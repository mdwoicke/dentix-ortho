/**
 * AI Enhancement Service
 * Uses Claude Opus to enhance prompts and tools with AI-powered improvements
 * Includes web search integration for best practices and quality scoring
 */

import { getLLMProvider, LLMProvider } from '../../../shared/services/llm-provider';
import { Database, AIEnhancementHistory, AIEnhancementTemplate, QualityScore, WebSearchResult } from '../../../test-agent/src/storage/database';
import * as promptService from './promptService';
import * as Diff from 'diff';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escape curly brackets for Flowise compatibility
 * Converts single { to {{ and } to }} for use in Flowise prompts
 * Already doubled brackets are preserved (not quadrupled)
 */
function escapeCurlyBrackets(content: string): string {
  // First, temporarily replace already-doubled brackets to preserve them
  let escaped = content
    .replace(/\{\{/g, '<<<DOUBLE_OPEN>>>')
    .replace(/\}\}/g, '<<<DOUBLE_CLOSE>>>');

  // Now escape single brackets
  escaped = escaped
    .replace(/\{/g, '{{')
    .replace(/\}/g, '}}');

  // Restore the already-doubled brackets (they are now quadrupled, need to reduce)
  escaped = escaped
    .replace(/<<<DOUBLE_OPEN>>>/g, '{{')
    .replace(/<<<DOUBLE_CLOSE>>>/g, '}}');

  return escaped;
}

// ============================================================================
// TYPES
// ============================================================================

export interface EnhanceRequest {
  fileKey: string;
  command: string;
  templateId?: string;
  useWebSearch?: boolean;
  sourceVersion?: number;
}

export interface EnhanceResult {
  enhancementId: string;
  fileKey: string;
  originalContent: string;
  enhancedContent: string;
  diff: DiffResult;
  qualityScores: {
    before: number;
    after: number;
    improvement: number;
  };
  webSearchResults?: WebSearchResult[];
  reasoning: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

export interface DiffResult {
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface ApplyEnhancementResult {
  success: boolean;
  newVersion: number;
  fileKey: string;
  enhancementId: string;
  error?: string;
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

const ENHANCEMENT_PROMPT = `You are an expert prompt engineer specializing in AI chatbot system prompts and function tools.

## CURRENT CONTENT
File: {{fileKey}} ({{fileType}})
Version: {{version}}

\`\`\`{{language}}
{{content}}
\`\`\`

## USER'S ENHANCEMENT REQUEST
{{command}}

{{webSearchSection}}

## YOUR TASK
1. Analyze the current prompt/tool content carefully
2. Apply the user's enhancement request thoughtfully
3. {{webSearchInstruction}}
4. Maintain consistency with existing style and format
5. For JavaScript tools: Ensure valid syntax - the code must compile without errors
6. For prompts: Maintain XML structure if present, preserve section markers

## IMPORTANT RULES
- DO NOT remove existing functionality unless explicitly asked
- DO NOT change the overall structure unless the request specifically asks for restructuring
- PRESERVE all existing sections and their content unless they need modification
- ADD new content in appropriate locations
- For JavaScript: Ensure all functions, brackets, and syntax are valid

## RESPONSE FORMAT
You MUST respond with valid JSON only. No markdown, no explanations outside the JSON.

\`\`\`json
{
  "enhancedContent": "... full enhanced content with all original content preserved plus your additions/modifications ...",
  "changes": [
    {
      "type": "added|modified|removed",
      "location": "section or line description",
      "description": "what changed and why"
    }
  ],
  "reasoning": "Brief explanation of your enhancement approach",
  "qualityImprovements": ["improvement 1", "improvement 2"]
}
\`\`\``;

const QUALITY_SCORE_PROMPT = `Analyze this prompt/tool and score it on these dimensions (0-100):

1. CLARITY (20%): How clear and unambiguous are the instructions?
2. COMPLETENESS (25%): Are all necessary cases and scenarios covered?
3. EXAMPLES (20%): Are there sufficient, relevant examples?
4. CONSISTENCY (15%): Is style and format consistent throughout?
5. EDGE_CASES (20%): Are edge cases and error handling addressed?

Content to analyze:
\`\`\`
{{content}}
\`\`\`

Respond with valid JSON only:
{
  "scores": {
    "clarity": <number 0-100>,
    "completeness": <number 0-100>,
    "examples": <number 0-100>,
    "consistency": <number 0-100>,
    "edgeCases": <number 0-100>
  },
  "overall": <weighted average>,
  "suggestions": [
    "specific improvement suggestion 1",
    "specific improvement suggestion 2"
  ]
}`;

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class AIEnhancementService {
  private db: Database;
  private llmProvider: LLMProvider | null = null;

  constructor() {
    this.db = new Database();
    this.db.initialize();
  }

  private async getLLM(): Promise<LLMProvider> {
    if (!this.llmProvider) {
      this.llmProvider = await getLLMProvider();
    }
    return this.llmProvider;
  }

  /**
   * Preview an enhancement without saving
   */
  async previewEnhancement(request: EnhanceRequest): Promise<EnhanceResult> {
    const enhancementId = `preview-${Date.now()}`;

    try {
      // Get current content
      const promptFile = promptService.getPromptContent(request.fileKey);
      if (!promptFile) {
        throw new Error(`Prompt file not found: ${request.fileKey}`);
      }

      const sourceVersion = request.sourceVersion || promptFile.version;
      let originalContent: string;

      if (request.sourceVersion && request.sourceVersion !== promptFile.version) {
        const versionContent = promptService.getVersionContent(request.fileKey, request.sourceVersion);
        if (!versionContent) {
          throw new Error(`Version ${request.sourceVersion} not found for ${request.fileKey}`);
        }
        originalContent = versionContent;
      } else {
        originalContent = promptFile.content;
      }

      // Get template if specified
      let command = request.command;
      if (request.templateId) {
        const template = this.db.getEnhancementTemplate(request.templateId);
        if (template) {
          command = template.commandTemplate;
          this.db.incrementTemplateUsage(request.templateId);
        }
      }

      // Get quality score before enhancement
      const qualityBefore = await this.scorePromptQuality(originalContent, request.fileKey);

      // Perform web search if requested
      let webSearchResults: WebSearchResult[] | undefined;
      let webSearchSection = '';
      let webSearchInstruction = 'Focus on the specific enhancement request';

      if (request.useWebSearch) {
        webSearchResults = await this.searchBestPractices(command, request.fileKey);
        if (webSearchResults.length > 0) {
          webSearchSection = `## BEST PRACTICES FROM WEB SEARCH
${webSearchResults.map(r => `### ${r.title}
Source: ${r.source}
${r.excerpt}

Key Takeaways:
${r.keyTakeaways.map(t => `- ${t}`).join('\n')}`).join('\n\n')}`;
          webSearchInstruction = 'Incorporate relevant best practices from the web search results where applicable';
        }
      }

      // Determine file type and language
      const fileType = request.fileKey.includes('tool') ? 'JavaScript Tool' : 'System Prompt';
      const language = request.fileKey.includes('tool') ? 'javascript' : 'markdown';

      // Build the enhancement prompt
      const prompt = ENHANCEMENT_PROMPT
        .replace('{{fileKey}}', request.fileKey)
        .replace('{{fileType}}', fileType)
        .replace('{{version}}', sourceVersion.toString())
        .replace('{{language}}', language)
        .replace('{{content}}', originalContent)
        .replace('{{command}}', command)
        .replace('{{webSearchSection}}', webSearchSection)
        .replace('{{webSearchInstruction}}', webSearchInstruction);

      // Call LLM with Claude Opus for highest quality
      const llm = await this.getLLM();
      const response = await llm.execute({
        prompt,
        model: 'claude-opus-4-5-20251101',
        maxTokens: 16000,
        temperature: 0.3,
      });

      if (!response.success || !response.content) {
        throw new Error(response.error || 'LLM call failed');
      }

      // Parse response
      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonContent = jsonMatch ? jsonMatch[1] : response.content;

      let parsed: {
        enhancedContent: string;
        changes: Array<{ type: string; location: string; description: string }>;
        reasoning: string;
        qualityImprovements: string[];
      };

      try {
        parsed = JSON.parse(jsonContent);
      } catch (parseError) {
        // Try to extract just the enhanced content if JSON parsing fails
        const contentMatch = response.content.match(/"enhancedContent"\s*:\s*"([\s\S]*?)"\s*,\s*"changes"/);
        if (contentMatch) {
          parsed = {
            enhancedContent: contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
            changes: [],
            reasoning: 'Enhancement applied but detailed response parsing failed',
            qualityImprovements: [],
          };
        } else {
          throw new Error('Failed to parse LLM response: ' + (parseError as Error).message);
        }
      }

      // Calculate diff
      const diff = this.calculateDiff(originalContent, parsed.enhancedContent);

      // Get quality score after enhancement
      const qualityAfter = await this.scorePromptQuality(parsed.enhancedContent, request.fileKey);

      return {
        enhancementId,
        fileKey: request.fileKey,
        originalContent,
        enhancedContent: parsed.enhancedContent,
        diff,
        qualityScores: {
          before: qualityBefore.overall,
          after: qualityAfter.overall,
          improvement: qualityAfter.overall - qualityBefore.overall,
        },
        webSearchResults,
        reasoning: parsed.reasoning,
        status: 'success',
      };
    } catch (error) {
      return {
        enhancementId,
        fileKey: request.fileKey,
        originalContent: '',
        enhancedContent: '',
        diff: { additions: 0, deletions: 0, hunks: [] },
        qualityScores: { before: 0, after: 0, improvement: 0 },
        reasoning: '',
        status: 'failed',
        errorMessage: (error as Error).message,
      };
    }
  }

  /**
   * Enhance a prompt and save to database (but not apply yet)
   */
  async enhancePrompt(request: EnhanceRequest): Promise<EnhanceResult> {
    // First ensure working copies are initialized (this satisfies the FK constraint)
    // getPromptContent calls initializeWorkingCopies internally
    const promptFile = promptService.getPromptContent(request.fileKey);
    if (!promptFile) {
      throw new Error(`Prompt file not found: ${request.fileKey}`);
    }

    // Double-check the working copy exists in database (FK constraint requirement)
    const promptFiles = promptService.getPromptFiles();
    const fileExists = promptFiles.some(f => f.fileKey === request.fileKey);
    if (!fileExists) {
      throw new Error(`Working copy not initialized for: ${request.fileKey}`);
    }

    const sourceVersion = request.sourceVersion || promptFile.version;

    const enhancementId = this.db.createEnhancement({
      enhancementId: '', // Will be generated
      fileKey: request.fileKey,
      sourceVersion,
      command: request.command,
      commandTemplate: request.templateId,
      webSearchUsed: request.useWebSearch || false,
      status: 'processing',
      createdBy: 'user',
    });

    try {
      // Update status to processing
      this.db.updateEnhancement(enhancementId, { status: 'processing' });

      // Perform enhancement
      const result = await this.previewEnhancement(request);

      if (result.status === 'failed') {
        this.db.updateEnhancement(enhancementId, {
          status: 'failed',
          errorMessage: result.errorMessage,
          completedAt: new Date().toISOString(),
        });
        return { ...result, enhancementId };
      }

      // Save successful result
      this.db.updateEnhancement(enhancementId, {
        status: 'completed',
        aiResponseJson: JSON.stringify({
          enhancedContent: result.enhancedContent,
          reasoning: result.reasoning,
        }),
        webSearchResultsJson: result.webSearchResults ? JSON.stringify(result.webSearchResults) : undefined,
        qualityScoreBefore: result.qualityScores.before,
        qualityScoreAfter: result.qualityScores.after,
        completedAt: new Date().toISOString(),
      });

      return { ...result, enhancementId };
    } catch (error) {
      this.db.updateEnhancement(enhancementId, {
        status: 'failed',
        errorMessage: (error as Error).message,
        completedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Apply an enhancement - saves to AI Enhancements storage (NOT to main prompt files)
   * Use promoteToProduction() to actually save to the main prompt files
   * @param customDescription - Optional custom description for when promoted
   */
  async applyEnhancement(
    fileKey: string,
    enhancementId: string,
    customDescription?: string,
  ): Promise<ApplyEnhancementResult> {
    try {
      const enhancement = this.db.getEnhancement(enhancementId);
      if (!enhancement) {
        throw new Error(`Enhancement not found: ${enhancementId}`);
      }

      if (enhancement.status !== 'completed') {
        throw new Error(`Enhancement is not in completed status: ${enhancement.status}`);
      }

      const aiResponse = enhancement.aiResponseJson ? JSON.parse(enhancement.aiResponseJson) : null;
      if (!aiResponse?.enhancedContent) {
        throw new Error('Enhancement has no content to apply');
      }

      // Store the description for later use when promoting
      const description = customDescription?.trim() ||
        `AI Enhancement [${enhancementId.slice(0, 8)}]: ${enhancement.command}`;

      // Save to AI Enhancements storage (NOT to main prompt files)
      // The enhancement stays in the "AI Enhancements" group until promoted
      this.db.updateEnhancement(enhancementId, {
        status: 'applied',
        appliedAt: new Date().toISOString(),
        appliedContent: aiResponse.enhancedContent,
        // Store description in metadata for use when promoting
        metadataJson: JSON.stringify({
          ...JSON.parse(enhancement.metadataJson || '{}'),
          pendingDescription: description,
        }),
      });

      return {
        success: true,
        newVersion: 0, // No version created yet - only created when promoted
        fileKey,
        enhancementId,
      };
    } catch (error) {
      return {
        success: false,
        newVersion: 0,
        fileKey,
        enhancementId,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Promote an applied enhancement to production (main prompt files)
   * This creates a new version in the main prompt file
   */
  async promoteToProduction(
    fileKey: string,
    enhancementId: string,
    customDescription?: string,
  ): Promise<ApplyEnhancementResult> {
    try {
      const enhancement = this.db.getEnhancement(enhancementId);
      if (!enhancement) {
        throw new Error(`Enhancement not found: ${enhancementId}`);
      }

      if (enhancement.status !== 'applied') {
        throw new Error(`Enhancement must be in 'applied' status to promote. Current status: ${enhancement.status}`);
      }

      if (!enhancement.appliedContent) {
        throw new Error('Enhancement has no applied content to promote');
      }

      // Get description from metadata or use custom/default
      const metadata = enhancement.metadataJson ? JSON.parse(enhancement.metadataJson) : {};
      const description = customDescription?.trim() ||
        metadata.pendingDescription ||
        `AI Enhancement [${enhancementId.slice(0, 8)}]: ${enhancement.command}`;

      // Escape curly brackets for Flowise compatibility
      // Single { becomes {{ and } becomes }} (already doubled brackets are preserved)
      const escapedContent = escapeCurlyBrackets(enhancement.appliedContent);

      // Now save to main prompt files
      const result = promptService.saveNewVersion(
        fileKey,
        escapedContent,
        description
      );

      // Update enhancement status to promoted
      this.db.updateEnhancement(enhancementId, {
        status: 'promoted',
        promotedAt: new Date().toISOString(),
        resultVersion: result.newVersion,
      });

      return {
        success: true,
        newVersion: result.newVersion,
        fileKey,
        enhancementId,
      };
    } catch (error) {
      return {
        success: false,
        newVersion: 0,
        fileKey,
        enhancementId,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Discard an enhancement
   */
  discardEnhancement(enhancementId: string): void {
    this.db.updateEnhancement(enhancementId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * Estimate token count using a simple heuristic
   * Claude/GPT tokenizers typically produce ~1.3 tokens per word
   * This is a rough estimate - actual tokenization may vary
   */
  private estimateTokenCount(content: string): number {
    // Split on whitespace and punctuation to approximate tokens
    // This matches how most LLM tokenizers work
    const tokens = content.split(/[\s\n\r]+|([.,!?;:'"()\[\]{}])/g)
      .filter(t => t && t.trim().length > 0);
    // Apply a slight multiplier since subword tokenization often splits words
    return Math.ceil(tokens.length * 1.1);
  }

  /**
   * Score prompt quality
   */
  async scorePromptQuality(content: string, _fileKey?: string): Promise<QualityScore> {
    // Calculate content metrics
    const tokenCount = this.estimateTokenCount(content);
    const charCount = content.length;
    const lineCount = content.split('\n').length;

    try {
      const prompt = QUALITY_SCORE_PROMPT.replace('{{content}}', content.substring(0, 8000)); // Limit content size

      const llm = await this.getLLM();
      const response = await llm.execute({
        prompt,
        model: 'claude-opus-4-5-20251101', // Use Opus 4.5 for highest quality
        maxTokens: 1000,
        temperature: 0.1,
      });

      if (!response.success || !response.content) {
        throw new Error(response.error || 'LLM call failed');
      }

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        overall: parsed.overall || 0,
        dimensions: {
          clarity: parsed.scores?.clarity || 0,
          completeness: parsed.scores?.completeness || 0,
          examples: parsed.scores?.examples || 0,
          consistency: parsed.scores?.consistency || 0,
          edgeCases: parsed.scores?.edgeCases || 0,
        },
        suggestions: parsed.suggestions || [],
        tokenCount,
        charCount,
        lineCount,
      };
    } catch (error) {
      // Return default scores on error, but still include content metrics
      return {
        overall: 50,
        dimensions: {
          clarity: 50,
          completeness: 50,
          examples: 50,
          consistency: 50,
          edgeCases: 50,
        },
        suggestions: ['Unable to analyze: ' + (error as Error).message],
        tokenCount,
        charCount,
        lineCount,
      };
    }
  }

  /**
   * Search for best practices using web search
   */
  async searchBestPractices(command: string, fileKey: string): Promise<WebSearchResult[]> {
    // Generate search queries based on the command and file type
    // Future: these could be used with an actual web search API
    // const searchQueries = this.generateSearchQueries(command, fileKey);

    // Note: In production, this would use an actual web search API
    // For now, we return curated best practices based on the command
    const bestPractices = this.getCuratedBestPractices(command, fileKey);

    return bestPractices;
  }

  /**
   * Get curated best practices (fallback when web search unavailable)
   */
  private getCuratedBestPractices(command: string, _fileKey: string): WebSearchResult[] {
    const practices: WebSearchResult[] = [];
    const commandLower = command.toLowerCase();

    if (commandLower.includes('example') || commandLower.includes('few-shot')) {
      practices.push({
        source: 'Anthropic Prompt Engineering Guide',
        title: 'Effective Few-Shot Examples',
        excerpt: 'Few-shot examples should be diverse, representative of real use cases, and clearly demonstrate the expected format. Include both positive and negative examples when appropriate.',
        relevanceScore: 0.9,
        keyTakeaways: [
          'Use 2-5 examples for most tasks',
          'Include edge cases in examples',
          'Match example format to expected output',
          'Order examples from simple to complex',
        ],
      });
    }

    if (commandLower.includes('clarity') || commandLower.includes('clear')) {
      practices.push({
        source: 'OpenAI Prompt Engineering',
        title: 'Writing Clear Instructions',
        excerpt: 'Clear prompts use specific language, avoid ambiguity, and explicitly state constraints. Break complex instructions into numbered steps.',
        relevanceScore: 0.85,
        keyTakeaways: [
          'Use concrete, specific language',
          'Avoid words like "simple" or "easy"',
          'State what to do, not just what not to do',
          'Use numbered steps for multi-step tasks',
        ],
      });
    }

    if (commandLower.includes('edge') || commandLower.includes('error')) {
      practices.push({
        source: 'LLM Application Best Practices',
        title: 'Handling Edge Cases',
        excerpt: 'Robust prompts anticipate edge cases and provide explicit handling instructions. Include fallback behaviors and graceful error messages.',
        relevanceScore: 0.88,
        keyTakeaways: [
          'Enumerate known edge cases explicitly',
          'Provide default behaviors for unknowns',
          'Include helpful error messages',
          'Consider user-friendly fallback responses',
        ],
      });
    }

    if (commandLower.includes('format') || commandLower.includes('structure')) {
      practices.push({
        source: 'Prompt Design Patterns',
        title: 'Structured Prompt Formatting',
        excerpt: 'Well-structured prompts use consistent formatting, clear section headers, and logical organization. XML tags can help delineate sections.',
        relevanceScore: 0.82,
        keyTakeaways: [
          'Use consistent header formatting',
          'Group related instructions together',
          'Use XML tags for clear section boundaries',
          'Include a summary at the end for complex prompts',
        ],
      });
    }

    // Add general best practices if no specific matches
    if (practices.length === 0) {
      practices.push({
        source: 'General Prompt Engineering',
        title: 'Prompt Engineering Fundamentals',
        excerpt: 'Effective prompts are clear, specific, and provide context. They include examples when helpful and explicitly state constraints and expected output format.',
        relevanceScore: 0.7,
        keyTakeaways: [
          'Be specific about what you want',
          'Provide relevant context',
          'Include examples for complex tasks',
          'Specify output format explicitly',
        ],
      });
    }

    return practices;
  }

  /**
   * Calculate diff between original and enhanced content
   */
  private calculateDiff(original: string, enhanced: string): DiffResult {
    const changes = Diff.diffLines(original, enhanced);

    let additions = 0;
    let deletions = 0;
    const hunks: DiffHunk[] = [];

    let currentHunk: DiffHunk | null = null;
    let oldLineNum = 1;
    let newLineNum = 1;

    for (const change of changes) {
      const lines = change.value.split('\n').filter((l: string) => l !== '' || change.value.endsWith('\n'));

      if (change.added || change.removed) {
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNum,
            oldLines: 0,
            newStart: newLineNum,
            newLines: 0,
            lines: [],
          };
        }

        for (const line of lines) {
          if (change.added) {
            additions++;
            currentHunk.newLines++;
            currentHunk.lines.push({
              type: 'add',
              content: line,
              newLineNumber: newLineNum++,
            });
          } else {
            deletions++;
            currentHunk.oldLines++;
            currentHunk.lines.push({
              type: 'remove',
              content: line,
              oldLineNumber: oldLineNum++,
            });
          }
        }
      } else {
        // Context lines
        if (currentHunk) {
          hunks.push(currentHunk);
          currentHunk = null;
        }

        const lineCount = lines.length;
        oldLineNum += lineCount;
        newLineNum += lineCount;
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return { additions, deletions, hunks };
  }

  /**
   * Get enhancement templates
   */
  getTemplates(): AIEnhancementTemplate[] {
    return this.db.getEnhancementTemplates();
  }

  /**
   * Get enhancement history for a file
   */
  getEnhancementHistory(fileKey: string, limit: number = 20): AIEnhancementHistory[] {
    return this.db.getEnhancementHistory(fileKey, limit);
  }

  /**
   * Get enhancement by ID
   */
  getEnhancement(enhancementId: string): AIEnhancementHistory | null {
    return this.db.getEnhancement(enhancementId);
  }
}

// Export singleton instance
export const aiEnhancementService = new AIEnhancementService();

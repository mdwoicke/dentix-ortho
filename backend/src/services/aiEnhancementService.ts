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

/**
 * Extract a complete JSON object from text using brace-depth tracking
 * Handles JSON embedded in prose or code fences, even when content contains nested code blocks
 */
function extractJsonObject(content: string): string | null {
  // Find the start of JSON object - look for { that begins the response JSON
  // Skip any prose/thinking text before the JSON
  let jsonStart = -1;

  // Try to find JSON after ```json marker first
  const jsonMarker = content.indexOf('```json');
  if (jsonMarker !== -1) {
    // Find the first { after the marker
    jsonStart = content.indexOf('{', jsonMarker);
  }

  // If no marker or no { found, look for {"enhancedContent" pattern
  if (jsonStart === -1) {
    jsonStart = content.indexOf('{"enhancedContent"');
  }

  // Last resort: find first { in the content
  if (jsonStart === -1) {
    jsonStart = content.indexOf('{');
  }

  if (jsonStart === -1) return null;

  // Track brace depth to find the matching closing brace
  // Must handle strings properly (don't count braces inside strings)
  let depth = 0;
  let inString = false;
  let pos = jsonStart;

  while (pos < content.length) {
    const char = content[pos];

    // Handle escape sequences in strings
    if (inString && char === '\\' && pos + 1 < content.length) {
      pos += 2; // Skip escaped character
      continue;
    }

    // Track string boundaries
    if (char === '"') {
      inString = !inString;
      pos++;
      continue;
    }

    // Only count braces outside of strings
    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          // Found the matching closing brace
          return content.substring(jsonStart, pos + 1);
        }
      }
    }

    pos++;
  }

  return null; // Incomplete JSON
}

/**
 * Robust JSON parsing for LLM responses containing code
 * Handles: prose before JSON, nested code blocks in content, escape issues
 */
function parseEnhancementResponse(content: string): {
  enhancedContent: string;
  changes: Array<{ type: string; location: string; description: string }>;
  reasoning: string;
  qualityImprovements: string[];
} | null {
  // Step 1: Extract the complete JSON object using brace tracking
  const jsonContent = extractJsonObject(content);

  if (!jsonContent) {
    console.error('[AIEnhancement] Could not extract JSON object from response');
    return null;
  }

  console.log('[AIEnhancement] Extracted JSON length:', jsonContent.length);

  // Step 2: Try standard JSON parse
  try {
    const parsed = JSON.parse(jsonContent);
    if (parsed.enhancedContent) {
      return {
        enhancedContent: parsed.enhancedContent,
        changes: parsed.changes || [],
        reasoning: parsed.reasoning || '',
        qualityImprovements: parsed.qualityImprovements || [],
      };
    }
  } catch (e) {
    console.log('[AIEnhancement] Standard JSON parse failed, trying fallback extraction:', (e as Error).message);
  }

  // Step 3: Fallback - Extract fields individually
  let enhancedContent = '';
  let changes: Array<{ type: string; location: string; description: string }> = [];
  let reasoning = '';
  let qualityImprovements: string[] = [];

  // Extract enhancedContent using escape-aware string extraction
  const enhancedContentStart = jsonContent.indexOf('"enhancedContent"');
  if (enhancedContentStart !== -1) {
    // Find the colon and opening quote
    let colonPos = jsonContent.indexOf(':', enhancedContentStart);
    if (colonPos !== -1) {
      // Skip whitespace and find opening quote
      let valueStart = colonPos + 1;
      while (valueStart < jsonContent.length && /\s/.test(jsonContent[valueStart])) {
        valueStart++;
      }

      if (jsonContent[valueStart] === '"') {
        valueStart++; // Move past opening quote

        // Find closing quote using escape tracking
        let pos = valueStart;
        while (pos < jsonContent.length) {
          const char = jsonContent[pos];
          if (char === '\\' && pos + 1 < jsonContent.length) {
            pos += 2; // Skip escaped character
            continue;
          }
          if (char === '"') {
            // Found closing quote
            const rawValue = jsonContent.substring(valueStart, pos);
            try {
              enhancedContent = JSON.parse(`"${rawValue}"`);
            } catch {
              // Manual unescape
              enhancedContent = rawValue
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\');
            }
            break;
          }
          pos++;
        }
      }
    }
  }

  // Extract reasoning (simpler field, less likely to have issues)
  const reasoningMatch = jsonContent.match(/"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (reasoningMatch) {
    try {
      reasoning = JSON.parse(`"${reasoningMatch[1]}"`);
    } catch {
      reasoning = reasoningMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
  }

  // Extract changes array - find the array bounds properly
  const changesStart = jsonContent.indexOf('"changes"');
  if (changesStart !== -1) {
    const arrayStart = jsonContent.indexOf('[', changesStart);
    if (arrayStart !== -1) {
      // Find matching ] using depth tracking
      let depth = 0;
      let inStr = false;
      for (let i = arrayStart; i < jsonContent.length; i++) {
        const c = jsonContent[i];
        if (inStr && c === '\\' && i + 1 < jsonContent.length) { i++; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (!inStr) {
          if (c === '[') depth++;
          else if (c === ']') {
            depth--;
            if (depth === 0) {
              try {
                changes = JSON.parse(jsonContent.substring(arrayStart, i + 1));
              } catch { /* ignore */ }
              break;
            }
          }
        }
      }
    }
  }

  // Extract qualityImprovements array similarly
  const improvementsStart = jsonContent.indexOf('"qualityImprovements"');
  if (improvementsStart !== -1) {
    const arrayStart = jsonContent.indexOf('[', improvementsStart);
    if (arrayStart !== -1) {
      let depth = 0;
      let inStr = false;
      for (let i = arrayStart; i < jsonContent.length; i++) {
        const c = jsonContent[i];
        if (inStr && c === '\\' && i + 1 < jsonContent.length) { i++; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (!inStr) {
          if (c === '[') depth++;
          else if (c === ']') {
            depth--;
            if (depth === 0) {
              try {
                qualityImprovements = JSON.parse(jsonContent.substring(arrayStart, i + 1));
              } catch { /* ignore */ }
              break;
            }
          }
        }
      }
    }
  }

  if (enhancedContent) {
    return { enhancedContent, changes, reasoning, qualityImprovements };
  }

  return null;
}

// ============================================================================
// TYPES
// ============================================================================

export type PromptContext = 'production' | 'sandbox_a' | 'sandbox_b';

export interface EnhanceRequest {
  fileKey: string;
  command: string;
  templateId?: string;
  useWebSearch?: boolean;
  sourceVersion?: number;
  context?: PromptContext;
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

## CRITICAL: COMPLETE OUTPUT REQUIRED
**WARNING: You MUST output the COMPLETE enhanced content. Truncation will cause syntax errors and break the system.**
- The "enhancedContent" field MUST contain the ENTIRE file content from start to finish
- Do NOT truncate, abbreviate, or use "..." to indicate continuation
- Do NOT say "rest of file unchanged" or similar - include ALL content
- If the original is 500 lines, your output must be ~500 lines (plus any additions)
- For JavaScript: The output must be syntactically valid and compile without errors

## CURRENT CONTENT
File: {{fileKey}} ({{fileType}})
Version: {{version}}

\`\`\`{{language}}
{{content}}
\`\`\`

## USER'S ENHANCEMENT REQUEST
{{command}}

{{webSearchSection}}

{{referenceDocumentsSection}}

## YOUR TASK
1. Analyze the current prompt/tool content carefully
2. Apply the user's enhancement request thoughtfully
3. {{webSearchInstruction}}
4. {{referenceDocumentsInstruction}}
5. Maintain consistency with existing style and format
6. For JavaScript tools: Ensure valid syntax - the code must compile without errors
7. For prompts: Maintain XML structure if present, preserve section markers

## IMPORTANT RULES
- DO NOT remove existing functionality unless explicitly asked
- DO NOT change the overall structure unless the request specifically asks for restructuring
- PRESERVE all existing sections and their content unless they need modification
- ADD new content in appropriate locations
- For JavaScript: Ensure all functions, brackets, and syntax are valid
- **CRITICAL: Output the COMPLETE file - never truncate**

## RESPONSE FORMAT
You MUST respond with valid JSON only. No markdown, no explanations outside the JSON.
The "enhancedContent" field MUST contain the COMPLETE file content - no truncation allowed.

\`\`\`json
{
  "enhancedContent": "<<< COMPLETE FILE CONTENT - every single line from start to finish, with your modifications applied >>>",
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
   * Get reference documents for a file key (for inclusion in enhancement prompt)
   */
  private getReferenceDocuments(fileKey: string): Array<{
    documentId: string;
    label: string;
    extractedText: string;
  }> {
    return this.db.getReferenceDocumentsForEnhancement(fileKey);
  }

  /**
   * Preview an enhancement and save to DB with status "preview"
   * Returns enhancementId so it can be confirmed later without re-running LLM
   */
  async previewEnhancement(request: EnhanceRequest): Promise<EnhanceResult> {
    const context = request.context || 'production';

    // Get source content based on context (production vs sandbox)
    let originalContent: string;
    let sourceVersion: number;

    if (context === 'production') {
      // Production: Get from main prompt files
      const promptFile = promptService.getPromptContent(request.fileKey);
      if (!promptFile) {
        throw new Error(`Prompt file not found: ${request.fileKey}`);
      }
      sourceVersion = request.sourceVersion || promptFile.version;

      if (request.sourceVersion && request.sourceVersion !== promptFile.version) {
        const versionContent = promptService.getVersionContent(request.fileKey, request.sourceVersion);
        if (!versionContent) {
          throw new Error(`Version ${request.sourceVersion} not found for ${request.fileKey}`);
        }
        originalContent = versionContent;
      } else {
        originalContent = promptFile.content;
      }
    } else {
      // Sandbox: Get from ab_sandbox_files
      const sandboxFile = this.db.getSandboxFile(context, request.fileKey);
      if (!sandboxFile) {
        throw new Error(`File ${request.fileKey} not found in ${context}. Copy from production first.`);
      }
      originalContent = sandboxFile.content;
      sourceVersion = sandboxFile.version;
    }

    const enhancementId = this.db.createEnhancement({
      enhancementId: '', // Will be generated
      fileKey: request.fileKey,
      sourceVersion,
      command: request.command,
      commandTemplate: request.templateId,
      webSearchUsed: request.useWebSearch || false,
      status: 'preview', // Mark as preview - can be confirmed later
      createdBy: 'user',
      context,
      sandboxId: context !== 'production' ? context : undefined,
    });

    try {

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

      // Fetch reference documents for this file
      let referenceDocumentsSection = '';
      let referenceDocumentsInstruction = 'Follow any guidelines from reference documents';
      const referenceDocuments = this.getReferenceDocuments(request.fileKey);

      if (referenceDocuments.length > 0) {
        referenceDocumentsSection = `## REFERENCE DOCUMENTS
The following documents provide context, requirements, and guidelines for this file:

${referenceDocuments.map(doc => `### ${doc.label}
<reference_document name="${doc.label}">
${doc.extractedText}
</reference_document>`).join('\n\n')}`;
        referenceDocumentsInstruction = 'Apply requirements, patterns, and guidelines from the reference documents where relevant';
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
        .replace('{{webSearchInstruction}}', webSearchInstruction)
        .replace('{{referenceDocumentsSection}}', referenceDocumentsSection)
        .replace('{{referenceDocumentsInstruction}}', referenceDocumentsInstruction);

      // Call LLM with Claude Opus for highest quality
      // Use 10 minute timeout for enhancement operations (large prompts like system_prompt need more time)
      // Use 32000 maxTokens to ensure complete output for large files
      const llm = await this.getLLM();
      const response = await llm.execute({
        prompt,
        model: 'claude-opus-4-5-20251101',
        maxTokens: 32000,
        temperature: 0.3,
        timeout: 600000, // 10 minutes for enhancement operations (large prompts need more time)
      });

      if (!response.success || !response.content) {
        throw new Error(response.error || 'LLM call failed');
      }

      // Parse response using robust parser
      const parsed = parseEnhancementResponse(response.content);
      if (!parsed || !parsed.enhancedContent) {
        console.error('[AIEnhancement] Failed to parse LLM response. First 500 chars:', response.content.substring(0, 500));
        throw new Error('Failed to parse LLM response: could not extract enhanced content');
      }

      // Log parsing results for debugging
      console.log('[AIEnhancement] Parsed response:', {
        hasEnhancedContent: !!parsed.enhancedContent,
        enhancedContentLength: parsed.enhancedContent.length,
        changesCount: parsed.changes.length,
        hasReasoning: !!parsed.reasoning,
        qualityImprovementsCount: parsed.qualityImprovements.length,
      });

      // Calculate diff
      const diff = this.calculateDiff(originalContent, parsed.enhancedContent);

      // Get quality score after enhancement
      const qualityAfter = await this.scorePromptQuality(parsed.enhancedContent, request.fileKey);

      // Save preview result to DB (status remains "preview" until confirmed)
      // Include original content for diff history - enables highlighted view in UI
      this.db.updateEnhancement(enhancementId, {
        aiResponseJson: JSON.stringify({
          originalContent,                       // Save original for diff history
          enhancedContent: parsed.enhancedContent,
          reasoning: parsed.reasoning,
          changes: parsed.changes,
          qualityImprovements: parsed.qualityImprovements,
          diff,                                  // Save diff for history
        }),
        webSearchResultsJson: webSearchResults ? JSON.stringify(webSearchResults) : undefined,
        qualityScoreBefore: qualityBefore.overall,
        qualityScoreAfter: qualityAfter.overall,
        // Keep status as "preview" - will be changed to "completed" when confirmed
      });

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
      // Update DB with failed status
      this.db.updateEnhancement(enhancementId, {
        status: 'failed',
        errorMessage: (error as Error).message,
        completedAt: new Date().toISOString(),
      });

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
   * Save a previewed enhancement (change status from "preview" to "completed")
   * This avoids re-running the LLM - uses the cached preview result
   */
  async savePreviewedEnhancement(enhancementId: string): Promise<EnhanceResult> {
    const enhancement = this.db.getEnhancement(enhancementId);
    if (!enhancement) {
      throw new Error(`Enhancement not found: ${enhancementId}`);
    }

    if (enhancement.status !== 'preview') {
      throw new Error(`Enhancement is not in preview status: ${enhancement.status}`);
    }

    const aiResponse = enhancement.aiResponseJson ? JSON.parse(enhancement.aiResponseJson) : null;
    if (!aiResponse?.enhancedContent) {
      throw new Error('Preview has no enhanced content');
    }

    // Update status to completed
    this.db.updateEnhancement(enhancementId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    // Get original content for the response
    const promptFile = promptService.getPromptContent(enhancement.fileKey);
    const originalContent = promptFile?.content || '';

    // Calculate diff
    const diff = this.calculateDiff(originalContent, aiResponse.enhancedContent);

    return {
      enhancementId,
      fileKey: enhancement.fileKey,
      originalContent,
      enhancedContent: aiResponse.enhancedContent,
      diff,
      qualityScores: {
        before: enhancement.qualityScoreBefore || 0,
        after: enhancement.qualityScoreAfter || 0,
        improvement: (enhancement.qualityScoreAfter || 0) - (enhancement.qualityScoreBefore || 0),
      },
      reasoning: aiResponse.reasoning || '',
      status: 'success',
    };
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

      // Save successful result with original content for diff history
      this.db.updateEnhancement(enhancementId, {
        status: 'completed',
        aiResponseJson: JSON.stringify({
          originalContent: result.originalContent, // Save original for diff history
          enhancedContent: result.enhancedContent,
          reasoning: result.reasoning,
          diff: result.diff,                       // Save diff for history
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
   * Apply an enhancement
   * - For sandbox context: saves directly to sandbox files
   * - For production context: saves to AI Enhancements storage (use promoteToProduction to save to main files)
   * @param customDescription - Optional custom description
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

      const context = enhancement.context || 'production';
      const description = customDescription?.trim() ||
        `AI Enhancement [${enhancementId.slice(0, 8)}]: ${enhancement.command}`;

      if (context !== 'production') {
        // SANDBOX CONTEXT: Save directly to sandbox files
        const existingFile = this.db.getSandboxFile(context, fileKey);
        if (!existingFile) {
          throw new Error(`File ${fileKey} not found in ${context}`);
        }

        // Save to sandbox file
        const newVersion = this.db.saveSandboxFile({
          sandboxId: context,
          fileKey,
          fileType: existingFile.fileType,
          displayName: existingFile.displayName,
          content: aiResponse.enhancedContent,
          version: existingFile.version + 1,
          changeDescription: description,
        });

        // Update enhancement status
        this.db.updateEnhancement(enhancementId, {
          status: 'applied',
          appliedAt: new Date().toISOString(),
          appliedContent: aiResponse.enhancedContent,
          resultVersion: newVersion,
        });

        return {
          success: true,
          newVersion,
          fileKey,
          enhancementId,
        };
      } else {
        // PRODUCTION CONTEXT: Save to AI Enhancements storage (NOT to main prompt files)
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
      }
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
      // ONLY apply to markdown files - JavaScript tools must preserve original syntax
      const isJavaScriptFile = fileKey.includes('tool') || fileKey.endsWith('.js');
      const contentToSave = isJavaScriptFile
        ? enhancement.appliedContent
        : escapeCurlyBrackets(enhancement.appliedContent);

      // Now save to main prompt files
      const result = promptService.saveNewVersion(
        fileKey,
        contentToSave,
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
  getEnhancementHistory(fileKey: string, limit: number = 20, context: PromptContext = 'production'): AIEnhancementHistory[] {
    return this.db.getEnhancementHistory(fileKey, limit, context);
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

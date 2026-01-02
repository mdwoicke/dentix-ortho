/**
 * LLM Analysis Service
 * Uses Claude API or CLI to analyze test failures and generate fix recommendations
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/config';
import { ConversationTurn, Finding } from '../tests/test-case';
import { ApiCall, Database, GeneratedFix } from '../storage/database';
import { getLLMProvider, LLMProvider } from '../../../shared/services/llm-provider';
import { isClaudeCliEnabled } from '../../../shared/config/llm-config';
import { TriggerService, type ABRecommendation } from './ab-testing';

// ============================================================================
// Types
// ============================================================================

export interface FailureContext {
  testId: string;
  testName: string;
  stepId: string;
  stepDescription: string;
  expectedPattern: string;
  unexpectedPatterns?: string[];
  transcript: ConversationTurn[];
  apiCalls: ApiCall[];
  errorMessage?: string;
  findings: Finding[];
}

export interface RootCause {
  type: 'prompt-gap' | 'prompt-conflict' | 'tool-bug' |
        'tool-missing-default' | 'llm-hallucination' | 'test-issue';
  evidence: string[];
  confidence: number;
  explanation: string;
}

/**
 * Classification of whether the issue is with the bot, test agent, or both
 * Based on the "Golden Rule" from iva-prompt-tuning skill
 */
export interface FixClassification {
  /** Where the issue originates - determines which system to fix */
  issueLocation: 'bot' | 'test-agent' | 'both';
  /** Confidence score from 0-1 */
  confidence: number;
  /** Explanation for the classification */
  reasoning: string;
  /** Would a real user say what the test agent said? */
  userBehaviorRealistic: boolean;
  /** Did the bot respond appropriately to the input? */
  botResponseAppropriate: boolean;
}

export interface PromptFix {
  type: 'prompt';
  fixType: 'add-rule' | 'add-example' | 'clarify-instruction' |
           'ban-word' | 'add-phase-step' | 'fix-format-spec';
  targetFile: string;
  location: {
    section: string;
    afterLine?: string;
    replaceLine?: string;
  };
  changeDescription: string;
  changeCode: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  reasoning: string;
}

export interface ToolFix {
  type: 'tool';
  fixType: 'add-default' | 'add-validation' | 'fix-parsing' |
           'add-error-handling' | 'fix-parameter';
  targetFile: string;
  location: {
    function?: string;
    lineNumber?: number;
    afterLine?: string;
  };
  changeDescription: string;
  changeCode: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  reasoning: string;
}

export interface AnalysisResult {
  rootCause: RootCause;
  fixes: (PromptFix | ToolFix)[];
  summary: string;
  /** Classification of bot vs test-agent issue */
  classification?: FixClassification;
}

/**
 * Analysis result extended with A/B testing recommendations
 */
export interface AnalysisResultWithABRecommendations extends AnalysisResult {
  /** A/B testing recommendations for high-impact fixes */
  abRecommendations: ABRecommendation[];
  /** Fixes that warrant A/B testing */
  testableFixIds: string[];
}

// ============================================================================
// LLM Analysis Service
// ============================================================================

export class LLMAnalysisService {
  private llmProvider: LLMProvider;
  private systemPromptContent: string = '';
  private schedulingToolContent: string = '';
  private patientToolContent: string = '';
  private triggerService: TriggerService | null = null;
  private database: Database | null = null;

  constructor(database?: Database) {
    this.llmProvider = getLLMProvider();
    this.loadSourceFiles();
    this.logInitialization();

    // Initialize TriggerService if database is provided
    if (database) {
      this.database = database;
      this.triggerService = new TriggerService(database);
    }
  }

  /**
   * Set the database and initialize A/B testing capabilities
   */
  setDatabase(database: Database): void {
    this.database = database;
    this.triggerService = new TriggerService(database);
  }

  private async logInitialization(): Promise<void> {
    const mode = isClaudeCliEnabled() ? 'CLI' : 'API';
    const status = await this.llmProvider.checkAvailability();
    if (status.available) {
      console.log(`[LLMAnalysisService] Initialized with ${mode} mode (provider: ${status.provider})`);
    } else {
      console.log(`[LLMAnalysisService] ${mode} mode configured but not available: ${status.error}`);
      console.log('[LLMAnalysisService] LLM analysis disabled - using rule-based analysis only');
    }
  }

  private loadSourceFiles(): void {
    const baseDir = path.resolve(__dirname, '../..');

    try {
      const promptPath = path.resolve(baseDir, config.agentTuning.systemPromptPath);
      if (fs.existsSync(promptPath)) {
        this.systemPromptContent = fs.readFileSync(promptPath, 'utf-8');
      }
    } catch (e) {
      console.warn('Could not load system prompt file');
    }

    try {
      const schedulingPath = path.resolve(baseDir, config.agentTuning.schedulingToolPath);
      if (fs.existsSync(schedulingPath)) {
        this.schedulingToolContent = fs.readFileSync(schedulingPath, 'utf-8');
      }
    } catch (e) {
      console.warn('Could not load scheduling tool file');
    }

    try {
      const patientPath = path.resolve(baseDir, config.agentTuning.patientToolPath);
      if (fs.existsSync(patientPath)) {
        this.patientToolContent = fs.readFileSync(patientPath, 'utf-8');
      }
    } catch (e) {
      console.warn('Could not load patient tool file');
    }
  }

  /**
   * Check if the service is available (API key or CLI configured)
   */
  isAvailable(): boolean {
    return this.llmProvider.isAvailable();
  }

  /**
   * Analyze a test failure and generate fix recommendations
   */
  async analyzeFailure(context: FailureContext): Promise<AnalysisResult> {
    console.log(`[Diagnosis:LLM] ========== analyzeFailure ==========`);
    console.log(`[Diagnosis:LLM] Test: ${context.testId}, Step: ${context.stepId}`);

    const status = await this.llmProvider.checkAvailability();
    console.log(`[Diagnosis:LLM] LLM Provider status:`, status);

    if (!status.available) {
      console.error(`[Diagnosis:LLM] LLM not available, throwing error`);
      throw new Error(`LLM Analysis Service not available: ${status.error}`);
    }

    const prompt = this.buildAnalysisPrompt(context);
    console.log(`[Diagnosis:LLM] Built prompt (${prompt.length} chars)`);

    try {
      console.log(`[Diagnosis:LLM] Calling LLM provider with model: ${config.llmAnalysis.model}, timeout: ${config.llmAnalysis.timeout}ms`);
      const response = await this.llmProvider.execute({
        prompt,
        model: config.llmAnalysis.model,
        maxTokens: config.llmAnalysis.maxTokens,
        temperature: config.llmAnalysis.temperature,
        timeout: config.llmAnalysis.timeout,
      });

      console.log(`[Diagnosis:LLM] LLM response:`, {
        success: response.success,
        provider: response.provider,
        durationMs: response.durationMs,
        contentLength: response.content?.length || 0,
        error: response.error,
      });

      if (!response.success) {
        // Handle timeout or other errors
        if (response.error?.includes('timeout')) {
          console.warn(`[Diagnosis:LLM] Timed out after ${config.llmAnalysis.timeout}ms - falling back to rule-based analysis`);
          return this.generateRuleBasedAnalysis(context);
        }
        throw new Error(response.error || 'LLM Analysis failed');
      }

      const responseText = response.content || '';
      console.log(`[Diagnosis:LLM] Analysis completed via ${response.provider} in ${response.durationMs}ms`);

      const result = this.parseAnalysisResponse(responseText, context);
      console.log(`[Diagnosis:LLM] Parsed result:`, {
        rootCause: result.rootCause.type,
        confidence: result.rootCause.confidence,
        fixCount: result.fixes.length,
        fixTypes: result.fixes.map(f => f.type),
      });

      return result;
    } catch (error: any) {
      // Handle timeout specifically
      if (error.message?.includes('timeout')) {
        console.warn(`[Diagnosis:LLM] Caught timeout error - falling back to rule-based analysis`);
        return this.generateRuleBasedAnalysis(context);
      }
      console.error(`[Diagnosis:LLM] LLM Analysis failed:`, error.message);
      throw error;
    }
  }

  /**
   * Analyze multiple failures and deduplicate fixes
   */
  async analyzeMultipleFailures(contexts: FailureContext[]): Promise<{
    analyses: Map<string, AnalysisResult>;
    deduplicatedFixes: (PromptFix | ToolFix)[];
  }> {
    const analyses = new Map<string, AnalysisResult>();
    const allFixes: (PromptFix | ToolFix)[] = [];

    for (const context of contexts) {
      try {
        const result = await this.analyzeFailure(context);
        analyses.set(context.testId, result);
        allFixes.push(...result.fixes);
      } catch (error) {
        console.error(`Failed to analyze ${context.testId}:`, error);
      }
    }

    // Deduplicate fixes based on target file and change description
    const deduplicatedFixes = this.deduplicateFixes(allFixes);

    return { analyses, deduplicatedFixes };
  }

  /**
   * Analyze a test failure and generate fix recommendations with A/B testing suggestions
   * This method extends analyzeFailure to include A/B testing recommendations
   * for high-impact fixes.
   */
  async analyzeFailureWithABRecommendation(
    context: FailureContext
  ): Promise<AnalysisResultWithABRecommendations> {
    // First, get the standard analysis
    const result = await this.analyzeFailure(context);

    // If no trigger service, return without A/B recommendations
    if (!this.triggerService || !this.database) {
      return {
        ...result,
        abRecommendations: [],
        testableFixIds: [],
      };
    }

    // Convert fixes to GeneratedFix format for A/B assessment
    const generatedFixes = this.convertToGeneratedFixes(result.fixes, context, result.rootCause);

    // Save generated fixes to database
    for (const fix of generatedFixes) {
      this.database.saveGeneratedFix(fix);
    }

    // Generate A/B recommendations using TriggerService
    const abRecommendations = this.triggerService.generateABRecommendations(generatedFixes);
    const testableFixIds = abRecommendations.map(r => r.fix.fixId);

    // Log A/B recommendations if any
    if (abRecommendations.length > 0) {
      console.log(`[LLMAnalysisService] Found ${abRecommendations.length} fixes warranting A/B testing:`);
      for (const rec of abRecommendations) {
        console.log(`  - [${rec.impactLevel.toUpperCase()}] ${rec.fix.changeDescription.substring(0, 50)}`);
      }
    }

    return {
      ...result,
      abRecommendations,
      testableFixIds,
    };
  }

  /**
   * Analyze multiple failures with A/B recommendations
   */
  async analyzeMultipleFailuresWithABRecommendations(contexts: FailureContext[]): Promise<{
    analyses: Map<string, AnalysisResultWithABRecommendations>;
    deduplicatedFixes: (PromptFix | ToolFix)[];
    abRecommendations: ABRecommendation[];
  }> {
    const analyses = new Map<string, AnalysisResultWithABRecommendations>();
    const allFixes: (PromptFix | ToolFix)[] = [];
    const allABRecommendations: ABRecommendation[] = [];

    for (const context of contexts) {
      try {
        const result = await this.analyzeFailureWithABRecommendation(context);
        analyses.set(context.testId, result);
        allFixes.push(...result.fixes);
        allABRecommendations.push(...result.abRecommendations);
      } catch (error) {
        console.error(`Failed to analyze ${context.testId}:`, error);
      }
    }

    // Deduplicate fixes
    const deduplicatedFixes = this.deduplicateFixes(allFixes);

    // Deduplicate A/B recommendations by fix ID
    const seenFixIds = new Set<string>();
    const uniqueABRecommendations = allABRecommendations.filter(rec => {
      if (seenFixIds.has(rec.fix.fixId)) {
        return false;
      }
      seenFixIds.add(rec.fix.fixId);
      return true;
    });

    return {
      analyses,
      deduplicatedFixes,
      abRecommendations: uniqueABRecommendations,
    };
  }

  /**
   * Convert PromptFix/ToolFix to GeneratedFix format for A/B testing
   */
  private convertToGeneratedFixes(
    fixes: (PromptFix | ToolFix)[],
    context: FailureContext,
    rootCause: RootCause
  ): GeneratedFix[] {
    const generatedFixes: GeneratedFix[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < fixes.length; i++) {
      const fix = fixes[i];
      const fixId = `FIX-${Date.now().toString(36)}-${i}`;

      const generatedFix: GeneratedFix = {
        fixId,
        runId: '', // Will be set by caller if needed
        affectedTests: [context.testId],
        type: fix.type,
        targetFile: fix.targetFile,
        location: fix.type === 'prompt'
          ? {
              section: (fix as PromptFix).location.section,
              afterLine: (fix as PromptFix).location.afterLine,
            }
          : {
              function: (fix as ToolFix).location.function,
              lineNumber: (fix as ToolFix).location.lineNumber,
              afterLine: (fix as ToolFix).location.afterLine,
            },
        changeDescription: fix.changeDescription,
        changeCode: fix.changeCode,
        rootCause: {
          type: rootCause.type,
          evidence: rootCause.evidence,
        },
        priority: fix.priority,
        confidence: fix.confidence,
        status: 'pending',
        createdAt: now,
      };

      generatedFixes.push(generatedFix);
    }

    return generatedFixes;
  }

  private buildAnalysisPrompt(context: FailureContext): string {
    const transcriptSummary = context.transcript
      .slice(-10) // Last 10 turns
      .map(t => `[${t.role}]: ${t.content.substring(0, 500)}${t.content.length > 500 ? '...' : ''}`)
      .join('\n\n');

    const apiCallsSummary = context.apiCalls
      .slice(-5) // Last 5 API calls
      .map(call => {
        const req = call.requestPayload ? JSON.parse(call.requestPayload) : null;
        const res = call.responsePayload ? JSON.parse(call.responsePayload) : null;
        return `Tool: ${call.toolName}\nRequest: ${JSON.stringify(req, null, 2)?.substring(0, 300)}\nResponse: ${JSON.stringify(res, null, 2)?.substring(0, 300)}`;
      })
      .join('\n---\n');

    const findingsSummary = context.findings
      .map(f => `[${f.severity}] ${f.title}: ${f.description}`)
      .join('\n');

    return `You are an expert at debugging AI chatbot failures. You are analyzing a test failure for "Allie IVA", an orthodontic appointment scheduling chatbot.

## SYSTEM PROMPT BEING TESTED (excerpt - key sections)
${this.systemPromptContent.substring(0, 8000)}
${this.systemPromptContent.length > 8000 ? '\n... [truncated]' : ''}

## SCHEDULING TOOL CODE (excerpt)
${this.schedulingToolContent.substring(0, 4000)}
${this.schedulingToolContent.length > 4000 ? '\n... [truncated]' : ''}

## PATIENT TOOL CODE (excerpt)
${this.patientToolContent.substring(0, 4000)}
${this.patientToolContent.length > 4000 ? '\n... [truncated]' : ''}

---

## TEST FAILURE DETAILS

**Test:** ${context.testId} - ${context.testName}
**Failed Step:** ${context.stepId} - ${context.stepDescription}
**Error:** ${context.errorMessage || 'Pattern mismatch'}

**Expected Pattern:** ${context.expectedPattern}
${context.unexpectedPatterns ? `**Unexpected Patterns Found:** ${context.unexpectedPatterns.join(', ')}` : ''}

## CONVERSATION TRANSCRIPT (last 10 turns)
${transcriptSummary}

## API/TOOL CALLS MADE
${apiCallsSummary || 'No API calls recorded'}

## EXISTING FINDINGS
${findingsSummary || 'No findings recorded'}

---

## YOUR TASK

### Step 0: DECISION FRAMEWORK CLASSIFICATION (Critical First Step!)

Before analyzing the root cause, you MUST classify this failure using the "Golden Rule":

**Answer these two questions:**
1. **Would a REAL USER say what the test agent said?**
   - Look at the user messages in the transcript
   - Would an actual parent calling to schedule an appointment respond this way?
   - Consider if the user response is natural, realistic, and what you'd expect from a real caller

2. **Did the BOT respond appropriately to the user's input?**
   - Given what the user said, is the bot's response reasonable?
   - Did the bot understand the user's intent?
   - Did the bot guide the conversation properly?

**Classification Rules:**
- **Bot Issue** (fix the Flowise prompt): Real user WOULD say this, but bot responded WRONG
- **Test Agent Issue** (fix the test agent): Test agent behavior is UNREALISTIC
- **Both** (fix bot FIRST): Both have problems, but bot fix takes priority

### Step 1: IDENTIFY ROOT CAUSE

Categorize as one of:
   - \`prompt-gap\`: Missing instruction in the system prompt
   - \`prompt-conflict\`: Conflicting instructions in the system prompt
   - \`tool-bug\`: Bug in the tool code (missing default, wrong parsing, etc.)
   - \`tool-missing-default\`: Tool needs a default value for a parameter
   - \`llm-hallucination\`: LLM generated unexpected response despite correct instructions
   - \`test-issue\`: The test expectation is wrong, not the agent

### Step 2: GENERATE SPECIFIC FIXES with:
   - Target file (system prompt or tool file)
   - Exact location (section name, function name, or line to insert after)
   - Complete replacement/addition code
   - Confidence score (0.0 to 1.0)
   - Priority (critical, high, medium, low)

**AVAILABLE TARGET FILES:**
- **System Prompt**: \`docs/Chord_Cloud9_SystemPrompt.md\` - Bot behavior instructions
- **Scheduling Tool (.js)**: \`docs/chord_dso_scheduling-StepwiseSearch.js\` - JavaScript logic
- **Scheduling Tool (.json)**: \`docs/chord_dso_scheduling-StepwiseSearch.json\` - Flowise config
- **Patient Tool (.js)**: \`docs/chord_dso_patient-FIXED.js\` - JavaScript logic
- **Patient Tool (.json)**: \`docs/chord_dso_patient-FIXED.json\` - Flowise config

**When to use each:**
- **.js files**: For fixing tool LOGIC (defaults, parsing, validation, API calls)
- **.json files**: For fixing Flowise CONFIGURATION (descriptions, schemas, parameters)
- **.md files**: For fixing bot BEHAVIOR (instructions, rules, examples)

### Step 3: Respond in this exact JSON format:
\`\`\`json
{
  "classification": {
    "issueLocation": "bot|test-agent|both",
    "confidence": 0.9,
    "reasoning": "Brief explanation of why this classification",
    "userBehaviorRealistic": true,
    "botResponseAppropriate": false
  },
  "rootCause": {
    "type": "prompt-gap|prompt-conflict|tool-bug|tool-missing-default|llm-hallucination|test-issue",
    "evidence": ["evidence 1", "evidence 2"],
    "confidence": 0.85,
    "explanation": "Brief explanation of why this is the root cause"
  },
  "fixes": [
    {
      "type": "prompt",
      "fixType": "add-rule|add-example|clarify-instruction|ban-word|add-phase-step|fix-format-spec",
      "targetFile": "docs/Chord_Cloud9_SystemPrompt.md",
      "location": {
        "section": "Phase 7: Scheduling",
        "afterLine": "ALWAYS check availability before offering times"
      },
      "changeDescription": "Add rule to always mention checking availability",
      "changeCode": "- ALWAYS say 'Let me check availability for you' before calling the slots API",
      "priority": "high",
      "confidence": 0.9,
      "reasoning": "The agent skipped the availability check language"
    }
  ],
  "summary": "One sentence summary of the issue and fix"
}
\`\`\`

**IMPORTANT:** The classification field is REQUIRED. Always assess user behavior realism and bot response appropriateness before generating fixes.

Be specific and actionable. Generate complete code that can be directly applied.`;
  }

  private parseAnalysisResponse(responseText: string, context: FailureContext): AnalysisResult {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      responseText.match(/\{[\s\S]*"rootCause"[\s\S]*\}/);

    if (!jsonMatch) {
      // Return a fallback result if parsing fails
      return this.createFallbackResult(context, responseText);
    }

    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      // Parse classification (new Decision Framework field)
      const classification: FixClassification | undefined = parsed.classification ? {
        issueLocation: parsed.classification.issueLocation || 'bot',
        confidence: parsed.classification.confidence || 0.5,
        reasoning: parsed.classification.reasoning || 'No reasoning provided',
        userBehaviorRealistic: parsed.classification.userBehaviorRealistic ?? true,
        botResponseAppropriate: parsed.classification.botResponseAppropriate ?? false,
      } : undefined;

      // Validate and normalize the parsed result
      const rootCause: RootCause = {
        type: parsed.rootCause?.type || 'prompt-gap',
        evidence: parsed.rootCause?.evidence || [],
        confidence: parsed.rootCause?.confidence || 0.5,
        explanation: parsed.rootCause?.explanation || 'Unknown',
      };

      const fixes: (PromptFix | ToolFix)[] = (parsed.fixes || []).map((fix: any) => {
        if (fix.type === 'prompt') {
          return {
            type: 'prompt' as const,
            fixType: fix.fixType || 'add-rule',
            targetFile: fix.targetFile || 'docs/Chord_Cloud9_SystemPrompt.md',
            location: fix.location || { section: 'Unknown' },
            changeDescription: fix.changeDescription || '',
            changeCode: fix.changeCode || '',
            priority: fix.priority || 'medium',
            confidence: fix.confidence || 0.5,
            reasoning: fix.reasoning || '',
          } as PromptFix;
        } else {
          return {
            type: 'tool' as const,
            fixType: fix.fixType || 'add-default',
            targetFile: fix.targetFile || 'docs/chord_dso_scheduling-StepwiseSearch.js',
            location: fix.location || {},
            changeDescription: fix.changeDescription || '',
            changeCode: fix.changeCode || '',
            priority: fix.priority || 'medium',
            confidence: fix.confidence || 0.5,
            reasoning: fix.reasoning || '',
          } as ToolFix;
        }
      });

      // Derive classification from actual fix target files (overrides LLM classification)
      const derivedClassification = this.deriveClassificationFromFixes(fixes, classification);

      return {
        rootCause,
        fixes,
        summary: parsed.summary || 'Analysis complete',
        classification: derivedClassification,
      };
    } catch (error) {
      return this.createFallbackResult(context, responseText);
    }
  }

  /**
   * Derive classification from actual fix target files
   * This ensures classification matches what the fixes actually modify
   */
  private deriveClassificationFromFixes(
    fixes: (PromptFix | ToolFix)[],
    llmClassification?: FixClassification
  ): FixClassification | undefined {
    if (fixes.length === 0) {
      return llmClassification; // No fixes, use LLM classification if available
    }

    // Categorize fixes by target type
    let hasBotFixes = false;
    let hasTestAgentFixes = false;

    for (const fix of fixes) {
      const targetFile = fix.targetFile.toLowerCase();
      if (
        targetFile.includes('systemprompt') ||
        targetFile.endsWith('.md') ||
        targetFile.includes('chord_dso') ||
        (targetFile.includes('docs/') && (targetFile.endsWith('.js') || targetFile.endsWith('.json')))
      ) {
        hasBotFixes = true;
      } else if (targetFile.includes('test-agent/') || targetFile.includes('test-cases/')) {
        hasTestAgentFixes = true;
      } else {
        // Default unknown targets to bot fixes
        hasBotFixes = true;
      }
    }

    // Determine issue location based on actual fix targets
    let issueLocation: 'bot' | 'test-agent' | 'both';
    if (hasBotFixes && hasTestAgentFixes) {
      issueLocation = 'both';
    } else if (hasTestAgentFixes) {
      issueLocation = 'test-agent';
    } else {
      issueLocation = 'bot';
    }

    // Return classification with derived issueLocation
    return {
      issueLocation,
      confidence: llmClassification?.confidence || 0.8,
      reasoning: llmClassification?.reasoning || `Derived from fix target files`,
      userBehaviorRealistic: llmClassification?.userBehaviorRealistic ?? (issueLocation !== 'test-agent'),
      botResponseAppropriate: llmClassification?.botResponseAppropriate ?? (issueLocation === 'test-agent'),
    };
  }

  private createFallbackResult(context: FailureContext, responseText: string): AnalysisResult {
    return {
      rootCause: {
        type: 'prompt-gap',
        evidence: ['Unable to parse LLM response'],
        confidence: 0.3,
        explanation: `Analysis failed to parse. Raw response excerpt: ${responseText.substring(0, 500)}`,
      },
      fixes: [],
      summary: 'Analysis failed - manual review required',
    };
  }

  private deduplicateFixes(fixes: (PromptFix | ToolFix)[]): (PromptFix | ToolFix)[] {
    const seen = new Map<string, PromptFix | ToolFix>();

    for (const fix of fixes) {
      const key = `${fix.targetFile}:${fix.changeDescription}`;
      const existing = seen.get(key);

      if (!existing || fix.confidence > existing.confidence) {
        seen.set(key, fix);
      }
    }

    // Sort by confidence descending
    return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Generate a quick analysis without full LLM call (for testing/fallback)
   */
  generateRuleBasedAnalysis(context: FailureContext): AnalysisResult {
    console.log(`[Diagnosis:RuleBased] ========== generateRuleBasedAnalysis ==========`);
    console.log(`[Diagnosis:RuleBased] Test: ${context.testId}, Step: ${context.stepId}`);
    console.log(`[Diagnosis:RuleBased] Transcript length: ${context.transcript.length} turns`);
    console.log(`[Diagnosis:RuleBased] API calls: ${context.apiCalls.length}`);

    const fixes: (PromptFix | ToolFix)[] = [];
    let rootCauseType: RootCause['type'] = 'prompt-gap';
    const evidence: string[] = [];

    // Check for common patterns
    const lastAssistantMessage = context.transcript
      .filter(t => t.role === 'assistant')
      .pop()?.content || '';

    console.log(`[Diagnosis:RuleBased] Last assistant message (${lastAssistantMessage.length} chars): "${lastAssistantMessage.slice(0, 100)}..."`);


    // Check for banned words
    const bannedWords = ['sorry', 'error', 'problem', 'unable', 'cannot', 'failed'];
    for (const word of bannedWords) {
      if (lastAssistantMessage.toLowerCase().includes(word)) {
        evidence.push(`Agent used banned word: "${word}"`);
        fixes.push({
          type: 'prompt',
          fixType: 'ban-word',
          targetFile: 'docs/Chord_Cloud9_SystemPrompt.md',
          location: { section: 'Positive_Language_Rule' },
          changeDescription: `Add explicit ban for "${word}"`,
          changeCode: `- NEVER say "${word}" - use positive alternatives instead`,
          priority: 'high',
          confidence: 0.9,
          reasoning: `Agent used banned word "${word}" in response`,
        });
      }
    }

    // Check for tool issues in API calls
    for (const call of context.apiCalls) {
      if (call.responsePayload?.includes('error') || call.status === 'error') {
        rootCauseType = 'tool-bug';
        evidence.push(`Tool call ${call.toolName} returned error`);

        // Check for common parameter issues
        const request = call.requestPayload ? JSON.parse(call.requestPayload) : {};
        if (request.appointmentTypeGUID === '' || request.appointmentTypeGUID === null) {
          fixes.push({
            type: 'tool',
            fixType: 'add-default',
            targetFile: 'docs/chord_dso_scheduling-StepwiseSearch.js',
            location: { function: 'book_child' },
            changeDescription: 'Add default appointmentTypeGUID',
            changeCode: `const appointmentTypeGUID = params.appointmentTypeGUID || CLOUD9.defaultApptTypeGUID;`,
            priority: 'critical',
            confidence: 0.95,
            reasoning: 'Empty appointmentTypeGUID causing booking failure',
          });
        }
      }
    }

    // Default classification for rule-based analysis: assume bot issue
    // since we can't assess user behavior realism without LLM
    // Note: rootCauseType can only be 'prompt-gap' or 'tool-bug', never 'test-issue'
    const classification: FixClassification = {
      issueLocation: 'bot', // Rule-based analysis always assumes bot issue
      confidence: 0.6,
      reasoning: 'Rule-based classification - LLM analysis recommended for accurate assessment',
      userBehaviorRealistic: true, // Assume user behavior is OK in rule-based
      botResponseAppropriate: false, // Assume bot has issue since test failed
    };

    const result = {
      rootCause: {
        type: rootCauseType,
        evidence,
        confidence: evidence.length > 0 ? 0.7 : 0.3,
        explanation: evidence.length > 0
          ? evidence.join('; ')
          : 'No specific pattern detected - manual review needed',
      },
      fixes,
      summary: fixes.length > 0
        ? `Found ${fixes.length} potential fix(es) based on pattern analysis`
        : 'No automatic fixes generated - LLM analysis recommended',
      classification,
    };

    console.log(`[Diagnosis:RuleBased] Result:`, {
      rootCauseType: result.rootCause.type,
      confidence: result.rootCause.confidence,
      evidenceCount: result.rootCause.evidence.length,
      fixCount: result.fixes.length,
      fixTypes: result.fixes.map(f => `${f.type}:${f.fixType}`),
      classification: result.classification?.issueLocation,
    });

    return result;
  }
}

// Singleton instance
export const llmAnalysisService = new LLMAnalysisService();

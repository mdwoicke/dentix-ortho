/**
 * Agent Failure Analyzer
 * Analyzes test failures to determine root cause and generate fixes
 * Uses LLM Analysis Service for deep analysis
 */

import { v4 as uuidv4 } from 'uuid';
import { Database, TestResult, GeneratedFix, ApiCall } from '../storage/database';
import { ConversationTurn, Finding, ConversationStep } from '../tests/test-case';
import {
  LLMAnalysisService,
  FailureContext,
  AnalysisResult,
  PromptFix,
  ToolFix,
  llmAnalysisService,
} from '../services/llm-analysis-service';

// ============================================================================
// Types
// ============================================================================

export interface FailedTest {
  testId: string;
  testName: string;
  category: string;
  failedStep: ConversationStep;
  errorMessage: string;
  transcript: ConversationTurn[];
  apiCalls: ApiCall[];
  findings: Finding[];
}

export interface AnalyzerOptions {
  useLLM?: boolean;           // Use LLM analysis (default: true if available)
  maxConcurrent?: number;     // Max concurrent LLM calls (default: 3)
  saveToDatabase?: boolean;   // Save results to database (default: true)
}

export interface AnalysisReport {
  runId: string;
  analyzedAt: string;
  totalFailures: number;
  analyzedCount: number;
  generatedFixes: GeneratedFix[];
  summary: {
    promptFixes: number;
    toolFixes: number;
    highConfidenceFixes: number;
    rootCauseBreakdown: Record<string, number>;
  };
}

// ============================================================================
// Agent Failure Analyzer
// ============================================================================

export class AgentFailureAnalyzer {
  private db: Database;
  private llmService: LLMAnalysisService;

  constructor(db: Database) {
    this.db = db;
    this.llmService = llmAnalysisService;
  }

  /**
   * Analyze all failures from a test run
   */
  async analyzeRun(runId: string, options: AnalyzerOptions = {}): Promise<AnalysisReport> {
    const {
      useLLM = this.llmService.isAvailable(),
      maxConcurrent = 3,
      saveToDatabase = true,
    } = options;

    console.log(`\n[Diagnosis:Analyzer] ========== Analyzing Run ==========`);
    console.log(`[Diagnosis:Analyzer] runId: ${runId}`);
    console.log(`[Diagnosis:Analyzer] Options: useLLM=${useLLM}, maxConcurrent=${maxConcurrent}, saveToDatabase=${saveToDatabase}`);
    console.log(`[Diagnosis:Analyzer] LLM Available: ${this.llmService.isAvailable()}`);

    // Get failed tests
    console.log(`[Diagnosis:Analyzer] Calling db.getFailedTestIds(${runId})...`);
    const failedTestIds = this.db.getFailedTestIds(runId);
    console.log(`[Diagnosis:Analyzer] getFailedTestIds returned:`, failedTestIds);

    console.log(`[Diagnosis:Analyzer] Calling db.getTestResults(${runId})...`);
    const testResults = this.db.getTestResults(runId);
    console.log(`[Diagnosis:Analyzer] getTestResults returned ${testResults.length} results`);

    // Log status breakdown
    const statusBreakdown = testResults.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`[Diagnosis:Analyzer] Test results by status:`, statusBreakdown);

    if (failedTestIds.length === 0) {
      console.log(`[Diagnosis:Analyzer] No failures to analyze - returning empty report`);
      return this.createEmptyReport(runId);
    }

    console.log(`[Diagnosis:Analyzer] Found ${failedTestIds.length} failed test(s): ${failedTestIds.join(', ')}`);

    // Build failure contexts
    console.log(`[Diagnosis:Analyzer] Building failure contexts...`);
    const failureContexts = await this.buildFailureContexts(runId, failedTestIds, testResults);
    console.log(`[Diagnosis:Analyzer] Built ${failureContexts.length} failure context(s)`);

    if (failureContexts.length === 0) {
      console.log(`[Diagnosis:Analyzer] No failure contexts built - returning empty report`);
      return this.createEmptyReport(runId);
    }

    // Analyze failures
    const allFixes: GeneratedFix[] = [];
    const rootCauseBreakdown: Record<string, number> = {};
    let analyzedCount = 0;

    for (const context of failureContexts) {
      try {
        console.log(`[Diagnosis:Analyzer] Analyzing: ${context.testId} - ${context.stepId}`);
        console.log(`[Diagnosis:Analyzer]   Expected pattern: ${context.expectedPattern?.slice(0, 100)}...`);

        let result: AnalysisResult;

        if (useLLM) {
          console.log(`[Diagnosis:Analyzer]   Using LLM analysis...`);
          result = await this.llmService.analyzeFailure(context);
        } else {
          console.log(`[Diagnosis:Analyzer]   Using rule-based analysis...`);
          result = this.llmService.generateRuleBasedAnalysis(context);
        }

        console.log(`[Diagnosis:Analyzer]   Analysis result:`, {
          rootCause: result.rootCause.type,
          confidence: result.rootCause.confidence,
          fixCount: result.fixes.length,
          classification: result.classification?.issueLocation,
        });

        // Track root cause
        const causeType = result.rootCause.type;
        rootCauseBreakdown[causeType] = (rootCauseBreakdown[causeType] || 0) + 1;

        // Convert fixes to GeneratedFix format
        const generatedFixes = this.convertToGeneratedFixes(
          result.fixes,
          runId,
          context.testId,
          result.rootCause,
          result.classification
        );

        console.log(`[Diagnosis:Analyzer]   Converted to ${generatedFixes.length} GeneratedFix(es)`);

        allFixes.push(...generatedFixes);
        analyzedCount++;

        console.log(`[Diagnosis:Analyzer]   Root cause: ${causeType} (confidence: ${(result.rootCause.confidence * 100).toFixed(0)}%)`);
        console.log(`[Diagnosis:Analyzer]   Generated ${generatedFixes.length} fix(es)`);

      } catch (error) {
        console.error(`[Diagnosis:Analyzer] Failed to analyze ${context.testId}:`, error);
      }
    }

    console.log(`[Diagnosis:Analyzer] Total fixes before deduplication: ${allFixes.length}`);

    // Deduplicate fixes
    const deduplicatedFixes = this.deduplicateFixes(allFixes);
    console.log(`[Diagnosis:Analyzer] Total fixes after deduplication: ${deduplicatedFixes.length}`);

    // Save to database if requested
    if (saveToDatabase && deduplicatedFixes.length > 0) {
      console.log(`[Diagnosis:Analyzer] Saving ${deduplicatedFixes.length} fix(es) to database...`);
      this.db.saveGeneratedFixes(deduplicatedFixes);
      console.log(`[Diagnosis:Analyzer] Saved successfully`);
    } else if (deduplicatedFixes.length === 0) {
      console.log(`[Diagnosis:Analyzer] No fixes to save (deduplicatedFixes.length = 0)`);
    } else {
      console.log(`[Diagnosis:Analyzer] Skipping database save (saveToDatabase = false)`);
    }

    // Build report
    const report: AnalysisReport = {
      runId,
      analyzedAt: new Date().toISOString(),
      totalFailures: failedTestIds.length,
      analyzedCount,
      generatedFixes: deduplicatedFixes,
      summary: {
        promptFixes: deduplicatedFixes.filter(f => f.type === 'prompt').length,
        toolFixes: deduplicatedFixes.filter(f => f.type === 'tool').length,
        highConfidenceFixes: deduplicatedFixes.filter(f => f.confidence >= 0.8).length,
        rootCauseBreakdown,
      },
    };

    return report;
  }

  /**
   * Analyze a single failed test
   */
  async analyzeTest(
    runId: string,
    testId: string,
    options: AnalyzerOptions = {}
  ): Promise<GeneratedFix[]> {
    const { useLLM = this.llmService.isAvailable() } = options;

    const testResults = this.db.getTestResults(runId);
    const testResult = testResults.find(r => r.testId === testId);

    if (!testResult) {
      throw new Error(`Test ${testId} not found in run ${runId}`);
    }

    const contexts = await this.buildFailureContexts(runId, [testId], testResults);
    if (contexts.length === 0) {
      return [];
    }

    const context = contexts[0];
    let result: AnalysisResult;

    if (useLLM) {
      result = await this.llmService.analyzeFailure(context);
    } else {
      result = this.llmService.generateRuleBasedAnalysis(context);
    }

    return this.convertToGeneratedFixes(
      result.fixes,
      runId,
      testId,
      result.rootCause,
      result.classification
    );
  }

  private async buildFailureContexts(
    runId: string,
    failedTestIds: string[],
    testResults: TestResult[]
  ): Promise<FailureContext[]> {
    const contexts: FailureContext[] = [];

    for (const testId of failedTestIds) {
      const result = testResults.find(r => r.testId === testId);
      if (!result) continue;

      // Get transcript
      const transcript = this.db.getTranscript(testId, runId);

      // Get API calls
      const apiCalls = this.db.getApiCalls(testId, runId);

      // Get findings
      const findings = this.db.getFindings(runId).filter(
        (f: any) => f.testId === testId || !f.testId
      );

      // Find the failed step from the error message
      const stepMatch = result.errorMessage?.match(/step[- ]?(\d+|[a-z-]+)/i);
      const failedStepId = stepMatch ? stepMatch[0].replace(/\s+/g, '-').toLowerCase() : 'unknown';

      // Extract expected pattern from error
      const patternMatch = result.errorMessage?.match(/patterns?:\s*(.+)/i);
      const expectedPattern = patternMatch ? patternMatch[1] : 'unknown';

      contexts.push({
        testId,
        testName: result.testName,
        stepId: failedStepId,
        stepDescription: result.errorMessage || '',
        expectedPattern,
        transcript,
        apiCalls,
        errorMessage: result.errorMessage,
        findings: findings as Finding[],
      });
    }

    return contexts;
  }

  private convertToGeneratedFixes(
    fixes: (PromptFix | ToolFix)[],
    runId: string,
    testId: string,
    rootCause: { type: string; evidence: string[] },
    classification?: {
      issueLocation: 'bot' | 'test-agent' | 'both';
      confidence: number;
      reasoning: string;
      userBehaviorRealistic: boolean;
      botResponseAppropriate: boolean;
    }
  ): GeneratedFix[] {
    return fixes.map(fix => ({
      fixId: `fix-${uuidv4().slice(0, 8)}`,
      runId,
      type: fix.type,
      targetFile: fix.targetFile,
      changeDescription: fix.changeDescription,
      changeCode: fix.changeCode,
      location: fix.location,
      priority: fix.priority,
      confidence: fix.confidence,
      affectedTests: [testId],
      rootCause: {
        type: rootCause.type,
        evidence: rootCause.evidence,
      },
      classification,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    }));
  }

  private deduplicateFixes(fixes: GeneratedFix[]): GeneratedFix[] {
    if (fixes.length === 0) return [];

    // Group fixes by target file first
    const byFile = new Map<string, GeneratedFix[]>();
    for (const fix of fixes) {
      const existing = byFile.get(fix.targetFile) || [];
      existing.push(fix);
      byFile.set(fix.targetFile, existing);
    }

    const deduplicatedFixes: GeneratedFix[] = [];

    // Process each file group
    for (const [_targetFile, fileFixes] of byFile) {
      const merged = this.mergeOverlappingFixes(fileFixes);
      deduplicatedFixes.push(...merged);
    }

    // Sort by priority then confidence
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return deduplicatedFixes.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Merge fixes that semantically overlap (address the same issue)
   * Uses key phrase extraction and similarity scoring
   */
  private mergeOverlappingFixes(fixes: GeneratedFix[]): GeneratedFix[] {
    if (fixes.length <= 1) return fixes;

    // Extract key phrases from each fix
    const fixesWithPhrases = fixes.map(fix => ({
      fix,
      phrases: this.extractKeyPhrases(fix.changeDescription),
      codeSignature: this.extractCodeSignature(fix.changeCode),
    }));

    // Find groups of similar fixes
    const groups: GeneratedFix[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < fixesWithPhrases.length; i++) {
      if (used.has(i)) continue;

      const group: GeneratedFix[] = [fixesWithPhrases[i].fix];
      used.add(i);

      for (let j = i + 1; j < fixesWithPhrases.length; j++) {
        if (used.has(j)) continue;

        const similarity = this.calculateFixSimilarity(
          fixesWithPhrases[i],
          fixesWithPhrases[j]
        );

        // If similarity is above threshold, they're addressing the same issue
        if (similarity >= 0.4) {
          group.push(fixesWithPhrases[j].fix);
          used.add(j);
          console.log(`    [Dedup] Merging overlapping fixes (similarity: ${(similarity * 100).toFixed(0)}%):`);
          console.log(`      - "${fixesWithPhrases[i].fix.changeDescription.slice(0, 60)}..."`);
          console.log(`      - "${fixesWithPhrases[j].fix.changeDescription.slice(0, 60)}..."`);
        }
      }

      groups.push(group);
    }

    // For each group, keep the best fix and merge affected tests
    return groups.map(group => this.selectBestFix(group));
  }

  /**
   * Extract key phrases from a fix description for comparison
   */
  private extractKeyPhrases(description: string): Set<string> {
    const phrases = new Set<string>();
    const text = description.toLowerCase();

    // Extract quoted phrases (e.g., 'anything else', 'Yes')
    const quotedMatches = text.match(/['"]([^'"]+)['"]/g) || [];
    quotedMatches.forEach(m => phrases.add(m.replace(/['"]/g, '').trim()));

    // Extract key concept words (filtering out common words)
    const stopWords = new Set([
      'add', 'for', 'to', 'the', 'a', 'an', 'in', 'of', 'and', 'or', 'with',
      'when', 'that', 'this', 'is', 'are', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
      'might', 'must', 'shall', 'can', 'need', 'explicit', 'new', 'handling',
      'handle', 'rule', 'exception', 'context', 'response', 'responses',
    ]);

    // Extract meaningful words
    const words = text
      .replace(/['"]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    words.forEach(w => phrases.add(w));

    // Extract bigrams (two-word phrases) for better matching
    for (let i = 0; i < words.length - 1; i++) {
      phrases.add(`${words[i]} ${words[i + 1]}`);
    }

    return phrases;
  }

  /**
   * Extract a signature from the code change for comparison
   */
  private extractCodeSignature(code: string): Set<string> {
    const signature = new Set<string>();
    const text = code.toLowerCase();

    // Extract XML section names
    const sectionMatches = text.match(/<([a-z_]+)[^>]*>/gi) || [];
    sectionMatches.forEach(m => {
      const name = m.replace(/<\/?|\s.*|>/g, '');
      if (name) signature.add(`section:${name}`);
    });

    // Extract function names
    const funcMatches = text.match(/function\s+(\w+)/gi) || [];
    funcMatches.forEach(m => {
      const name = m.replace(/function\s+/i, '');
      if (name) signature.add(`func:${name}`);
    });

    // Extract case statements
    const caseMatches = text.match(/case\s+['"]([^'"]+)['"]/gi) || [];
    caseMatches.forEach(m => {
      const name = m.replace(/case\s+['"]/i, '').replace(/['"]$/, '');
      if (name) signature.add(`case:${name}`);
    });

    // Extract quoted strings that might be key identifiers
    const quotedMatches = text.match(/['"]([^'"]{3,30})['"]/g) || [];
    quotedMatches.forEach(m => {
      const content = m.replace(/['"]/g, '').trim();
      if (content && !content.includes(' ')) {
        signature.add(`id:${content}`);
      }
    });

    return signature;
  }

  /**
   * Calculate similarity between two fixes
   * Returns a score from 0 to 1
   */
  private calculateFixSimilarity(
    fix1: { fix: GeneratedFix; phrases: Set<string>; codeSignature: Set<string> },
    fix2: { fix: GeneratedFix; phrases: Set<string>; codeSignature: Set<string> }
  ): number {
    // Must be same type (prompt/tool) to be considered similar
    if (fix1.fix.type !== fix2.fix.type) return 0;

    // Calculate phrase overlap (Jaccard similarity)
    const phraseIntersection = new Set(
      [...fix1.phrases].filter(x => fix2.phrases.has(x))
    );
    const phraseUnion = new Set([...fix1.phrases, ...fix2.phrases]);
    const phraseSimilarity = phraseUnion.size > 0
      ? phraseIntersection.size / phraseUnion.size
      : 0;

    // Calculate code signature overlap
    const codeIntersection = new Set(
      [...fix1.codeSignature].filter(x => fix2.codeSignature.has(x))
    );
    const codeUnion = new Set([...fix1.codeSignature, ...fix2.codeSignature]);
    const codeSimilarity = codeUnion.size > 0
      ? codeIntersection.size / codeUnion.size
      : 0;

    // Check for same location (section/function)
    let locationMatch = 0;
    if (fix1.fix.location && fix2.fix.location) {
      if (fix1.fix.location.section && fix1.fix.location.section === fix2.fix.location.section) {
        locationMatch = 0.3;
      }
      if (fix1.fix.location.function && fix1.fix.location.function === fix2.fix.location.function) {
        locationMatch = 0.3;
      }
    }

    // Weighted combination
    // Phrase similarity is most important for detecting semantic overlap
    const similarity = (phraseSimilarity * 0.5) + (codeSimilarity * 0.3) + locationMatch;

    return Math.min(similarity, 1);
  }

  /**
   * Select the best fix from a group of similar fixes
   * Merges affected tests from all fixes
   */
  private selectBestFix(group: GeneratedFix[]): GeneratedFix {
    if (group.length === 1) return group[0];

    // Sort by priority (critical first) then confidence (highest first)
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...group].sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });

    // Take the best one
    const best = { ...sorted[0] };

    // Merge affected tests from all fixes in the group
    const allAffectedTests = new Set<string>();
    for (const fix of group) {
      fix.affectedTests.forEach(t => allAffectedTests.add(t));
    }
    best.affectedTests = Array.from(allAffectedTests);

    // Slightly boost confidence when multiple similar fixes were generated
    // (suggests higher agreement on the issue)
    if (group.length > 1) {
      best.confidence = Math.min(best.confidence + 0.05, 1);
    }

    return best;
  }

  private createEmptyReport(runId: string): AnalysisReport {
    return {
      runId,
      analyzedAt: new Date().toISOString(),
      totalFailures: 0,
      analyzedCount: 0,
      generatedFixes: [],
      summary: {
        promptFixes: 0,
        toolFixes: 0,
        highConfidenceFixes: 0,
        rootCauseBreakdown: {},
      },
    };
  }

  /**
   * Get pending fixes for review
   */
  getPendingFixes(runId?: string): GeneratedFix[] {
    return this.db.getGeneratedFixes(runId, 'pending');
  }

  /**
   * Get all fixes grouped by type
   */
  getFixesByType(runId?: string): { prompt: GeneratedFix[]; tool: GeneratedFix[] } {
    const fixes = this.db.getGeneratedFixes(runId);
    return {
      prompt: fixes.filter(f => f.type === 'prompt'),
      tool: fixes.filter(f => f.type === 'tool'),
    };
  }

  /**
   * Mark a fix as applied
   */
  markFixApplied(fixId: string): void {
    this.db.updateFixStatus(fixId, 'applied');
  }

  /**
   * Mark a fix as rejected
   */
  markFixRejected(fixId: string): void {
    this.db.updateFixStatus(fixId, 'rejected');
  }

  /**
   * Record the outcome of an applied fix
   */
  recordFixOutcome(
    fixId: string,
    testsBefore: string[],
    testsAfter: string[],
    notes?: string
  ): void {
    const effective = testsAfter.length < testsBefore.length;

    this.db.saveFixOutcome({
      fixId,
      appliedAt: new Date().toISOString(),
      testsBefore,
      testsAfter,
      effective,
      notes,
    });

    // Update fix status based on outcome
    if (effective) {
      this.db.updateFixStatus(fixId, 'verified');
    }
  }
}

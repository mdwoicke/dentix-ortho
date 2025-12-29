/**
 * SQLite Database for Test Results
 * Stores test runs, results, transcripts, findings, and recommendations
 */
import { ConversationTurn, Finding } from '../tests/test-case';
import { Recommendation } from '../analysis/recommendation-engine';
export interface TestRun {
    runId: string;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed' | 'aborted';
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    summary?: string;
}
export interface TestResult {
    id?: number;
    runId: string;
    testId: string;
    testName: string;
    category: string;
    status: 'passed' | 'failed' | 'error' | 'skipped';
    startedAt: string;
    completedAt: string;
    durationMs: number;
    errorMessage?: string;
    transcript: ConversationTurn[];
    findings: Finding[];
}
export interface ApiCall {
    id?: number;
    runId: string;
    testId: string;
    stepId?: string;
    toolName: string;
    requestPayload?: string;
    responsePayload?: string;
    status?: string;
    durationMs?: number;
    timestamp: string;
}
export interface FixClassification {
    issueLocation: 'bot' | 'test-agent' | 'both';
    confidence: number;
    reasoning: string;
    userBehaviorRealistic: boolean;
    botResponseAppropriate: boolean;
}
export interface GeneratedFix {
    fixId: string;
    runId: string;
    type: 'prompt' | 'tool';
    targetFile: string;
    changeDescription: string;
    changeCode: string;
    location?: {
        section?: string;
        function?: string;
        lineNumber?: number;
        afterLine?: string;
    };
    priority: 'critical' | 'high' | 'medium' | 'low';
    confidence: number;
    affectedTests: string[];
    rootCause?: {
        type: string;
        evidence: string[];
    };
    classification?: FixClassification;
    status: 'pending' | 'applied' | 'rejected' | 'verified';
    createdAt: string;
}
export interface FixOutcome {
    id?: number;
    fixId: string;
    appliedAt: string;
    testsBefore: string[];
    testsAfter: string[];
    effective: boolean;
    notes?: string;
}
export interface PromptVersion {
    id?: number;
    version: string;
    contentHash: string;
    changesFromPrevious?: string;
    testPassRate?: number;
    capturedAt: string;
}
export interface AIEnhancementHistory {
    id?: number;
    enhancementId: string;
    fileKey: string;
    sourceVersion: number;
    resultVersion?: number;
    command: string;
    commandTemplate?: string;
    webSearchUsed: boolean;
    webSearchQueries?: string;
    webSearchResultsJson?: string;
    enhancementPrompt?: string;
    aiResponseJson?: string;
    qualityScoreBefore?: number;
    qualityScoreAfter?: number;
    status: 'pending' | 'preview' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'applied' | 'promoted';
    errorMessage?: string;
    createdAt: string;
    completedAt?: string;
    createdBy: string;
    metadataJson?: string;
    appliedAt?: string;
    promotedAt?: string;
    appliedContent?: string;
}
export interface AIEnhancementTemplate {
    id?: number;
    templateId: string;
    name: string;
    description?: string;
    commandTemplate: string;
    category: 'clarity' | 'examples' | 'edge-cases' | 'format' | 'validation' | 'custom';
    useWebSearch: boolean;
    defaultSearchQueries?: string;
    isBuiltIn: boolean;
    createdAt?: string;
    usageCount: number;
}
export interface QualityScore {
    overall: number;
    dimensions: {
        clarity: number;
        completeness: number;
        examples: number;
        consistency: number;
        edgeCases: number;
    };
    suggestions: string[];
    tokenCount?: number;
    charCount?: number;
    lineCount?: number;
}
export interface WebSearchResult {
    source: string;
    title: string;
    excerpt: string;
    relevanceScore: number;
    keyTakeaways: string[];
}
export interface GoalTestResultRecord {
    id?: number;
    runId: string;
    testId: string;
    passed: number;
    turnCount: number;
    durationMs: number;
    startedAt: string;
    completedAt: string;
    goalResultsJson?: string;
    constraintViolationsJson?: string;
    summaryText?: string;
    resolvedPersonaJson?: string;
    generationSeed?: number;
}
export interface GoalProgressSnapshot {
    id?: number;
    runId: string;
    testId: string;
    turnNumber: number;
    collectedFieldsJson: string;
    pendingFieldsJson: string;
    issuesJson: string;
}
export interface TestCaseStepDTO {
    id: string;
    description?: string;
    userMessage: string;
    expectedPatterns: string[];
    unexpectedPatterns: string[];
    semanticExpectations: SemanticExpectationDTO[];
    negativeExpectations: NegativeExpectationDTO[];
    timeout?: number;
    delay?: number;
    optional?: boolean;
}
export interface SemanticExpectationDTO {
    type: string;
    description: string;
    customCriteria?: string;
    required: boolean;
}
export interface NegativeExpectationDTO {
    type: string;
    description: string;
    customCriteria?: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
}
export interface ExpectationDTO {
    type: 'conversation-complete' | 'final-state' | 'no-errors' | 'custom';
    description: string;
}
export interface TestCaseRecord {
    id?: number;
    caseId: string;
    name: string;
    description: string;
    category: 'happy-path' | 'edge-case' | 'error-handling';
    tags: string[];
    steps: TestCaseStepDTO[];
    expectations: ExpectationDTO[];
    isArchived: boolean;
    version: number;
    createdAt: string;
    updatedAt: string;
}
export declare class Database {
    private db;
    private dbPath;
    constructor();
    /**
     * Initialize database and create tables
     */
    initialize(): void;
    /**
     * Get database connection (initialize if needed)
     */
    private getDb;
    /**
     * Create database tables
     */
    private createTables;
    /**
     * Add a column to a table if it doesn't exist (migration helper)
     */
    private addColumnIfNotExists;
    /**
     * Migrate ai_enhancement_history table to add 'preview', 'applied' and 'promoted' to CHECK constraint
     * SQLite requires recreating the table to modify CHECK constraints
     */
    private migrateEnhancementHistoryCheckConstraint;
    /**
     * Initialize built-in enhancement templates (runs once on first setup)
     */
    private initializeBuiltInTemplates;
    /**
     * Create a new test run
     */
    createTestRun(): string;
    /**
     * Complete a test run
     */
    completeTestRun(runId: string, summary: {
        totalTests: number;
        passed: number;
        failed: number;
        skipped: number;
    }): void;
    /**
     * Mark a test run as failed (for error cases)
     */
    failTestRun(runId: string, errorMessage?: string): void;
    /**
     * Mark a test run as aborted (for user cancellation)
     */
    abortTestRun(runId: string): void;
    /**
     * Clean up stale running test runs (runs started more than X hours ago still showing as running)
     */
    cleanupStaleRuns(maxAgeHours?: number): number;
    /**
     * Save a test result
     */
    saveTestResult(result: TestResult): number;
    /**
     * Save transcript for a test
     */
    saveTranscript(resultId: number, transcript: ConversationTurn[]): void;
    /**
     * Save a finding
     */
    saveFinding(runId: string, testId: string, finding: Finding): void;
    /**
     * Save recommendations
     */
    saveRecommendations(runId: string, recommendations: Recommendation[]): void;
    /**
     * Get the last test run
     */
    getLastTestRun(): TestRun | null;
    /**
     * Get recent runs
     */
    getRecentRuns(limit?: number): TestRun[];
    /**
     * Get test results for a run
     */
    getTestResults(runId: string): TestResult[];
    /**
     * Get failed test IDs from a run
     */
    getFailedTestIds(runId: string): string[];
    /**
     * Get transcript for a test
     */
    getTranscript(testId: string, runId?: string): ConversationTurn[];
    /**
     * Get recommendations
     */
    getRecommendations(runId?: string): Recommendation[];
    /**
     * Save an API call
     */
    saveApiCall(apiCall: ApiCall): void;
    /**
     * Save multiple API calls
     */
    saveApiCalls(apiCalls: ApiCall[]): void;
    /**
     * Get API calls for a test
     */
    getApiCalls(testId: string, runId?: string): ApiCall[];
    /**
     * Get all API calls for a run
     */
    getApiCallsByRun(runId: string): ApiCall[];
    /**
     * Get all test runs with pagination
     */
    getAllTestRuns(limit?: number, offset?: number): TestRun[];
    /**
     * Get a single test run by ID
     */
    getTestRun(runId: string): TestRun | null;
    /**
     * Get findings for a run or all findings
     */
    getFindings(runId?: string): (Finding & {
        id?: number;
    })[];
    /**
     * Save a generated fix
     */
    saveGeneratedFix(fix: GeneratedFix): void;
    /**
     * Save multiple generated fixes
     */
    saveGeneratedFixes(fixes: GeneratedFix[]): void;
    /**
     * Get generated fixes for a run
     */
    getGeneratedFixes(runId?: string, status?: string): GeneratedFix[];
    /**
     * Get a single fix by ID
     */
    getGeneratedFix(fixId: string): GeneratedFix | null;
    /**
     * Update fix status
     */
    updateFixStatus(fixId: string, status: GeneratedFix['status']): void;
    /**
     * Save a fix outcome
     */
    saveFixOutcome(outcome: FixOutcome): void;
    /**
     * Get fix outcomes for a fix
     */
    getFixOutcomes(fixId: string): FixOutcome[];
    /**
     * Save a prompt version
     */
    savePromptVersion(version: PromptVersion): void;
    /**
     * Get latest prompt version
     */
    getLatestPromptVersion(): PromptVersion | null;
    /**
     * Get prompt version history
     */
    getPromptVersionHistory(limit?: number): PromptVersion[];
    /**
     * Get pending fixes count
     */
    getPendingFixesCount(): number;
    /**
     * Get fix statistics
     */
    getFixStatistics(): {
        total: number;
        pending: number;
        applied: number;
        verified: number;
        rejected: number;
    };
    /**
     * Clear all data
     */
    clear(): void;
    /**
     * Get all test cases (optionally filtered)
     */
    getTestCases(options?: {
        category?: string;
        includeArchived?: boolean;
    }): TestCaseRecord[];
    /**
     * Get a single test case by ID
     */
    getTestCase(caseId: string): TestCaseRecord | null;
    /**
     * Create a new test case
     */
    createTestCase(testCase: Omit<TestCaseRecord, 'id' | 'version' | 'createdAt' | 'updatedAt'>): TestCaseRecord;
    /**
     * Update an existing test case
     */
    updateTestCase(caseId: string, updates: Partial<Omit<TestCaseRecord, 'id' | 'caseId' | 'createdAt'>>): TestCaseRecord | null;
    /**
     * Archive a test case (soft delete)
     */
    archiveTestCase(caseId: string): boolean;
    /**
     * Permanently delete a test case
     */
    deleteTestCase(caseId: string): boolean;
    /**
     * Clone a test case with a new ID
     */
    cloneTestCase(caseId: string, newCaseId: string): TestCaseRecord | null;
    /**
     * Get test case statistics
     */
    getTestCaseStats(): {
        total: number;
        byCategory: Record<string, number>;
        archived: number;
    };
    /**
     * Get all unique tags from test cases
     */
    getAllTags(): string[];
    /**
     * Check if a test case ID exists
     */
    testCaseExists(caseId: string): boolean;
    /**
     * Generate the next available case ID for a category
     */
    generateNextCaseId(category: 'happy-path' | 'edge-case' | 'error-handling'): string;
    /**
     * Save a goal test result
     */
    saveGoalTestResult(result: GoalTestResultRecord): number;
    /**
     * Get goal test results for a run
     */
    getGoalTestResults(runId: string): GoalTestResultRecord[];
    /**
     * Get a single goal test result
     */
    getGoalTestResult(runId: string, testId: string): GoalTestResultRecord | null;
    /**
     * Save a goal progress snapshot
     */
    saveGoalProgressSnapshot(snapshot: GoalProgressSnapshot): void;
    /**
     * Get progress snapshots for a test
     */
    getGoalProgressSnapshots(runId: string, testId: string): GoalProgressSnapshot[];
    /**
     * Get goal test statistics
     */
    getGoalTestStats(runId?: string): {
        total: number;
        passed: number;
        failed: number;
        avgTurns: number;
    };
    /**
     * Delete goal test data for a run
     */
    deleteGoalTestData(runId: string): void;
    /**
     * Save a variant
     */
    saveVariant(variant: ABVariant): void;
    /**
     * Get a variant by ID
     */
    getVariant(variantId: string): ABVariant | null;
    /**
     * Get variants by target file
     */
    getVariantsByFile(targetFile: string): ABVariant[];
    /**
     * Get baseline variant for a file
     */
    getBaselineVariant(targetFile: string): ABVariant | null;
    /**
     * Set a variant as baseline (unsets others for same file)
     */
    setVariantAsBaseline(variantId: string): void;
    /**
     * Find variant by content hash
     */
    findVariantByHash(contentHash: string, targetFile: string): ABVariant | null;
    /**
     * Get all variants
     */
    getAllVariants(options?: {
        variantType?: string;
        isBaseline?: boolean;
    }): ABVariant[];
    private mapRowToVariant;
    /**
     * Save an experiment
     */
    saveExperiment(experiment: ABExperiment): void;
    /**
     * Get an experiment by ID
     */
    getExperiment(experimentId: string): ABExperiment | null;
    /**
     * Get experiments by status
     */
    getExperimentsByStatus(status: string): ABExperiment[];
    /**
     * Get all experiments
     */
    getAllExperiments(options?: {
        status?: string;
        limit?: number;
    }): ABExperiment[];
    /**
     * Update experiment status
     */
    updateExperimentStatus(experimentId: string, status: string, updates?: {
        startedAt?: string;
        completedAt?: string;
        winningVariantId?: string;
        conclusion?: string;
    }): void;
    private mapRowToExperiment;
    /**
     * Save an experiment run
     */
    saveExperimentRun(run: ABExperimentRun): number;
    /**
     * Get experiment runs for an experiment
     */
    getExperimentRuns(experimentId: string): ABExperimentRun[];
    /**
     * Get experiment runs for a specific variant
     */
    getExperimentRunsByVariant(experimentId: string, variantId: string): ABExperimentRun[];
    /**
     * Count runs per variant for an experiment
     */
    countExperimentRuns(experimentId: string): {
        variantId: string;
        count: number;
        passCount: number;
    }[];
    private mapRowToExperimentRun;
    /**
     * Save an experiment trigger
     */
    saveExperimentTrigger(trigger: ABExperimentTrigger): void;
    /**
     * Get triggers for an experiment
     */
    getExperimentTriggers(experimentId: string): ABExperimentTrigger[];
    /**
     * Get enabled triggers
     */
    getEnabledTriggers(): ABExperimentTrigger[];
    /**
     * Update trigger last triggered time
     */
    updateTriggerLastTriggered(triggerId: string): void;
    /**
     * Get A/B testing statistics
     */
    getABTestingStats(): {
        totalExperiments: number;
        runningExperiments: number;
        completedExperiments: number;
        totalVariants: number;
        totalRuns: number;
    };
    /**
     * Initialize default sandboxes (A and B)
     */
    initializeSandboxes(): void;
    /**
     * Get a sandbox by ID
     */
    getSandbox(sandboxId: string): ABSandbox | null;
    /**
     * Get all sandboxes
     */
    getAllSandboxes(): ABSandbox[];
    /**
     * Update a sandbox
     */
    updateSandbox(sandboxId: string, updates: Partial<ABSandbox>): void;
    /**
     * Get a sandbox file
     */
    getSandboxFile(sandboxId: string, fileKey: string): ABSandboxFile | null;
    /**
     * Get all files for a sandbox
     */
    getSandboxFiles(sandboxId: string): ABSandboxFile[];
    /**
     * Save or update a sandbox file (creates new version)
     */
    saveSandboxFile(file: Omit<ABSandboxFile, 'id' | 'createdAt' | 'updatedAt'>): number;
    /**
     * Get sandbox file history
     */
    getSandboxFileHistory(sandboxId: string, fileKey: string, limit?: number): ABSandboxFileHistory[];
    /**
     * Rollback sandbox file to a specific version
     */
    rollbackSandboxFile(sandboxId: string, fileKey: string, version: number): void;
    /**
     * Delete all files for a sandbox (for reset)
     */
    clearSandboxFiles(sandboxId: string): void;
    /**
     * Create a comparison run
     */
    createComparisonRun(run: Omit<ABSandboxComparisonRun, 'id' | 'createdAt'>): string;
    /**
     * Get a comparison run
     */
    getComparisonRun(comparisonId: string): ABSandboxComparisonRun | null;
    /**
     * Update a comparison run
     */
    updateComparisonRun(comparisonId: string, updates: Partial<ABSandboxComparisonRun>): void;
    /**
     * Get comparison run history
     */
    getComparisonRunHistory(limit?: number): ABSandboxComparisonRun[];
    /**
     * Create a new AI enhancement record
     */
    createEnhancement(enhancement: Omit<AIEnhancementHistory, 'id' | 'createdAt'>): string;
    /**
     * Update an enhancement record
     */
    updateEnhancement(enhancementId: string, updates: Partial<AIEnhancementHistory>): void;
    /**
     * Get enhancement by ID
     */
    getEnhancement(enhancementId: string): AIEnhancementHistory | null;
    /**
     * Get enhancement history for a file
     */
    getEnhancementHistory(fileKey: string, limit?: number): AIEnhancementHistory[];
    /**
     * Get all enhancement templates
     */
    getEnhancementTemplates(): AIEnhancementTemplate[];
    /**
     * Get a specific enhancement template
     */
    getEnhancementTemplate(templateId: string): AIEnhancementTemplate | null;
    /**
     * Increment template usage count
     */
    incrementTemplateUsage(templateId: string): void;
    /**
     * Create a custom enhancement template
     */
    createEnhancementTemplate(template: Omit<AIEnhancementTemplate, 'id' | 'createdAt' | 'usageCount' | 'isBuiltIn'>): string;
    /**
     * Helper to map enhancement row to interface
     */
    private mapEnhancementRow;
    /**
     * Close database connection
     */
    close(): void;
}
export interface ABVariant {
    variantId: string;
    variantType: 'prompt' | 'tool' | 'config';
    targetFile: string;
    name: string;
    description: string;
    content: string;
    contentHash: string;
    baselineVariantId?: string;
    sourceFixId?: string;
    isBaseline: boolean;
    createdAt: string;
    createdBy: 'manual' | 'llm-analysis' | 'auto-generated';
    metadata?: Record<string, any>;
}
export interface ABExperiment {
    experimentId: string;
    name: string;
    description?: string;
    hypothesis: string;
    status: 'draft' | 'running' | 'paused' | 'completed' | 'aborted';
    experimentType: 'prompt' | 'tool' | 'config' | 'multi';
    variants: {
        variantId: string;
        role: 'control' | 'treatment';
        weight: number;
    }[];
    testIds: string[];
    trafficSplit: Record<string, number>;
    minSampleSize: number;
    maxSampleSize: number;
    significanceThreshold: number;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    winningVariantId?: string;
    conclusion?: string;
}
export interface ABExperimentRun {
    id?: number;
    experimentId: string;
    runId: string;
    testId: string;
    variantId: string;
    variantRole: 'control' | 'treatment';
    startedAt: string;
    completedAt: string;
    passed: boolean;
    turnCount: number;
    durationMs: number;
    goalCompletionRate: number;
    constraintViolations: number;
    errorOccurred: boolean;
    metrics?: Record<string, any>;
}
export interface ABExperimentTrigger {
    triggerId: string;
    experimentId: string;
    triggerType: 'fix-applied' | 'scheduled' | 'pass-rate-drop' | 'manual';
    condition?: Record<string, any>;
    enabled: boolean;
    lastTriggered?: string;
}
export interface ABSandbox {
    id?: number;
    sandboxId: string;
    name: string;
    description?: string;
    flowiseEndpoint?: string;
    flowiseApiKey?: string;
    langfuseHost?: string;
    langfusePublicKey?: string;
    langfuseSecretKey?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface ABSandboxFile {
    id?: number;
    sandboxId: string;
    fileKey: string;
    fileType: 'markdown' | 'json';
    displayName: string;
    content: string;
    version: number;
    baseVersion?: number;
    changeDescription?: string;
    createdAt: string;
    updatedAt: string;
}
export interface ABSandboxFileHistory {
    id?: number;
    sandboxId: string;
    fileKey: string;
    version: number;
    content: string;
    changeDescription?: string;
    createdAt: string;
}
export interface ABSandboxComparisonRun {
    id?: number;
    comparisonId: string;
    name?: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    testIds?: string[];
    productionResults?: Record<string, any>;
    sandboxAResults?: Record<string, any>;
    sandboxBResults?: Record<string, any>;
    startedAt?: string;
    completedAt?: string;
    summary?: {
        productionPassRate: number;
        sandboxAPassRate: number;
        sandboxBPassRate: number;
        totalTests: number;
        improvements: Array<{
            testId: string;
            from: string;
            to: string;
        }>;
        regressions: Array<{
            testId: string;
            from: string;
            to: string;
        }>;
    };
    createdAt: string;
}
//# sourceMappingURL=database.d.ts.map
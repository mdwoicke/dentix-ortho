/**
 * SQLite Database for Test Results
 * Stores test runs, results, transcripts, findings, and recommendations
 */

import BetterSqlite3 from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
// config import removed - not currently used
import { ConversationTurn, Finding } from '../tests/test-case';
import { Recommendation } from '../analysis/recommendation-engine';
import * as fs from 'fs';
import * as path from 'path';

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
  // Environment tracking fields
  environmentPresetId?: number;
  environmentPresetName?: string;
  flowiseConfigId?: number;
  flowiseConfigName?: string;
  langfuseConfigId?: number;
  langfuseConfigName?: string;
}

/**
 * Environment configuration for test runs
 */
export interface EnvironmentConfig {
  environmentPresetId?: number;
  environmentPresetName?: string;
  flowiseConfigId?: number;
  flowiseConfigName?: string;
  langfuseConfigId?: number;
  langfuseConfigName?: string;
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
  langfuseTraceId?: string;
  // Flowise session ID (UUID) - used for Langfuse session URL
  flowiseSessionId?: string;
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

// ============================================================================
// PROD TEST RECORD INPUT
// ============================================================================

export interface ProdTestRecordInput {
  recordType: 'patient' | 'appointment';
  patientGuid: string;
  appointmentGuid?: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientBirthdate?: string;
  patientPhone?: string;
  patientEmail?: string;
  appointmentDatetime?: string;
  scheduleViewGuid?: string;
  scheduleColumnGuid?: string;
  appointmentTypeGuid?: string;
  appointmentMinutes?: number;
  locationGuid?: string;
  note?: string;
  runId?: string;
  testId?: string;
  // Langfuse trace context for note extraction
  traceId?: string;
  sessionId?: string;
  // Family grouping for sibling booking
  familyId?: string;
  isChild?: boolean;
  parentPatientGuid?: string;
}

// ============================================================================
// DYNAMIC AGENT TUNING SYSTEM - New Interfaces
// ============================================================================

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

// ============================================================================
// AI ENHANCEMENT INTERFACES
// ============================================================================

export type PromptContext = 'production' | 'sandbox_a' | 'sandbox_b';

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
  // New fields for applied/promoted workflow
  appliedAt?: string;
  promotedAt?: string;
  appliedContent?: string;
  // Context fields for sandbox support
  context?: PromptContext;
  sandboxId?: string;
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

export interface ReferenceDocument {
  id?: number;
  documentId: string;
  fileKey: string;
  label: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  extractedText?: string;
  extractionStatus: 'pending' | 'success' | 'failed';
  extractionError?: string;
  displayOrder: number;
  isActive: boolean;
  isEnabled: boolean; // Whether to include in enhancement prompts
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// GOAL-ORIENTED TEST INTERFACES
// ============================================================================

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
  // Dynamic data resolution fields
  resolvedPersonaJson?: string;
  generationSeed?: number;
  // Langfuse tracing
  langfuseTraceId?: string;
  // Flowise session ID (UUID) - used for Langfuse session URL
  flowiseSessionId?: string;
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

// ============================================================================
// HEARTBEAT ALERTING SYSTEM INTERFACES
// ============================================================================

export interface HeartbeatAlert {
  id?: number;
  name: string;
  description?: string;
  metricType: string;
  conditionOperator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  thresholdValue: number;
  thresholdUnit?: string;
  lookbackMinutes: number;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  slackChannel?: string;
  cooldownMinutes: number;
  environment?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HeartbeatRun {
  id?: number;
  startedAt: string;
  completedAt?: string;
  alertsChecked: number;
  alertsTriggered: number;
  alertsSent: number;
  alertsSuppressed: number;
  durationMs?: number;
  status: 'running' | 'completed' | 'error';
  errorMessage?: string;
}

export interface HeartbeatAlertHistory {
  id?: number;
  heartbeatRunId?: number;
  alertId: number;
  triggeredAt: string;
  metricValue?: number;
  thresholdValue?: number;
  severity?: string;
  slackSent: boolean;
  slackMessageTs?: string;
  suppressed: boolean;
  suppressionReason?: string;
  sampleTraceIds?: string[];
  resolvedAt?: string;
  // Joined fields for display
  alertName?: string;
  alertDescription?: string;
  metricType?: string;
}

export interface HeartbeatSlackConfig {
  id?: number;
  webhookUrl?: string;
  defaultChannel?: string;
  criticalChannel?: string;
  enabled: boolean;
  lastTestAt?: string;
  lastTestSuccess?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface HeartbeatStatus {
  isRunning: boolean;
  intervalMinutes: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastRunStatus?: string;
  alertsEnabled: number;
  alertsTotal: number;
}

// ============================================================================
// TEST CASE MANAGEMENT INTERFACES
// ============================================================================

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

export class Database {
  private db: BetterSqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    // Determine the correct database path regardless of whether we're running from
    // source (test-agent/src/storage/) or compiled (test-agent/dist/test-agent/src/storage/)
    // We always want to use test-agent/data/test-results.db

    // Check if we're in a dist directory (compiled code)
    const currentDir = __dirname;
    if (currentDir.includes('dist')) {
      // Compiled: __dirname is test-agent/dist/test-agent/src/storage/
      // Navigate up to test-agent/ then down to data/
      const testAgentRoot = path.resolve(currentDir, '../../../../');
      this.dbPath = path.join(testAgentRoot, 'data/test-results.db');
    } else {
      // Source: __dirname is test-agent/src/storage/
      this.dbPath = path.resolve(currentDir, '../../data/test-results.db');
    }

    console.log(`[Database] Using path: ${this.dbPath}`);
  }

  /**
   * Initialize database and create tables
   */
  initialize(): void {
    // Ensure data directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new BetterSqlite3(this.dbPath);

    // Enable WAL mode for better concurrent write performance
    // WAL allows multiple readers with one writer, reducing lock contention
    this.db.pragma('journal_mode = WAL');

    // NORMAL synchronous mode: slightly faster, still safe with WAL
    this.db.pragma('synchronous = NORMAL');

    // Increase cache size to 64MB for better performance
    this.db.pragma('cache_size = -64000');

    // Wait up to 5 seconds when database is locked (parallel writes)
    this.db.pragma('busy_timeout = 5000');

    // Enable memory-mapped I/O for faster reads (256MB)
    this.db.pragma('mmap_size = 268435456');

    this.createTables();
  }

  /**
   * Get database connection (initialize if needed)
   */
  private getDb(): BetterSqlite3.Database {
    if (!this.db) {
      this.initialize();
    }
    return this.db!;
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    const db = this.getDb();

    db.exec(`
      -- Test Runs
      CREATE TABLE IF NOT EXISTS test_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT UNIQUE NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT CHECK(status IN ('running', 'completed', 'failed', 'aborted')) DEFAULT 'running',
        total_tests INTEGER DEFAULT 0,
        passed INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        skipped INTEGER DEFAULT 0,
        summary TEXT
      );

      -- Individual Test Results
      CREATE TABLE IF NOT EXISTS test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        test_name TEXT NOT NULL,
        category TEXT,
        status TEXT CHECK(status IN ('passed', 'failed', 'error', 'skipped')),
        started_at TEXT,
        completed_at TEXT,
        duration_ms INTEGER,
        error_message TEXT,
        UNIQUE(run_id, test_id)
      );

      -- Conversation Transcripts
      CREATE TABLE IF NOT EXISTS transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        result_id INTEGER,
        test_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        session_id TEXT,
        transcript_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Findings
      CREATE TABLE IF NOT EXISTS findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT,
        test_id TEXT,
        type TEXT CHECK(type IN ('bug', 'enhancement', 'prompt-issue', 'tool-issue', 'regression')),
        severity TEXT,
        title TEXT NOT NULL,
        description TEXT,
        affected_step TEXT,
        agent_question TEXT,
        expected_behavior TEXT,
        actual_behavior TEXT,
        recommendation TEXT,
        status TEXT CHECK(status IN ('new', 'in-progress', 'resolved', 'wont-fix')) DEFAULT 'new',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Recommendations
      CREATE TABLE IF NOT EXISTS recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rec_id TEXT UNIQUE NOT NULL,
        run_id TEXT,
        type TEXT CHECK(type IN ('flowise-prompt', 'function-tool', 'node-red', 'backend')),
        priority INTEGER DEFAULT 5,
        title TEXT NOT NULL,
        problem TEXT,
        solution TEXT,
        prompt_suggestion TEXT,
        tool_suggestion TEXT,
        affected_tests TEXT,
        evidence TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- API Calls (tool calls made by Flowise to Cloud 9)
      CREATE TABLE IF NOT EXISTS api_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        step_id TEXT,
        tool_name TEXT NOT NULL,
        request_payload TEXT,
        response_payload TEXT,
        status TEXT,
        duration_ms INTEGER,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_test_id ON test_results(test_id);
      CREATE INDEX IF NOT EXISTS idx_transcripts_test_id ON transcripts(test_id);
      CREATE INDEX IF NOT EXISTS idx_findings_run_id ON findings(run_id);
      CREATE INDEX IF NOT EXISTS idx_api_calls_run_id ON api_calls(run_id);
      CREATE INDEX IF NOT EXISTS idx_api_calls_test_id ON api_calls(test_id);

      -- Performance optimization indexes (added for faster queries)
      CREATE INDEX IF NOT EXISTS idx_test_runs_status_started ON test_runs(status, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_test_results_status_run ON test_results(status, run_id);
      CREATE INDEX IF NOT EXISTS idx_findings_severity_status ON findings(severity, status);
      CREATE INDEX IF NOT EXISTS idx_transcripts_run_created ON transcripts(run_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_api_calls_timestamp ON api_calls(run_id, timestamp);

      -- ========================================================================
      -- DYNAMIC AGENT TUNING SYSTEM TABLES
      -- ========================================================================

      -- Generated Fixes (prompt and tool fixes suggested by LLM analysis)
      CREATE TABLE IF NOT EXISTS generated_fixes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fix_id TEXT UNIQUE NOT NULL,
        run_id TEXT NOT NULL,
        type TEXT CHECK(type IN ('prompt', 'tool')) NOT NULL,
        target_file TEXT NOT NULL,
        change_description TEXT NOT NULL,
        change_code TEXT NOT NULL,
        location_json TEXT,
        priority TEXT CHECK(priority IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
        confidence REAL DEFAULT 0.5,
        affected_tests TEXT,
        root_cause_json TEXT,
        classification_json TEXT,
        status TEXT CHECK(status IN ('pending', 'applied', 'rejected', 'verified')) DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );


      -- Fix Outcomes (track effectiveness of applied fixes)
      CREATE TABLE IF NOT EXISTS fix_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fix_id TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        tests_before TEXT,
        tests_after TEXT,
        effective INTEGER DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (fix_id) REFERENCES generated_fixes(fix_id)
      );

      -- Prompt Versions (track system prompt changes over time)
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        changes_from_previous TEXT,
        test_pass_rate REAL,
        captured_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for new tables
      CREATE INDEX IF NOT EXISTS idx_generated_fixes_run_id ON generated_fixes(run_id);
      CREATE INDEX IF NOT EXISTS idx_generated_fixes_status ON generated_fixes(status);
      CREATE INDEX IF NOT EXISTS idx_fix_outcomes_fix_id ON fix_outcomes(fix_id);

      -- ========================================================================
      -- PROMPT VERSION MANAGEMENT TABLES
      -- ========================================================================

      -- Working copies of prompts (current state with all applied fixes)
      CREATE TABLE IF NOT EXISTS prompt_working_copies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_key TEXT UNIQUE NOT NULL,
        file_path TEXT NOT NULL,
        display_name TEXT,
        content TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        last_fix_id TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Version history for prompts (tracks each version)
      CREATE TABLE IF NOT EXISTS prompt_version_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_key TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        fix_id TEXT,
        change_description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for prompt tables
      CREATE INDEX IF NOT EXISTS idx_prompt_version_history_file_key ON prompt_version_history(file_key);
      CREATE INDEX IF NOT EXISTS idx_prompt_version_history_version ON prompt_version_history(version);

      -- ========================================================================
      -- TEST CASE MANAGEMENT TABLE
      -- ========================================================================

      -- Test cases stored as JSON for UI editing
      CREATE TABLE IF NOT EXISTS test_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT CHECK(category IN ('happy-path', 'edge-case', 'error-handling')) NOT NULL,
        tags_json TEXT DEFAULT '[]',
        steps_json TEXT DEFAULT '[]',
        expectations_json TEXT DEFAULT '[]',
        is_archived INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for test cases
      CREATE INDEX IF NOT EXISTS idx_test_cases_category ON test_cases(category);
      CREATE INDEX IF NOT EXISTS idx_test_cases_archived ON test_cases(is_archived);
      CREATE INDEX IF NOT EXISTS idx_test_cases_case_id ON test_cases(case_id);

      -- ========================================================================
      -- GOAL-ORIENTED TEST TABLES
      -- ========================================================================

      -- Goal Test Results (tracks goal-based test outcomes)
      CREATE TABLE IF NOT EXISTS goal_test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        passed INTEGER DEFAULT 0,
        turn_count INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        goal_results_json TEXT,
        constraint_violations_json TEXT,
        summary_text TEXT,
        UNIQUE(run_id, test_id)
      );

      -- Goal Progress Snapshots (for debugging and analysis)
      CREATE TABLE IF NOT EXISTS goal_progress_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        turn_number INTEGER NOT NULL,
        collected_fields_json TEXT,
        pending_fields_json TEXT,
        issues_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for goal test tables
      CREATE INDEX IF NOT EXISTS idx_goal_test_results_run_id ON goal_test_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_goal_test_results_test_id ON goal_test_results(test_id);
      CREATE INDEX IF NOT EXISTS idx_goal_progress_snapshots_run_id ON goal_progress_snapshots(run_id);
      CREATE INDEX IF NOT EXISTS idx_goal_progress_snapshots_test_id ON goal_progress_snapshots(test_id);

      -- ========================================================================
      -- A/B TESTING FRAMEWORK TABLES
      -- ========================================================================

      -- Variants: Store versioned copies of prompts/tools/configs
      CREATE TABLE IF NOT EXISTS ab_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id TEXT UNIQUE NOT NULL,
        variant_type TEXT CHECK(variant_type IN ('prompt', 'tool', 'config')) NOT NULL,
        target_file TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        baseline_variant_id TEXT,
        source_fix_id TEXT,
        is_baseline INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT CHECK(created_by IN ('manual', 'llm-analysis', 'auto-generated')) DEFAULT 'manual',
        metadata_json TEXT,
        FOREIGN KEY (baseline_variant_id) REFERENCES ab_variants(variant_id),
        FOREIGN KEY (source_fix_id) REFERENCES generated_fixes(fix_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ab_variants_type ON ab_variants(variant_type);
      CREATE INDEX IF NOT EXISTS idx_ab_variants_target ON ab_variants(target_file);
      CREATE INDEX IF NOT EXISTS idx_ab_variants_hash ON ab_variants(content_hash);
      CREATE INDEX IF NOT EXISTS idx_ab_variants_baseline ON ab_variants(is_baseline);

      -- Experiments: Define A/B test experiments
      CREATE TABLE IF NOT EXISTS ab_experiments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        hypothesis TEXT,
        status TEXT CHECK(status IN ('draft', 'running', 'paused', 'completed', 'aborted')) DEFAULT 'draft',
        experiment_type TEXT CHECK(experiment_type IN ('prompt', 'tool', 'config', 'multi')) NOT NULL,
        variants_json TEXT NOT NULL,
        test_ids_json TEXT NOT NULL,
        traffic_split_json TEXT,
        min_sample_size INTEGER DEFAULT 10,
        max_sample_size INTEGER DEFAULT 100,
        significance_threshold REAL DEFAULT 0.05,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        completed_at TEXT,
        winning_variant_id TEXT,
        conclusion TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ab_experiments_status ON ab_experiments(status);
      CREATE INDEX IF NOT EXISTS idx_ab_experiments_type ON ab_experiments(experiment_type);

      -- Experiment Runs: Track each test execution with variant info
      CREATE TABLE IF NOT EXISTS ab_experiment_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        variant_id TEXT NOT NULL,
        variant_role TEXT CHECK(variant_role IN ('control', 'treatment')) NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        passed INTEGER DEFAULT 0,
        turn_count INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        goal_completion_rate REAL DEFAULT 0,
        constraint_violations INTEGER DEFAULT 0,
        error_occurred INTEGER DEFAULT 0,
        metrics_json TEXT,
        FOREIGN KEY (experiment_id) REFERENCES ab_experiments(experiment_id),
        FOREIGN KEY (variant_id) REFERENCES ab_variants(variant_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ab_runs_experiment ON ab_experiment_runs(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_ab_runs_variant ON ab_experiment_runs(variant_id);
      CREATE INDEX IF NOT EXISTS idx_ab_runs_test ON ab_experiment_runs(test_id);

      -- Experiment Triggers: Define when to suggest/run experiments
      CREATE TABLE IF NOT EXISTS ab_experiment_triggers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_id TEXT UNIQUE NOT NULL,
        experiment_id TEXT NOT NULL,
        trigger_type TEXT CHECK(trigger_type IN ('fix-applied', 'scheduled', 'pass-rate-drop', 'manual')) NOT NULL,
        condition_json TEXT,
        enabled INTEGER DEFAULT 1,
        last_triggered TEXT,
        FOREIGN KEY (experiment_id) REFERENCES ab_experiments(experiment_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ab_triggers_experiment ON ab_experiment_triggers(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_ab_triggers_enabled ON ab_experiment_triggers(enabled);

      -- ========================================================================
      -- A/B TESTING SANDBOX TABLES
      -- ========================================================================

      -- Sandboxes: Persistent A and B sandbox configurations
      CREATE TABLE IF NOT EXISTS ab_sandboxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sandbox_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        flowise_endpoint TEXT,
        flowise_api_key TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Sandbox Files: Copy of each of the 3 files per sandbox
      CREATE TABLE IF NOT EXISTS ab_sandbox_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sandbox_id TEXT NOT NULL,
        file_key TEXT NOT NULL,
        file_type TEXT NOT NULL,
        display_name TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        base_version INTEGER,
        change_description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sandbox_id, file_key),
        FOREIGN KEY (sandbox_id) REFERENCES ab_sandboxes(sandbox_id)
      );

      -- Sandbox File History: Version history for sandbox file edits
      CREATE TABLE IF NOT EXISTS ab_sandbox_file_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sandbox_id TEXT NOT NULL,
        file_key TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        change_description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sandbox_id) REFERENCES ab_sandboxes(sandbox_id)
      );

      -- Sandbox Comparison Runs: Track three-way comparison test runs
      CREATE TABLE IF NOT EXISTS ab_sandbox_comparison_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comparison_id TEXT UNIQUE NOT NULL,
        name TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
        test_ids_json TEXT,
        production_results_json TEXT,
        sandbox_a_results_json TEXT,
        sandbox_b_results_json TEXT,
        started_at TEXT,
        completed_at TEXT,
        summary_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for sandbox tables
      CREATE INDEX IF NOT EXISTS idx_sandbox_files_sandbox ON ab_sandbox_files(sandbox_id);
      CREATE INDEX IF NOT EXISTS idx_sandbox_history_sandbox ON ab_sandbox_file_history(sandbox_id);
      CREATE INDEX IF NOT EXISTS idx_sandbox_history_file ON ab_sandbox_file_history(file_key);
      CREATE INDEX IF NOT EXISTS idx_comparison_runs_status ON ab_sandbox_comparison_runs(status);

      -- ========================================================================
      -- AI ENHANCEMENT TABLES
      -- ========================================================================

      -- AI Enhancement History: Track all AI prompt enhancement operations
      CREATE TABLE IF NOT EXISTS ai_enhancement_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enhancement_id TEXT UNIQUE NOT NULL,
        file_key TEXT NOT NULL,
        source_version INTEGER NOT NULL,
        result_version INTEGER,
        command TEXT NOT NULL,
        command_template TEXT,
        web_search_used INTEGER DEFAULT 0,
        web_search_queries TEXT,
        web_search_results_json TEXT,
        enhancement_prompt TEXT,
        ai_response_json TEXT,
        quality_score_before REAL,
        quality_score_after REAL,
        status TEXT CHECK(status IN ('pending', 'preview', 'processing', 'completed', 'failed', 'cancelled', 'applied', 'promoted')) DEFAULT 'pending',
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        created_by TEXT DEFAULT 'user',
        metadata_json TEXT,
        FOREIGN KEY (file_key) REFERENCES prompt_working_copies(file_key)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_file_key ON ai_enhancement_history(file_key);
      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_status ON ai_enhancement_history(status);
      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_created ON ai_enhancement_history(created_at);

      -- AI Enhancement Templates: Pre-built and custom enhancement templates
      CREATE TABLE IF NOT EXISTS ai_enhancement_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        command_template TEXT NOT NULL,
        category TEXT CHECK(category IN ('clarity', 'examples', 'edge-cases', 'format', 'validation', 'custom')) NOT NULL,
        use_web_search INTEGER DEFAULT 0,
        default_search_queries TEXT,
        is_built_in INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        usage_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_ai_templates_category ON ai_enhancement_templates(category);
      CREATE INDEX IF NOT EXISTS idx_ai_templates_built_in ON ai_enhancement_templates(is_built_in);

      -- ========================================================================
      -- REFERENCE DOCUMENTS TABLE
      -- ========================================================================

      -- Reference Documents: Store supporting documents for AI enhancement context
      CREATE TABLE IF NOT EXISTS reference_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT UNIQUE NOT NULL,
        file_key TEXT NOT NULL,
        label TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        extracted_text TEXT,
        extraction_status TEXT CHECK(extraction_status IN ('pending', 'success', 'failed')) DEFAULT 'pending',
        extraction_error TEXT,
        display_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_key) REFERENCES prompt_working_copies(file_key)
      );

      CREATE INDEX IF NOT EXISTS idx_ref_docs_file_key ON reference_documents(file_key);
      CREATE INDEX IF NOT EXISTS idx_ref_docs_active ON reference_documents(is_active);

      -- ============================================================================
      -- PARALLEL EXECUTION OPTIMIZATION TABLES
      -- ============================================================================

      -- Failure fingerprints for deduplication and clustering
      CREATE TABLE IF NOT EXISTS failure_fingerprints (
        fingerprint_id TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        components_json TEXT NOT NULL,
        first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
        occurrence_count INTEGER DEFAULT 1,
        cluster_id TEXT,
        FOREIGN KEY (cluster_id) REFERENCES failure_clusters(cluster_id)
      );

      CREATE INDEX IF NOT EXISTS idx_fingerprints_hash ON failure_fingerprints(hash);
      CREATE INDEX IF NOT EXISTS idx_fingerprints_cluster ON failure_fingerprints(cluster_id);
      CREATE INDEX IF NOT EXISTS idx_fingerprints_last_seen ON failure_fingerprints(last_seen);

      -- Failure clusters for grouping similar failures
      CREATE TABLE IF NOT EXISTS failure_clusters (
        cluster_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        root_cause_json TEXT,
        severity TEXT CHECK(severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
        trend TEXT CHECK(trend IN ('new', 'recurring', 'improving', 'worsening', 'stable')) DEFAULT 'new',
        affected_test_count INTEGER DEFAULT 0,
        first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_clusters_severity ON failure_clusters(severity);
      CREATE INDEX IF NOT EXISTS idx_clusters_trend ON failure_clusters(trend);

      -- Fingerprint to test mapping (many-to-many)
      CREATE TABLE IF NOT EXISTS fingerprint_tests (
        fingerprint_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        run_id TEXT,
        seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (fingerprint_id, test_id, run_id),
        FOREIGN KEY (fingerprint_id) REFERENCES failure_fingerprints(fingerprint_id)
      );

      CREATE INDEX IF NOT EXISTS idx_fp_tests_test ON fingerprint_tests(test_id);
      CREATE INDEX IF NOT EXISTS idx_fp_tests_run ON fingerprint_tests(run_id);

      -- Fix rollback points for safe fix application
      CREATE TABLE IF NOT EXISTS fix_rollback_points (
        rollback_id TEXT PRIMARY KEY,
        fix_id TEXT NOT NULL,
        target_file TEXT NOT NULL,
        original_content TEXT NOT NULL,
        pass_rate_before REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        applied_at TEXT,
        rolled_back_at TEXT,
        status TEXT CHECK(status IN ('created', 'applied', 'rolled_back', 'expired')) DEFAULT 'created',
        FOREIGN KEY (fix_id) REFERENCES generated_fixes(fix_id)
      );

      CREATE INDEX IF NOT EXISTS idx_rollback_fix ON fix_rollback_points(fix_id);
      CREATE INDEX IF NOT EXISTS idx_rollback_status ON fix_rollback_points(status);

      -- Fix approvals for human-in-the-loop workflow
      CREATE TABLE IF NOT EXISTS fix_approvals (
        approval_id TEXT PRIMARY KEY,
        fix_id TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'auto_approved', 'expired')) DEFAULT 'pending',
        risk_level TEXT CHECK(risk_level IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
        approver TEXT,
        approval_reason TEXT,
        rejection_reason TEXT,
        requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT,
        expires_at TEXT,
        auto_approve_threshold REAL,
        FOREIGN KEY (fix_id) REFERENCES generated_fixes(fix_id)
      );

      CREATE INDEX IF NOT EXISTS idx_approvals_status ON fix_approvals(status);
      CREATE INDEX IF NOT EXISTS idx_approvals_fix ON fix_approvals(fix_id);

      -- Fix effectiveness tracking for learning
      CREATE TABLE IF NOT EXISTS fix_effectiveness (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fix_id TEXT NOT NULL,
        initial_confidence REAL,
        actual_effectiveness REAL,
        pass_rate_before REAL,
        pass_rate_after REAL,
        tests_affected INTEGER,
        tests_improved INTEGER,
        tests_regressed INTEGER,
        evaluated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        evaluation_run_id TEXT,
        FOREIGN KEY (fix_id) REFERENCES generated_fixes(fix_id)
      );

      CREATE INDEX IF NOT EXISTS idx_effectiveness_fix ON fix_effectiveness(fix_id);
      CREATE INDEX IF NOT EXISTS idx_effectiveness_run ON fix_effectiveness(evaluation_run_id);

      -- Test history for priority queue optimization
      CREATE TABLE IF NOT EXISTS test_history_stats (
        test_id TEXT PRIMARY KEY,
        avg_duration_ms REAL,
        last_pass_rate REAL,
        run_count INTEGER DEFAULT 0,
        pass_count INTEGER DEFAULT 0,
        fail_count INTEGER DEFAULT 0,
        flaky_score REAL DEFAULT 0,
        last_status TEXT CHECK(last_status IN ('passed', 'failed', 'error', 'skipped')),
        last_run_at TEXT,
        category TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_test_history_category ON test_history_stats(category);
      CREATE INDEX IF NOT EXISTS idx_test_history_flaky ON test_history_stats(flaky_score DESC);

      -- Parallel execution metrics
      CREATE TABLE IF NOT EXISTS parallel_execution_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        worker_count INTEGER,
        total_tests INTEGER,
        completed_tests INTEGER,
        passed_tests INTEGER,
        failed_tests INTEGER,
        avg_test_duration_ms REAL,
        throughput_per_minute REAL,
        total_duration_ms INTEGER,
        batch_writes INTEGER,
        write_queue_max_size INTEGER,
        retries_total INTEGER,
        early_terminations INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_parallel_metrics_run ON parallel_execution_metrics(run_id);

      -- Production Traces: Store imported Langfuse traces for viewing production calls
      CREATE TABLE IF NOT EXISTS production_traces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT UNIQUE NOT NULL,
        langfuse_config_id INTEGER NOT NULL,
        session_id TEXT,
        user_id TEXT,
        name TEXT,
        input TEXT,
        output TEXT,
        metadata_json TEXT,
        tags_json TEXT,
        release TEXT,
        version TEXT,
        total_cost REAL,
        latency_ms INTEGER,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        environment TEXT,
        original_session_id TEXT,
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (langfuse_config_id) REFERENCES langfuse_configs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_prod_traces_config ON production_traces(langfuse_config_id);
      CREATE INDEX IF NOT EXISTS idx_prod_traces_session ON production_traces(session_id);
      CREATE INDEX IF NOT EXISTS idx_prod_traces_started ON production_traces(started_at DESC);

      -- Production Trace Observations: Stores generations/spans from traces
      CREATE TABLE IF NOT EXISTS production_trace_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        observation_id TEXT UNIQUE NOT NULL,
        trace_id TEXT NOT NULL,
        parent_observation_id TEXT,
        type TEXT CHECK(type IN ('GENERATION', 'SPAN', 'EVENT')),
        name TEXT,
        model TEXT,
        input TEXT,
        output TEXT,
        metadata_json TEXT,
        started_at TEXT,
        ended_at TEXT,
        completion_start_time TEXT,
        latency_ms INTEGER,
        usage_input_tokens INTEGER,
        usage_output_tokens INTEGER,
        usage_total_tokens INTEGER,
        cost REAL,
        level TEXT,
        status_message TEXT,
        FOREIGN KEY (trace_id) REFERENCES production_traces(trace_id)
      );

      CREATE INDEX IF NOT EXISTS idx_prod_trace_obs_trace ON production_trace_observations(trace_id);

      -- Import History: Track import operations per config
      CREATE TABLE IF NOT EXISTS langfuse_import_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        langfuse_config_id INTEGER NOT NULL,
        import_started_at TEXT NOT NULL,
        import_completed_at TEXT,
        status TEXT CHECK(status IN ('running', 'completed', 'failed')) DEFAULT 'running',
        traces_imported INTEGER DEFAULT 0,
        traces_skipped INTEGER DEFAULT 0,
        error_message TEXT,
        from_date TEXT NOT NULL,
        to_date TEXT,
        FOREIGN KEY (langfuse_config_id) REFERENCES langfuse_configs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_import_history_config ON langfuse_import_history(langfuse_config_id);

      -- Production Sessions: Aggregate view of conversations (grouped by session_id)
      -- Each session contains multiple traces representing a full conversation
      CREATE TABLE IF NOT EXISTS production_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        langfuse_config_id INTEGER NOT NULL,
        user_id TEXT,
        environment TEXT,
        first_trace_at TEXT NOT NULL,
        last_trace_at TEXT NOT NULL,
        trace_count INTEGER DEFAULT 1,
        total_cost REAL,
        total_latency_ms INTEGER,
        input_preview TEXT,  -- First user message (preview)
        tags_json TEXT,
        metadata_json TEXT,
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, langfuse_config_id),
        FOREIGN KEY (langfuse_config_id) REFERENCES langfuse_configs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_prod_sessions_config ON production_sessions(langfuse_config_id);
      CREATE INDEX IF NOT EXISTS idx_prod_sessions_last_trace ON production_sessions(last_trace_at DESC);
      CREATE INDEX IF NOT EXISTS idx_prod_sessions_user ON production_sessions(user_id);

      -- ============================================================================
      -- PRODUCTION TEST DATA TRACKER
      -- ============================================================================

      -- Track patients and appointments created in Production for cleanup
      CREATE TABLE IF NOT EXISTS prod_test_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_type TEXT NOT NULL CHECK(record_type IN ('patient', 'appointment')),

        -- Cloud9 identifiers
        patient_guid TEXT NOT NULL,
        appointment_guid TEXT,

        -- Patient info
        patient_id TEXT,
        patient_first_name TEXT,
        patient_last_name TEXT,
        patient_email TEXT,
        patient_phone TEXT,
        patient_birthdate TEXT,

        -- Appointment info
        appointment_datetime TEXT,
        appointment_type TEXT,
        appointment_type_guid TEXT,
        appointment_minutes INTEGER,

        -- Location/Provider context
        location_guid TEXT,
        location_name TEXT,
        provider_guid TEXT,
        provider_name TEXT,
        schedule_view_guid TEXT,
        schedule_column_guid TEXT,

        -- Langfuse tracing
        trace_id TEXT,
        observation_id TEXT,
        session_id TEXT,
        langfuse_config_id INTEGER,

        -- Status tracking
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'deleted', 'cleanup_failed')),
        cancelled_at TEXT,
        deleted_at TEXT,
        cleanup_notes TEXT,
        cleanup_error TEXT,

        -- Timestamps
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        cloud9_created_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_prod_test_records_type ON prod_test_records(record_type);
      CREATE INDEX IF NOT EXISTS idx_prod_test_records_status ON prod_test_records(status);
      CREATE INDEX IF NOT EXISTS idx_prod_test_records_patient_guid ON prod_test_records(patient_guid);
      CREATE INDEX IF NOT EXISTS idx_prod_test_records_appointment_guid ON prod_test_records(appointment_guid);
      CREATE INDEX IF NOT EXISTS idx_prod_test_records_trace_id ON prod_test_records(trace_id);
      CREATE INDEX IF NOT EXISTS idx_prod_test_records_created_at ON prod_test_records(created_at);

      -- ============================================================================
      -- HEARTBEAT ALERTING SYSTEM
      -- ============================================================================

      -- Alert Definitions: Configurable alert rules
      CREATE TABLE IF NOT EXISTS heartbeat_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        metric_type TEXT NOT NULL,
        condition_operator TEXT NOT NULL CHECK(condition_operator IN ('gt', 'lt', 'gte', 'lte', 'eq')),
        threshold_value REAL NOT NULL,
        threshold_unit TEXT,
        lookback_minutes INTEGER DEFAULT 15,
        severity TEXT DEFAULT 'warning' CHECK(severity IN ('critical', 'warning', 'info')),
        enabled INTEGER DEFAULT 1,
        slack_channel TEXT,
        cooldown_minutes INTEGER DEFAULT 30,
        environment TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_heartbeat_alerts_enabled ON heartbeat_alerts(enabled);
      CREATE INDEX IF NOT EXISTS idx_heartbeat_alerts_metric ON heartbeat_alerts(metric_type);

      -- Heartbeat Runs: Track each heartbeat execution
      CREATE TABLE IF NOT EXISTS heartbeat_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        alerts_checked INTEGER DEFAULT 0,
        alerts_triggered INTEGER DEFAULT 0,
        alerts_sent INTEGER DEFAULT 0,
        alerts_suppressed INTEGER DEFAULT 0,
        duration_ms INTEGER,
        status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'error')),
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_status ON heartbeat_runs(status);
      CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_started ON heartbeat_runs(started_at DESC);

      -- Alert History: Track triggered alerts
      CREATE TABLE IF NOT EXISTS heartbeat_alert_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        heartbeat_run_id INTEGER,
        alert_id INTEGER NOT NULL,
        triggered_at TEXT NOT NULL,
        metric_value REAL,
        threshold_value REAL,
        severity TEXT,
        slack_sent INTEGER DEFAULT 0,
        slack_message_ts TEXT,
        suppressed INTEGER DEFAULT 0,
        suppression_reason TEXT,
        sample_trace_ids TEXT,
        resolved_at TEXT,
        FOREIGN KEY (alert_id) REFERENCES heartbeat_alerts(id),
        FOREIGN KEY (heartbeat_run_id) REFERENCES heartbeat_runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_heartbeat_history_alert ON heartbeat_alert_history(alert_id);
      CREATE INDEX IF NOT EXISTS idx_heartbeat_history_triggered ON heartbeat_alert_history(triggered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_heartbeat_history_run ON heartbeat_alert_history(heartbeat_run_id);

      -- Slack Configuration: Store webhook settings
      CREATE TABLE IF NOT EXISTS heartbeat_slack_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_url TEXT,
        default_channel TEXT,
        critical_channel TEXT,
        enabled INTEGER DEFAULT 1,
        last_test_at TEXT,
        last_test_success INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: Add agent_question column if it doesn't exist
    this.addColumnIfNotExists('findings', 'agent_question', 'TEXT');

    // Migration: Add display_name column to prompt_working_copies if it doesn't exist
    this.addColumnIfNotExists('prompt_working_copies', 'display_name', 'TEXT');

    // Migration: Add resolved persona fields to goal_test_results
    this.addColumnIfNotExists('goal_test_results', 'resolved_persona_json', 'TEXT');
    this.addColumnIfNotExists('goal_test_results', 'generation_seed', 'INTEGER');

    // Migration: Add classification_json column to generated_fixes
    this.addColumnIfNotExists('generated_fixes', 'classification_json', 'TEXT');

    // Migration: Add flowise_api_key column to ab_sandboxes
    this.addColumnIfNotExists('ab_sandboxes', 'flowise_api_key', 'TEXT');

    // Migration: Add LangFuse credential columns to ab_sandboxes
    this.addColumnIfNotExists('ab_sandboxes', 'langfuse_host', 'TEXT');
    this.addColumnIfNotExists('ab_sandboxes', 'langfuse_public_key', 'TEXT');
    this.addColumnIfNotExists('ab_sandboxes', 'langfuse_secret_key', 'TEXT');

    // Migration: Add AI enhancement tracking columns to prompt_version_history
    this.addColumnIfNotExists('prompt_version_history', 'enhancement_id', 'TEXT');
    this.addColumnIfNotExists('prompt_version_history', 'is_experimental', 'INTEGER DEFAULT 0');
    this.addColumnIfNotExists('prompt_version_history', 'ai_generated', 'INTEGER DEFAULT 0');

    // Migration: Add applied/promoted tracking columns to ai_enhancement_history
    this.addColumnIfNotExists('ai_enhancement_history', 'applied_at', 'TEXT');
    this.addColumnIfNotExists('ai_enhancement_history', 'promoted_at', 'TEXT');
    this.addColumnIfNotExists('ai_enhancement_history', 'applied_content', 'TEXT');

    // Migration: Update CHECK constraint to include 'applied' and 'promoted' statuses
    this.migrateEnhancementHistoryCheckConstraint();

    // Migration: Add is_enabled field to reference_documents (for selective inclusion in enhancements)
    this.addColumnIfNotExists('reference_documents', 'is_enabled', 'INTEGER DEFAULT 1');

    // Migration: Add langfuse_trace_id column to test_results and goal_test_results
    this.addColumnIfNotExists('test_results', 'langfuse_trace_id', 'TEXT');
    this.addColumnIfNotExists('goal_test_results', 'langfuse_trace_id', 'TEXT');

    // Migration: Add flowise_session_id column (UUID used for Langfuse session URL)
    this.addColumnIfNotExists('goal_test_results', 'flowise_session_id', 'TEXT');
    this.addColumnIfNotExists('test_results', 'flowise_session_id', 'TEXT');

    // Migration: Add context columns to ai_enhancement_history for sandbox support
    this.addColumnIfNotExists('ai_enhancement_history', 'context', "TEXT DEFAULT 'production'");
    this.addColumnIfNotExists('ai_enhancement_history', 'sandbox_id', 'TEXT');

    // Add index for context-based queries (db already declared at top of method)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_enhancement_context ON ai_enhancement_history(context, file_key)`);

    // Migration: Add environment tracking columns to test_runs for environment-aware test execution
    this.addColumnIfNotExists('test_runs', 'environment_preset_id', 'INTEGER');
    this.addColumnIfNotExists('test_runs', 'environment_preset_name', 'TEXT');
    this.addColumnIfNotExists('test_runs', 'flowise_config_id', 'INTEGER');
    this.addColumnIfNotExists('test_runs', 'flowise_config_name', 'TEXT');
    this.addColumnIfNotExists('test_runs', 'langfuse_config_id', 'INTEGER');
    this.addColumnIfNotExists('test_runs', 'langfuse_config_name', 'TEXT');

    // Add index for environment filtering
    db.exec(`CREATE INDEX IF NOT EXISTS idx_test_runs_environment ON test_runs(environment_preset_name)`);

    // Migration: Add original_session_id to production_traces for reverse-lookup after session rebuild
    this.addColumnIfNotExists('production_traces', 'original_session_id', 'TEXT');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_production_traces_original_session ON production_traces(original_session_id)`);

    // Initialize built-in enhancement templates
    this.initializeBuiltInTemplates();

    // Initialize default heartbeat alerts
    this.initializeDefaultAlerts();
  }

  /**
   * Add a column to a table if it doesn't exist (migration helper)
   */
  private addColumnIfNotExists(table: string, column: string, type: string): void {
    const db = this.getDb();

    // Check if column exists
    const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    const columnExists = tableInfo.some((col: any) => col.name === column);

    if (!columnExists) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }

  /**
   * Migrate ai_enhancement_history table to add 'preview', 'applied' and 'promoted' to CHECK constraint
   * SQLite requires recreating the table to modify CHECK constraints
   */
  private migrateEnhancementHistoryCheckConstraint(): void {
    const db = this.getDb();

    // Check if migration is needed by looking at the table SQL
    const tableInfo = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_enhancement_history'"
    ).get() as any;

    if (!tableInfo || !tableInfo.sql) {
      return; // Table doesn't exist yet, will be created with correct constraint
    }

    // Check if the CHECK constraint already includes 'preview', 'applied' and 'promoted'
    if (tableInfo.sql.includes("'preview'") && tableInfo.sql.includes("'applied'") && tableInfo.sql.includes("'promoted'")) {
      return; // Already migrated
    }

    // Need to recreate the table with the new CHECK constraint
    db.exec(`
      -- Create temporary table with new CHECK constraint
      CREATE TABLE ai_enhancement_history_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enhancement_id TEXT UNIQUE NOT NULL,
        file_key TEXT NOT NULL,
        source_version INTEGER NOT NULL,
        result_version INTEGER,
        command TEXT NOT NULL,
        command_template TEXT,
        web_search_used INTEGER DEFAULT 0,
        web_search_queries TEXT,
        web_search_results_json TEXT,
        enhancement_prompt TEXT,
        ai_response_json TEXT,
        quality_score_before REAL,
        quality_score_after REAL,
        status TEXT CHECK(status IN ('pending', 'preview', 'processing', 'completed', 'failed', 'cancelled', 'applied', 'promoted')) DEFAULT 'pending',
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        created_by TEXT DEFAULT 'user',
        metadata_json TEXT,
        applied_at TEXT,
        promoted_at TEXT,
        applied_content TEXT,
        FOREIGN KEY (file_key) REFERENCES prompt_working_copies(file_key)
      );

      -- Copy data from old table
      INSERT INTO ai_enhancement_history_new
      SELECT id, enhancement_id, file_key, source_version, result_version, command, command_template,
             web_search_used, web_search_queries, web_search_results_json, enhancement_prompt,
             ai_response_json, quality_score_before, quality_score_after, status, error_message,
             created_at, completed_at, created_by, metadata_json, applied_at, promoted_at, applied_content
      FROM ai_enhancement_history;

      -- Drop old table
      DROP TABLE ai_enhancement_history;

      -- Rename new table
      ALTER TABLE ai_enhancement_history_new RENAME TO ai_enhancement_history;

      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_file_key ON ai_enhancement_history(file_key);
      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_status ON ai_enhancement_history(status);
      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_created ON ai_enhancement_history(created_at);
    `);
  }

  /**
   * Initialize built-in enhancement templates (runs once on first setup)
   */
  private initializeBuiltInTemplates(): void {
    const db = this.getDb();

    const builtInTemplates = [
      {
        template_id: 'add-examples',
        name: 'Add Examples',
        description: 'Add 2-3 clear, concrete examples for key scenarios',
        command_template: 'Add 2-3 clear examples showing how to handle {{topic}}',
        category: 'examples',
        use_web_search: 1,
      },
      {
        template_id: 'improve-clarity',
        name: 'Improve Clarity',
        description: 'Rewrite unclear sections to be more specific and actionable',
        command_template: 'Rewrite unclear sections to be more specific and actionable. Focus on removing ambiguity.',
        category: 'clarity',
        use_web_search: 0,
      },
      {
        template_id: 'add-edge-cases',
        name: 'Add Edge Case Handling',
        description: 'Add explicit handling for edge cases and error scenarios',
        command_template: 'Add explicit handling for edge cases including: {{scenarios}}',
        category: 'edge-cases',
        use_web_search: 1,
      },
      {
        template_id: 'improve-format',
        name: 'Improve Formatting',
        description: 'Reorganize content with clear sections, headers, and consistent formatting',
        command_template: 'Reorganize content with clear sections, headers, and consistent formatting throughout.',
        category: 'format',
        use_web_search: 0,
      },
      {
        template_id: 'add-validation',
        name: 'Add Input Validation',
        description: 'Add validation rules and helpful error messages for user inputs',
        command_template: 'Add input validation and helpful error messages for: {{fields}}',
        category: 'validation',
        use_web_search: 1,
      },
      {
        template_id: 'best-practices',
        name: 'Apply Best Practices',
        description: 'Apply prompt engineering best practices: clear structure, explicit constraints, chain-of-thought',
        command_template: 'Apply prompt engineering best practices: clear structure, explicit constraints, chain-of-thought reasoning where applicable.',
        category: 'custom',
        use_web_search: 1,
      },
    ];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO ai_enhancement_templates
      (template_id, name, description, command_template, category, use_web_search, is_built_in)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);

    for (const template of builtInTemplates) {
      stmt.run(
        template.template_id,
        template.name,
        template.description,
        template.command_template,
        template.category,
        template.use_web_search
      );
    }
  }

  /**
   * Initialize default heartbeat alert configurations
   */
  private initializeDefaultAlerts(): void {
    const db = this.getDb();

    const defaultAlerts = [
      {
        name: 'high_api_error_rate',
        description: 'Alert when API errors (502/500) exceed threshold',
        metric_type: 'api_errors',
        condition_operator: 'gt',
        threshold_value: 5,
        threshold_unit: 'count',
        lookback_minutes: 15,
        severity: 'critical',
        cooldown_minutes: 30,
      },
      {
        name: 'elevated_latency',
        description: 'Alert when average tool latency is too high',
        metric_type: 'avg_latency',
        condition_operator: 'gt',
        threshold_value: 5000,
        threshold_unit: 'ms',
        lookback_minutes: 15,
        severity: 'warning',
        cooldown_minutes: 30,
      },
      {
        name: 'slot_fetch_failures',
        description: 'Alert when slot fetch failure rate is high',
        metric_type: 'slot_failures',
        condition_operator: 'gt',
        threshold_value: 20,
        threshold_unit: 'percent',
        lookback_minutes: 15,
        severity: 'warning',
        cooldown_minutes: 30,
      },
      {
        name: 'high_abandonment',
        description: 'Alert when session abandonment rate is high',
        metric_type: 'abandonment_rate',
        condition_operator: 'gt',
        threshold_value: 40,
        threshold_unit: 'percent',
        lookback_minutes: 60,
        severity: 'warning',
        cooldown_minutes: 60,
      },
      {
        name: 'empty_guid_errors',
        description: 'Alert on any empty patient GUID booking attempts',
        metric_type: 'empty_guid_errors',
        condition_operator: 'gt',
        threshold_value: 0,
        threshold_unit: 'count',
        lookback_minutes: 15,
        severity: 'critical',
        cooldown_minutes: 15,
      },
      {
        name: 'escalation_spike',
        description: 'Alert when escalations exceed normal levels',
        metric_type: 'escalation_count',
        condition_operator: 'gt',
        threshold_value: 10,
        threshold_unit: 'count',
        lookback_minutes: 15,
        severity: 'warning',
        cooldown_minutes: 30,
      },
      {
        name: 'cost_anomaly',
        description: 'Alert when average session cost is unusually high',
        metric_type: 'cost_per_session',
        condition_operator: 'gt',
        threshold_value: 0.50,
        threshold_unit: 'dollars',
        lookback_minutes: 60,
        severity: 'info',
        cooldown_minutes: 60,
      },
      {
        name: 'cache_staleness',
        description: 'Slot cache data is stale (auto-refresh may have stopped)',
        metric_type: 'cache_staleness',
        condition_operator: 'gt',
        threshold_value: 10,
        threshold_unit: 'minutes',
        lookback_minutes: 5,
        severity: 'critical',
        cooldown_minutes: 15,
      },
      {
        name: 'low_conversion',
        description: 'Alert when patient to booking conversion rate drops',
        metric_type: 'booking_conversion',
        condition_operator: 'lt',
        threshold_value: 30,
        threshold_unit: 'percent',
        lookback_minutes: 60,
        severity: 'warning',
        cooldown_minutes: 60,
      },
    ];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO heartbeat_alerts
      (name, description, metric_type, condition_operator, threshold_value, threshold_unit, lookback_minutes, severity, cooldown_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const alert of defaultAlerts) {
      stmt.run(
        alert.name,
        alert.description,
        alert.metric_type,
        alert.condition_operator,
        alert.threshold_value,
        alert.threshold_unit,
        alert.lookback_minutes,
        alert.severity,
        alert.cooldown_minutes
      );
    }
  }

  /**
   * Create a new test run with optional environment configuration
   */
  createTestRun(envConfig?: EnvironmentConfig): string {
    const db = this.getDb();
    const runId = `run-${new Date().toISOString().slice(0, 10)}-${uuidv4().slice(0, 8)}`;

    db.prepare(`
      INSERT INTO test_runs (
        run_id, started_at, status,
        environment_preset_id, environment_preset_name,
        flowise_config_id, flowise_config_name,
        langfuse_config_id, langfuse_config_name
      )
      VALUES (?, ?, 'running', ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      new Date().toISOString(),
      envConfig?.environmentPresetId ?? null,
      envConfig?.environmentPresetName ?? null,
      envConfig?.flowiseConfigId ?? null,
      envConfig?.flowiseConfigName ?? null,
      envConfig?.langfuseConfigId ?? null,
      envConfig?.langfuseConfigName ?? null
    );

    return runId;
  }

  /**
   * Complete a test run
   */
  completeTestRun(runId: string, summary: { totalTests: number; passed: number; failed: number; skipped: number }): void {
    const db = this.getDb();

    db.prepare(`
      UPDATE test_runs
      SET completed_at = ?,
          status = 'completed',
          total_tests = ?,
          passed = ?,
          failed = ?,
          skipped = ?,
          summary = ?
      WHERE run_id = ?
    `).run(
      new Date().toISOString(),
      summary.totalTests,
      summary.passed,
      summary.failed,
      summary.skipped,
      JSON.stringify(summary),
      runId
    );
  }

  /**
   * Mark a test run as failed (for error cases)
   */
  failTestRun(runId: string, errorMessage?: string): void {
    const db = this.getDb();

    // Get current counts from existing results
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM test_results WHERE run_id = ?
    `).get(runId) as { total: number; passed: number; failed: number; skipped: number } | undefined;

    const summary = {
      totalTests: stats?.total || 0,
      passed: stats?.passed || 0,
      failed: stats?.failed || 0,
      skipped: stats?.skipped || 0,
      error: errorMessage || 'Test run failed unexpectedly',
    };

    db.prepare(`
      UPDATE test_runs
      SET completed_at = ?,
          status = 'failed',
          total_tests = ?,
          passed = ?,
          failed = ?,
          skipped = ?,
          summary = ?
      WHERE run_id = ?
    `).run(
      new Date().toISOString(),
      summary.totalTests,
      summary.passed,
      summary.failed,
      summary.skipped,
      JSON.stringify(summary),
      runId
    );
  }

  /**
   * Mark a test run as aborted (for user cancellation)
   */
  abortTestRun(runId: string): void {
    const db = this.getDb();

    // Get current counts from existing results
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM test_results WHERE run_id = ?
    `).get(runId) as { total: number; passed: number; failed: number; skipped: number } | undefined;

    const summary = {
      totalTests: stats?.total || 0,
      passed: stats?.passed || 0,
      failed: stats?.failed || 0,
      skipped: stats?.skipped || 0,
      aborted: true,
    };

    db.prepare(`
      UPDATE test_runs
      SET completed_at = ?,
          status = 'aborted',
          total_tests = ?,
          passed = ?,
          failed = ?,
          skipped = ?,
          summary = ?
      WHERE run_id = ?
    `).run(
      new Date().toISOString(),
      summary.totalTests,
      summary.passed,
      summary.failed,
      summary.skipped,
      JSON.stringify(summary),
      runId
    );
  }

  /**
   * Clean up stale running test runs (runs started more than X hours ago still showing as running)
   */
  cleanupStaleRuns(maxAgeHours: number = 2): number {
    const db = this.getDb();
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

    const result = db.prepare(`
      UPDATE test_runs
      SET completed_at = ?,
          status = 'aborted',
          summary = ?
      WHERE status = 'running' AND started_at < ?
    `).run(
      new Date().toISOString(),
      JSON.stringify({ aborted: true, reason: 'Stale run cleanup - exceeded maximum age' }),
      cutoffTime
    );

    return result.changes;
  }

  /**
   * Mark all currently running test runs as aborted (for server restart cleanup)
   * This should be called on server startup to clean up any runs that were interrupted
   */
  markAbandonedRunsOnStartup(): { count: number; runIds: string[] } {
    const db = this.getDb();

    // First, get the IDs of running tests for logging
    const runningRuns = db.prepare(`
      SELECT run_id, started_at FROM test_runs WHERE status = 'running'
    `).all() as Array<{ run_id: string; started_at: string }>;

    if (runningRuns.length === 0) {
      return { count: 0, runIds: [] };
    }

    const runIds = runningRuns.map(r => r.run_id);
    const now = new Date().toISOString();

    // Update all running runs to aborted
    const result = db.prepare(`
      UPDATE test_runs
      SET completed_at = ?,
          status = 'aborted',
          summary = json_set(
            COALESCE(summary, '{}'),
            '$.aborted', true,
            '$.abortReason', 'Server restart - process terminated unexpectedly',
            '$.abortedAt', ?
          )
      WHERE status = 'running'
    `).run(now, now);

    return { count: result.changes, runIds };
  }

  /**
   * Get all currently running test runs with their age
   */
  getRunningTestRuns(): Array<{
    runId: string;
    startedAt: string;
    ageMinutes: number;
    totalTests: number;
    passed: number;
    failed: number;
  }> {
    const db = this.getDb();
    const now = Date.now();

    const runs = db.prepare(`
      SELECT run_id, started_at, total_tests, passed, failed
      FROM test_runs
      WHERE status = 'running'
      ORDER BY started_at DESC
    `).all() as Array<{
      run_id: string;
      started_at: string;
      total_tests: number;
      passed: number;
      failed: number;
    }>;

    return runs.map(r => ({
      runId: r.run_id,
      startedAt: r.started_at,
      ageMinutes: Math.round((now - new Date(r.started_at).getTime()) / 60000),
      totalTests: r.total_tests,
      passed: r.passed,
      failed: r.failed,
    }));
  }

  /**
   * Mark a specific run as abandoned with a custom reason
   */
  markRunAsAbandoned(runId: string, reason: string): boolean {
    const db = this.getDb();
    const now = new Date().toISOString();

    // Get current stats for the run
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM test_results WHERE run_id = ?
    `).get(runId) as { total: number; passed: number; failed: number; skipped: number } | undefined;

    const summary = {
      totalTests: stats?.total || 0,
      passed: stats?.passed || 0,
      failed: stats?.failed || 0,
      skipped: stats?.skipped || 0,
      aborted: true,
      abortReason: reason,
      abortedAt: now,
    };

    const result = db.prepare(`
      UPDATE test_runs
      SET completed_at = ?,
          status = 'aborted',
          total_tests = ?,
          passed = ?,
          failed = ?,
          skipped = ?,
          summary = ?
      WHERE run_id = ? AND status = 'running'
    `).run(
      now,
      summary.totalTests,
      summary.passed,
      summary.failed,
      summary.skipped,
      JSON.stringify(summary),
      runId
    );

    return result.changes > 0;
  }

  /**
   * Save a test result
   */
  saveTestResult(result: TestResult): number {
    const db = this.getDb();

    const info = db.prepare(`
      INSERT OR REPLACE INTO test_results
      (run_id, test_id, test_name, category, status, started_at, completed_at, duration_ms, error_message, langfuse_trace_id, flowise_session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.runId,
      result.testId,
      result.testName,
      result.category,
      result.status,
      result.startedAt,
      result.completedAt,
      result.durationMs,
      result.errorMessage,
      result.langfuseTraceId || null,
      result.flowiseSessionId || null
    );

    const resultId = info.lastInsertRowid as number;

    // Save findings
    for (const finding of result.findings) {
      this.saveFinding(result.runId, result.testId, finding);
    }

    return resultId;
  }

  /**
   * Save transcript for a test
   */
  saveTranscript(resultId: number, transcript: ConversationTurn[]): void {
    const db = this.getDb();

    // Get test info
    const result = db.prepare('SELECT run_id, test_id FROM test_results WHERE id = ?').get(resultId) as any;

    if (result) {
      db.prepare(`
        INSERT INTO transcripts (result_id, test_id, run_id, transcript_json)
        VALUES (?, ?, ?, ?)
      `).run(resultId, result.test_id, result.run_id, JSON.stringify(transcript));
    }
  }

  /**
   * Save a finding
   */
  saveFinding(runId: string, testId: string, finding: Finding): void {
    const db = this.getDb();

    db.prepare(`
      INSERT INTO findings (run_id, test_id, type, severity, title, description, affected_step, agent_question, expected_behavior, actual_behavior, recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      testId,
      finding.type,
      finding.severity,
      finding.title,
      finding.description,
      finding.affectedStep,
      finding.agentQuestion,
      finding.expectedBehavior,
      finding.actualBehavior,
      finding.recommendation
    );
  }

  /**
   * Save recommendations
   */
  saveRecommendations(runId: string, recommendations: Recommendation[]): void {
    const db = this.getDb();

    for (const rec of recommendations) {
      db.prepare(`
        INSERT OR REPLACE INTO recommendations
        (rec_id, run_id, type, priority, title, problem, solution, prompt_suggestion, tool_suggestion, affected_tests, evidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        rec.id,
        runId,
        rec.type,
        rec.priority,
        rec.title,
        rec.problem,
        rec.solution,
        rec.promptSuggestion ? JSON.stringify(rec.promptSuggestion) : null,
        rec.toolSuggestion ? JSON.stringify(rec.toolSuggestion) : null,
        JSON.stringify(rec.affectedTests),
        JSON.stringify(rec.evidence)
      );
    }
  }

  /**
   * Get the last test run
   */
  getLastTestRun(): TestRun | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
      FROM test_runs
      ORDER BY started_at DESC
      LIMIT 1
    `).get() as any;

    if (!row) return null;

    return {
      runId: row.run_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      status: row.status,
      totalTests: row.total_tests,
      passed: row.passed,
      failed: row.failed,
      skipped: row.skipped,
      summary: row.summary,
    };
  }

  /**
   * Get recent runs
   */
  getRecentRuns(limit: number = 10): TestRun[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
      FROM test_runs
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      runId: row.run_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      status: row.status,
      totalTests: row.total_tests,
      passed: row.passed,
      failed: row.failed,
      skipped: row.skipped,
      summary: row.summary,
    }));
  }

  /**
   * Get test results for a run
   */
  getTestResults(runId: string): TestResult[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, run_id, test_id, test_name, category, status, started_at, completed_at, duration_ms, error_message, langfuse_trace_id
      FROM test_results
      WHERE run_id = ?
    `).all(runId) as any[];

    return rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      testName: row.test_name,
      category: row.category,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
      errorMessage: row.error_message,
      transcript: [],
      findings: [],
      langfuseTraceId: row.langfuse_trace_id,
    }));
  }

  /**
   * Get failed test IDs from a run
   */
  getFailedTestIds(runId: string): string[] {
    console.log(`[Diagnosis:DB] getFailedTestIds called with runId: ${runId}`);
    const db = this.getDb();

    // First, log all test results for this run for debugging
    const allResults = db.prepare(`
      SELECT test_id, status FROM test_results WHERE run_id = ?
    `).all(runId) as any[];
    console.log(`[Diagnosis:DB] All test_results for run (${allResults.length} total):`, allResults);

    const rows = db.prepare(`
      SELECT test_id FROM test_results
      WHERE run_id = ? AND status IN ('failed', 'error')
    `).all(runId) as any[];

    const testIds = rows.map(r => r.test_id);
    console.log(`[Diagnosis:DB] getFailedTestIds returning ${testIds.length} failed test(s):`, testIds);

    return testIds;
  }

  /**
   * Get transcript for a test
   */
  getTranscript(testId: string, runId?: string): ConversationTurn[] {
    const db = this.getDb();

    let query = 'SELECT transcript_json FROM transcripts WHERE test_id = ?';
    const params: any[] = [testId];

    if (runId) {
      query += ' AND run_id = ?';
      params.push(runId);
    }

    query += ' ORDER BY created_at DESC LIMIT 1';

    const row = db.prepare(query).get(...params) as any;

    if (!row) return [];

    return JSON.parse(row.transcript_json);
  }

  /**
   * Get recommendations
   */
  getRecommendations(runId?: string): Recommendation[] {
    const db = this.getDb();

    let query = `
      SELECT rec_id, run_id, type, priority, title, problem, solution,
             prompt_suggestion, tool_suggestion, affected_tests, evidence
      FROM recommendations
    `;

    const params: any[] = [];
    if (runId) {
      query += ' WHERE run_id = ?';
      params.push(runId);
    }

    query += ' ORDER BY priority DESC';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.rec_id,
      type: row.type,
      priority: row.priority,
      title: row.title,
      problem: row.problem,
      solution: row.solution,
      promptSuggestion: row.prompt_suggestion ? JSON.parse(row.prompt_suggestion) : undefined,
      toolSuggestion: row.tool_suggestion ? JSON.parse(row.tool_suggestion) : undefined,
      affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
      evidence: row.evidence ? JSON.parse(row.evidence) : [],
    }));
  }

  /**
   * Save an API call
   */
  saveApiCall(apiCall: ApiCall): void {
    const db = this.getDb();

    db.prepare(`
      INSERT INTO api_calls (run_id, test_id, step_id, tool_name, request_payload, response_payload, status, duration_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      apiCall.runId,
      apiCall.testId,
      apiCall.stepId,
      apiCall.toolName,
      apiCall.requestPayload,
      apiCall.responsePayload,
      apiCall.status,
      apiCall.durationMs,
      apiCall.timestamp || new Date().toISOString()
    );
  }

  /**
   * Save multiple API calls
   */
  saveApiCalls(apiCalls: ApiCall[]): void {
    for (const apiCall of apiCalls) {
      this.saveApiCall(apiCall);
    }
  }

  /**
   * Save a record to the prod_test_records table for tracking created patients/appointments
   * Returns true if inserted, false if duplicate (already exists)
   */
  saveProdTestRecord(record: ProdTestRecordInput): boolean {
    const db = this.getDb();

    try {
      // Check for duplicate based on record type
      if (record.recordType === 'patient') {
        const existing = db.prepare(`
          SELECT id FROM prod_test_records WHERE patient_guid = ? AND record_type = 'patient'
        `).get(record.patientGuid);
        if (existing) {
          console.log(`[Database] Skipping duplicate patient: ${record.patientGuid}`);
          return false;
        }
      } else if (record.recordType === 'appointment' && record.appointmentGuid) {
        const existing = db.prepare(`
          SELECT id FROM prod_test_records WHERE appointment_guid = ? AND record_type = 'appointment'
        `).get(record.appointmentGuid);
        if (existing) {
          console.log(`[Database] Skipping duplicate appointment: ${record.appointmentGuid}`);
          return false;
        }
      }

      // For appointments without patient names, try to look up from existing patient record
      let firstName = record.patientFirstName || null;
      let lastName = record.patientLastName || null;
      if (record.recordType === 'appointment' && !firstName && record.patientGuid) {
        const patientRecord = db.prepare(`
          SELECT patient_first_name, patient_last_name
          FROM prod_test_records
          WHERE patient_guid = ?
            AND patient_first_name IS NOT NULL
            AND patient_first_name != ''
          LIMIT 1
        `).get(record.patientGuid) as { patient_first_name: string; patient_last_name: string } | undefined;
        if (patientRecord) {
          firstName = patientRecord.patient_first_name;
          lastName = patientRecord.patient_last_name;
          console.log(`[Database] Auto-filled patient name for appointment: ${firstName} ${lastName}`);
        }
      }

      // Insert the record
      db.prepare(`
        INSERT INTO prod_test_records (
          record_type, patient_guid, appointment_guid,
          patient_first_name, patient_last_name, patient_birthdate, patient_phone, patient_email,
          appointment_datetime, schedule_view_guid, schedule_column_guid,
          appointment_type_guid, appointment_minutes, location_guid, note,
          status, cleanup_notes, trace_id, session_id,
          family_id, is_child, parent_patient_guid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.recordType,
        record.patientGuid,
        record.appointmentGuid || null,
        firstName,
        lastName,
        record.patientBirthdate || null,
        record.patientPhone || null,
        record.patientEmail || null,
        record.appointmentDatetime || null,
        record.scheduleViewGuid || null,
        record.scheduleColumnGuid || null,
        record.appointmentTypeGuid || null,
        record.appointmentMinutes || null,
        record.locationGuid || null,
        record.note || null,
        'active',
        record.runId && record.testId ? `Goal Test: ${record.testId} (Run: ${record.runId})` : null,
        record.traceId || null,
        record.sessionId || null,
        record.familyId || null,
        record.isChild ? 1 : null,
        record.parentPatientGuid || null
      );

      console.log(`[Database] Saved ${record.recordType} to prod_test_records: ${record.recordType === 'patient' ? record.patientGuid : record.appointmentGuid}`);
      return true;
    } catch (error: any) {
      console.error(`[Database] Failed to save prod test record: ${error.message}`);
      return false;
    }
  }

  /**
   * Get API calls for a test
   */
  getApiCalls(testId: string, runId?: string): ApiCall[] {
    const db = this.getDb();

    let query = `
      SELECT id, run_id, test_id, step_id, tool_name, request_payload, response_payload, status, duration_ms, timestamp
      FROM api_calls
      WHERE test_id = ?
    `;
    const params: any[] = [testId];

    if (runId) {
      query += ' AND run_id = ?';
      params.push(runId);
    }

    query += ' ORDER BY timestamp ASC';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      stepId: row.step_id,
      toolName: row.tool_name,
      requestPayload: row.request_payload,
      responsePayload: row.response_payload,
      status: row.status,
      durationMs: row.duration_ms,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Get all API calls for a run
   */
  getApiCallsByRun(runId: string): ApiCall[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, run_id, test_id, step_id, tool_name, request_payload, response_payload, status, duration_ms, timestamp
      FROM api_calls
      WHERE run_id = ?
      ORDER BY timestamp ASC
    `).all(runId) as any[];

    return rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      stepId: row.step_id,
      toolName: row.tool_name,
      requestPayload: row.request_payload,
      responsePayload: row.response_payload,
      status: row.status,
      durationMs: row.duration_ms,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Get all test runs with pagination
   */
  getAllTestRuns(limit: number = 50, offset: number = 0): TestRun[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
      FROM test_runs
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    return rows.map(row => ({
      runId: row.run_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      status: row.status,
      totalTests: row.total_tests,
      passed: row.passed,
      failed: row.failed,
      skipped: row.skipped,
      summary: row.summary,
    }));
  }

  /**
   * Get a single test run by ID
   */
  getTestRun(runId: string): TestRun | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
      FROM test_runs
      WHERE run_id = ?
    `).get(runId) as any;

    if (!row) return null;

    return {
      runId: row.run_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      status: row.status,
      totalTests: row.total_tests,
      passed: row.passed,
      failed: row.failed,
      skipped: row.skipped,
      summary: row.summary,
    };
  }

  /**
   * Get findings for a run or all findings
   */
  getFindings(runId?: string): (Finding & { id?: number })[] {
    const db = this.getDb();

    let query = `
      SELECT id, run_id, test_id, type, severity, title, description,
             affected_step, agent_question, expected_behavior, actual_behavior, recommendation, status, created_at
      FROM findings
    `;
    const params: any[] = [];

    if (runId) {
      query += ' WHERE run_id = ?';
      params.push(runId);
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      affectedStep: row.affected_step,
      agentQuestion: row.agent_question,
      expectedBehavior: row.expected_behavior,
      actualBehavior: row.actual_behavior,
      recommendation: row.recommendation,
    }));
  }

  // ============================================================================
  // DYNAMIC AGENT TUNING SYSTEM - Fix Management Methods
  // ============================================================================

  /**
   * Save a generated fix
   */
  saveGeneratedFix(fix: GeneratedFix): void {
    console.log(`[Diagnosis:DB] saveGeneratedFix called:`, {
      fixId: fix.fixId,
      runId: fix.runId,
      type: fix.type,
      targetFile: fix.targetFile,
      priority: fix.priority,
      confidence: fix.confidence,
      status: fix.status,
    });

    const db = this.getDb();

    try {
      db.prepare(`
        INSERT OR REPLACE INTO generated_fixes
        (fix_id, run_id, type, target_file, change_description, change_code,
         location_json, priority, confidence, affected_tests, root_cause_json, classification_json, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fix.fixId,
        fix.runId,
        fix.type,
        fix.targetFile,
        fix.changeDescription,
        fix.changeCode,
        fix.location ? JSON.stringify(fix.location) : null,
        fix.priority,
        fix.confidence,
        JSON.stringify(fix.affectedTests),
        fix.rootCause ? JSON.stringify(fix.rootCause) : null,
        fix.classification ? JSON.stringify(fix.classification) : null,
        fix.status,
        fix.createdAt || new Date().toISOString()
      );
      console.log(`[Diagnosis:DB] Successfully saved fix ${fix.fixId}`);
    } catch (error) {
      console.error(`[Diagnosis:DB] Error saving fix ${fix.fixId}:`, error);
      throw error;
    }
  }

  /**
   * Save multiple generated fixes
   */
  saveGeneratedFixes(fixes: GeneratedFix[]): void {
    console.log(`[Diagnosis:DB] saveGeneratedFixes called with ${fixes.length} fix(es)`);
    for (const fix of fixes) {
      this.saveGeneratedFix(fix);
    }
    console.log(`[Diagnosis:DB] Finished saving ${fixes.length} fix(es)`);
  }

  /**
   * Get generated fixes for a run
   */
  getGeneratedFixes(runId?: string, status?: string): GeneratedFix[] {
    console.log(`[Diagnosis:DB] getGeneratedFixes called with runId: ${runId}, status: ${status}`);
    const db = this.getDb();

    let query = `
      SELECT fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, root_cause_json, classification_json, status, created_at
      FROM generated_fixes
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (runId) {
      conditions.push('run_id = ?');
      params.push(runId);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY confidence DESC, priority ASC';

    console.log(`[Diagnosis:DB] Executing query: ${query.replace(/\s+/g, ' ').trim()}`);
    const rows = db.prepare(query).all(...params) as any[];
    console.log(`[Diagnosis:DB] getGeneratedFixes found ${rows.length} fix(es)`);

    if (rows.length > 0) {
      console.log(`[Diagnosis:DB] Fix IDs:`, rows.map(r => r.fix_id));
    }

    return rows.map(row => ({
      fixId: row.fix_id,
      runId: row.run_id,
      type: row.type,
      targetFile: row.target_file,
      changeDescription: row.change_description,
      changeCode: row.change_code,
      location: row.location_json ? JSON.parse(row.location_json) : undefined,
      priority: row.priority,
      confidence: row.confidence,
      affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
      rootCause: row.root_cause_json ? JSON.parse(row.root_cause_json) : undefined,
      classification: row.classification_json ? JSON.parse(row.classification_json) : undefined,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get a single fix by ID
   */
  getGeneratedFix(fixId: string): GeneratedFix | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, root_cause_json, classification_json, status, created_at
      FROM generated_fixes
      WHERE fix_id = ?
    `).get(fixId) as any;

    if (!row) return null;

    return {
      fixId: row.fix_id,
      runId: row.run_id,
      type: row.type,
      targetFile: row.target_file,
      changeDescription: row.change_description,
      changeCode: row.change_code,
      location: row.location_json ? JSON.parse(row.location_json) : undefined,
      priority: row.priority,
      confidence: row.confidence,
      affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
      rootCause: row.root_cause_json ? JSON.parse(row.root_cause_json) : undefined,
      classification: row.classification_json ? JSON.parse(row.classification_json) : undefined,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  /**
   * Update fix status
   */
  updateFixStatus(fixId: string, status: GeneratedFix['status']): void {
    const db = this.getDb();

    db.prepare(`
      UPDATE generated_fixes SET status = ? WHERE fix_id = ?
    `).run(status, fixId);
  }

  /**
   * Save a fix outcome
   */
  saveFixOutcome(outcome: FixOutcome): void {
    const db = this.getDb();

    db.prepare(`
      INSERT INTO fix_outcomes (fix_id, applied_at, tests_before, tests_after, effective, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      outcome.fixId,
      outcome.appliedAt,
      JSON.stringify(outcome.testsBefore),
      JSON.stringify(outcome.testsAfter),
      outcome.effective ? 1 : 0,
      outcome.notes
    );
  }

  /**
   * Get fix outcomes for a fix
   */
  getFixOutcomes(fixId: string): FixOutcome[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, fix_id, applied_at, tests_before, tests_after, effective, notes
      FROM fix_outcomes
      WHERE fix_id = ?
      ORDER BY applied_at DESC
    `).all(fixId) as any[];

    return rows.map(row => ({
      id: row.id,
      fixId: row.fix_id,
      appliedAt: row.applied_at,
      testsBefore: row.tests_before ? JSON.parse(row.tests_before) : [],
      testsAfter: row.tests_after ? JSON.parse(row.tests_after) : [],
      effective: row.effective === 1,
      notes: row.notes,
    }));
  }

  /**
   * Save a prompt version
   */
  savePromptVersion(version: PromptVersion): void {
    const db = this.getDb();

    db.prepare(`
      INSERT INTO prompt_versions (version, content_hash, changes_from_previous, test_pass_rate, captured_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      version.version,
      version.contentHash,
      version.changesFromPrevious,
      version.testPassRate,
      version.capturedAt || new Date().toISOString()
    );
  }

  /**
   * Get latest prompt version
   */
  getLatestPromptVersion(): PromptVersion | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT id, version, content_hash, changes_from_previous, test_pass_rate, captured_at
      FROM prompt_versions
      ORDER BY captured_at DESC
      LIMIT 1
    `).get() as any;

    if (!row) return null;

    return {
      id: row.id,
      version: row.version,
      contentHash: row.content_hash,
      changesFromPrevious: row.changes_from_previous,
      testPassRate: row.test_pass_rate,
      capturedAt: row.captured_at,
    };
  }

  /**
   * Get prompt version history
   */
  getPromptVersionHistory(limit: number = 10): PromptVersion[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, version, content_hash, changes_from_previous, test_pass_rate, captured_at
      FROM prompt_versions
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      version: row.version,
      contentHash: row.content_hash,
      changesFromPrevious: row.changes_from_previous,
      testPassRate: row.test_pass_rate,
      capturedAt: row.captured_at,
    }));
  }

  /**
   * Get pending fixes count
   */
  getPendingFixesCount(): number {
    const db = this.getDb();
    const row = db.prepare(`SELECT COUNT(*) as count FROM generated_fixes WHERE status = 'pending'`).get() as any;
    return row?.count || 0;
  }

  /**
   * Get fix statistics
   */
  getFixStatistics(): { total: number; pending: number; applied: number; verified: number; rejected: number } {
    const db = this.getDb();
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) as applied,
        SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM generated_fixes
    `).get() as any;

    return {
      total: row?.total || 0,
      pending: row?.pending || 0,
      applied: row?.applied || 0,
      verified: row?.verified || 0,
      rejected: row?.rejected || 0,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    const db = this.getDb();

    db.exec(`
      DELETE FROM ab_experiment_triggers;
      DELETE FROM ab_experiment_runs;
      DELETE FROM ab_experiments;
      DELETE FROM ab_variants;
      DELETE FROM fix_outcomes;
      DELETE FROM generated_fixes;
      DELETE FROM prompt_versions;
      DELETE FROM api_calls;
      DELETE FROM recommendations;
      DELETE FROM findings;
      DELETE FROM transcripts;
      DELETE FROM test_results;
      DELETE FROM test_runs;
    `);
  }

  // ============================================================================
  // TEST CASE MANAGEMENT METHODS
  // ============================================================================

  /**
   * Get all test cases (optionally filtered)
   */
  getTestCases(options?: { category?: string; includeArchived?: boolean }): TestCaseRecord[] {
    const db = this.getDb();

    let query = `
      SELECT id, case_id, name, description, category, tags_json, steps_json,
             expectations_json, is_archived, version, created_at, updated_at
      FROM test_cases
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (!options?.includeArchived) {
      conditions.push('is_archived = 0');
    }

    if (options?.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY category, case_id';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      description: row.description || '',
      category: row.category,
      tags: JSON.parse(row.tags_json || '[]'),
      steps: JSON.parse(row.steps_json || '[]'),
      expectations: JSON.parse(row.expectations_json || '[]'),
      isArchived: row.is_archived === 1,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get a single test case by ID
   */
  getTestCase(caseId: string): TestCaseRecord | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT id, case_id, name, description, category, tags_json, steps_json,
             expectations_json, is_archived, version, created_at, updated_at
      FROM test_cases
      WHERE case_id = ?
    `).get(caseId) as any;

    if (!row) return null;

    return {
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      description: row.description || '',
      category: row.category,
      tags: JSON.parse(row.tags_json || '[]'),
      steps: JSON.parse(row.steps_json || '[]'),
      expectations: JSON.parse(row.expectations_json || '[]'),
      isArchived: row.is_archived === 1,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Create a new test case
   */
  createTestCase(testCase: Omit<TestCaseRecord, 'id' | 'version' | 'createdAt' | 'updatedAt'>): TestCaseRecord {
    const db = this.getDb();
    const now = new Date().toISOString();

    const info = db.prepare(`
      INSERT INTO test_cases (case_id, name, description, category, tags_json, steps_json, expectations_json, is_archived, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      testCase.caseId,
      testCase.name,
      testCase.description,
      testCase.category,
      JSON.stringify(testCase.tags),
      JSON.stringify(testCase.steps),
      JSON.stringify(testCase.expectations),
      testCase.isArchived ? 1 : 0,
      now,
      now
    );

    return {
      id: info.lastInsertRowid as number,
      ...testCase,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update an existing test case
   */
  updateTestCase(caseId: string, updates: Partial<Omit<TestCaseRecord, 'id' | 'caseId' | 'createdAt'>>): TestCaseRecord | null {
    const db = this.getDb();

    // First get the existing record
    const existing = this.getTestCase(caseId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const newVersion = existing.version + 1;

    // Build update fields
    const updated = {
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      category: updates.category ?? existing.category,
      tags: updates.tags ?? existing.tags,
      steps: updates.steps ?? existing.steps,
      expectations: updates.expectations ?? existing.expectations,
      isArchived: updates.isArchived ?? existing.isArchived,
    };

    db.prepare(`
      UPDATE test_cases
      SET name = ?, description = ?, category = ?, tags_json = ?, steps_json = ?,
          expectations_json = ?, is_archived = ?, version = ?, updated_at = ?
      WHERE case_id = ?
    `).run(
      updated.name,
      updated.description,
      updated.category,
      JSON.stringify(updated.tags),
      JSON.stringify(updated.steps),
      JSON.stringify(updated.expectations),
      updated.isArchived ? 1 : 0,
      newVersion,
      now,
      caseId
    );

    return {
      id: existing.id,
      caseId,
      ...updated,
      version: newVersion,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  /**
   * Archive a test case (soft delete)
   */
  archiveTestCase(caseId: string): boolean {
    const db = this.getDb();

    const result = db.prepare(`
      UPDATE test_cases SET is_archived = 1, updated_at = ? WHERE case_id = ?
    `).run(new Date().toISOString(), caseId);

    return result.changes > 0;
  }

  /**
   * Permanently delete a test case
   */
  deleteTestCase(caseId: string): boolean {
    const db = this.getDb();

    const result = db.prepare(`DELETE FROM test_cases WHERE case_id = ?`).run(caseId);
    return result.changes > 0;
  }

  /**
   * Clone a test case with a new ID
   */
  cloneTestCase(caseId: string, newCaseId: string): TestCaseRecord | null {
    const existing = this.getTestCase(caseId);
    if (!existing) return null;

    return this.createTestCase({
      caseId: newCaseId,
      name: `${existing.name} (Copy)`,
      description: existing.description,
      category: existing.category,
      tags: [...existing.tags],
      steps: JSON.parse(JSON.stringify(existing.steps)),
      expectations: JSON.parse(JSON.stringify(existing.expectations)),
      isArchived: false,
    });
  }

  /**
   * Get test case statistics
   */
  getTestCaseStats(): { total: number; byCategory: Record<string, number>; archived: number } {
    const db = this.getDb();

    const total = (db.prepare('SELECT COUNT(*) as count FROM test_cases WHERE is_archived = 0').get() as any)?.count || 0;
    const archived = (db.prepare('SELECT COUNT(*) as count FROM test_cases WHERE is_archived = 1').get() as any)?.count || 0;

    const byCategoryRows = db.prepare(`
      SELECT category, COUNT(*) as count FROM test_cases WHERE is_archived = 0 GROUP BY category
    `).all() as any[];

    const byCategory: Record<string, number> = {};
    for (const row of byCategoryRows) {
      byCategory[row.category] = row.count;
    }

    return { total, byCategory, archived };
  }

  /**
   * Get all unique tags from test cases
   */
  getAllTags(): string[] {
    const db = this.getDb();

    const rows = db.prepare(`SELECT tags_json FROM test_cases WHERE is_archived = 0`).all() as any[];

    const tagSet = new Set<string>();
    for (const row of rows) {
      const tags = JSON.parse(row.tags_json || '[]');
      for (const tag of tags) {
        tagSet.add(tag);
      }
    }

    return Array.from(tagSet).sort();
  }

  /**
   * Check if a test case ID exists
   */
  testCaseExists(caseId: string): boolean {
    const db = this.getDb();
    const row = db.prepare('SELECT 1 FROM test_cases WHERE case_id = ?').get(caseId);
    return !!row;
  }

  /**
   * Generate the next available case ID for a category
   */
  generateNextCaseId(category: 'happy-path' | 'edge-case' | 'error-handling'): string {
    const prefix = category === 'happy-path' ? 'HAPPY' :
                   category === 'edge-case' ? 'EDGE' : 'ERR';

    const db = this.getDb();
    const rows = db.prepare(`
      SELECT case_id FROM test_cases WHERE case_id LIKE ?
    `).all(`${prefix}-%`) as any[];

    let maxNum = 0;
    for (const row of rows) {
      const match = row.case_id.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
  }

  // ============================================================================
  // GOAL-ORIENTED TEST METHODS
  // ============================================================================

  /**
   * Save a goal test result
   */
  saveGoalTestResult(result: GoalTestResultRecord): number {
    const db = this.getDb();

    const info = db.prepare(`
      INSERT OR REPLACE INTO goal_test_results
      (run_id, test_id, passed, turn_count, duration_ms, started_at, completed_at,
       goal_results_json, constraint_violations_json, summary_text,
       resolved_persona_json, generation_seed, langfuse_trace_id, flowise_session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.runId,
      result.testId,
      result.passed,
      result.turnCount,
      result.durationMs,
      result.startedAt,
      result.completedAt,
      result.goalResultsJson,
      result.constraintViolationsJson,
      result.summaryText,
      result.resolvedPersonaJson,
      result.generationSeed,
      result.langfuseTraceId || null,
      result.flowiseSessionId || null
    );

    return info.lastInsertRowid as number;
  }

  /**
   * Get goal test results for a run
   */
  getGoalTestResults(runId: string): GoalTestResultRecord[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, run_id, test_id, passed, turn_count, duration_ms, started_at, completed_at,
             goal_results_json, constraint_violations_json, summary_text,
             resolved_persona_json, generation_seed, langfuse_trace_id, flowise_session_id
      FROM goal_test_results
      WHERE run_id = ?
    `).all(runId) as any[];

    return rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      passed: row.passed,
      turnCount: row.turn_count,
      durationMs: row.duration_ms,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      goalResultsJson: row.goal_results_json,
      constraintViolationsJson: row.constraint_violations_json,
      summaryText: row.summary_text,
      resolvedPersonaJson: row.resolved_persona_json,
      generationSeed: row.generation_seed,
      langfuseTraceId: row.langfuse_trace_id,
      flowiseSessionId: row.flowise_session_id,
    }));
  }

  /**
   * Get a single goal test result
   */
  getGoalTestResult(runId: string, testId: string): GoalTestResultRecord | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT id, run_id, test_id, passed, turn_count, duration_ms, started_at, completed_at,
             goal_results_json, constraint_violations_json, summary_text,
             resolved_persona_json, generation_seed, langfuse_trace_id, flowise_session_id
      FROM goal_test_results
      WHERE run_id = ? AND test_id = ?
    `).get(runId, testId) as any;

    if (!row) return null;

    return {
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      passed: row.passed,
      turnCount: row.turn_count,
      durationMs: row.duration_ms,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      goalResultsJson: row.goal_results_json,
      constraintViolationsJson: row.constraint_violations_json,
      summaryText: row.summary_text,
      resolvedPersonaJson: row.resolved_persona_json,
      generationSeed: row.generation_seed,
      langfuseTraceId: row.langfuse_trace_id,
      flowiseSessionId: row.flowise_session_id,
    };
  }

  /**
   * Save a goal progress snapshot
   */
  saveGoalProgressSnapshot(snapshot: GoalProgressSnapshot): void {
    const db = this.getDb();

    db.prepare(`
      INSERT INTO goal_progress_snapshots
      (run_id, test_id, turn_number, collected_fields_json, pending_fields_json, issues_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.runId,
      snapshot.testId,
      snapshot.turnNumber,
      snapshot.collectedFieldsJson,
      snapshot.pendingFieldsJson,
      snapshot.issuesJson
    );
  }

  /**
   * Get progress snapshots for a test
   */
  getGoalProgressSnapshots(runId: string, testId: string): GoalProgressSnapshot[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, run_id, test_id, turn_number, collected_fields_json, pending_fields_json, issues_json
      FROM goal_progress_snapshots
      WHERE run_id = ? AND test_id = ?
      ORDER BY turn_number ASC
    `).all(runId, testId) as any[];

    return rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      turnNumber: row.turn_number,
      collectedFieldsJson: row.collected_fields_json,
      pendingFieldsJson: row.pending_fields_json,
      issuesJson: row.issues_json,
    }));
  }

  /**
   * Get goal test statistics
   */
  getGoalTestStats(runId?: string): { total: number; passed: number; failed: number; avgTurns: number } {
    const db = this.getDb();

    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) as failed,
        AVG(turn_count) as avg_turns
      FROM goal_test_results
    `;
    const params: any[] = [];

    if (runId) {
      query += ' WHERE run_id = ?';
      params.push(runId);
    }

    const row = db.prepare(query).get(...params) as any;

    return {
      total: row?.total || 0,
      passed: row?.passed || 0,
      failed: row?.failed || 0,
      avgTurns: row?.avg_turns || 0,
    };
  }

  /**
   * Delete goal test data for a run
   */
  deleteGoalTestData(runId: string): void {
    const db = this.getDb();

    db.prepare('DELETE FROM goal_progress_snapshots WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM goal_test_results WHERE run_id = ?').run(runId);
  }

  // ============================================================================
  // A/B TESTING FRAMEWORK METHODS
  // ============================================================================

  // ----- VARIANT METHODS -----

  /**
   * Save a variant
   */
  saveVariant(variant: ABVariant): void {
    const db = this.getDb();

    db.prepare(`
      INSERT OR REPLACE INTO ab_variants
      (variant_id, variant_type, target_file, name, description, content, content_hash,
       baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      variant.variantId,
      variant.variantType,
      variant.targetFile,
      variant.name,
      variant.description,
      variant.content,
      variant.contentHash,
      variant.baselineVariantId,
      variant.sourceFixId,
      variant.isBaseline ? 1 : 0,
      variant.createdAt || new Date().toISOString(),
      variant.createdBy,
      variant.metadata ? JSON.stringify(variant.metadata) : null
    );
  }

  /**
   * Get a variant by ID
   */
  getVariant(variantId: string): ABVariant | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT variant_id, variant_type, target_file, name, description, content, content_hash,
             baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
      WHERE variant_id = ?
    `).get(variantId) as any;

    if (!row) return null;

    return this.mapRowToVariant(row);
  }

  /**
   * Get variants by target file
   */
  getVariantsByFile(targetFile: string): ABVariant[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT variant_id, variant_type, target_file, name, description, content, content_hash,
             baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
      WHERE target_file = ?
      ORDER BY created_at DESC
    `).all(targetFile) as any[];

    return rows.map(row => this.mapRowToVariant(row));
  }

  /**
   * Get baseline variant for a file
   */
  getBaselineVariant(targetFile: string): ABVariant | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT variant_id, variant_type, target_file, name, description, content, content_hash,
             baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
      WHERE target_file = ? AND is_baseline = 1
    `).get(targetFile) as any;

    if (!row) return null;

    return this.mapRowToVariant(row);
  }

  /**
   * Set a variant as baseline (unsets others for same file)
   */
  setVariantAsBaseline(variantId: string): void {
    const db = this.getDb();

    // Get the variant's target file
    const variant = this.getVariant(variantId);
    if (!variant) return;

    // Unset other baselines for the same file
    db.prepare(`
      UPDATE ab_variants SET is_baseline = 0 WHERE target_file = ?
    `).run(variant.targetFile);

    // Set this one as baseline
    db.prepare(`
      UPDATE ab_variants SET is_baseline = 1 WHERE variant_id = ?
    `).run(variantId);
  }

  /**
   * Find variant by content hash
   */
  findVariantByHash(contentHash: string, targetFile: string): ABVariant | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT variant_id, variant_type, target_file, name, description, content, content_hash,
             baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
      WHERE content_hash = ? AND target_file = ?
    `).get(contentHash, targetFile) as any;

    if (!row) return null;

    return this.mapRowToVariant(row);
  }

  /**
   * Get all variants
   */
  getAllVariants(options?: { variantType?: string; isBaseline?: boolean }): ABVariant[] {
    const db = this.getDb();

    let query = `
      SELECT variant_id, variant_type, target_file, name, description, content, content_hash,
             baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.variantType) {
      conditions.push('variant_type = ?');
      params.push(options.variantType);
    }
    if (options?.isBaseline !== undefined) {
      conditions.push('is_baseline = ?');
      params.push(options.isBaseline ? 1 : 0);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => this.mapRowToVariant(row));
  }

  private mapRowToVariant(row: any): ABVariant {
    return {
      variantId: row.variant_id,
      variantType: row.variant_type,
      targetFile: row.target_file,
      name: row.name,
      description: row.description,
      content: row.content,
      contentHash: row.content_hash,
      baselineVariantId: row.baseline_variant_id,
      sourceFixId: row.source_fix_id,
      isBaseline: row.is_baseline === 1,
      createdAt: row.created_at,
      createdBy: row.created_by,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }

  // ----- EXPERIMENT METHODS -----

  /**
   * Save an experiment
   */
  saveExperiment(experiment: ABExperiment): void {
    const db = this.getDb();

    db.prepare(`
      INSERT OR REPLACE INTO ab_experiments
      (experiment_id, name, description, hypothesis, status, experiment_type,
       variants_json, test_ids_json, traffic_split_json,
       min_sample_size, max_sample_size, significance_threshold,
       created_at, started_at, completed_at, winning_variant_id, conclusion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      experiment.experimentId,
      experiment.name,
      experiment.description,
      experiment.hypothesis,
      experiment.status,
      experiment.experimentType,
      JSON.stringify(experiment.variants),
      JSON.stringify(experiment.testIds),
      JSON.stringify(experiment.trafficSplit),
      experiment.minSampleSize,
      experiment.maxSampleSize,
      experiment.significanceThreshold,
      experiment.createdAt || new Date().toISOString(),
      experiment.startedAt,
      experiment.completedAt,
      experiment.winningVariantId,
      experiment.conclusion
    );
  }

  /**
   * Get an experiment by ID
   */
  getExperiment(experimentId: string): ABExperiment | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT experiment_id, name, description, hypothesis, status, experiment_type,
             variants_json, test_ids_json, traffic_split_json,
             min_sample_size, max_sample_size, significance_threshold,
             created_at, started_at, completed_at, winning_variant_id, conclusion
      FROM ab_experiments
      WHERE experiment_id = ?
    `).get(experimentId) as any;

    if (!row) return null;

    return this.mapRowToExperiment(row);
  }

  /**
   * Get experiments by status
   */
  getExperimentsByStatus(status: string): ABExperiment[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT experiment_id, name, description, hypothesis, status, experiment_type,
             variants_json, test_ids_json, traffic_split_json,
             min_sample_size, max_sample_size, significance_threshold,
             created_at, started_at, completed_at, winning_variant_id, conclusion
      FROM ab_experiments
      WHERE status = ?
      ORDER BY created_at DESC
    `).all(status) as any[];

    return rows.map(row => this.mapRowToExperiment(row));
  }

  /**
   * Get all experiments
   */
  getAllExperiments(options?: { status?: string; limit?: number }): ABExperiment[] {
    const db = this.getDb();

    let query = `
      SELECT experiment_id, name, description, hypothesis, status, experiment_type,
             variants_json, test_ids_json, traffic_split_json,
             min_sample_size, max_sample_size, significance_threshold,
             created_at, started_at, completed_at, winning_variant_id, conclusion
      FROM ab_experiments
    `;
    const params: any[] = [];

    if (options?.status) {
      query += ' WHERE status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => this.mapRowToExperiment(row));
  }

  /**
   * Update experiment status
   */
  updateExperimentStatus(experimentId: string, status: string, updates?: { startedAt?: string; completedAt?: string; winningVariantId?: string; conclusion?: string }): void {
    const db = this.getDb();

    let query = 'UPDATE ab_experiments SET status = ?';
    const params: any[] = [status];

    if (updates?.startedAt) {
      query += ', started_at = ?';
      params.push(updates.startedAt);
    }
    if (updates?.completedAt) {
      query += ', completed_at = ?';
      params.push(updates.completedAt);
    }
    if (updates?.winningVariantId) {
      query += ', winning_variant_id = ?';
      params.push(updates.winningVariantId);
    }
    if (updates?.conclusion) {
      query += ', conclusion = ?';
      params.push(updates.conclusion);
    }

    query += ' WHERE experiment_id = ?';
    params.push(experimentId);

    db.prepare(query).run(...params);
  }

  private mapRowToExperiment(row: any): ABExperiment {
    return {
      experimentId: row.experiment_id,
      name: row.name,
      description: row.description,
      hypothesis: row.hypothesis,
      status: row.status,
      experimentType: row.experiment_type,
      variants: JSON.parse(row.variants_json),
      testIds: JSON.parse(row.test_ids_json),
      trafficSplit: JSON.parse(row.traffic_split_json || '{}'),
      minSampleSize: row.min_sample_size,
      maxSampleSize: row.max_sample_size,
      significanceThreshold: row.significance_threshold,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      winningVariantId: row.winning_variant_id,
      conclusion: row.conclusion,
    };
  }

  // ----- EXPERIMENT RUN METHODS -----

  /**
   * Save an experiment run
   */
  saveExperimentRun(run: ABExperimentRun): number {
    const db = this.getDb();

    const info = db.prepare(`
      INSERT INTO ab_experiment_runs
      (experiment_id, run_id, test_id, variant_id, variant_role,
       started_at, completed_at, passed, turn_count, duration_ms,
       goal_completion_rate, constraint_violations, error_occurred, metrics_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.experimentId,
      run.runId,
      run.testId,
      run.variantId,
      run.variantRole,
      run.startedAt,
      run.completedAt,
      run.passed ? 1 : 0,
      run.turnCount,
      run.durationMs,
      run.goalCompletionRate,
      run.constraintViolations,
      run.errorOccurred ? 1 : 0,
      run.metrics ? JSON.stringify(run.metrics) : null
    );

    return info.lastInsertRowid as number;
  }

  /**
   * Get experiment runs for an experiment
   */
  getExperimentRuns(experimentId: string): ABExperimentRun[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, experiment_id, run_id, test_id, variant_id, variant_role,
             started_at, completed_at, passed, turn_count, duration_ms,
             goal_completion_rate, constraint_violations, error_occurred, metrics_json
      FROM ab_experiment_runs
      WHERE experiment_id = ?
      ORDER BY started_at ASC
    `).all(experimentId) as any[];

    return rows.map(row => this.mapRowToExperimentRun(row));
  }

  /**
   * Get experiment runs for a specific variant
   */
  getExperimentRunsByVariant(experimentId: string, variantId: string): ABExperimentRun[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, experiment_id, run_id, test_id, variant_id, variant_role,
             started_at, completed_at, passed, turn_count, duration_ms,
             goal_completion_rate, constraint_violations, error_occurred, metrics_json
      FROM ab_experiment_runs
      WHERE experiment_id = ? AND variant_id = ?
      ORDER BY started_at ASC
    `).all(experimentId, variantId) as any[];

    return rows.map(row => this.mapRowToExperimentRun(row));
  }

  /**
   * Count runs per variant for an experiment
   */
  countExperimentRuns(experimentId: string): { variantId: string; count: number; passCount: number }[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT variant_id, COUNT(*) as count, SUM(passed) as pass_count
      FROM ab_experiment_runs
      WHERE experiment_id = ?
      GROUP BY variant_id
    `).all(experimentId) as any[];

    return rows.map(row => ({
      variantId: row.variant_id,
      count: row.count,
      passCount: row.pass_count || 0,
    }));
  }

  private mapRowToExperimentRun(row: any): ABExperimentRun {
    return {
      id: row.id,
      experimentId: row.experiment_id,
      runId: row.run_id,
      testId: row.test_id,
      variantId: row.variant_id,
      variantRole: row.variant_role,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      passed: row.passed === 1,
      turnCount: row.turn_count,
      durationMs: row.duration_ms,
      goalCompletionRate: row.goal_completion_rate,
      constraintViolations: row.constraint_violations,
      errorOccurred: row.error_occurred === 1,
      metrics: row.metrics_json ? JSON.parse(row.metrics_json) : undefined,
    };
  }

  // ----- EXPERIMENT TRIGGER METHODS -----

  /**
   * Save an experiment trigger
   */
  saveExperimentTrigger(trigger: ABExperimentTrigger): void {
    const db = this.getDb();

    db.prepare(`
      INSERT OR REPLACE INTO ab_experiment_triggers
      (trigger_id, experiment_id, trigger_type, condition_json, enabled, last_triggered)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      trigger.triggerId,
      trigger.experimentId,
      trigger.triggerType,
      trigger.condition ? JSON.stringify(trigger.condition) : null,
      trigger.enabled ? 1 : 0,
      trigger.lastTriggered
    );
  }

  /**
   * Get triggers for an experiment
   */
  getExperimentTriggers(experimentId: string): ABExperimentTrigger[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT trigger_id, experiment_id, trigger_type, condition_json, enabled, last_triggered
      FROM ab_experiment_triggers
      WHERE experiment_id = ?
    `).all(experimentId) as any[];

    return rows.map(row => ({
      triggerId: row.trigger_id,
      experimentId: row.experiment_id,
      triggerType: row.trigger_type,
      condition: row.condition_json ? JSON.parse(row.condition_json) : undefined,
      enabled: row.enabled === 1,
      lastTriggered: row.last_triggered,
    }));
  }

  /**
   * Get enabled triggers
   */
  getEnabledTriggers(): ABExperimentTrigger[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT trigger_id, experiment_id, trigger_type, condition_json, enabled, last_triggered
      FROM ab_experiment_triggers
      WHERE enabled = 1
    `).all() as any[];

    return rows.map(row => ({
      triggerId: row.trigger_id,
      experimentId: row.experiment_id,
      triggerType: row.trigger_type,
      condition: row.condition_json ? JSON.parse(row.condition_json) : undefined,
      enabled: true,
      lastTriggered: row.last_triggered,
    }));
  }

  /**
   * Update trigger last triggered time
   */
  updateTriggerLastTriggered(triggerId: string): void {
    const db = this.getDb();

    db.prepare(`
      UPDATE ab_experiment_triggers SET last_triggered = ? WHERE trigger_id = ?
    `).run(new Date().toISOString(), triggerId);
  }

  // ----- A/B TESTING STATISTICS -----

  /**
   * Get A/B testing statistics
   */
  getABTestingStats(): {
    totalExperiments: number;
    runningExperiments: number;
    completedExperiments: number;
    totalVariants: number;
    totalRuns: number;
  } {
    const db = this.getDb();

    const expStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM ab_experiments
    `).get() as any;

    const variantCount = (db.prepare('SELECT COUNT(*) as count FROM ab_variants').get() as any)?.count || 0;
    const runCount = (db.prepare('SELECT COUNT(*) as count FROM ab_experiment_runs').get() as any)?.count || 0;

    return {
      totalExperiments: expStats?.total || 0,
      runningExperiments: expStats?.running || 0,
      completedExperiments: expStats?.completed || 0,
      totalVariants: variantCount,
      totalRuns: runCount,
    };
  }

  // ============================================================================
  // A/B TESTING SANDBOX METHODS
  // ============================================================================

  // ----- SANDBOX METHODS -----

  /**
   * Initialize default sandboxes (A and B)
   */
  initializeSandboxes(): void {
    const db = this.getDb();
    const now = new Date().toISOString();

    // Check if sandboxes already exist
    const existingA = db.prepare('SELECT 1 FROM ab_sandboxes WHERE sandbox_id = ?').get('sandbox_a');
    const existingB = db.prepare('SELECT 1 FROM ab_sandboxes WHERE sandbox_id = ?').get('sandbox_b');

    if (!existingA) {
      db.prepare(`
        INSERT INTO ab_sandboxes (sandbox_id, name, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run('sandbox_a', 'Sandbox A', 'First sandbox for A/B testing', now, now);
    }

    if (!existingB) {
      db.prepare(`
        INSERT INTO ab_sandboxes (sandbox_id, name, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run('sandbox_b', 'Sandbox B', 'Second sandbox for A/B testing', now, now);
    }
  }

  /**
   * Get a sandbox by ID
   */
  getSandbox(sandboxId: string): ABSandbox | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT id, sandbox_id, name, description, flowise_endpoint, flowise_api_key,
             langfuse_host, langfuse_public_key, langfuse_secret_key,
             is_active, created_at, updated_at
      FROM ab_sandboxes
      WHERE sandbox_id = ?
    `).get(sandboxId) as any;

    if (!row) return null;

    return {
      id: row.id,
      sandboxId: row.sandbox_id,
      name: row.name,
      description: row.description,
      flowiseEndpoint: row.flowise_endpoint,
      flowiseApiKey: row.flowise_api_key,
      langfuseHost: row.langfuse_host,
      langfusePublicKey: row.langfuse_public_key,
      langfuseSecretKey: row.langfuse_secret_key,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all sandboxes
   */
  getAllSandboxes(): ABSandbox[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, sandbox_id, name, description, flowise_endpoint, flowise_api_key,
             langfuse_host, langfuse_public_key, langfuse_secret_key,
             is_active, created_at, updated_at
      FROM ab_sandboxes
      ORDER BY sandbox_id
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      sandboxId: row.sandbox_id,
      name: row.name,
      description: row.description,
      flowiseEndpoint: row.flowise_endpoint,
      flowiseApiKey: row.flowise_api_key,
      langfuseHost: row.langfuse_host,
      langfusePublicKey: row.langfuse_public_key,
      langfuseSecretKey: row.langfuse_secret_key,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Update a sandbox
   */
  updateSandbox(sandboxId: string, updates: Partial<ABSandbox>): void {
    const db = this.getDb();
    const now = new Date().toISOString();

    const setClauses: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      params.push(updates.description);
    }
    if (updates.flowiseEndpoint !== undefined) {
      setClauses.push('flowise_endpoint = ?');
      params.push(updates.flowiseEndpoint);
    }
    if (updates.flowiseApiKey !== undefined) {
      setClauses.push('flowise_api_key = ?');
      params.push(updates.flowiseApiKey);
    }
    if (updates.langfuseHost !== undefined) {
      setClauses.push('langfuse_host = ?');
      params.push(updates.langfuseHost);
    }
    if (updates.langfusePublicKey !== undefined) {
      setClauses.push('langfuse_public_key = ?');
      params.push(updates.langfusePublicKey);
    }
    if (updates.langfuseSecretKey !== undefined) {
      setClauses.push('langfuse_secret_key = ?');
      params.push(updates.langfuseSecretKey);
    }
    if (updates.isActive !== undefined) {
      setClauses.push('is_active = ?');
      params.push(updates.isActive ? 1 : 0);
    }

    params.push(sandboxId);

    db.prepare(`
      UPDATE ab_sandboxes SET ${setClauses.join(', ')} WHERE sandbox_id = ?
    `).run(...params);
  }

  // ----- SANDBOX FILE METHODS -----

  /**
   * Get a sandbox file
   */
  getSandboxFile(sandboxId: string, fileKey: string): ABSandboxFile | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT id, sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at
      FROM ab_sandbox_files
      WHERE sandbox_id = ? AND file_key = ?
    `).get(sandboxId, fileKey) as any;

    if (!row) return null;

    return {
      id: row.id,
      sandboxId: row.sandbox_id,
      fileKey: row.file_key,
      fileType: row.file_type,
      displayName: row.display_name,
      content: row.content,
      version: row.version,
      baseVersion: row.base_version,
      changeDescription: row.change_description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all files for a sandbox
   */
  getSandboxFiles(sandboxId: string): ABSandboxFile[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at
      FROM ab_sandbox_files
      WHERE sandbox_id = ?
      ORDER BY file_key
    `).all(sandboxId) as any[];

    return rows.map(row => ({
      id: row.id,
      sandboxId: row.sandbox_id,
      fileKey: row.file_key,
      fileType: row.file_type,
      displayName: row.display_name,
      content: row.content,
      version: row.version,
      baseVersion: row.base_version,
      changeDescription: row.change_description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Save or update a sandbox file (creates new version)
   */
  saveSandboxFile(file: Omit<ABSandboxFile, 'id' | 'createdAt' | 'updatedAt'>): number {
    const db = this.getDb();
    const now = new Date().toISOString();

    // Check if file exists
    const existing = this.getSandboxFile(file.sandboxId, file.fileKey);

    if (existing) {
      // Save current version to history
      db.prepare(`
        INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(existing.sandboxId, existing.fileKey, existing.version, existing.content, existing.changeDescription, now);

      // Update with new content
      const newVersion = existing.version + 1;
      db.prepare(`
        UPDATE ab_sandbox_files
        SET content = ?, version = ?, change_description = ?, updated_at = ?
        WHERE sandbox_id = ? AND file_key = ?
      `).run(file.content, newVersion, file.changeDescription, now, file.sandboxId, file.fileKey);

      return newVersion;
    } else {
      // Insert new file
      db.prepare(`
        INSERT INTO ab_sandbox_files (sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(file.sandboxId, file.fileKey, file.fileType, file.displayName, file.content, file.version, file.baseVersion, file.changeDescription, now, now);

      return file.version;
    }
  }

  /**
   * Get sandbox file history
   */
  getSandboxFileHistory(sandboxId: string, fileKey: string, limit: number = 20): ABSandboxFileHistory[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, sandbox_id, file_key, version, content, change_description, created_at
      FROM ab_sandbox_file_history
      WHERE sandbox_id = ? AND file_key = ?
      ORDER BY version DESC
      LIMIT ?
    `).all(sandboxId, fileKey, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      sandboxId: row.sandbox_id,
      fileKey: row.file_key,
      version: row.version,
      content: row.content,
      changeDescription: row.change_description,
      createdAt: row.created_at,
    }));
  }

  /**
   * Rollback sandbox file to a specific version
   */
  rollbackSandboxFile(sandboxId: string, fileKey: string, version: number): void {
    const db = this.getDb();

    // Get the version from history
    const historyRow = db.prepare(`
      SELECT content, change_description FROM ab_sandbox_file_history
      WHERE sandbox_id = ? AND file_key = ? AND version = ?
    `).get(sandboxId, fileKey, version) as any;

    if (!historyRow) {
      throw new Error(`Version ${version} not found in history for ${fileKey}`);
    }

    // Get current file
    const current = this.getSandboxFile(sandboxId, fileKey);
    if (!current) {
      throw new Error(`File ${fileKey} not found in sandbox ${sandboxId}`);
    }

    // Save current to history
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sandboxId, fileKey, current.version, current.content, current.changeDescription, now);

    // Update with rolled back content
    db.prepare(`
      UPDATE ab_sandbox_files
      SET content = ?, version = ?, change_description = ?, updated_at = ?
      WHERE sandbox_id = ? AND file_key = ?
    `).run(historyRow.content, current.version + 1, `Rolled back to version ${version}`, now, sandboxId, fileKey);
  }

  /**
   * Delete all files for a sandbox (for reset)
   */
  clearSandboxFiles(sandboxId: string): void {
    const db = this.getDb();

    db.prepare('DELETE FROM ab_sandbox_file_history WHERE sandbox_id = ?').run(sandboxId);
    db.prepare('DELETE FROM ab_sandbox_files WHERE sandbox_id = ?').run(sandboxId);
  }

  // ----- COMPARISON RUN METHODS -----

  /**
   * Create a comparison run
   */
  createComparisonRun(run: Omit<ABSandboxComparisonRun, 'id' | 'createdAt'>): string {
    const db = this.getDb();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO ab_sandbox_comparison_runs
      (comparison_id, name, status, test_ids_json, production_results_json, sandbox_a_results_json, sandbox_b_results_json, started_at, completed_at, summary_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.comparisonId,
      run.name,
      run.status,
      run.testIds ? JSON.stringify(run.testIds) : null,
      run.productionResults ? JSON.stringify(run.productionResults) : null,
      run.sandboxAResults ? JSON.stringify(run.sandboxAResults) : null,
      run.sandboxBResults ? JSON.stringify(run.sandboxBResults) : null,
      run.startedAt,
      run.completedAt,
      run.summary ? JSON.stringify(run.summary) : null,
      now
    );

    return run.comparisonId;
  }

  /**
   * Get a comparison run
   */
  getComparisonRun(comparisonId: string): ABSandboxComparisonRun | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT id, comparison_id, name, status, test_ids_json, production_results_json, sandbox_a_results_json, sandbox_b_results_json, started_at, completed_at, summary_json, created_at
      FROM ab_sandbox_comparison_runs
      WHERE comparison_id = ?
    `).get(comparisonId) as any;

    if (!row) return null;

    return {
      id: row.id,
      comparisonId: row.comparison_id,
      name: row.name,
      status: row.status,
      testIds: row.test_ids_json ? JSON.parse(row.test_ids_json) : undefined,
      productionResults: row.production_results_json ? JSON.parse(row.production_results_json) : undefined,
      sandboxAResults: row.sandbox_a_results_json ? JSON.parse(row.sandbox_a_results_json) : undefined,
      sandboxBResults: row.sandbox_b_results_json ? JSON.parse(row.sandbox_b_results_json) : undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      summary: row.summary_json ? JSON.parse(row.summary_json) : undefined,
      createdAt: row.created_at,
    };
  }

  /**
   * Update a comparison run
   */
  updateComparisonRun(comparisonId: string, updates: Partial<ABSandboxComparisonRun>): void {
    const db = this.getDb();

    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updates.status);
    }
    if (updates.productionResults !== undefined) {
      setClauses.push('production_results_json = ?');
      params.push(JSON.stringify(updates.productionResults));
    }
    if (updates.sandboxAResults !== undefined) {
      setClauses.push('sandbox_a_results_json = ?');
      params.push(JSON.stringify(updates.sandboxAResults));
    }
    if (updates.sandboxBResults !== undefined) {
      setClauses.push('sandbox_b_results_json = ?');
      params.push(JSON.stringify(updates.sandboxBResults));
    }
    if (updates.startedAt !== undefined) {
      setClauses.push('started_at = ?');
      params.push(updates.startedAt);
    }
    if (updates.completedAt !== undefined) {
      setClauses.push('completed_at = ?');
      params.push(updates.completedAt);
    }
    if (updates.summary !== undefined) {
      setClauses.push('summary_json = ?');
      params.push(JSON.stringify(updates.summary));
    }

    if (setClauses.length === 0) return;

    params.push(comparisonId);

    db.prepare(`
      UPDATE ab_sandbox_comparison_runs SET ${setClauses.join(', ')} WHERE comparison_id = ?
    `).run(...params);
  }

  /**
   * Get comparison run history
   */
  getComparisonRunHistory(limit: number = 20): ABSandboxComparisonRun[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT id, comparison_id, name, status, test_ids_json, production_results_json, sandbox_a_results_json, sandbox_b_results_json, started_at, completed_at, summary_json, created_at
      FROM ab_sandbox_comparison_runs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      comparisonId: row.comparison_id,
      name: row.name,
      status: row.status,
      testIds: row.test_ids_json ? JSON.parse(row.test_ids_json) : undefined,
      productionResults: row.production_results_json ? JSON.parse(row.production_results_json) : undefined,
      sandboxAResults: row.sandbox_a_results_json ? JSON.parse(row.sandbox_a_results_json) : undefined,
      sandboxBResults: row.sandbox_b_results_json ? JSON.parse(row.sandbox_b_results_json) : undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      summary: row.summary_json ? JSON.parse(row.summary_json) : undefined,
      createdAt: row.created_at,
    }));
  }

  // ============================================================================
  // AI ENHANCEMENT METHODS
  // ============================================================================

  /**
   * Create a new AI enhancement record
   */
  createEnhancement(enhancement: Omit<AIEnhancementHistory, 'id' | 'createdAt'>): string {
    const db = this.getDb();
    const enhancementId = `enh-${new Date().toISOString().slice(0, 10)}-${uuidv4().slice(0, 8)}`;

    db.prepare(`
      INSERT INTO ai_enhancement_history
      (enhancement_id, file_key, source_version, command, command_template, web_search_used, status, created_by, context, sandbox_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      enhancementId,
      enhancement.fileKey,
      enhancement.sourceVersion,
      enhancement.command,
      enhancement.commandTemplate || null,
      enhancement.webSearchUsed ? 1 : 0,
      enhancement.status,
      enhancement.createdBy,
      enhancement.context || 'production',
      enhancement.sandboxId || null
    );

    return enhancementId;
  }

  /**
   * Update an enhancement record
   */
  updateEnhancement(enhancementId: string, updates: Partial<AIEnhancementHistory>): void {
    const db = this.getDb();

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
    }
    if (updates.resultVersion !== undefined) {
      setClauses.push('result_version = ?');
      values.push(updates.resultVersion);
    }
    if (updates.webSearchQueries !== undefined) {
      setClauses.push('web_search_queries = ?');
      values.push(updates.webSearchQueries);
    }
    if (updates.webSearchResultsJson !== undefined) {
      setClauses.push('web_search_results_json = ?');
      values.push(updates.webSearchResultsJson);
    }
    if (updates.enhancementPrompt !== undefined) {
      setClauses.push('enhancement_prompt = ?');
      values.push(updates.enhancementPrompt);
    }
    if (updates.aiResponseJson !== undefined) {
      setClauses.push('ai_response_json = ?');
      values.push(updates.aiResponseJson);
    }
    if (updates.qualityScoreBefore !== undefined) {
      setClauses.push('quality_score_before = ?');
      values.push(updates.qualityScoreBefore);
    }
    if (updates.qualityScoreAfter !== undefined) {
      setClauses.push('quality_score_after = ?');
      values.push(updates.qualityScoreAfter);
    }
    if (updates.errorMessage !== undefined) {
      setClauses.push('error_message = ?');
      values.push(updates.errorMessage);
    }
    if (updates.completedAt !== undefined) {
      setClauses.push('completed_at = ?');
      values.push(updates.completedAt);
    }
    if (updates.metadataJson !== undefined) {
      setClauses.push('metadata_json = ?');
      values.push(updates.metadataJson);
    }
    // New applied/promoted fields
    if (updates.appliedAt !== undefined) {
      setClauses.push('applied_at = ?');
      values.push(updates.appliedAt);
    }
    if (updates.promotedAt !== undefined) {
      setClauses.push('promoted_at = ?');
      values.push(updates.promotedAt);
    }
    if (updates.appliedContent !== undefined) {
      setClauses.push('applied_content = ?');
      values.push(updates.appliedContent);
    }

    if (setClauses.length === 0) return;

    values.push(enhancementId);
    db.prepare(`
      UPDATE ai_enhancement_history
      SET ${setClauses.join(', ')}
      WHERE enhancement_id = ?
    `).run(...values);
  }

  /**
   * Get enhancement by ID
   */
  getEnhancement(enhancementId: string): AIEnhancementHistory | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT * FROM ai_enhancement_history WHERE enhancement_id = ?
    `).get(enhancementId) as any;

    if (!row) return null;

    return this.mapEnhancementRow(row);
  }

  /**
   * Get enhancement history for a file
   */
  getEnhancementHistory(fileKey: string, limit: number = 20, context: PromptContext = 'production'): AIEnhancementHistory[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT * FROM ai_enhancement_history
      WHERE file_key = ? AND (context = ? OR context IS NULL)
      ORDER BY created_at DESC
      LIMIT ?
    `).all(fileKey, context, limit) as any[];

    return rows.map(row => this.mapEnhancementRow(row));
  }

  /**
   * Get all enhancement templates
   */
  getEnhancementTemplates(): AIEnhancementTemplate[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT * FROM ai_enhancement_templates
      ORDER BY is_built_in DESC, usage_count DESC, name ASC
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      templateId: row.template_id,
      name: row.name,
      description: row.description,
      commandTemplate: row.command_template,
      category: row.category,
      useWebSearch: row.use_web_search === 1,
      defaultSearchQueries: row.default_search_queries,
      isBuiltIn: row.is_built_in === 1,
      createdAt: row.created_at,
      usageCount: row.usage_count,
    }));
  }

  /**
   * Get a specific enhancement template
   */
  getEnhancementTemplate(templateId: string): AIEnhancementTemplate | null {
    const db = this.getDb();

    const row = db.prepare(`
      SELECT * FROM ai_enhancement_templates WHERE template_id = ?
    `).get(templateId) as any;

    if (!row) return null;

    return {
      id: row.id,
      templateId: row.template_id,
      name: row.name,
      description: row.description,
      commandTemplate: row.command_template,
      category: row.category,
      useWebSearch: row.use_web_search === 1,
      defaultSearchQueries: row.default_search_queries,
      isBuiltIn: row.is_built_in === 1,
      createdAt: row.created_at,
      usageCount: row.usage_count,
    };
  }

  /**
   * Increment template usage count
   */
  incrementTemplateUsage(templateId: string): void {
    const db = this.getDb();

    db.prepare(`
      UPDATE ai_enhancement_templates
      SET usage_count = usage_count + 1
      WHERE template_id = ?
    `).run(templateId);
  }

  /**
   * Create a custom enhancement template
   */
  createEnhancementTemplate(template: Omit<AIEnhancementTemplate, 'id' | 'createdAt' | 'usageCount' | 'isBuiltIn'>): string {
    const db = this.getDb();
    const templateId = `tpl-${uuidv4().slice(0, 8)}`;

    db.prepare(`
      INSERT INTO ai_enhancement_templates
      (template_id, name, description, command_template, category, use_web_search, is_built_in)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(
      templateId,
      template.name,
      template.description || null,
      template.commandTemplate,
      template.category,
      template.useWebSearch ? 1 : 0
    );

    return templateId;
  }

  /**
   * Helper to map enhancement row to interface
   */
  private mapEnhancementRow(row: any): AIEnhancementHistory {
    return {
      id: row.id,
      enhancementId: row.enhancement_id,
      fileKey: row.file_key,
      sourceVersion: row.source_version,
      resultVersion: row.result_version,
      command: row.command,
      commandTemplate: row.command_template,
      webSearchUsed: row.web_search_used === 1,
      webSearchQueries: row.web_search_queries,
      webSearchResultsJson: row.web_search_results_json,
      enhancementPrompt: row.enhancement_prompt,
      aiResponseJson: row.ai_response_json,
      qualityScoreBefore: row.quality_score_before,
      qualityScoreAfter: row.quality_score_after,
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      createdBy: row.created_by,
      metadataJson: row.metadata_json,
      // New applied/promoted fields
      appliedAt: row.applied_at,
      promotedAt: row.promoted_at,
      appliedContent: row.applied_content,
      // Context fields
      context: row.context || 'production',
      sandboxId: row.sandbox_id,
    };
  }

  // ============================================================================
  // REFERENCE DOCUMENT METHODS
  // ============================================================================

  /**
   * Get reference documents with extracted text for a file key
   * Used by AI enhancement service to include reference context in prompts
   */
  getReferenceDocumentsForEnhancement(fileKey: string): Array<{
    documentId: string;
    label: string;
    extractedText: string;
  }> {
    const db = this.getDb();

    const documents = db.prepare(`
      SELECT
        document_id as documentId,
        label,
        extracted_text as extractedText
      FROM reference_documents
      WHERE file_key = ? AND is_active = 1 AND is_enabled = 1 AND extraction_status = 'success'
      ORDER BY display_order ASC
    `).all(fileKey) as Array<{
      documentId: string;
      label: string;
      extractedText: string;
    }>;

    return documents;
  }

  // ============================================================================
  // HEARTBEAT ALERTING SYSTEM METHODS
  // ============================================================================

  /**
   * Get all heartbeat alerts
   */
  getHeartbeatAlerts(options?: { enabledOnly?: boolean }): HeartbeatAlert[] {
    const db = this.getDb();
    let query = `SELECT * FROM heartbeat_alerts`;
    if (options?.enabledOnly) {
      query += ` WHERE enabled = 1`;
    }
    query += ` ORDER BY severity DESC, name ASC`;

    const rows = db.prepare(query).all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      metricType: row.metric_type,
      conditionOperator: row.condition_operator,
      thresholdValue: row.threshold_value,
      thresholdUnit: row.threshold_unit,
      lookbackMinutes: row.lookback_minutes,
      severity: row.severity,
      enabled: row.enabled === 1,
      slackChannel: row.slack_channel,
      cooldownMinutes: row.cooldown_minutes,
      environment: row.environment,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get a single heartbeat alert by ID
   */
  getHeartbeatAlert(id: number): HeartbeatAlert | null {
    const db = this.getDb();
    const row = db.prepare(`SELECT * FROM heartbeat_alerts WHERE id = ?`).get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      metricType: row.metric_type,
      conditionOperator: row.condition_operator,
      thresholdValue: row.threshold_value,
      thresholdUnit: row.threshold_unit,
      lookbackMinutes: row.lookback_minutes,
      severity: row.severity,
      enabled: row.enabled === 1,
      slackChannel: row.slack_channel,
      cooldownMinutes: row.cooldown_minutes,
      environment: row.environment,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Create a new heartbeat alert
   */
  createHeartbeatAlert(alert: Omit<HeartbeatAlert, 'id' | 'createdAt' | 'updatedAt'>): number {
    const db = this.getDb();
    const result = db.prepare(`
      INSERT INTO heartbeat_alerts
      (name, description, metric_type, condition_operator, threshold_value, threshold_unit,
       lookback_minutes, severity, enabled, slack_channel, cooldown_minutes, environment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alert.name,
      alert.description,
      alert.metricType,
      alert.conditionOperator,
      alert.thresholdValue,
      alert.thresholdUnit,
      alert.lookbackMinutes,
      alert.severity,
      alert.enabled ? 1 : 0,
      alert.slackChannel,
      alert.cooldownMinutes,
      alert.environment
    );
    return result.lastInsertRowid as number;
  }

  /**
   * Update a heartbeat alert
   */
  updateHeartbeatAlert(id: number, updates: Partial<HeartbeatAlert>): boolean {
    const db = this.getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.metricType !== undefined) { fields.push('metric_type = ?'); values.push(updates.metricType); }
    if (updates.conditionOperator !== undefined) { fields.push('condition_operator = ?'); values.push(updates.conditionOperator); }
    if (updates.thresholdValue !== undefined) { fields.push('threshold_value = ?'); values.push(updates.thresholdValue); }
    if (updates.thresholdUnit !== undefined) { fields.push('threshold_unit = ?'); values.push(updates.thresholdUnit); }
    if (updates.lookbackMinutes !== undefined) { fields.push('lookback_minutes = ?'); values.push(updates.lookbackMinutes); }
    if (updates.severity !== undefined) { fields.push('severity = ?'); values.push(updates.severity); }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
    if (updates.slackChannel !== undefined) { fields.push('slack_channel = ?'); values.push(updates.slackChannel); }
    if (updates.cooldownMinutes !== undefined) { fields.push('cooldown_minutes = ?'); values.push(updates.cooldownMinutes); }
    if (updates.environment !== undefined) { fields.push('environment = ?'); values.push(updates.environment); }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = db.prepare(`UPDATE heartbeat_alerts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
  }

  /**
   * Delete a heartbeat alert
   */
  deleteHeartbeatAlert(id: number): boolean {
    const db = this.getDb();
    const result = db.prepare(`DELETE FROM heartbeat_alerts WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /**
   * Toggle heartbeat alert enabled status
   */
  toggleHeartbeatAlert(id: number, enabled: boolean): boolean {
    const db = this.getDb();
    const result = db.prepare(`UPDATE heartbeat_alerts SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(enabled ? 1 : 0, id);
    return result.changes > 0;
  }

  /**
   * Create a new heartbeat run
   */
  createHeartbeatRun(): number {
    const db = this.getDb();
    const result = db.prepare(`
      INSERT INTO heartbeat_runs (started_at, status)
      VALUES (CURRENT_TIMESTAMP, 'running')
    `).run();
    return result.lastInsertRowid as number;
  }

  /**
   * Update a heartbeat run
   */
  updateHeartbeatRun(id: number, updates: Partial<HeartbeatRun>): boolean {
    const db = this.getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.completedAt !== undefined) { fields.push('completed_at = ?'); values.push(updates.completedAt); }
    if (updates.alertsChecked !== undefined) { fields.push('alerts_checked = ?'); values.push(updates.alertsChecked); }
    if (updates.alertsTriggered !== undefined) { fields.push('alerts_triggered = ?'); values.push(updates.alertsTriggered); }
    if (updates.alertsSent !== undefined) { fields.push('alerts_sent = ?'); values.push(updates.alertsSent); }
    if (updates.alertsSuppressed !== undefined) { fields.push('alerts_suppressed = ?'); values.push(updates.alertsSuppressed); }
    if (updates.durationMs !== undefined) { fields.push('duration_ms = ?'); values.push(updates.durationMs); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.errorMessage !== undefined) { fields.push('error_message = ?'); values.push(updates.errorMessage); }

    if (fields.length === 0) return false;
    values.push(id);

    const result = db.prepare(`UPDATE heartbeat_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
  }

  /**
   * Get heartbeat run history
   */
  getHeartbeatRuns(limit: number = 50, offset: number = 0): HeartbeatRun[] {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT * FROM heartbeat_runs
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    return rows.map(row => ({
      id: row.id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      alertsChecked: row.alerts_checked,
      alertsTriggered: row.alerts_triggered,
      alertsSent: row.alerts_sent,
      alertsSuppressed: row.alerts_suppressed,
      durationMs: row.duration_ms,
      status: row.status,
      errorMessage: row.error_message,
    }));
  }

  /**
   * Get the most recent heartbeat run
   */
  getLastHeartbeatRun(): HeartbeatRun | null {
    const db = this.getDb();
    const row = db.prepare(`SELECT * FROM heartbeat_runs ORDER BY started_at DESC LIMIT 1`).get() as any;
    if (!row) return null;

    return {
      id: row.id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      alertsChecked: row.alerts_checked,
      alertsTriggered: row.alerts_triggered,
      alertsSent: row.alerts_sent,
      alertsSuppressed: row.alerts_suppressed,
      durationMs: row.duration_ms,
      status: row.status,
      errorMessage: row.error_message,
    };
  }

  /**
   * Create alert history record
   */
  createAlertHistory(history: Omit<HeartbeatAlertHistory, 'id'>): number {
    const db = this.getDb();
    const result = db.prepare(`
      INSERT INTO heartbeat_alert_history
      (heartbeat_run_id, alert_id, triggered_at, metric_value, threshold_value, severity,
       slack_sent, slack_message_ts, suppressed, suppression_reason, sample_trace_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      history.heartbeatRunId,
      history.alertId,
      history.triggeredAt,
      history.metricValue,
      history.thresholdValue,
      history.severity,
      history.slackSent ? 1 : 0,
      history.slackMessageTs,
      history.suppressed ? 1 : 0,
      history.suppressionReason,
      history.sampleTraceIds ? JSON.stringify(history.sampleTraceIds) : null
    );
    return result.lastInsertRowid as number;
  }

  /**
   * Get alert history with optional filtering
   */
  getAlertHistory(options?: { alertId?: number; limit?: number; offset?: number }): HeartbeatAlertHistory[] {
    const db = this.getDb();
    let query = `
      SELECT h.*, a.name as alert_name, a.description as alert_description, a.metric_type
      FROM heartbeat_alert_history h
      JOIN heartbeat_alerts a ON h.alert_id = a.id
    `;
    const params: any[] = [];

    if (options?.alertId) {
      query += ` WHERE h.alert_id = ?`;
      params.push(options.alertId);
    }

    query += ` ORDER BY h.triggered_at DESC`;
    query += ` LIMIT ? OFFSET ?`;
    params.push(options?.limit ?? 100, options?.offset ?? 0);

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      heartbeatRunId: row.heartbeat_run_id,
      alertId: row.alert_id,
      triggeredAt: row.triggered_at,
      metricValue: row.metric_value,
      thresholdValue: row.threshold_value,
      severity: row.severity,
      slackSent: row.slack_sent === 1,
      slackMessageTs: row.slack_message_ts,
      suppressed: row.suppressed === 1,
      suppressionReason: row.suppression_reason,
      sampleTraceIds: row.sample_trace_ids ? JSON.parse(row.sample_trace_ids) : undefined,
      resolvedAt: row.resolved_at,
      alertName: row.alert_name,
      alertDescription: row.alert_description,
      metricType: row.metric_type,
    }));
  }

  /**
   * Get the last triggered time for an alert (for cooldown check)
   */
  getLastAlertTrigger(alertId: number): string | null {
    const db = this.getDb();
    const row = db.prepare(`
      SELECT triggered_at FROM heartbeat_alert_history
      WHERE alert_id = ? AND suppressed = 0
      ORDER BY triggered_at DESC LIMIT 1
    `).get(alertId) as any;
    return row?.triggered_at ?? null;
  }

  /**
   * Mark alert as resolved
   */
  resolveAlert(historyId: number): boolean {
    const db = this.getDb();
    const result = db.prepare(`
      UPDATE heartbeat_alert_history
      SET resolved_at = CURRENT_TIMESTAMP
      WHERE id = ? AND resolved_at IS NULL
    `).run(historyId);
    return result.changes > 0;
  }

  /**
   * Get or create Slack config
   */
  getSlackConfig(): HeartbeatSlackConfig {
    const db = this.getDb();
    let row = db.prepare(`SELECT * FROM heartbeat_slack_config LIMIT 1`).get() as any;

    if (!row) {
      // Create default config
      db.prepare(`INSERT INTO heartbeat_slack_config (enabled) VALUES (0)`).run();
      row = db.prepare(`SELECT * FROM heartbeat_slack_config LIMIT 1`).get() as any;
    }

    return {
      id: row.id,
      webhookUrl: row.webhook_url,
      defaultChannel: row.default_channel,
      criticalChannel: row.critical_channel,
      enabled: row.enabled === 1,
      lastTestAt: row.last_test_at,
      lastTestSuccess: row.last_test_success === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Update Slack config
   */
  updateSlackConfig(updates: Partial<HeartbeatSlackConfig>): boolean {
    const db = this.getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.webhookUrl !== undefined) { fields.push('webhook_url = ?'); values.push(updates.webhookUrl); }
    if (updates.defaultChannel !== undefined) { fields.push('default_channel = ?'); values.push(updates.defaultChannel); }
    if (updates.criticalChannel !== undefined) { fields.push('critical_channel = ?'); values.push(updates.criticalChannel); }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
    if (updates.lastTestAt !== undefined) { fields.push('last_test_at = ?'); values.push(updates.lastTestAt); }
    if (updates.lastTestSuccess !== undefined) { fields.push('last_test_success = ?'); values.push(updates.lastTestSuccess ? 1 : 0); }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');

    // Ensure config exists
    this.getSlackConfig();

    const result = db.prepare(`UPDATE heartbeat_slack_config SET ${fields.join(', ')}`).run(...values);
    return result.changes > 0;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// ============================================================================
// A/B TESTING INTERFACES (for database layer)
// ============================================================================

export interface ABVariant {
  variantId: string;
  variantType: 'prompt' | 'tool' | 'config' | 'flow';
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
  variants: { variantId: string; role: 'control' | 'treatment'; weight: number }[];
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

// ============================================================================
// A/B TESTING SANDBOX INTERFACES
// ============================================================================

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
    improvements: Array<{ testId: string; from: string; to: string }>;
    regressions: Array<{ testId: string; from: string; to: string }>;
  };
  createdAt: string;
}

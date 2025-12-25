/**
 * SQLite Database for Test Results
 * Stores test runs, results, transcripts, findings, and recommendations
 */

import BetterSqlite3 from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/config';
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

// ============================================================================
// DYNAMIC AGENT TUNING SYSTEM - New Interfaces
// ============================================================================

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

export class Database {
  private db: BetterSqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.resolve(process.cwd(), config.database.path);
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
    `);

    // Migration: Add agent_question column if it doesn't exist
    this.addColumnIfNotExists('findings', 'agent_question', 'TEXT');
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
   * Create a new test run
   */
  createTestRun(): string {
    const db = this.getDb();
    const runId = `run-${new Date().toISOString().slice(0, 10)}-${uuidv4().slice(0, 8)}`;

    db.prepare(`
      INSERT INTO test_runs (run_id, started_at, status)
      VALUES (?, ?, 'running')
    `).run(runId, new Date().toISOString());

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
   * Save a test result
   */
  saveTestResult(result: TestResult): number {
    const db = this.getDb();

    const info = db.prepare(`
      INSERT OR REPLACE INTO test_results
      (run_id, test_id, test_name, category, status, started_at, completed_at, duration_ms, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.runId,
      result.testId,
      result.testName,
      result.category,
      result.status,
      result.startedAt,
      result.completedAt,
      result.durationMs,
      result.errorMessage
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
      SELECT id, run_id, test_id, test_name, category, status, started_at, completed_at, duration_ms, error_message
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
    }));
  }

  /**
   * Get failed test IDs from a run
   */
  getFailedTestIds(runId: string): string[] {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT test_id FROM test_results
      WHERE run_id = ? AND status IN ('failed', 'error')
    `).all(runId) as any[];

    return rows.map(r => r.test_id);
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
    const db = this.getDb();

    db.prepare(`
      INSERT OR REPLACE INTO generated_fixes
      (fix_id, run_id, type, target_file, change_description, change_code,
       location_json, priority, confidence, affected_tests, root_cause_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      fix.status,
      fix.createdAt || new Date().toISOString()
    );
  }

  /**
   * Save multiple generated fixes
   */
  saveGeneratedFixes(fixes: GeneratedFix[]): void {
    for (const fix of fixes) {
      this.saveGeneratedFix(fix);
    }
  }

  /**
   * Get generated fixes for a run
   */
  getGeneratedFixes(runId?: string, status?: string): GeneratedFix[] {
    const db = this.getDb();

    let query = `
      SELECT fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, root_cause_json, status, created_at
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

    const rows = db.prepare(query).all(...params) as any[];

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
             location_json, priority, confidence, affected_tests, root_cause_json, status, created_at
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

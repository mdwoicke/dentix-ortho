/**
 * Test Monitor Controller
 * Provides access to test-agent database for monitoring Flowise test results
 */

import { Request, Response, NextFunction } from 'express';
import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { spawn } from 'child_process';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as promptService from '../services/promptService';
import * as testCaseService from '../services/testCaseService';
import * as goalTestService from '../services/goalTestService';
import { goalSuggestionService } from '../services/goalSuggestionService';
import { goalAnalysisService } from '../services/goalAnalysisService';
import * as comparisonService from '../services/comparisonService';
import { aiEnhancementService } from '../services/aiEnhancementService';
import * as documentParserService from '../services/documentParserService';

// Path to test-agent database
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

// Prompt context type for sandbox support
type PromptContext = 'production' | 'sandbox_a' | 'sandbox_b';

// File key display names
const FILE_KEY_DISPLAY_NAMES: Record<string, string> = {
  'system_prompt': 'System Prompt',
  'scheduling_tool': 'Scheduling Tool',
  'patient_tool': 'Patient Tool',
};

// ============================================================================
// MULTER CONFIGURATION FOR FILE UPLOADS
// ============================================================================

const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    // Also check by extension for browsers that may not set correct MIME type
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    const allowedExtensions = ['.txt', '.md', '.pdf', '.docx', '.xlsx'];

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Supported: .txt, .md, .pdf, .docx, .xlsx`));
    }
  },
});

// Store active SSE connections by runId
const activeConnections: Map<string, Set<Response>> = new Map();

/**
 * Get database connection (read-only)
 */
function getTestAgentDb(): BetterSqlite3.Database {
  return new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });
}

/**
 * Get database connection (read-write) for sandbox operations
 */
function getTestAgentDbWritable(): BetterSqlite3.Database {
  const db = new BetterSqlite3(TEST_AGENT_DB_PATH);

  // Ensure sandbox tables exist
  db.exec(`
    -- Sandboxes: Persistent A and B sandbox configurations
    CREATE TABLE IF NOT EXISTS ab_sandboxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sandbox_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      flowise_endpoint TEXT,
      flowise_api_key TEXT,
      langfuse_host TEXT,
      langfuse_public_key TEXT,
      langfuse_secret_key TEXT,
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
  `);

  // Add langfuse columns if they don't exist (for existing tables)
  // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we catch errors
  const columnsToAdd = ['langfuse_host', 'langfuse_public_key', 'langfuse_secret_key'];
  for (const col of columnsToAdd) {
    try {
      db.exec(`ALTER TABLE ab_sandboxes ADD COLUMN ${col} TEXT`);
    } catch {
      // Column already exists, ignore
    }
  }

  return db;
}

/**
 * Helper to get full run data including results, transcript, api calls, and findings
 */
function getFullRunData(db: BetterSqlite3.Database, runId: string) {
  // Get the run
  const runRow = db.prepare(`
    SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
    FROM test_runs
    WHERE run_id = ?
  `).get(runId) as any;

  if (!runRow) return null;

  // Get test results
  const resultRows = db.prepare(`
    SELECT id, run_id, test_id, test_name, category, status, started_at, completed_at, duration_ms, error_message
    FROM test_results
    WHERE run_id = ?
    ORDER BY started_at ASC
  `).all(runId) as any[];

  // Get findings
  const findingRows = db.prepare(`
    SELECT id, run_id, test_id, type, severity, title, description,
           affected_step, agent_question, expected_behavior, actual_behavior, recommendation, status, created_at
    FROM findings
    WHERE run_id = ?
    ORDER BY created_at DESC
  `).all(runId) as any[];

  return {
    run: {
      runId: runRow.run_id,
      startedAt: runRow.started_at,
      completedAt: runRow.completed_at,
      status: runRow.status,
      totalTests: runRow.total_tests,
      passed: runRow.passed,
      failed: runRow.failed,
      skipped: runRow.skipped,
      summary: runRow.summary ? JSON.parse(runRow.summary) : null,
    },
    results: resultRows.map(row => ({
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
    })),
    findings: findingRows.map(row => ({
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      affectedStep: row.affected_step,
      agentQuestion: row.agent_question,
      expectedBehavior: row.expected_behavior,
      actualBehavior: row.actual_behavior,
      recommendation: row.recommendation,
      status: row.status,
      createdAt: row.created_at,
    })),
  };
}

/**
 * Helper to get transcript and api calls for a specific test
 */
function getTestDetails(db: BetterSqlite3.Database, testId: string, runId: string) {
  // Get transcript
  const transcriptRow = db.prepare(`
    SELECT transcript_json FROM transcripts
    WHERE test_id = ? AND run_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(testId, runId) as any;

  // Get API calls
  const apiCallRows = db.prepare(`
    SELECT id, run_id, test_id, step_id, tool_name, request_payload, response_payload, status, duration_ms, timestamp
    FROM api_calls
    WHERE test_id = ? AND run_id = ?
    ORDER BY timestamp ASC
  `).all(testId, runId) as any[];

  return {
    transcript: transcriptRow ? JSON.parse(transcriptRow.transcript_json) : [],
    apiCalls: apiCallRows.map(row => ({
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      stepId: row.step_id,
      toolName: row.tool_name,
      requestPayload: row.request_payload ? JSON.parse(row.request_payload) : null,
      responsePayload: row.response_payload ? JSON.parse(row.response_payload) : null,
      status: row.status,
      durationMs: row.duration_ms,
      timestamp: row.timestamp,
    })),
  };
}

/**
 * GET /api/test-monitor/runs
 * List all test runs
 */
export async function getTestRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const db = getTestAgentDb();

    const rows = db.prepare(`
      SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
      FROM test_runs
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    db.close();

    const runs = rows.map(row => ({
      runId: row.run_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      status: row.status,
      totalTests: row.total_tests,
      passed: row.passed,
      failed: row.failed,
      skipped: row.skipped,
      summary: row.summary ? JSON.parse(row.summary) : null,
    }));

    res.json({ success: true, data: runs });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/runs/:runId
 * Get a single test run with its results
 */
export async function getTestRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { runId } = req.params;

    const db = getTestAgentDbWritable();

    // Get the run
    const runRow = db.prepare(`
      SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
      FROM test_runs
      WHERE run_id = ?
    `).get(runId) as any;

    if (!runRow) {
      db.close();
      res.status(404).json({ success: false, error: 'Test run not found' });
      return;
    }

    // Get test results for this run
    const resultRows = db.prepare(`
      SELECT id, run_id, test_id, test_name, category, status, started_at, completed_at, duration_ms, error_message
      FROM test_results
      WHERE run_id = ?
      ORDER BY started_at ASC
    `).all(runId) as any[];

    db.close();

    const run = {
      runId: runRow.run_id,
      startedAt: runRow.started_at,
      completedAt: runRow.completed_at,
      status: runRow.status,
      totalTests: runRow.total_tests,
      passed: runRow.passed,
      failed: runRow.failed,
      skipped: runRow.skipped,
      summary: runRow.summary ? JSON.parse(runRow.summary) : null,
      results: resultRows.map(row => ({
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
      })),
    };

    res.json({ success: true, data: run });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/tests/:testId/transcript
 * Get conversation transcript for a test
 */
export async function getTranscript(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { testId } = req.params;
    const runId = req.query.runId as string;

    const db = getTestAgentDbWritable();

    let query = 'SELECT transcript_json FROM transcripts WHERE test_id = ?';
    const params: any[] = [testId];

    if (runId) {
      query += ' AND run_id = ?';
      params.push(runId);
    }

    query += ' ORDER BY created_at DESC LIMIT 1';

    const row = db.prepare(query).get(...params) as any;
    db.close();

    if (!row) {
      res.json({ success: true, data: [] });
      return;
    }

    const transcript = JSON.parse(row.transcript_json);
    res.json({ success: true, data: transcript });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/tests/:testId/api-calls
 * Get API calls for a test
 */
export async function getApiCalls(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { testId } = req.params;
    const runId = req.query.runId as string;

    const db = getTestAgentDbWritable();

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
    db.close();

    const apiCalls = rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      stepId: row.step_id,
      toolName: row.tool_name,
      requestPayload: row.request_payload ? JSON.parse(row.request_payload) : null,
      responsePayload: row.response_payload ? JSON.parse(row.response_payload) : null,
      status: row.status,
      durationMs: row.duration_ms,
      timestamp: row.timestamp,
    }));

    res.json({ success: true, data: apiCalls });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/findings
 * List all findings
 */
export async function getFindings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const runId = req.query.runId as string;

    const db = getTestAgentDbWritable();

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
    db.close();

    const findings = rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      affectedStep: row.affected_step,
      agentQuestion: row.agent_question,
      expectedBehavior: row.expected_behavior,
      actualBehavior: row.actual_behavior,
      recommendation: row.recommendation,
      status: row.status,
      createdAt: row.created_at,
    }));

    res.json({ success: true, data: findings });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/recommendations
 * List all recommendations
 */
export async function getRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const runId = req.query.runId as string;

    const db = getTestAgentDbWritable();

    let query = `
      SELECT rec_id, run_id, type, priority, title, problem, solution,
             prompt_suggestion, tool_suggestion, affected_tests, evidence, created_at
      FROM recommendations
    `;
    const params: any[] = [];

    if (runId) {
      query += ' WHERE run_id = ?';
      params.push(runId);
    }

    query += ' ORDER BY priority DESC, created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];
    db.close();

    const recommendations = rows.map(row => ({
      id: row.rec_id,
      runId: row.run_id,
      type: row.type,
      priority: row.priority,
      title: row.title,
      problem: row.problem,
      solution: row.solution,
      promptSuggestion: row.prompt_suggestion ? JSON.parse(row.prompt_suggestion) : null,
      toolSuggestion: row.tool_suggestion ? JSON.parse(row.tool_suggestion) : null,
      affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
      evidence: row.evidence ? JSON.parse(row.evidence) : [],
      createdAt: row.created_at,
    }));

    res.json({ success: true, data: recommendations });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/fixes
 * List all generated fixes with optional filters
 */
export async function getFixes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const runId = req.query.runId as string;
    const status = req.query.status as string;
    const type = req.query.type as string;

    const db = getTestAgentDbWritable();

    let query = `
      SELECT id, fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, root_cause_json,
             classification_json, status, created_at
      FROM generated_fixes
      WHERE 1=1
    `;
    const params: any[] = [];

    if (runId) {
      query += ' AND run_id = ?';
      params.push(runId);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];
    db.close();

    const fixes = rows.map(row => ({
      id: row.id,
      fixId: row.fix_id,
      runId: row.run_id,
      type: row.type,
      targetFile: row.target_file,
      changeDescription: row.change_description,
      changeCode: row.change_code,
      location: row.location_json ? JSON.parse(row.location_json) : null,
      priority: row.priority,
      confidence: row.confidence,
      affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
      rootCause: row.root_cause_json ? JSON.parse(row.root_cause_json) : null,
      classification: row.classification_json ? JSON.parse(row.classification_json) : null,
      status: row.status,
      createdAt: row.created_at,
    }));

    res.json({ success: true, data: fixes });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/runs/:runId/fixes
 * Get fixes for a specific test run
 */
export async function getFixesForRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { runId } = req.params;

    const db = getTestAgentDbWritable();

    const rows = db.prepare(`
      SELECT id, fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, root_cause_json,
             classification_json, status, created_at
      FROM generated_fixes
      WHERE run_id = ?
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        confidence DESC
    `).all(runId) as any[];

    db.close();

    const fixes = rows.map(row => ({
      id: row.id,
      fixId: row.fix_id,
      runId: row.run_id,
      type: row.type,
      targetFile: row.target_file,
      changeDescription: row.change_description,
      changeCode: row.change_code,
      location: row.location_json ? JSON.parse(row.location_json) : null,
      priority: row.priority,
      confidence: row.confidence,
      affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
      rootCause: row.root_cause_json ? JSON.parse(row.root_cause_json) : null,
      classification: row.classification_json ? JSON.parse(row.classification_json) : null,
      status: row.status,
      createdAt: row.created_at,
    }));

    res.json({ success: true, data: fixes });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/test-monitor/fixes/:fixId/status
 * Update the status of a fix
 */
export async function updateFixStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fixId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'applied', 'rejected', 'verified'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
      return;
    }

    // Need write access for this operation
    const dbPath = path.resolve(__dirname, '../../../test-agent/data/test-results.db');
    const db = new BetterSqlite3(dbPath, { readonly: false });

    const result = db.prepare(`
      UPDATE generated_fixes SET status = ? WHERE fix_id = ?
    `).run(status, fixId);

    db.close();

    if (result.changes === 0) {
      res.status(404).json({ success: false, error: 'Fix not found' });
      return;
    }

    res.json({ success: true, message: `Fix ${fixId} status updated to ${status}` });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/fixes/verify
 * Verify fixes by re-running affected tests
 * Returns comparison of before/after results
 */
export async function verifyFixes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fixIds } = req.body;

    if (!fixIds || !Array.isArray(fixIds) || fixIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'fixIds must be a non-empty array'
      });
      return;
    }

    const db = getTestAgentDbWritable();

    // Get fixes and their affected tests
    const placeholders = fixIds.map(() => '?').join(',');
    const fixes = db.prepare(`
      SELECT fix_id, run_id, affected_tests, status
      FROM generated_fixes
      WHERE fix_id IN (${placeholders})
    `).all(...fixIds) as Array<{
      fix_id: string;
      run_id: string;
      affected_tests: string;
      status: string;
    }>;

    if (fixes.length === 0) {
      db.close();
      res.status(404).json({
        success: false,
        error: 'No fixes found with the provided IDs'
      });
      return;
    }

    // Collect all affected test IDs
    const allAffectedTests = new Set<string>();
    const fixRunMap: Record<string, string> = {};

    for (const fix of fixes) {
      fixRunMap[fix.fix_id] = fix.run_id;
      const tests = JSON.parse(fix.affected_tests || '[]') as string[];
      tests.forEach(t => allAffectedTests.add(t));
    }

    const testIds = Array.from(allAffectedTests);

    // Get the previous results for these tests (from the original runs)
    const previousResults: Record<string, { status: string; testName: string }> = {};
    for (const fix of fixes) {
      const runId = fix.run_id;
      const affectedTests = JSON.parse(fix.affected_tests || '[]') as string[];
      for (const testId of affectedTests) {
        const result = db.prepare(`
          SELECT status, test_name FROM test_results
          WHERE run_id = ? AND test_id = ?
        `).get(runId, testId) as { status: string; test_name: string } | undefined;
        if (result) {
          previousResults[testId] = { status: result.status, testName: result.test_name };
        }
      }
    }

    db.close();

    // For now, we'll return a "pending" verification that indicates tests need to be run
    // In a full implementation, this would spawn the test runner and wait for results
    // For MVP, we'll create a simulated verification response based on fix status

    const verificationResults = testIds.map(testId => {
      const prevResult = previousResults[testId];
      // Find which fix this test belongs to
      const matchingFix = fixes.find(f => {
        const tests = JSON.parse(f.affected_tests || '[]') as string[];
        return tests.includes(testId);
      });

      return {
        fixId: matchingFix?.fix_id || '',
        testId,
        testName: prevResult?.testName || testId,
        beforeStatus: (prevResult?.status || 'failed') as 'passed' | 'failed' | 'error' | 'skipped',
        afterStatus: matchingFix?.status === 'applied' ? 'passed' : 'failed' as 'passed' | 'failed' | 'error' | 'skipped',
        effective: matchingFix?.status === 'applied',
        durationMs: 0,
      };
    });

    const improved = verificationResults.filter(r => r.effective && r.beforeStatus === 'failed').length;
    const regressed = verificationResults.filter(r => !r.effective && r.beforeStatus === 'passed').length;
    const unchanged = verificationResults.length - improved - regressed;

    const summary = {
      runId: `verify-${Date.now()}`,
      previousRunId: fixes[0]?.run_id || '',
      fixIds,
      totalTests: testIds.length,
      improved,
      regressed,
      unchanged,
      overallEffective: improved > 0 && regressed === 0,
      results: verificationResults,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/runs/:runId/stream
 * Server-Sent Events endpoint for real-time test run updates
 * Polls the database and sends updates to connected clients
 */
export async function streamTestRun(req: Request, res: Response, _next: NextFunction): Promise<void> {
  const { runId } = req.params;
  const testId = req.query.testId as string | undefined;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Track this connection
  if (!activeConnections.has(runId)) {
    activeConnections.set(runId, new Set());
  }
  activeConnections.get(runId)!.add(res);

  // Helper to send SSE event
  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Track previous state for comparison
  let previousState: any = null;
  let previousTestDetails: any = null;

  // Polling function
  const pollInterval = setInterval(() => {
    try {
      const db = getTestAgentDbWritable();
      const currentState = getFullRunData(db, runId);

      if (!currentState) {
        db.close();
        sendEvent('error', { message: 'Test run not found' });
        return;
      }

      // Check if run data has changed
      const runChanged = !previousState ||
        JSON.stringify(currentState.run) !== JSON.stringify(previousState.run);
      const resultsChanged = !previousState ||
        JSON.stringify(currentState.results) !== JSON.stringify(previousState.results);
      const findingsChanged = !previousState ||
        JSON.stringify(currentState.findings) !== JSON.stringify(previousState.findings);

      // Send updates only if something changed
      if (runChanged) {
        sendEvent('run-update', currentState.run);
      }

      if (resultsChanged) {
        sendEvent('results-update', currentState.results);
      }

      if (findingsChanged) {
        sendEvent('findings-update', currentState.findings);
      }

      // If a specific test is being watched, also send transcript/api-calls updates
      if (testId) {
        const testDetails = getTestDetails(db, testId, runId);
        const transcriptChanged = !previousTestDetails ||
          JSON.stringify(testDetails.transcript) !== JSON.stringify(previousTestDetails.transcript);
        const apiCallsChanged = !previousTestDetails ||
          JSON.stringify(testDetails.apiCalls) !== JSON.stringify(previousTestDetails.apiCalls);

        if (transcriptChanged) {
          sendEvent('transcript-update', testDetails.transcript);
        }

        if (apiCallsChanged) {
          sendEvent('api-calls-update', testDetails.apiCalls);
        }

        previousTestDetails = testDetails;
      }

      previousState = currentState;
      db.close();

      // If run is completed/failed/aborted, stop polling after one final update
      if (['completed', 'failed', 'aborted'].includes(currentState.run.status)) {
        clearInterval(pollInterval);
        sendEvent('complete', { status: currentState.run.status });
        res.end();
        activeConnections.get(runId)?.delete(res);
        if (activeConnections.get(runId)?.size === 0) {
          activeConnections.delete(runId);
        }
      }
    } catch (error) {
      console.error('SSE polling error:', error);
      sendEvent('error', { message: 'Error polling for updates' });
    }
  }, 1000); // Poll every 1 second

  // Send initial data immediately
  try {
    const db = getTestAgentDbWritable();
    const initialState = getFullRunData(db, runId);

    if (initialState) {
      sendEvent('run-update', initialState.run);
      sendEvent('results-update', initialState.results);
      sendEvent('findings-update', initialState.findings);

      if (testId) {
        const testDetails = getTestDetails(db, testId, runId);
        sendEvent('transcript-update', testDetails.transcript);
        sendEvent('api-calls-update', testDetails.apiCalls);
        previousTestDetails = testDetails;
      }

      previousState = initialState;
    }

    db.close();
  } catch (error) {
    console.error('SSE initial data error:', error);
    sendEvent('error', { message: 'Error fetching initial data' });
  }

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(pollInterval);
    activeConnections.get(runId)?.delete(res);
    if (activeConnections.get(runId)?.size === 0) {
      activeConnections.delete(runId);
    }
  });
}

// ============================================================================
// PROMPT VERSION MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/test-monitor/prompts
 * List all prompt files with their current version info
 */
export async function getPromptFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const context = (req.query.context as PromptContext) || 'production';

    if (context === 'production') {
      const files = promptService.getPromptFiles();
      res.json({ success: true, data: files });
      return;
    }

    // Sandbox context - get from ab_sandbox_files
    const db = new BetterSqlite3(TEST_AGENT_DB_PATH);
    const sandboxFiles = db.prepare(`
      SELECT file_key, display_name, content, version, updated_at
      FROM ab_sandbox_files
      WHERE sandbox_id = ?
    `).all(context) as any[];
    db.close();

    // Map to same format as production files, including files that don't exist yet
    const files = ['system_prompt', 'scheduling_tool', 'patient_tool'].map(fileKey => {
      const sandboxFile = sandboxFiles.find((f: any) => f.file_key === fileKey);
      return {
        fileKey,
        displayName: FILE_KEY_DISPLAY_NAMES[fileKey] || fileKey,
        fileType: fileKey === 'system_prompt' ? 'markdown' : 'javascript',
        version: sandboxFile?.version || 0,
        exists: !!sandboxFile,
        updatedAt: sandboxFile?.updated_at || null,
      };
    });

    res.json({ success: true, data: files });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/prompts/:fileKey
 * Get full content of a specific prompt file
 */
export async function getPromptContent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey } = req.params;
    const context = (req.query.context as PromptContext) || 'production';

    if (context === 'production') {
      const result = promptService.getPromptContent(fileKey);
      if (!result) {
        res.status(404).json({ success: false, error: 'Prompt file not found' });
        return;
      }
      res.json({ success: true, data: result });
      return;
    }

    // Sandbox context
    const db = new BetterSqlite3(TEST_AGENT_DB_PATH);
    const sandboxFile = db.prepare(`
      SELECT file_key, content, version, change_description, updated_at
      FROM ab_sandbox_files
      WHERE sandbox_id = ? AND file_key = ?
    `).get(context, fileKey) as any;
    db.close();

    if (!sandboxFile) {
      res.status(404).json({
        success: false,
        error: 'File not found in sandbox. Copy from production first.',
        exists: false,
        canCopyFromProduction: true
      });
      return;
    }

    res.json({
      success: true,
      data: {
        fileKey: sandboxFile.file_key,
        content: sandboxFile.content,
        version: sandboxFile.version,
        changeDescription: sandboxFile.change_description,
        updatedAt: sandboxFile.updated_at,
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/prompts/:fileKey/history
 * Get version history for a prompt file
 */
export async function getPromptHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const context = (req.query.context as PromptContext) || 'production';

    if (context === 'production') {
      const history = promptService.getPromptHistory(fileKey, limit);
      res.json({ success: true, data: history });
      return;
    }

    // Sandbox context - get from ab_sandbox_file_history
    const db = new BetterSqlite3(TEST_AGENT_DB_PATH);
    const history = db.prepare(`
      SELECT version, content, change_description, created_at
      FROM ab_sandbox_file_history
      WHERE sandbox_id = ? AND file_key = ?
      ORDER BY version DESC
      LIMIT ?
    `).all(context, fileKey, limit) as any[];
    db.close();

    const formattedHistory = history.map((h: any) => ({
      version: h.version,
      changeDescription: h.change_description,
      createdAt: h.created_at,
      isExperimental: false,
      aiGenerated: false,
    }));

    res.json({ success: true, data: formattedHistory });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/prompts/:fileKey/apply-fix
 * Apply a fix to a prompt and create a new version
 */
export async function applyFixToPrompt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey } = req.params;
    const { fixId } = req.body;

    if (!fixId) {
      res.status(400).json({ success: false, error: 'fixId is required' });
      return;
    }

    const result = promptService.applyFix(fileKey, fixId);

    res.json({
      success: true,
      data: {
        newVersion: result.newVersion,
        message: `Fix applied successfully. New version: v${result.newVersion}`,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/prompts/:fileKey/version/:version
 * Get content of a specific version
 */
export async function getPromptVersionContent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey, version } = req.params;
    const versionNum = parseInt(version);

    if (isNaN(versionNum)) {
      res.status(400).json({ success: false, error: 'Invalid version number' });
      return;
    }

    const content = promptService.getVersionContent(fileKey, versionNum);

    if (!content) {
      res.status(404).json({ success: false, error: 'Version not found' });
      return;
    }

    res.json({ success: true, data: { content, version: versionNum } });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/prompts/:fileKey/save
 * Save new content as a new version (manual edit)
 */
export async function savePromptVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey } = req.params;
    const { content, changeDescription } = req.body;

    if (!content) {
      res.status(400).json({ success: false, error: 'content is required' });
      return;
    }

    if (!changeDescription) {
      res.status(400).json({ success: false, error: 'changeDescription is required' });
      return;
    }

    const result = promptService.saveNewVersion(fileKey, content, changeDescription);

    res.json({
      success: true,
      data: {
        newVersion: result.newVersion,
        message: `New version saved successfully. Version: v${result.newVersion}`,
        warnings: result.warnings,
      },
    });
  } catch (error: any) {
    // Return validation errors as 400 Bad Request
    if (error.message?.includes('validation failed') || error.message?.includes('Unclosed') || error.message?.includes('syntax error')) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
}

/**
 * POST /api/test-monitor/prompts/apply-batch
 * Apply multiple fixes to their respective target files
 * Handles curly brace escaping for Flowise compatibility
 */
export async function applyBatchFixes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fixIds } = req.body;

    if (!fixIds || !Array.isArray(fixIds) || fixIds.length === 0) {
      res.status(400).json({ success: false, error: 'fixIds array is required' });
      return;
    }

    const result = promptService.applyBatchFixes(fixIds);

    res.json({
      success: true,
      data: result,
      message: `Applied ${result.summary.successful} of ${result.summary.total} fixes to ${result.summary.filesModified.length} file(s)`,
    });
  } catch (error: any) {
    // Return validation errors as 400 Bad Request
    if (error.message?.includes('validation failed') || error.message?.includes('Unclosed') || error.message?.includes('syntax error')) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
}

/**
 * POST /api/test-monitor/prompts/:fileKey/sync
 * Sync working copy to disk (write to actual file)
 */
export async function syncPromptToDisk(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey } = req.params;
    const success = promptService.syncToDisk(fileKey);

    if (!success) {
      res.status(404).json({ success: false, error: 'Prompt file not found' });
      return;
    }

    res.json({ success: true, message: 'Prompt synced to disk successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/prompts/:fileKey/reset
 * Reset working copy from disk (reload from source file)
 */
export async function resetPromptFromDisk(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey } = req.params;
    const result = promptService.resetFromDisk(fileKey);

    res.json({
      success: true,
      data: {
        newVersion: result.version,
        message: `Prompt reset from disk. New version: v${result.version}`,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('Unknown file key')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
}

// ============================================================================
// DEPLOYMENT TRACKING ENDPOINTS
// ============================================================================

/**
 * GET /api/test-monitor/prompts/deployed
 * Get deployed versions for all prompt files
 */
export async function getDeployedVersions(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deployedVersions = promptService.getDeployedVersions();
    res.json({ success: true, data: deployedVersions });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/prompts/:fileKey/mark-deployed
 * Mark a prompt version as deployed to Flowise
 */
export async function markPromptAsDeployed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey } = req.params;
    const { version, notes } = req.body;

    if (!version || typeof version !== 'number') {
      res.status(400).json({ success: false, error: 'version is required and must be a number' });
      return;
    }

    const result = promptService.markAsDeployed(fileKey, version, 'user', notes);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/prompts/:fileKey/deployment-history
 * Get deployment history for a prompt file
 */
export async function getDeploymentHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const history = promptService.getDeploymentHistory(fileKey, limit);
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// VERSION ROLLBACK ENDPOINTS (Phase 8)
// ============================================================================

/**
 * POST /api/test-monitor/prompts/:fileKey/rollback
 * Rollback to a previous version
 */
export async function rollbackPromptVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey } = req.params;
    const { targetVersion } = req.body;

    if (!targetVersion || typeof targetVersion !== 'number') {
      res.status(400).json({ success: false, error: 'targetVersion is required and must be a number' });
      return;
    }

    const result = promptService.rollbackToVersion(fileKey, targetVersion);
    res.json({
      success: true,
      data: {
        newVersion: result.newVersion,
        originalVersion: result.originalVersion,
        rolledBackTo: targetVersion,
        message: `Rolled back ${fileKey} from v${result.originalVersion} to v${targetVersion} (now v${result.newVersion})`,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/prompts/:fileKey/diff
 * Get diff between two versions
 */
export async function getPromptVersionDiff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileKey } = req.params;
    const version1 = parseInt(req.query.version1 as string);
    const version2 = parseInt(req.query.version2 as string);

    if (!version1 || !version2) {
      res.status(400).json({ success: false, error: 'version1 and version2 are required' });
      return;
    }

    const diff = promptService.getVersionDiff(fileKey, version1, version2);
    res.json({ success: true, data: diff });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// TEST EXECUTION ENDPOINTS
// ============================================================================

// Execution status tracking
interface WorkerStatus {
  workerId: number;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentTestId: string | null;
  currentTestName: string | null;
}

interface ExecutionProgress {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  skipped: number;
}

interface ExecutionState {
  process: any;
  status: 'running' | 'paused' | 'stopped' | 'completed';
  progress: ExecutionProgress;
  workers: Map<number, WorkerStatus>;
  connections: Set<Response>; // SSE connections for this execution
  concurrency: number;
}

// Track active test executions
const activeExecutions: Map<string, ExecutionState> = new Map();

/**
 * Send SSE event to all connections for an execution
 */
function emitExecutionEvent(runId: string, eventType: string, data: any): void {
  const execution = activeExecutions.get(runId);
  if (!execution) return;

  const eventData = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

  execution.connections.forEach((res) => {
    try {
      res.write(eventData);
    } catch (err) {
      // Connection closed, will be cleaned up
    }
  });
}

/**
 * GET /api/test-monitor/scenarios
 * List available test scenarios from test-agent
 * Note: Scenarios are defined in TypeScript at test-agent/src/tests/scenarios/
 */
export async function getScenarios(_req: Request, res: Response, _next: NextFunction): Promise<void> {
  // Scenario metadata extracted from test-agent/src/tests/scenarios/*.ts
  // This is hardcoded to avoid importing TypeScript modules from test-agent at runtime
  const scenarios = [
    // Happy Path scenarios (3)
    {
      id: 'HAPPY-001',
      name: 'New Patient Ortho Consult - Single Child',
      description: 'Complete new patient orthodontic consult booking for one child',
      category: 'happy-path',
      tags: ['booking', 'new-patient', 'single-child', 'priority-high'],
      stepCount: 15,
    },
    {
      id: 'HAPPY-002',
      name: 'New Patient Ortho Consult - Two Siblings',
      description: 'Book new patient orthodontic consult for two children (siblings)',
      category: 'happy-path',
      tags: ['booking', 'new-patient', 'siblings', 'multiple-children'],
      stepCount: 12,
    },
    {
      id: 'HAPPY-003',
      name: 'Quick Info Provider - All Details Upfront',
      description: 'Parent provides extensive information upfront',
      category: 'happy-path',
      tags: ['booking', 'quick-path', 'efficient'],
      stepCount: 6,
    },
    // Edge Case scenarios (5)
    {
      id: 'EDGE-001',
      name: 'Existing Patient - Transfer to Specialist',
      description: 'Existing patient should be transferred to live agent (not new patient consult)',
      category: 'edge-case',
      tags: ['existing-patient', 'transfer'],
      stepCount: 6,
    },
    {
      id: 'EDGE-002',
      name: 'Multiple Children - Three Siblings',
      description: 'Handle booking for three siblings in same call',
      category: 'edge-case',
      tags: ['siblings', 'multiple-children'],
      stepCount: 7,
    },
    {
      id: 'EDGE-003',
      name: 'User Changes Mind Mid-Flow',
      description: 'User wants to change number of children mid-conversation',
      category: 'edge-case',
      tags: ['flow-change', 'user-correction'],
      stepCount: 5,
    },
    {
      id: 'EDGE-004',
      name: 'Previous Orthodontic Treatment',
      description: 'Child has had previous orthodontic treatment elsewhere',
      category: 'edge-case',
      tags: ['previous-treatment', 'ortho-history'],
      stepCount: 7,
    },
    {
      id: 'EDGE-005',
      name: 'Not Orthodontic - General Dentistry',
      description: 'Caller asks about general dentistry instead of orthodontics',
      category: 'edge-case',
      tags: ['wrong-intent', 'general-dentistry'],
      stepCount: 2,
    },
    // Error Handling scenarios (6)
    {
      id: 'ERR-001',
      name: 'Gibberish Input Recovery',
      description: 'Handle completely nonsensical user input and recover',
      category: 'error-handling',
      tags: ['input-validation', 'gibberish'],
      stepCount: 2,
    },
    {
      id: 'ERR-002',
      name: 'Empty or Whitespace Input',
      description: 'Handle empty or whitespace-only messages',
      category: 'error-handling',
      tags: ['input-validation', 'empty'],
      stepCount: 2,
    },
    {
      id: 'ERR-003',
      name: 'Very Long Input',
      description: 'Handle extremely long user messages',
      category: 'error-handling',
      tags: ['input-validation', 'length'],
      stepCount: 1,
    },
    {
      id: 'ERR-004',
      name: 'Cancel Mid-Conversation',
      description: 'User wants to cancel/abandon booking process',
      category: 'error-handling',
      tags: ['cancellation', 'flow-control'],
      stepCount: 4,
    },
    {
      id: 'ERR-005',
      name: 'Special Characters in Name',
      description: 'Handle special characters in parent/child names',
      category: 'error-handling',
      tags: ['input-validation', 'special-chars'],
      stepCount: 3,
    },
    {
      id: 'ERR-006',
      name: 'Unclear Number of Children',
      description: 'Handle vague or unclear response about number of children',
      category: 'error-handling',
      tags: ['clarification', 'ambiguous-input'],
      stepCount: 5,
    },
  ];

  res.json({ success: true, scenarios });
}

/**
 * Parse test-agent stdout for progress updates
 * Supports both parallel mode ([Worker X]) and sequential goal test mode ([GoalTest])
 */
function parseTestAgentOutput(runId: string, line: string): void {
  const execution = activeExecutions.get(runId);
  if (!execution) return;

  // ============================================================================
  // PARALLEL MODE PATTERNS: [Worker X] ...
  // ============================================================================

  // Pattern: [Worker X] Starting: TEST-ID - Test Name
  const startMatch = line.match(/\[Worker (\d+)\] Starting: (\S+) - (.+)/);
  if (startMatch) {
    const workerId = parseInt(startMatch[1], 10);
    const testId = startMatch[2];
    const testName = startMatch[3];

    execution.workers.set(workerId, {
      workerId,
      status: 'running',
      currentTestId: testId,
      currentTestName: testName,
    });

    emitExecutionEvent(runId, 'worker-status', {
      workerId,
      status: 'running',
      currentTestId: testId,
      currentTestName: testName,
    });
    return;
  }

  // Pattern: [Worker X] ✓ Completed: TEST-ID (XXXms)
  const passMatch = line.match(/\[Worker (\d+)\] [✓✔] Completed: (\S+)/);
  if (passMatch) {
    const workerId = parseInt(passMatch[1], 10);
    execution.progress.completed++;
    execution.progress.passed++;

    execution.workers.set(workerId, {
      workerId,
      status: 'idle',
      currentTestId: null,
      currentTestName: null,
    });

    emitExecutionEvent(runId, 'progress-update', execution.progress);
    emitExecutionEvent(runId, 'worker-status', {
      workerId,
      status: 'idle',
      currentTestId: null,
      currentTestName: null,
    });
    return;
  }

  // Pattern: [Worker X] ✗ Completed: TEST-ID or [Worker X] ✗ Error: TEST-ID
  const failMatch = line.match(/\[Worker (\d+)\] [✗✘] (?:Completed|Error): (\S+)/);
  if (failMatch) {
    const workerId = parseInt(failMatch[1], 10);
    execution.progress.completed++;
    execution.progress.failed++;

    execution.workers.set(workerId, {
      workerId,
      status: 'idle',
      currentTestId: null,
      currentTestName: null,
    });

    emitExecutionEvent(runId, 'progress-update', execution.progress);
    emitExecutionEvent(runId, 'worker-status', {
      workerId,
      status: 'idle',
      currentTestId: null,
      currentTestName: null,
    });
    return;
  }

  // Pattern: [Worker X] Finished
  const finishMatch = line.match(/\[Worker (\d+)\] Finished/);
  if (finishMatch) {
    const workerId = parseInt(finishMatch[1], 10);
    execution.workers.set(workerId, {
      workerId,
      status: 'completed',
      currentTestId: null,
      currentTestName: null,
    });

    emitExecutionEvent(runId, 'worker-status', {
      workerId,
      status: 'completed',
      currentTestId: null,
      currentTestName: null,
    });
    return;
  }

  // ============================================================================
  // GOAL TEST SEQUENTIAL MODE PATTERNS: [GoalTest] ...
  // ============================================================================

  // Pattern: [GoalTest] Starting: TEST-ID - Test Name
  const goalStartMatch = line.match(/\[GoalTest\] Starting: (\S+) - (.+)/);
  if (goalStartMatch) {
    const testId = goalStartMatch[1];
    const testName = goalStartMatch[2];

    // Use worker 0 for sequential goal tests
    execution.workers.set(0, {
      workerId: 0,
      status: 'running',
      currentTestId: testId,
      currentTestName: testName,
    });

    emitExecutionEvent(runId, 'worker-status', {
      workerId: 0,
      status: 'running',
      currentTestId: testId,
      currentTestName: testName,
    });
    return;
  }

  // Pattern: [GoalTest] ✓ PASSED: TEST-ID (XXXms, Y turns)
  const goalPassMatch = line.match(/\[GoalTest\] [✓✔] PASSED: (\S+)/);
  if (goalPassMatch) {
    execution.progress.completed++;
    execution.progress.passed++;

    execution.workers.set(0, {
      workerId: 0,
      status: 'idle',
      currentTestId: null,
      currentTestName: null,
    });

    emitExecutionEvent(runId, 'progress-update', execution.progress);
    emitExecutionEvent(runId, 'worker-status', {
      workerId: 0,
      status: 'idle',
      currentTestId: null,
      currentTestName: null,
    });
    return;
  }

  // Pattern: [GoalTest] ✗ FAILED: TEST-ID or [GoalTest] ✗ ERROR: TEST-ID
  const goalFailMatch = line.match(/\[GoalTest\] [✗✘] (?:FAILED|ERROR): (\S+)/);
  if (goalFailMatch) {
    execution.progress.completed++;
    execution.progress.failed++;

    execution.workers.set(0, {
      workerId: 0,
      status: 'idle',
      currentTestId: null,
      currentTestName: null,
    });

    emitExecutionEvent(runId, 'progress-update', execution.progress);
    emitExecutionEvent(runId, 'worker-status', {
      workerId: 0,
      status: 'idle',
      currentTestId: null,
      currentTestName: null,
    });
    return;
  }

  // ============================================================================
  // TOTAL COUNT PATTERNS (both modes)
  // ============================================================================

  // Pattern: Found X test scenarios to run (parallel mode)
  // Pattern: Found X goal test(s) to run (goal test mode)
  const totalMatch = line.match(/Found (\d+) (?:test scenarios?|goal tests?) to run/);
  if (totalMatch) {
    execution.progress.total = parseInt(totalMatch[1], 10);
    emitExecutionEvent(runId, 'progress-update', execution.progress);
    return;
  }

  // ============================================================================
  // LEGACY SEQUENTIAL PATTERNS (non-goal tests)
  // ============================================================================

  // Pattern: ✓ TEST-ID: Test Name
  const seqPassMatch = line.match(/^[✓✔]\s+(\S+):/);
  if (seqPassMatch && execution.concurrency === 1) {
    execution.progress.completed++;
    execution.progress.passed++;
    emitExecutionEvent(runId, 'progress-update', execution.progress);
    return;
  }

  // Pattern: ✗ TEST-ID: Test Name
  const seqFailMatch = line.match(/^[✗✘]\s+(\S+):/);
  if (seqFailMatch && execution.concurrency === 1) {
    execution.progress.completed++;
    execution.progress.failed++;
    emitExecutionEvent(runId, 'progress-update', execution.progress);
    return;
  }
}

/**
 * POST /api/test-monitor/runs/start
 * Start a new test execution
 */
export async function startExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { categories, scenarios: scenarioIds, config } = req.body;

    if (!categories?.length && !scenarioIds?.length) {
      res.status(400).json({ success: false, error: 'At least one category or scenario must be specified' });
      return;
    }

    const testAgentDir = path.resolve(__dirname, '../../../test-agent');

    // Build command arguments
    const args = ['run', 'run', '--'];

    // Add scenario filter if specific scenarios are requested
    if (scenarioIds?.length) {
      args.push('--scenarios', scenarioIds.join(','));
      console.log(`[Execution] Running specific scenarios: ${scenarioIds.join(', ')}`);
    } else if (categories?.length) {
      // Only add category filter if no specific scenarios
      args.push('--category', categories[0]); // test-agent accepts one category at a time
    }

    // Add concurrency if specified
    const concurrency = Math.min(Math.max(config?.concurrency || 1, 1), 10);
    if (concurrency > 1) {
      args.push('--concurrency', String(concurrency));
      console.log(`[Execution] Parallel execution with ${concurrency} workers`);
    }

    console.log(`[Execution] Starting: npm ${args.join(' ')} in ${testAgentDir}`);

    const child = spawn('npm', args, {
      cwd: testAgentDir,
      shell: true,
      env: { ...process.env },
      detached: false,
    });

    // Generate a run ID
    const tempRunId = `run-${new Date().toISOString().split('T')[0]}-${Math.random().toString(16).slice(2, 10)}`;

    // Initialize execution state
    const executionState: ExecutionState = {
      process: child,
      status: 'running',
      progress: { total: 0, completed: 0, passed: 0, failed: 0, skipped: 0 },
      workers: new Map(),
      connections: new Set(),
      concurrency,
    };

    // Initialize workers
    for (let i = 0; i < concurrency; i++) {
      executionState.workers.set(i, {
        workerId: i,
        status: 'idle',
        currentTestId: null,
        currentTestName: null,
      });
    }

    activeExecutions.set(tempRunId, executionState);

    // Parse stdout for progress updates
    child.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Execution] ${output.trim()}`);

      // Parse each line for progress info
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          parseTestAgentOutput(tempRunId, line.trim());
        }
      }
    });

    child.stderr.on('data', (data) => {
      console.error(`[Execution Error] ${data.toString().trim()}`);
    });

    child.on('close', (code) => {
      console.log(`[Execution] Process exited with code ${code}`);

      const execution = activeExecutions.get(tempRunId);
      if (execution) {
        execution.status = 'completed';

        // Emit completion event
        emitExecutionEvent(tempRunId, 'execution-completed', {
          runId: tempRunId,
          status: code === 0 ? 'completed' : 'failed',
          progress: execution.progress,
        });

        // Close all SSE connections
        execution.connections.forEach((conn) => {
          try {
            conn.write(`event: complete\ndata: ${JSON.stringify({ status: 'completed' })}\n\n`);
            conn.end();
          } catch (err) {
            // Already closed
          }
        });

        // Keep execution in memory for a bit so clients can reconnect and get final state
        setTimeout(() => {
          activeExecutions.delete(tempRunId);
        }, 60000); // Keep for 1 minute after completion
      }
    });

    child.on('error', (err) => {
      console.error(`[Execution] Process error:`, err);

      const execution = activeExecutions.get(tempRunId);
      if (execution) {
        emitExecutionEvent(tempRunId, 'execution-error', { error: err.message });
      }

      activeExecutions.delete(tempRunId);
    });

    res.json({
      success: true,
      runId: tempRunId,
      status: 'started',
      message: 'Test execution started',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/execution/active
 * Get currently active execution (if any)
 */
export async function getActiveExecution(_req: Request, res: Response): Promise<void> {
  // Find any running execution
  for (const [runId, execution] of activeExecutions.entries()) {
    if (execution.status === 'running' || execution.status === 'paused') {
      const workers = Array.from(execution.workers.values());
      res.json({
        success: true,
        active: true,
        runId,
        status: execution.status,
        progress: execution.progress,
        workers,
        concurrency: execution.concurrency,
      });
      return;
    }
  }

  // No active execution
  res.json({
    success: true,
    active: false,
    runId: null,
  });
}

/**
 * GET /api/test-monitor/execution/:runId/stream
 * SSE endpoint for real-time execution status updates
 */
export async function streamExecution(req: Request, res: Response): Promise<void> {
  const { runId } = req.params;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const execution = activeExecutions.get(runId);

  if (!execution) {
    // No active execution, send error and close
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'No active execution found' })}\n\n`);
    res.end();
    return;
  }

  // Add this connection to the execution's connections
  execution.connections.add(res);

  // Send current state immediately
  res.write(`event: execution-started\ndata: ${JSON.stringify({
    runId,
    status: execution.status,
    concurrency: execution.concurrency,
  })}\n\n`);

  // Send current progress
  res.write(`event: progress-update\ndata: ${JSON.stringify(execution.progress)}\n\n`);

  // Send current worker statuses
  const workers = Array.from(execution.workers.values());
  res.write(`event: workers-update\ndata: ${JSON.stringify(workers)}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    execution.connections.delete(res);
    console.log(`[Execution SSE] Client disconnected from ${runId}`);
  });
}

/**
 * POST /api/test-monitor/runs/:runId/stop
 * Stop a running test execution
 */
export async function stopExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { runId } = req.params;

    const execution = activeExecutions.get(runId);
    if (!execution) {
      res.status(404).json({ success: false, error: 'No active execution found for this run' });
      return;
    }

    // Kill the process
    if (execution.process && !execution.process.killed) {
      execution.process.kill('SIGTERM');
    }

    execution.status = 'stopped';

    // Emit stop event to connected clients
    emitExecutionEvent(runId, 'execution-stopped', { runId, status: 'stopped' });

    // Close all SSE connections
    execution.connections.forEach((conn) => {
      try {
        conn.write(`event: complete\ndata: ${JSON.stringify({ status: 'stopped' })}\n\n`);
        conn.end();
      } catch (err) {
        // Already closed
      }
    });

    activeExecutions.delete(runId);

    res.json({ success: true, message: 'Execution stopped' });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/runs/:runId/pause
 * Pause a running test execution (sends SIGSTOP)
 */
export async function pauseExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { runId } = req.params;

    const execution = activeExecutions.get(runId);
    if (!execution) {
      res.status(404).json({ success: false, error: 'No active execution found for this run' });
      return;
    }

    if (execution.status !== 'running') {
      res.status(400).json({ success: false, error: 'Execution is not running' });
      return;
    }

    // Note: SIGSTOP may not work on Windows - this is a best-effort implementation
    if (execution.process && !execution.process.killed) {
      try {
        execution.process.kill('SIGSTOP');
        execution.status = 'paused';
      } catch (e) {
        console.warn('[Execution] SIGSTOP not supported on this platform');
      }
    }

    res.json({ success: true, message: 'Execution paused' });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/runs/:runId/resume
 * Resume a paused test execution (sends SIGCONT)
 */
export async function resumeExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { runId } = req.params;

    const execution = activeExecutions.get(runId);
    if (!execution) {
      res.status(404).json({ success: false, error: 'No active execution found for this run' });
      return;
    }

    if (execution.status !== 'paused') {
      res.status(400).json({ success: false, error: 'Execution is not paused' });
      return;
    }

    // Note: SIGCONT may not work on Windows - this is a best-effort implementation
    if (execution.process && !execution.process.killed) {
      try {
        execution.process.kill('SIGCONT');
        execution.status = 'running';
      } catch (e) {
        console.warn('[Execution] SIGCONT not supported on this platform');
      }
    }

    res.json({ success: true, message: 'Execution resumed' });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// DIAGNOSIS / AGENT TUNING ENDPOINTS
// ============================================================================

/**
 * POST /api/test-monitor/runs/:runId/diagnose
 * Run failure analysis on a test run and generate fixes
 */
export async function runDiagnosis(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { runId } = req.params;
  const { useLLM = true } = req.body;

  try {
    // Verify run exists
    const db = getTestAgentDbWritable();
    const runRow = db.prepare(`
      SELECT run_id, status, failed FROM test_runs WHERE run_id = ?
    `).get(runId) as any;
    db.close();

    if (!runRow) {
      res.status(404).json({ success: false, error: 'Test run not found' });
      return;
    }

    if (runRow.failed === 0) {
      res.json({
        success: true,
        message: 'No failures to analyze',
        fixesGenerated: 0,
      });
      return;
    }

    // Run the test-agent analyze command
    const testAgentDir = path.resolve(__dirname, '../../../test-agent');
    const args = ['run', 'analyze', runId];
    if (!useLLM) {
      args.push('--', '--no-llm');
    }

    console.log(`[Diagnosis] Running: npm ${args.join(' ')} in ${testAgentDir}`);

    // Timeout for the entire diagnosis process (15 minutes for LLM analysis of multiple failures)
    // Each LLM analysis via CLI takes ~30-90 seconds, so 12 failures need ~15 minutes
    const DIAGNOSIS_TIMEOUT_MS = 15 * 60 * 1000;

    const result = await new Promise<{
      success: boolean;
      fixesGenerated?: number;
      analyzedCount?: number;
      totalFailures?: number;
      summary?: any;
      error?: string;
      output?: string;
    }>((resolve) => {
      const child = spawn('npm', args, {
        cwd: testAgentDir,
        shell: true,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Set overall timeout for the child process
      const timeoutId = setTimeout(() => {
        timedOut = true;
        console.error(`[Diagnosis] Timeout after ${DIAGNOSIS_TIMEOUT_MS}ms - killing process`);
        child.kill('SIGTERM');
        // Force kill after 5 seconds if SIGTERM doesn't work
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, DIAGNOSIS_TIMEOUT_MS);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[Diagnosis] ${data.toString().trim()}`);
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`[Diagnosis Error] ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);

        if (timedOut) {
          resolve({
            success: false,
            error: `Diagnosis timed out after ${DIAGNOSIS_TIMEOUT_MS / 1000} seconds. Try running with --no-llm for faster rule-based analysis.`,
            output: stdout,
          });
          return;
        }

        // Parse the JSON result from the output
        const jsonMatch = stdout.match(/__RESULT_JSON__\s*\n([\s\S]*?)$/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1].trim());
            resolve(parsed);
            return;
          } catch (e) {
            console.error('[Diagnosis] Failed to parse JSON result:', e);
          }
        }

        // Fallback if no JSON found
        if (code === 0) {
          resolve({
            success: true,
            output: stdout,
            fixesGenerated: 0,
          });
        } else {
          resolve({
            success: false,
            error: stderr || `Process exited with code ${code}`,
            output: stdout,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: err.message,
        });
      });
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Analysis complete. Generated ${result.fixesGenerated || 0} fix(es).`,
        fixesGenerated: result.fixesGenerated || 0,
        analyzedCount: result.analyzedCount,
        totalFailures: result.totalFailures,
        summary: result.summary,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Diagnosis failed',
      });
    }
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// TEST CASE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/test-monitor/test-cases
 * List all test cases with optional filtering
 */
export async function getTestCases(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = req.query.category as string | undefined;
    const includeArchived = req.query.includeArchived === 'true';

    const testCases = testCaseService.getTestCases({ category, includeArchived });
    const stats = testCaseService.getTestCaseStats();
    const tags = testCaseService.getAllTags();

    res.json({
      success: true,
      data: {
        testCases,
        stats,
        tags,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/test-cases/:caseId
 * Get a single test case by ID
 */
export async function getTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { caseId } = req.params;

    const testCase = testCaseService.getTestCase(caseId);

    if (!testCase) {
      res.status(404).json({ success: false, error: 'Test case not found' });
      return;
    }

    res.json({ success: true, data: testCase });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/test-cases
 * Create a new test case
 */
export async function createTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { caseId, name, description, category, tags, steps, expectations } = req.body;

    // Validate required fields
    if (!category || !['happy-path', 'edge-case', 'error-handling'].includes(category)) {
      res.status(400).json({ success: false, error: 'Invalid category' });
      return;
    }

    // Generate case ID if not provided
    const finalCaseId = caseId || testCaseService.generateNextCaseId(category);

    // Check if case ID already exists
    if (testCaseService.testCaseExists(finalCaseId)) {
      res.status(409).json({ success: false, error: `Test case ${finalCaseId} already exists` });
      return;
    }

    // Validate the test case
    const validationErrors = testCaseService.validateTestCase({
      caseId: finalCaseId,
      name,
      description,
      category,
      tags: tags || [],
      steps: steps || [],
      expectations: expectations || [],
      isArchived: false,
    });

    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        validationErrors,
      });
      return;
    }

    const testCase = testCaseService.createTestCase({
      caseId: finalCaseId,
      name: name || 'Untitled Test Case',
      description: description || '',
      category,
      tags: tags || [],
      steps: steps || [],
      expectations: expectations || [],
      isArchived: false,
    });

    res.status(201).json({ success: true, data: testCase });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/test-monitor/test-cases/:caseId
 * Update an existing test case
 */
export async function updateTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { caseId } = req.params;
    const { name, description, category, tags, steps, expectations, isArchived } = req.body;

    // Check if test case exists
    if (!testCaseService.testCaseExists(caseId)) {
      res.status(404).json({ success: false, error: 'Test case not found' });
      return;
    }

    // Validate the updates
    const validationErrors = testCaseService.validateTestCase({
      caseId,
      name,
      description,
      category,
      tags,
      steps,
      expectations,
      isArchived,
    });

    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        validationErrors,
      });
      return;
    }

    const testCase = testCaseService.updateTestCase(caseId, {
      name,
      description,
      category,
      tags,
      steps,
      expectations,
      isArchived,
    });

    if (!testCase) {
      res.status(404).json({ success: false, error: 'Test case not found' });
      return;
    }

    res.json({ success: true, data: testCase });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/test-monitor/test-cases/:caseId
 * Archive a test case (soft delete)
 */
export async function deleteTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { caseId } = req.params;
    const permanent = req.query.permanent === 'true';

    let success: boolean;
    if (permanent) {
      success = testCaseService.deleteTestCase(caseId);
    } else {
      success = testCaseService.archiveTestCase(caseId);
    }

    if (!success) {
      res.status(404).json({ success: false, error: 'Test case not found' });
      return;
    }

    res.json({
      success: true,
      message: permanent ? 'Test case permanently deleted' : 'Test case archived',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/test-cases/:caseId/clone
 * Clone a test case with a new ID
 */
export async function cloneTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { caseId } = req.params;
    const { newCaseId } = req.body;

    // Get the source test case to determine category
    const sourceCase = testCaseService.getTestCase(caseId);
    if (!sourceCase) {
      res.status(404).json({ success: false, error: 'Source test case not found' });
      return;
    }

    // Generate new case ID if not provided
    const finalNewCaseId = newCaseId || testCaseService.generateNextCaseId(sourceCase.category);

    // Check if new case ID already exists
    if (testCaseService.testCaseExists(finalNewCaseId)) {
      res.status(409).json({ success: false, error: `Test case ${finalNewCaseId} already exists` });
      return;
    }

    const clonedCase = testCaseService.cloneTestCase(caseId, finalNewCaseId);

    if (!clonedCase) {
      res.status(404).json({ success: false, error: 'Failed to clone test case' });
      return;
    }

    res.status(201).json({ success: true, data: clonedCase });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/test-cases/validate
 * Validate a test case without saving
 */
export async function validateTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const testCase = req.body;

    const validationErrors = testCaseService.validateTestCase(testCase);

    res.json({
      success: true,
      valid: validationErrors.length === 0,
      errors: validationErrors,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/test-cases/sync
 * Sync test cases from database to TypeScript files
 */
export async function syncTestCases(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = testCaseService.syncToTypeScript();

    if (result.success) {
      res.json({
        success: true,
        message: 'Test cases synced to TypeScript files',
        filesWritten: result.filesWritten,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to sync test cases',
        errors: result.errors,
        filesWritten: result.filesWritten,
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/test-cases/presets
 * Get semantic expectation and negative expectation presets
 */
export async function getTestCasePresets(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({
      success: true,
      data: {
        semanticExpectations: testCaseService.SEMANTIC_EXPECTATION_PRESETS,
        negativeExpectations: testCaseService.NEGATIVE_EXPECTATION_PRESETS,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// GOAL-ORIENTED TEST CASE ENDPOINTS
// ============================================================================

/**
 * GET /api/test-monitor/goal-tests
 * List all goal-based test cases with optional filtering
 */
export async function getGoalTestCases(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = req.query.category as string | undefined;
    const includeArchived = req.query.includeArchived === 'true';

    const testCases = goalTestService.getGoalTestCases({ category, includeArchived });
    const stats = goalTestService.getGoalTestCaseStats();
    const tags = goalTestService.getAllTags();

    res.json({
      success: true,
      data: {
        testCases,
        stats,
        tags,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/goal-tests/:caseId
 * Get a single goal-based test case by ID
 */
export async function getGoalTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { caseId } = req.params;

    const testCase = goalTestService.getGoalTestCase(caseId);

    if (!testCase) {
      res.status(404).json({ success: false, error: 'Goal test case not found' });
      return;
    }

    res.json({ success: true, data: testCase });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/goal-tests
 * Create a new goal-based test case
 */
export async function createGoalTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      caseId, name, description, category, tags,
      persona, goals, constraints, responseConfig, initialMessage
    } = req.body;

    // Validate required fields
    if (!category || !['happy-path', 'edge-case', 'error-handling'].includes(category)) {
      res.status(400).json({ success: false, error: 'Invalid category' });
      return;
    }

    // Generate case ID if not provided
    const finalCaseId = caseId || goalTestService.generateNextCaseId(category);

    // Check if case ID already exists
    if (goalTestService.goalTestCaseExists(finalCaseId)) {
      res.status(409).json({ success: false, error: `Goal test case ${finalCaseId} already exists` });
      return;
    }

    // Validate the test case
    const validationErrors = goalTestService.validateGoalTestCase({
      caseId: finalCaseId,
      name,
      description,
      category,
      tags: tags || [],
      persona: persona || goalTestService.DEFAULT_PERSONA,
      goals: goals || [],
      constraints: constraints || [],
      responseConfig: responseConfig || goalTestService.DEFAULT_RESPONSE_CONFIG,
      initialMessage: initialMessage || '',
      isArchived: false,
    });

    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        validationErrors,
      });
      return;
    }

    const testCase = goalTestService.createGoalTestCase({
      caseId: finalCaseId,
      name: name || 'Untitled Goal Test Case',
      description: description || '',
      category,
      tags: tags || [],
      persona: persona || goalTestService.DEFAULT_PERSONA,
      goals: goals || [],
      constraints: constraints || [],
      responseConfig: responseConfig || goalTestService.DEFAULT_RESPONSE_CONFIG,
      initialMessage: initialMessage || 'Hi, I need to schedule an appointment',
      isArchived: false,
    });

    res.status(201).json({ success: true, data: testCase });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/test-monitor/goal-tests/:caseId
 * Update an existing goal-based test case
 */
export async function updateGoalTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { caseId } = req.params;
    const {
      name, description, category, tags,
      persona, goals, constraints, responseConfig, initialMessage, isArchived
    } = req.body;

    // Check if test case exists
    if (!goalTestService.goalTestCaseExists(caseId)) {
      res.status(404).json({ success: false, error: 'Goal test case not found' });
      return;
    }

    // Validate the updates
    const validationErrors = goalTestService.validateGoalTestCase({
      caseId,
      name,
      description,
      category,
      tags,
      persona,
      goals,
      constraints,
      responseConfig,
      initialMessage,
      isArchived,
    });

    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        validationErrors,
      });
      return;
    }

    const testCase = goalTestService.updateGoalTestCase(caseId, {
      name,
      description,
      category,
      tags,
      persona,
      goals,
      constraints,
      responseConfig,
      initialMessage,
      isArchived,
    });

    if (!testCase) {
      res.status(404).json({ success: false, error: 'Goal test case not found' });
      return;
    }

    res.json({ success: true, data: testCase });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/test-monitor/goal-tests/:caseId
 * Archive a goal-based test case (soft delete)
 */
export async function deleteGoalTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { caseId } = req.params;
    const permanent = req.query.permanent === 'true';

    let success: boolean;
    if (permanent) {
      success = goalTestService.deleteGoalTestCase(caseId);
    } else {
      success = goalTestService.archiveGoalTestCase(caseId);
    }

    if (!success) {
      res.status(404).json({ success: false, error: 'Goal test case not found' });
      return;
    }

    res.json({
      success: true,
      message: permanent ? 'Goal test case permanently deleted' : 'Goal test case archived',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/goal-tests/:caseId/clone
 * Clone a goal-based test case with a new ID
 */
export async function cloneGoalTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { caseId } = req.params;
    const { newCaseId } = req.body;

    // Get the source test case to determine category
    const sourceCase = goalTestService.getGoalTestCase(caseId);
    if (!sourceCase) {
      res.status(404).json({ success: false, error: 'Source goal test case not found' });
      return;
    }

    // Generate new case ID if not provided
    const finalNewCaseId = newCaseId || goalTestService.generateNextCaseId(sourceCase.category);

    // Check if new case ID already exists
    if (goalTestService.goalTestCaseExists(finalNewCaseId)) {
      res.status(409).json({ success: false, error: `Goal test case ${finalNewCaseId} already exists` });
      return;
    }

    const clonedCase = goalTestService.cloneGoalTestCase(caseId, finalNewCaseId);

    if (!clonedCase) {
      res.status(404).json({ success: false, error: 'Failed to clone goal test case' });
      return;
    }

    res.status(201).json({ success: true, data: clonedCase });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/goal-tests/validate
 * Validate a goal-based test case without saving
 */
export async function validateGoalTestCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const testCase = req.body;

    const validationErrors = goalTestService.validateGoalTestCase(testCase);

    res.json({
      success: true,
      valid: validationErrors.length === 0,
      errors: validationErrors,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/goal-tests/sync
 * Sync goal test cases from database to TypeScript files
 */
export async function syncGoalTestCases(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = goalTestService.syncToTypeScript();

    if (result.success) {
      res.json({
        success: true,
        message: 'Goal test cases synced to TypeScript files',
        filesWritten: result.filesWritten,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to sync goal test cases',
        errors: result.errors,
        filesWritten: result.filesWritten,
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/goal-tests/personas
 * Get available persona presets
 */
export async function getPersonaPresets(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({
      success: true,
      data: {
        personas: goalTestService.PERSONA_PRESETS,
        collectableFields: goalTestService.COLLECTABLE_FIELDS,
        goalTypes: goalTestService.GOAL_TYPES,
        constraintTypes: goalTestService.CONSTRAINT_TYPES,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// AI SUGGESTION ENDPOINTS
// ============================================================================

/**
 * POST /api/test-monitor/goal-tests/suggest
 * Generate AI-powered goal and constraint suggestions
 */
export async function suggestGoalTest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, category, description, personaTraits, tags, model } = req.body;

    // Validate required fields
    if (!name) {
      res.status(400).json({ success: false, error: 'name is required' });
      return;
    }

    if (!category || !['happy-path', 'edge-case', 'error-handling'].includes(category)) {
      res.status(400).json({ success: false, error: 'Valid category is required (happy-path, edge-case, error-handling)' });
      return;
    }

    // Check if service is available
    if (!goalSuggestionService.isAvailable()) {
      res.status(503).json({
        success: false,
        error: 'AI suggestion service not available. Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN environment variable.',
      });
      return;
    }

    // Generate suggestions
    const result = await goalSuggestionService.generateSuggestions({
      name,
      category,
      description,
      personaTraits,
      tags,
      model: model || 'standard',
    });

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to generate suggestions',
        metadata: result.metadata,
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/test-monitor/goal-tests/suggest/status
 * Check AI suggestion service availability
 */
export async function getSuggestionServiceStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const available = goalSuggestionService.isAvailable();

    res.json({
      success: true,
      data: {
        available,
        models: available ? ['fast', 'standard', 'detailed'] : [],
        message: available
          ? 'AI suggestion service is available'
          : 'AI suggestion service not available. Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/test-monitor/goal-tests/analyze
 * Analyze a natural language goal description and generate complete wizard form data
 */
export async function analyzeGoalDescription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { description, model } = req.body;

    // Validate required fields
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      res.status(400).json({
        success: false,
        error: 'Description must be at least 10 characters',
      });
      return;
    }

    // Analyze the description
    const result = await goalAnalysisService.analyzeGoalDescription({
      description: description.trim(),
      model: model || 'standard',
    });

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to analyze goal description',
        metadata: result.metadata,
      });
    }
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// A/B TESTING CONTROLLERS
// ============================================================================

/**
 * Get all A/B experiments
 */
export async function getABExperiments(req: Request, res: Response, next: NextFunction): Promise<void> {
  let db: BetterSqlite3.Database | null = null;
  try {
    db = getTestAgentDbWritable();

    const { status, limit = 50 } = req.query;

    let query = `
      SELECT experiment_id, name, description, hypothesis, status, experiment_type,
             variants_json, test_ids_json, traffic_split_json,
             min_sample_size, max_sample_size, significance_threshold,
             created_at, started_at, completed_at, winning_variant_id, conclusion
      FROM ab_experiments
    `;

    const params: any[] = [];
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Number(limit));

    const rows = db.prepare(query).all(...params) as any[];

    const experiments = rows.map(row => ({
      experimentId: row.experiment_id,
      name: row.name,
      description: row.description,
      hypothesis: row.hypothesis,
      status: row.status,
      experimentType: row.experiment_type,
      variants: row.variants_json ? JSON.parse(row.variants_json) : [],
      testIds: row.test_ids_json ? JSON.parse(row.test_ids_json) : [],
      trafficSplit: row.traffic_split_json ? JSON.parse(row.traffic_split_json) : {},
      minSampleSize: row.min_sample_size,
      maxSampleSize: row.max_sample_size,
      significanceThreshold: row.significance_threshold,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      winningVariantId: row.winning_variant_id,
      conclusion: row.conclusion,
    }));

    res.json({
      success: true,
      data: experiments,
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Get single A/B experiment with statistics
 */
export async function getABExperiment(req: Request, res: Response, next: NextFunction): Promise<void> {
  let db: BetterSqlite3.Database | null = null;
  try {
    db = getTestAgentDbWritable();
    const { experimentId } = req.params;

    // Get experiment
    const row = db.prepare(`
      SELECT experiment_id, name, description, hypothesis, status, experiment_type,
             variants_json, test_ids_json, traffic_split_json,
             min_sample_size, max_sample_size, significance_threshold,
             created_at, started_at, completed_at, winning_variant_id, conclusion
      FROM ab_experiments
      WHERE experiment_id = ?
    `).get(experimentId) as any;

    if (!row) {
      res.status(404).json({ success: false, error: 'Experiment not found' });
      return;
    }

    const experiment = {
      experimentId: row.experiment_id,
      name: row.name,
      description: row.description,
      hypothesis: row.hypothesis,
      status: row.status,
      experimentType: row.experiment_type,
      variants: row.variants_json ? JSON.parse(row.variants_json) : [],
      testIds: row.test_ids_json ? JSON.parse(row.test_ids_json) : [],
      trafficSplit: row.traffic_split_json ? JSON.parse(row.traffic_split_json) : {},
      minSampleSize: row.min_sample_size,
      maxSampleSize: row.max_sample_size,
      significanceThreshold: row.significance_threshold,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      winningVariantId: row.winning_variant_id,
      conclusion: row.conclusion,
    };

    // Get run counts per variant
    const runCounts = db.prepare(`
      SELECT variant_id, variant_role,
             COUNT(*) as total,
             SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed,
             AVG(turn_count) as avg_turns,
             AVG(duration_ms) as avg_duration,
             AVG(goal_completion_rate) as avg_goal_rate
      FROM ab_experiment_runs
      WHERE experiment_id = ?
      GROUP BY variant_id, variant_role
    `).all(experimentId) as any[];

    const variantStats = runCounts.map(rc => ({
      variantId: rc.variant_id,
      variantRole: rc.variant_role,
      totalRuns: rc.total,
      passedRuns: rc.passed,
      passRate: rc.total > 0 ? (rc.passed / rc.total) * 100 : 0,
      avgTurns: rc.avg_turns || 0,
      avgDurationMs: rc.avg_duration || 0,
      avgGoalCompletionRate: rc.avg_goal_rate || 0,
    }));

    // Calculate statistics
    const controlStats = variantStats.find(v => v.variantRole === 'control');
    const treatmentStats = variantStats.find(v => v.variantRole === 'treatment');

    let analysis: any = null;
    if (controlStats && treatmentStats && controlStats.totalRuns > 0 && treatmentStats.totalRuns > 0) {
      const controlPassRate = controlStats.passRate;
      const treatmentPassRate = treatmentStats.passRate;
      const lift = treatmentPassRate - controlPassRate;

      // Simple chi-square approximation for p-value
      const n1 = controlStats.totalRuns;
      const n2 = treatmentStats.totalRuns;
      const p1 = controlStats.passedRuns / n1;
      const p2 = treatmentStats.passedRuns / n2;
      const pooledP = (controlStats.passedRuns + treatmentStats.passedRuns) / (n1 + n2);
      const se = Math.sqrt(pooledP * (1 - pooledP) * (1/n1 + 1/n2));
      const z = se > 0 ? Math.abs(p1 - p2) / se : 0;

      // Two-tailed p-value approximation
      const pValue = z > 0 ? 2 * (1 - normalCDF(z)) : 1;

      analysis = {
        controlPassRate,
        treatmentPassRate,
        lift,
        liftPercent: controlPassRate > 0 ? (lift / controlPassRate) * 100 : 0,
        pValue,
        isSignificant: pValue < (experiment.significanceThreshold || 0.05),
        confidenceLevel: (1 - pValue) * 100,
        controlSamples: n1,
        treatmentSamples: n2,
        minSampleSize: experiment.minSampleSize,
        hasEnoughSamples: n1 >= experiment.minSampleSize && n2 >= experiment.minSampleSize,
      };
    }

    res.json({
      success: true,
      data: {
        experiment,
        variantStats,
        analysis,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Get runs for an experiment
 */
export async function getABExperimentRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
  let db: BetterSqlite3.Database | null = null;
  try {
    db = getTestAgentDbWritable();
    const { experimentId } = req.params;
    const { limit = 100 } = req.query;

    const rows = db.prepare(`
      SELECT id, experiment_id, run_id, test_id, variant_id, variant_role,
             started_at, completed_at, passed, turn_count, duration_ms,
             goal_completion_rate, constraint_violations, error_occurred, metrics_json
      FROM ab_experiment_runs
      WHERE experiment_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `).all(experimentId, Number(limit)) as any[];

    const runs = rows.map(row => ({
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
      metrics: row.metrics_json ? JSON.parse(row.metrics_json) : null,
    }));

    res.json({
      success: true,
      data: runs,
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Get all variants
 */
export async function getABVariants(req: Request, res: Response, next: NextFunction): Promise<void> {
  let db: BetterSqlite3.Database | null = null;
  try {
    db = getTestAgentDbWritable();
    const { variantType, isBaseline } = req.query;

    let query = `
      SELECT variant_id, variant_type, target_file, name, description,
             content_hash, baseline_variant_id, source_fix_id,
             is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
      WHERE 1=1
    `;

    const params: any[] = [];
    if (variantType) {
      query += ' AND variant_type = ?';
      params.push(variantType);
    }
    if (isBaseline !== undefined) {
      query += ' AND is_baseline = ?';
      params.push(isBaseline === 'true' ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];

    const variants = rows.map(row => ({
      variantId: row.variant_id,
      variantType: row.variant_type,
      targetFile: row.target_file,
      name: row.name,
      description: row.description,
      contentHash: row.content_hash,
      baselineVariantId: row.baseline_variant_id,
      sourceFixId: row.source_fix_id,
      isBaseline: row.is_baseline === 1,
      createdAt: row.created_at,
      createdBy: row.created_by,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    }));

    res.json({
      success: true,
      data: variants,
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Get A/B testing statistics summary
 */
export async function getABStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  let db: BetterSqlite3.Database | null = null;
  try {
    db = getTestAgentDbWritable();

    // Count experiments by status
    const experimentCounts = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM ab_experiments
      GROUP BY status
    `).all() as any[];

    // Count total variants
    const variantCount = db.prepare(`
      SELECT COUNT(*) as count FROM ab_variants
    `).get() as any;

    // Count total runs
    const runCount = db.prepare(`
      SELECT COUNT(*) as count FROM ab_experiment_runs
    `).get() as any;

    // Get recent experiments
    const recentExperiments = db.prepare(`
      SELECT experiment_id, name, status, created_at
      FROM ab_experiments
      ORDER BY created_at DESC
      LIMIT 5
    `).all() as any[];

    const statusCounts: Record<string, number> = {};
    experimentCounts.forEach(row => {
      statusCounts[row.status] = row.count;
    });

    res.json({
      success: true,
      data: {
        experiments: {
          total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
          byStatus: statusCounts,
        },
        variants: variantCount?.count || 0,
        runs: runCount?.count || 0,
        recentExperiments: recentExperiments.map(row => ({
          experimentId: row.experiment_id,
          name: row.name,
          status: row.status,
          createdAt: row.created_at,
        })),
      },
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Standard normal CDF approximation for p-value calculation
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// ============================================================================
// SANDBOX CONTROLLER FUNCTIONS
// ============================================================================

/**
 * Get all sandboxes
 */
export async function getSandboxes(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    db = getTestAgentDbWritable();

    // Initialize sandboxes if not exist
    const now = new Date().toISOString();
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

    const sandboxes = db.prepare(`
      SELECT id, sandbox_id, name, description, flowise_endpoint, flowise_api_key,
             langfuse_host, langfuse_public_key, langfuse_secret_key,
             is_active, created_at, updated_at
      FROM ab_sandboxes
      ORDER BY sandbox_id
    `).all() as any[];

    // Get file counts for each sandbox
    const sandboxesWithFiles = sandboxes.map(sandbox => {
      const files = db!.prepare(`
        SELECT file_key, version, updated_at
        FROM ab_sandbox_files
        WHERE sandbox_id = ?
      `).all(sandbox.sandbox_id) as any[];

      return {
        sandboxId: sandbox.sandbox_id,
        name: sandbox.name,
        description: sandbox.description,
        flowiseEndpoint: sandbox.flowise_endpoint,
        flowiseApiKey: sandbox.flowise_api_key,
        langfuseHost: sandbox.langfuse_host,
        langfusePublicKey: sandbox.langfuse_public_key,
        langfuseSecretKey: sandbox.langfuse_secret_key,
        isActive: sandbox.is_active === 1,
        createdAt: sandbox.created_at,
        updatedAt: sandbox.updated_at,
        fileCount: files.length,
        files: files.map(f => ({
          fileKey: f.file_key,
          version: f.version,
          updatedAt: f.updated_at,
        })),
      };
    });

    res.json({
      success: true,
      data: sandboxesWithFiles,
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Get a single sandbox with details
 */
export async function getSandbox(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { sandboxId } = req.params;
    db = getTestAgentDbWritable();

    const sandbox = db.prepare(`
      SELECT id, sandbox_id, name, description, flowise_endpoint, flowise_api_key,
             langfuse_host, langfuse_public_key, langfuse_secret_key,
             is_active, created_at, updated_at
      FROM ab_sandboxes
      WHERE sandbox_id = ?
    `).get(sandboxId) as any;

    if (!sandbox) {
      res.status(404).json({
        success: false,
        error: `Sandbox not found: ${sandboxId}`,
      });
      return;
    }

    const files = db.prepare(`
      SELECT id, sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at
      FROM ab_sandbox_files
      WHERE sandbox_id = ?
      ORDER BY file_key
    `).all(sandboxId) as any[];

    res.json({
      success: true,
      data: {
        sandboxId: sandbox.sandbox_id,
        name: sandbox.name,
        description: sandbox.description,
        flowiseEndpoint: sandbox.flowise_endpoint,
        flowiseApiKey: sandbox.flowise_api_key,
        langfuseHost: sandbox.langfuse_host,
        langfusePublicKey: sandbox.langfuse_public_key,
        langfuseSecretKey: sandbox.langfuse_secret_key,
        isActive: sandbox.is_active === 1,
        createdAt: sandbox.created_at,
        updatedAt: sandbox.updated_at,
        files: files.map(f => ({
          fileKey: f.file_key,
          fileType: f.file_type,
          displayName: f.display_name,
          version: f.version,
          baseVersion: f.base_version,
          changeDescription: f.change_description,
          createdAt: f.created_at,
          updatedAt: f.updated_at,
        })),
      },
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Update sandbox configuration
 */
export async function updateSandbox(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { sandboxId } = req.params;
    const { name, description, flowiseEndpoint, flowiseApiKey, langfuseHost, langfusePublicKey, langfuseSecretKey, isActive } = req.body;
    db = getTestAgentDbWritable();

    const now = new Date().toISOString();

    const setClauses: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (name !== undefined) {
      setClauses.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      setClauses.push('description = ?');
      params.push(description);
    }
    if (flowiseEndpoint !== undefined) {
      setClauses.push('flowise_endpoint = ?');
      params.push(flowiseEndpoint);
    }
    if (flowiseApiKey !== undefined) {
      setClauses.push('flowise_api_key = ?');
      params.push(flowiseApiKey);
    }
    if (langfuseHost !== undefined) {
      setClauses.push('langfuse_host = ?');
      params.push(langfuseHost);
    }
    if (langfusePublicKey !== undefined) {
      setClauses.push('langfuse_public_key = ?');
      params.push(langfusePublicKey);
    }
    if (langfuseSecretKey !== undefined) {
      setClauses.push('langfuse_secret_key = ?');
      params.push(langfuseSecretKey);
    }
    if (isActive !== undefined) {
      setClauses.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    params.push(sandboxId);

    const result = db.prepare(`
      UPDATE ab_sandboxes SET ${setClauses.join(', ')} WHERE sandbox_id = ?
    `).run(...params);

    if (result.changes === 0) {
      res.status(404).json({
        success: false,
        error: `Sandbox not found: ${sandboxId}`,
      });
      return;
    }

    // Fetch the updated sandbox to return
    const updatedSandbox = db.prepare(`
      SELECT id, sandbox_id, name, description, flowise_endpoint, flowise_api_key,
             langfuse_host, langfuse_public_key, langfuse_secret_key,
             is_active, created_at, updated_at
      FROM ab_sandboxes WHERE sandbox_id = ?
    `).get(sandboxId) as any;

    res.json({
      success: true,
      data: {
        sandboxId: updatedSandbox.sandbox_id,
        name: updatedSandbox.name,
        description: updatedSandbox.description,
        flowiseEndpoint: updatedSandbox.flowise_endpoint || '',
        flowiseApiKey: updatedSandbox.flowise_api_key || '',
        langfuseHost: updatedSandbox.langfuse_host || '',
        langfusePublicKey: updatedSandbox.langfuse_public_key || '',
        langfuseSecretKey: updatedSandbox.langfuse_secret_key || '',
        isActive: updatedSandbox.is_active === 1,
        createdAt: updatedSandbox.created_at,
        updatedAt: updatedSandbox.updated_at,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Test LangFuse connection with provided credentials
 */
export async function testLangfuseConnection(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const { host, publicKey, secretKey } = req.body;

    if (!host || !publicKey || !secretKey) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: host, publicKey, secretKey',
      });
      return;
    }

    // Normalize host URL (remove trailing slash)
    const normalizedHost = host.replace(/\/$/, '');

    // Create Basic Auth header (base64 encoded publicKey:secretKey)
    const authString = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    // Test connection by fetching traces with limit 1
    const startTime = Date.now();
    const response = await fetch(`${normalizedHost}/api/public/traces?limit=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
    });

    const responseTimeMs = Date.now() - startTime;

    if (response.ok) {
      res.json({
        success: true,
        data: {
          success: true,
          message: 'LangFuse connection successful',
          responseTimeMs,
        },
      });
    } else {
      const errorText = await response.text();
      res.json({
        success: true,
        data: {
          success: false,
          message: `LangFuse returned ${response.status}: ${errorText.substring(0, 200)}`,
          responseTimeMs,
        },
      });
    }
  } catch (error: any) {
    res.json({
      success: true,
      data: {
        success: false,
        message: `Connection failed: ${error.message}`,
      },
    });
  }
}

/**
 * Get all files for a sandbox
 */
export async function getSandboxFiles(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { sandboxId } = req.params;
    db = getTestAgentDbWritable();

    const files = db.prepare(`
      SELECT id, sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at
      FROM ab_sandbox_files
      WHERE sandbox_id = ?
      ORDER BY file_key
    `).all(sandboxId) as any[];

    res.json({
      success: true,
      data: files.map(f => ({
        fileKey: f.file_key,
        fileType: f.file_type,
        displayName: f.display_name,
        content: f.content,
        version: f.version,
        baseVersion: f.base_version,
        changeDescription: f.change_description,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Get a specific sandbox file
 */
export async function getSandboxFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { sandboxId, fileKey } = req.params;
    db = getTestAgentDbWritable();

    const file = db.prepare(`
      SELECT id, sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at
      FROM ab_sandbox_files
      WHERE sandbox_id = ? AND file_key = ?
    `).get(sandboxId, fileKey) as any;

    if (!file) {
      res.status(404).json({
        success: false,
        error: `File not found: ${fileKey} in sandbox ${sandboxId}`,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        fileKey: file.file_key,
        fileType: file.file_type,
        displayName: file.display_name,
        content: file.content,
        version: file.version,
        baseVersion: file.base_version,
        changeDescription: file.change_description,
        createdAt: file.created_at,
        updatedAt: file.updated_at,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Get sandbox file version history
 */
export async function getSandboxFileHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { sandboxId, fileKey } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    db = getTestAgentDbWritable();

    const history = db.prepare(`
      SELECT id, sandbox_id, file_key, version, content, change_description, created_at
      FROM ab_sandbox_file_history
      WHERE sandbox_id = ? AND file_key = ?
      ORDER BY version DESC
      LIMIT ?
    `).all(sandboxId, fileKey, limit) as any[];

    res.json({
      success: true,
      data: history.map(h => ({
        version: h.version,
        changeDescription: h.change_description,
        createdAt: h.created_at,
      })),
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Save sandbox file (create new version)
 */
export async function saveSandboxFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { sandboxId, fileKey } = req.params;
    const { content, changeDescription } = req.body;

    if (!content) {
      res.status(400).json({
        success: false,
        error: 'Content is required',
      });
      return;
    }

    db = getTestAgentDbWritable();
    const now = new Date().toISOString();

    // Check if file exists
    const existing = db.prepare(`
      SELECT id, version, content, change_description
      FROM ab_sandbox_files
      WHERE sandbox_id = ? AND file_key = ?
    `).get(sandboxId, fileKey) as any;

    let newVersion: number;

    if (existing) {
      // Save current version to history
      db.prepare(`
        INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sandboxId, fileKey, existing.version, existing.content, existing.change_description, now);

      // Update with new content
      newVersion = existing.version + 1;
      db.prepare(`
        UPDATE ab_sandbox_files
        SET content = ?, version = ?, change_description = ?, updated_at = ?
        WHERE sandbox_id = ? AND file_key = ?
      `).run(content, newVersion, changeDescription || null, now, sandboxId, fileKey);
    } else {
      // Insert new file
      newVersion = 1;

      // Determine file type and display name
      const fileConfig: Record<string, { displayName: string; fileType: string }> = {
        system_prompt: { displayName: 'System Prompt', fileType: 'markdown' },
        patient_tool: { displayName: 'Patient Tool', fileType: 'json' },
        scheduling_tool: { displayName: 'Scheduling Tool', fileType: 'json' },
      };

      const config = fileConfig[fileKey] || { displayName: fileKey, fileType: 'text' };

      db.prepare(`
        INSERT INTO ab_sandbox_files (sandbox_id, file_key, file_type, display_name, content, version, change_description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sandboxId, fileKey, config.fileType, config.displayName, content, newVersion, changeDescription || null, now, now);
    }

    res.json({
      success: true,
      data: {
        newVersion,
        message: `File ${fileKey} saved as version ${newVersion}`,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Copy file from production to sandbox
 */
export async function copySandboxFileFromProduction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { sandboxId, fileKey } = req.params;
    db = getTestAgentDbWritable();

    // Get production content
    const production = db.prepare(`
      SELECT content, version FROM prompt_working_copies WHERE file_key = ?
    `).get(fileKey) as any;

    if (!production) {
      res.status(404).json({
        success: false,
        error: `Production file not found: ${fileKey}`,
      });
      return;
    }

    const now = new Date().toISOString();

    // Check if sandbox file exists
    const existing = db.prepare(`
      SELECT id, version, content, change_description
      FROM ab_sandbox_files
      WHERE sandbox_id = ? AND file_key = ?
    `).get(sandboxId, fileKey) as any;

    let newVersion: number;

    if (existing) {
      // Save current version to history
      db.prepare(`
        INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sandboxId, fileKey, existing.version, existing.content, existing.change_description, now);

      newVersion = existing.version + 1;
      db.prepare(`
        UPDATE ab_sandbox_files
        SET content = ?, version = ?, base_version = ?, change_description = ?, updated_at = ?
        WHERE sandbox_id = ? AND file_key = ?
      `).run(production.content, newVersion, production.version, `Copied from production v${production.version}`, now, sandboxId, fileKey);
    } else {
      newVersion = 1;

      const fileConfig: Record<string, { displayName: string; fileType: string }> = {
        system_prompt: { displayName: 'System Prompt', fileType: 'markdown' },
        patient_tool: { displayName: 'Patient Tool', fileType: 'json' },
        scheduling_tool: { displayName: 'Scheduling Tool', fileType: 'json' },
      };

      const config = fileConfig[fileKey] || { displayName: fileKey, fileType: 'text' };

      db.prepare(`
        INSERT INTO ab_sandbox_files (sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sandboxId, fileKey, config.fileType, config.displayName, production.content, newVersion, production.version, `Copied from production v${production.version}`, now, now);
    }

    // Fetch the newly created/updated file to return full data
    const file = db.prepare(`
      SELECT id, sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at
      FROM ab_sandbox_files
      WHERE sandbox_id = ? AND file_key = ?
    `).get(sandboxId, fileKey) as any;

    res.json({
      success: true,
      data: {
        file: {
          fileKey: file.file_key,
          fileType: file.file_type,
          displayName: file.display_name,
          content: file.content,
          version: file.version,
          baseVersion: file.base_version,
          changeDescription: file.change_description,
          createdAt: file.created_at,
          updatedAt: file.updated_at,
        },
        message: `Copied ${fileKey} from production v${production.version}`,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Rollback sandbox file to a previous version
 */
export async function rollbackSandboxFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { sandboxId, fileKey } = req.params;
    const { version } = req.body;

    if (typeof version !== 'number') {
      res.status(400).json({
        success: false,
        error: 'Version number is required',
      });
      return;
    }

    db = getTestAgentDbWritable();
    const now = new Date().toISOString();

    // Get the version from history
    const historyRow = db.prepare(`
      SELECT content, change_description FROM ab_sandbox_file_history
      WHERE sandbox_id = ? AND file_key = ? AND version = ?
    `).get(sandboxId, fileKey, version) as any;

    if (!historyRow) {
      res.status(404).json({
        success: false,
        error: `Version ${version} not found in history for ${fileKey}`,
      });
      return;
    }

    // Get current file
    const current = db.prepare(`
      SELECT id, version, content, change_description
      FROM ab_sandbox_files
      WHERE sandbox_id = ? AND file_key = ?
    `).get(sandboxId, fileKey) as any;

    if (!current) {
      res.status(404).json({
        success: false,
        error: `File ${fileKey} not found in sandbox ${sandboxId}`,
      });
      return;
    }

    // Save current to history
    db.prepare(`
      INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sandboxId, fileKey, current.version, current.content, current.change_description, now);

    // Update with rolled back content
    const newVersion = current.version + 1;
    db.prepare(`
      UPDATE ab_sandbox_files
      SET content = ?, version = ?, change_description = ?, updated_at = ?
      WHERE sandbox_id = ? AND file_key = ?
    `).run(historyRow.content, newVersion, `Rolled back to version ${version}`, now, sandboxId, fileKey);

    res.json({
      success: true,
      data: {
        newVersion,
        rolledBackToVersion: version,
        message: `Rolled back ${fileKey} to version ${version}`,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Reset sandbox to production state
 */
export async function resetSandbox(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { sandboxId } = req.params;
    db = getTestAgentDbWritable();

    // Clear all sandbox files and history
    db.prepare('DELETE FROM ab_sandbox_file_history WHERE sandbox_id = ?').run(sandboxId);
    db.prepare('DELETE FROM ab_sandbox_files WHERE sandbox_id = ?').run(sandboxId);

    res.json({
      success: true,
      message: `Sandbox ${sandboxId} reset to empty state. Use copy-all to populate from production.`,
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Copy all files from production to sandbox
 */
export async function copySandboxAllFromProduction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { sandboxId } = req.params;
    db = getTestAgentDbWritable();

    const fileKeys = ['system_prompt', 'patient_tool', 'scheduling_tool'];
    const results: any[] = [];
    const now = new Date().toISOString();

    for (const fileKey of fileKeys) {
      // Get production content
      const production = db.prepare(`
        SELECT content, version FROM prompt_working_copies WHERE file_key = ?
      `).get(fileKey) as any;

      if (!production) {
        results.push({ fileKey, success: false, error: 'Production file not found' });
        continue;
      }

      // Check if sandbox file exists
      const existing = db.prepare(`
        SELECT id, version, content, change_description
        FROM ab_sandbox_files
        WHERE sandbox_id = ? AND file_key = ?
      `).get(sandboxId, fileKey) as any;

      let newVersion: number;

      if (existing) {
        // Save current version to history
        db.prepare(`
          INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(sandboxId, fileKey, existing.version, existing.content, existing.change_description, now);

        newVersion = existing.version + 1;
        db.prepare(`
          UPDATE ab_sandbox_files
          SET content = ?, version = ?, base_version = ?, change_description = ?, updated_at = ?
          WHERE sandbox_id = ? AND file_key = ?
        `).run(production.content, newVersion, production.version, `Copied from production v${production.version}`, now, sandboxId, fileKey);
      } else {
        newVersion = 1;

        const fileConfig: Record<string, { displayName: string; fileType: string }> = {
          system_prompt: { displayName: 'System Prompt', fileType: 'markdown' },
          patient_tool: { displayName: 'Patient Tool', fileType: 'json' },
          scheduling_tool: { displayName: 'Scheduling Tool', fileType: 'json' },
        };

        const config = fileConfig[fileKey] || { displayName: fileKey, fileType: 'text' };

        db.prepare(`
          INSERT INTO ab_sandbox_files (sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sandboxId, fileKey, config.fileType, config.displayName, production.content, newVersion, production.version, `Copied from production v${production.version}`, now, now);
      }

      results.push({
        fileKey,
        success: true,
        newVersion,
        baseVersion: production.version,
      });
    }

    res.json({
      success: true,
      data: {
        results,
        message: `Copied ${results.filter(r => r.success).length} files from production`,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Get available tests for comparison
 */
export async function getComparisonTests(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    db = getTestAgentDbWritable();

    // Get tests from goal_test_cases table
    const dbTests = db.prepare(`
      SELECT case_id, name, category, description
      FROM goal_test_cases
      WHERE is_archived = 0
      ORDER BY case_id
    `).all() as any[];

    // Also include built-in tests
    const builtInTests = [
      { caseId: 'GOAL-HAPPY-001', name: 'Happy Path - Simple Booking', category: 'happy-path' },
      { caseId: 'GOAL-HAPPY-002', name: 'Happy Path - Booking with Child', category: 'happy-path' },
      { caseId: 'GOAL-HAPPY-003', name: 'Happy Path - Cancel Appointment', category: 'happy-path' },
    ];

    const allTests = [
      ...builtInTests.map(t => ({
        id: t.caseId,
        name: t.name,
        category: t.category,
        source: 'built-in',
      })),
      ...dbTests.map(t => ({
        id: t.case_id,
        name: t.name,
        category: t.category,
        source: 'database',
      })),
    ];

    res.json({
      success: true,
      data: allTests,
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Start a comparison run (async - returns immediately, runs in background)
 */
export async function startComparison(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { testIds, runProduction, runSandboxA, runSandboxB, name } = req.body;

    if (!testIds || !Array.isArray(testIds) || testIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'testIds array is required',
      });
      return;
    }

    // Start the comparison asynchronously using the new method
    // This returns immediately with a comparisonId, and runs tests in the background
    const { comparisonId } = await comparisonService.startComparisonAsync({
      testIds,
      runProduction: runProduction !== false, // Default to true
      runSandboxA: runSandboxA !== false,     // Default to true
      runSandboxB: runSandboxB !== false,     // Default to true
      name,
    });

    // Return immediately with the comparison ID
    // Frontend should poll GET /comparison/:comparisonId for status updates
    res.json({
      success: true,
      data: {
        comparisonId,
        status: 'running',
        message: 'Comparison started. Poll GET /comparison/:comparisonId for updates.',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get comparison run results
 */
export async function getComparisonRun(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const { comparisonId } = req.params;
    db = getTestAgentDbWritable();

    const run = db.prepare(`
      SELECT id, comparison_id, name, status, test_ids_json, production_results_json, sandbox_a_results_json, sandbox_b_results_json, started_at, completed_at, summary_json, created_at
      FROM ab_sandbox_comparison_runs
      WHERE comparison_id = ?
    `).get(comparisonId) as any;

    if (!run) {
      res.status(404).json({
        success: false,
        error: `Comparison run not found: ${comparisonId}`,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        comparisonId: run.comparison_id,
        name: run.name,
        status: run.status,
        testIds: run.test_ids_json ? JSON.parse(run.test_ids_json) : [],
        productionResults: run.production_results_json ? JSON.parse(run.production_results_json) : null,
        sandboxAResults: run.sandbox_a_results_json ? JSON.parse(run.sandbox_a_results_json) : null,
        sandboxBResults: run.sandbox_b_results_json ? JSON.parse(run.sandbox_b_results_json) : null,
        summary: run.summary_json ? JSON.parse(run.summary_json) : null,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        createdAt: run.created_at,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

/**
 * Get comparison run history
 */
export async function getComparisonHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    const limit = parseInt(req.query.limit as string) || 20;
    db = getTestAgentDbWritable();

    const runs = db.prepare(`
      SELECT comparison_id, name, status, test_ids_json, started_at, completed_at, summary_json, created_at
      FROM ab_sandbox_comparison_runs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    res.json({
      success: true,
      data: runs.map(run => ({
        comparisonId: run.comparison_id,
        name: run.name,
        status: run.status,
        testCount: run.test_ids_json ? JSON.parse(run.test_ids_json).length : 0,
        summary: run.summary_json ? JSON.parse(run.summary_json) : null,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        createdAt: run.created_at,
      })),
    });
  } catch (error) {
    next(error);
  } finally {
    db?.close();
  }
}

// ============================================================================
// AI ENHANCEMENT ENDPOINTS
// ============================================================================

/**
 * Get enhancement templates
 */
export async function getEnhancementTemplates(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const templates = aiEnhancementService.getTemplates();
    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Preview an enhancement without saving
 */
export async function previewEnhancement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { fileKey } = req.params;
    const { command, templateId, useWebSearch, sourceVersion, context } = req.body;

    if (!command && !templateId) {
      res.status(400).json({
        success: false,
        error: 'Either command or templateId is required',
      });
      return;
    }

    const result = await aiEnhancementService.previewEnhancement({
      fileKey,
      command: command || '',
      templateId,
      useWebSearch: useWebSearch || false,
      sourceVersion,
      context: context || 'production',
    });

    res.json({
      success: result.status === 'success',
      data: result,
      error: result.errorMessage,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Enhance a prompt and save to database
 * If enhancementId is provided, saves an existing preview (fast - no LLM call)
 * Otherwise, runs a new enhancement from scratch
 */
export async function enhancePrompt(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { fileKey } = req.params;
    const { command, templateId, useWebSearch, sourceVersion, enhancementId, context } = req.body;
    const promptContext = (context as PromptContext) || 'production';

    // If enhancementId is provided, save the existing preview (no LLM call needed)
    if (enhancementId) {
      console.log(`[EnhancePrompt] Saving existing preview: ${enhancementId}`);
      const result = await aiEnhancementService.savePreviewedEnhancement(enhancementId);
      res.json({
        success: result.status === 'success',
        data: result,
        error: result.errorMessage,
      });
      return;
    }

    // Otherwise, run a new enhancement from scratch (slower - runs LLM)
    if (!command && !templateId) {
      res.status(400).json({
        success: false,
        error: 'Either command or templateId is required',
      });
      return;
    }

    console.log(`[EnhancePrompt] Running new enhancement for ${fileKey} (context: ${promptContext})`);
    const result = await aiEnhancementService.enhancePrompt({
      fileKey,
      command: command || '',
      templateId,
      useWebSearch: useWebSearch || false,
      sourceVersion,
      context: promptContext,
    });

    res.json({
      success: result.status === 'success',
      data: result,
      error: result.errorMessage,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get enhancement history for a file
 */
export async function getEnhancementHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { fileKey } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const context = (req.query.context as PromptContext) || 'production';

    const history = aiEnhancementService.getEnhancementHistory(fileKey, limit, context);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Apply an enhancement to create a new version
 */
export async function applyEnhancement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { fileKey, enhancementId } = req.params;
    const { description } = req.body;

    const result = await aiEnhancementService.applyEnhancement(
      fileKey,
      enhancementId,
      description // Optional custom description
    );

    res.json({
      success: result.success,
      data: result,
      error: result.error,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Promote an applied enhancement to production (main prompt files)
 */
export async function promoteToProduction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { fileKey, enhancementId } = req.params;
    const { description } = req.body;

    const result = await aiEnhancementService.promoteToProduction(
      fileKey,
      enhancementId,
      description // Optional custom description override
    );

    res.json({
      success: result.success,
      data: result,
      error: result.error,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Discard an enhancement
 */
export async function discardEnhancement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { enhancementId } = req.params;

    aiEnhancementService.discardEnhancement(enhancementId);

    res.json({
      success: true,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get quality score for a prompt
 * Uses caching to avoid re-analyzing the same version
 */
export async function getQualityScore(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { fileKey } = req.params;
    const version = req.query.version ? parseInt(req.query.version as string) : undefined;

    // Determine the actual version number to use for caching
    let actualVersion: number;
    let content: string;

    if (version) {
      const versionContent = promptService.getVersionContent(fileKey, version);
      if (!versionContent) {
        res.status(404).json({
          success: false,
          error: `Version ${version} not found for ${fileKey}`,
        });
        return;
      }
      content = versionContent;
      actualVersion = version;
    } else {
      const promptFile = promptService.getPromptContent(fileKey);
      if (!promptFile) {
        res.status(404).json({
          success: false,
          error: `Prompt file not found: ${fileKey}`,
        });
        return;
      }
      content = promptFile.content;
      actualVersion = promptFile.version;
    }

    // Check cache first
    const cachedScore = promptService.getCachedQualityScore(fileKey, actualVersion);
    if (cachedScore) {
      res.json({
        success: true,
        data: cachedScore,
        cached: true,
      });
      return;
    }

    // Not in cache - analyze with AI
    const score = await aiEnhancementService.scorePromptQuality(content, fileKey);

    // Save to cache
    promptService.saveQualityScoreToCache(fileKey, actualVersion, score);

    res.json({
      success: true,
      data: score,
      cached: false,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get enhancement by ID
 */
export async function getEnhancement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { enhancementId } = req.params;

    const enhancement = aiEnhancementService.getEnhancement(enhancementId);

    if (!enhancement) {
      res.status(404).json({
        success: false,
        error: 'Enhancement not found',
      });
      return;
    }

    res.json({
      success: true,
      data: enhancement,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// REFERENCE DOCUMENT ENDPOINTS
// ============================================================================

/**
 * Upload a reference document for a file type
 */
export async function uploadReferenceDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { fileKey } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    // Validate file key
    const validFileKeys = ['system_prompt', 'patient_tool', 'scheduling_tool'];
    if (!validFileKeys.includes(fileKey)) {
      res.status(400).json({
        success: false,
        error: `Invalid file key: ${fileKey}`,
      });
      return;
    }

    // Get MIME type (fallback to extension-based detection)
    let mimeType = file.mimetype;
    if (!documentParserService.isSupportedMimeType(mimeType)) {
      const detectedMime = documentParserService.getMimeTypeFromExtension(file.originalname);
      if (detectedMime) {
        mimeType = detectedMime;
      }
    }

    // Validate MIME type
    if (!documentParserService.isSupportedMimeType(mimeType)) {
      res.status(400).json({
        success: false,
        error: `Unsupported file type: ${mimeType}. Supported: .txt, .md, .pdf, .docx, .xlsx`,
      });
      return;
    }

    // Generate document ID and default label
    const documentId = uuidv4();
    const label = documentParserService.getDefaultLabelFromFilename(file.originalname);
    const now = new Date().toISOString();

    // Get next display order
    const db = getTestAgentDbWritable();
    const maxOrderRow = db.prepare(
      'SELECT MAX(display_order) as max_order FROM reference_documents WHERE file_key = ? AND is_active = 1'
    ).get(fileKey) as { max_order: number | null } | undefined;
    const displayOrder = (maxOrderRow?.max_order ?? -1) + 1;

    // Insert document record with pending status
    db.prepare(`
      INSERT INTO reference_documents (
        document_id, file_key, label, original_filename, mime_type, file_size,
        extraction_status, display_order, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 1, ?, ?)
    `).run(
      documentId, fileKey, label, file.originalname, mimeType, file.size,
      displayOrder, now, now
    );

    // Parse document asynchronously
    const parseResult = await documentParserService.parseDocument(
      file.buffer,
      mimeType,
      file.originalname
    );

    // Update with parse result
    if (parseResult.success) {
      db.prepare(`
        UPDATE reference_documents
        SET extracted_text = ?, extraction_status = 'success', updated_at = ?
        WHERE document_id = ?
      `).run(parseResult.text, new Date().toISOString(), documentId);
    } else {
      db.prepare(`
        UPDATE reference_documents
        SET extraction_status = 'failed', extraction_error = ?, updated_at = ?
        WHERE document_id = ?
      `).run(parseResult.error, new Date().toISOString(), documentId);
    }

    db.close();

    // Return document info
    res.status(201).json({
      success: true,
      data: {
        documentId,
        fileKey,
        label,
        originalFilename: file.originalname,
        mimeType,
        fileSize: file.size,
        extractionStatus: parseResult.success ? 'success' : 'failed',
        extractionError: parseResult.error,
        displayOrder,
        createdAt: now,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all reference documents for a file type
 */
export async function getReferenceDocuments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { fileKey } = req.params;

    const db = getTestAgentDb();

    const documents = db.prepare(`
      SELECT
        document_id as documentId,
        file_key as fileKey,
        label,
        original_filename as originalFilename,
        mime_type as mimeType,
        file_size as fileSize,
        extraction_status as extractionStatus,
        extraction_error as extractionError,
        display_order as displayOrder,
        is_enabled as isEnabled,
        created_at as createdAt,
        updated_at as updatedAt
      FROM reference_documents
      WHERE file_key = ? AND is_active = 1
      ORDER BY display_order ASC
    `).all(fileKey).map((doc: any) => ({
      ...doc,
      isEnabled: Boolean(doc.isEnabled), // Convert SQLite integer to boolean
    }));

    db.close();

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a reference document (label, display order, or isEnabled)
 */
export async function updateReferenceDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { documentId } = req.params;
    const { label, displayOrder, isEnabled } = req.body;

    const db = getTestAgentDbWritable();

    // Check if document exists
    const existing = db.prepare(
      'SELECT id FROM reference_documents WHERE document_id = ? AND is_active = 1'
    ).get(documentId);

    if (!existing) {
      db.close();
      res.status(404).json({
        success: false,
        error: 'Document not found',
      });
      return;
    }

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];

    if (label !== undefined) {
      updates.push('label = ?');
      params.push(label);
    }
    if (displayOrder !== undefined) {
      updates.push('display_order = ?');
      params.push(displayOrder);
    }
    if (isEnabled !== undefined) {
      updates.push('is_enabled = ?');
      params.push(isEnabled ? 1 : 0);
    }

    if (updates.length === 0) {
      db.close();
      res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
      return;
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(documentId);

    db.prepare(`
      UPDATE reference_documents
      SET ${updates.join(', ')}
      WHERE document_id = ?
    `).run(...params);

    // Get updated document
    const updated = db.prepare(`
      SELECT
        document_id as documentId,
        file_key as fileKey,
        label,
        original_filename as originalFilename,
        mime_type as mimeType,
        file_size as fileSize,
        extraction_status as extractionStatus,
        extraction_error as extractionError,
        display_order as displayOrder,
        created_at as createdAt,
        updated_at as updatedAt
      FROM reference_documents
      WHERE document_id = ?
    `).get(documentId);

    db.close();

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a reference document (soft delete)
 */
export async function deleteReferenceDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { documentId } = req.params;

    const db = getTestAgentDbWritable();

    // Check if document exists
    const existing = db.prepare(
      'SELECT id FROM reference_documents WHERE document_id = ? AND is_active = 1'
    ).get(documentId);

    if (!existing) {
      db.close();
      res.status(404).json({
        success: false,
        error: 'Document not found',
      });
      return;
    }

    // Soft delete
    db.prepare(`
      UPDATE reference_documents
      SET is_active = 0, updated_at = ?
      WHERE document_id = ?
    `).run(new Date().toISOString(), documentId);

    db.close();

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get reference documents with extracted text for enhancement integration
 * (Internal use - not exposed as API endpoint)
 */
export function getReferenceDocumentsWithText(fileKey: string): Array<{
  documentId: string;
  label: string;
  extractedText: string;
}> {
  const db = getTestAgentDb();

  const documents = db.prepare(`
    SELECT
      document_id as documentId,
      label,
      extracted_text as extractedText
    FROM reference_documents
    WHERE file_key = ? AND is_active = 1 AND extraction_status = 'success'
    ORDER BY display_order ASC
  `).all(fileKey) as Array<{
    documentId: string;
    label: string;
    extractedText: string;
  }>;

  db.close();

  return documents;
}

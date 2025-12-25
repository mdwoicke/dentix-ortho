/**
 * Test Monitor Controller
 * Provides access to test-agent database for monitoring Flowise test results
 */

import { Request, Response, NextFunction } from 'express';
import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { spawn } from 'child_process';
import * as promptService from '../services/promptService';

// Path to test-agent database
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

// Store active SSE connections by runId
const activeConnections: Map<string, Set<Response>> = new Map();

/**
 * Get database connection (read-only)
 */
function getTestAgentDb(): BetterSqlite3.Database {
  return new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });
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

    const db = getTestAgentDb();

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

    const db = getTestAgentDb();

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

    const db = getTestAgentDb();

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

    const db = getTestAgentDb();

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

    const db = getTestAgentDb();

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

    const db = getTestAgentDb();

    let query = `
      SELECT id, fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, root_cause_json, status, created_at
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

    const db = getTestAgentDb();

    const rows = db.prepare(`
      SELECT id, fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, root_cause_json, status, created_at
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
      const db = getTestAgentDb();
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
    const db = getTestAgentDb();
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
export async function getPromptFiles(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = promptService.getPromptFiles();
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
    const result = promptService.getPromptContent(fileKey);

    if (!result) {
      res.status(404).json({ success: false, error: 'Prompt file not found' });
      return;
    }

    res.json({ success: true, data: result });
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

    const history = promptService.getPromptHistory(fileKey, limit);
    res.json({ success: true, data: history });
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

// ============================================================================
// TEST EXECUTION ENDPOINTS
// ============================================================================

// Track active test executions
const activeExecutions: Map<string, { process: any; status: 'running' | 'paused' | 'stopped' }> = new Map();

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

    // Add category filter
    if (categories?.length) {
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

    // Generate a temporary run ID (the real one will come from test-agent)
    const tempRunId = `run-${new Date().toISOString().split('T')[0]}-${Math.random().toString(16).slice(2, 10)}`;

    activeExecutions.set(tempRunId, {
      process: child,
      status: 'running',
    });

    child.stdout.on('data', (data) => {
      console.log(`[Execution] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      console.error(`[Execution Error] ${data.toString().trim()}`);
    });

    child.on('close', (code) => {
      console.log(`[Execution] Process exited with code ${code}`);
      activeExecutions.delete(tempRunId);
    });

    child.on('error', (err) => {
      console.error(`[Execution] Process error:`, err);
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
    const db = getTestAgentDb();
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

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[Diagnosis] ${data.toString().trim()}`);
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`[Diagnosis Error] ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
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

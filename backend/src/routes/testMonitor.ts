import { Router } from 'express';
import * as testMonitorController from '../controllers/testMonitorController';

/**
 * Test Monitor Routes
 * /api/test-monitor/*
 *
 * Provides access to Flowise test results for the dashboard UI
 */

const router = Router();

// ============================================================================
// TEST EXECUTION ROUTES
// ============================================================================

// GET /api/test-monitor/scenarios - List available test scenarios
router.get('/scenarios', testMonitorController.getScenarios);

// POST /api/test-monitor/runs/start - Start test execution
router.post('/runs/start', testMonitorController.startExecution);

// POST /api/test-monitor/runs/:runId/stop - Stop execution
router.post('/runs/:runId/stop', testMonitorController.stopExecution);

// POST /api/test-monitor/runs/:runId/pause - Pause execution
router.post('/runs/:runId/pause', testMonitorController.pauseExecution);

// POST /api/test-monitor/runs/:runId/resume - Resume execution
router.post('/runs/:runId/resume', testMonitorController.resumeExecution);

// ============================================================================
// TEST RUNS ROUTES
// ============================================================================

// GET /api/test-monitor/runs - List all test runs
router.get('/runs', testMonitorController.getTestRuns);

// GET /api/test-monitor/runs/:runId/stream - SSE endpoint for real-time updates
// Must be defined before /runs/:runId to avoid conflicts
router.get('/runs/:runId/stream', testMonitorController.streamTestRun);

// GET /api/test-monitor/runs/:runId/fixes - Get fixes for a specific run
router.get('/runs/:runId/fixes', testMonitorController.getFixesForRun);

// POST /api/test-monitor/runs/:runId/diagnose - Run failure analysis and generate fixes
router.post('/runs/:runId/diagnose', testMonitorController.runDiagnosis);

// GET /api/test-monitor/runs/:runId - Get single test run with results
router.get('/runs/:runId', testMonitorController.getTestRun);

// GET /api/test-monitor/tests/:testId/transcript - Get conversation transcript
router.get('/tests/:testId/transcript', testMonitorController.getTranscript);

// GET /api/test-monitor/tests/:testId/api-calls - Get API calls for test
router.get('/tests/:testId/api-calls', testMonitorController.getApiCalls);

// GET /api/test-monitor/findings - List all findings
router.get('/findings', testMonitorController.getFindings);

// GET /api/test-monitor/recommendations - List all recommendations
router.get('/recommendations', testMonitorController.getRecommendations);

// GET /api/test-monitor/fixes - List all fixes with optional filters
router.get('/fixes', testMonitorController.getFixes);

// PUT /api/test-monitor/fixes/:fixId/status - Update fix status
router.put('/fixes/:fixId/status', testMonitorController.updateFixStatus);

// ============================================================================
// PROMPT VERSION MANAGEMENT ROUTES
// ============================================================================

// GET /api/test-monitor/prompts - List all prompt files
router.get('/prompts', testMonitorController.getPromptFiles);

// GET /api/test-monitor/prompts/:fileKey - Get prompt content
router.get('/prompts/:fileKey', testMonitorController.getPromptContent);

// GET /api/test-monitor/prompts/:fileKey/history - Get version history
router.get('/prompts/:fileKey/history', testMonitorController.getPromptHistory);

// GET /api/test-monitor/prompts/:fileKey/version/:version - Get specific version
router.get('/prompts/:fileKey/version/:version', testMonitorController.getPromptVersionContent);

// POST /api/test-monitor/prompts/:fileKey/apply-fix - Apply fix to prompt
router.post('/prompts/:fileKey/apply-fix', testMonitorController.applyFixToPrompt);

// POST /api/test-monitor/prompts/:fileKey/sync - Sync to disk
router.post('/prompts/:fileKey/sync', testMonitorController.syncPromptToDisk);

export default router;

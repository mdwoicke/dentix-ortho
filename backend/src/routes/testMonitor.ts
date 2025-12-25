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

// GET /api/test-monitor/execution/active - Check for active execution
router.get('/execution/active', testMonitorController.getActiveExecution);

// GET /api/test-monitor/execution/:runId/stream - SSE for execution status
router.get('/execution/:runId/stream', testMonitorController.streamExecution);

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

// POST /api/test-monitor/prompts/:fileKey/save - Save new version manually
router.post('/prompts/:fileKey/save', testMonitorController.savePromptVersion);

// POST /api/test-monitor/prompts/:fileKey/sync - Sync to disk
router.post('/prompts/:fileKey/sync', testMonitorController.syncPromptToDisk);

// ============================================================================
// TEST CASE MANAGEMENT ROUTES
// ============================================================================

// GET /api/test-monitor/test-cases/presets - Get semantic expectation presets
// Must be defined before /:caseId routes to avoid conflicts
router.get('/test-cases/presets', testMonitorController.getTestCasePresets);

// POST /api/test-monitor/test-cases/validate - Validate test case without saving
router.post('/test-cases/validate', testMonitorController.validateTestCase);

// POST /api/test-monitor/test-cases/sync - Sync test cases to TypeScript files
router.post('/test-cases/sync', testMonitorController.syncTestCases);

// GET /api/test-monitor/test-cases - List all test cases
router.get('/test-cases', testMonitorController.getTestCases);

// POST /api/test-monitor/test-cases - Create new test case
router.post('/test-cases', testMonitorController.createTestCase);

// POST /api/test-monitor/test-cases/:caseId/clone - Clone test case
router.post('/test-cases/:caseId/clone', testMonitorController.cloneTestCase);

// GET /api/test-monitor/test-cases/:caseId - Get single test case
router.get('/test-cases/:caseId', testMonitorController.getTestCase);

// PUT /api/test-monitor/test-cases/:caseId - Update test case
router.put('/test-cases/:caseId', testMonitorController.updateTestCase);

// DELETE /api/test-monitor/test-cases/:caseId - Archive/delete test case
router.delete('/test-cases/:caseId', testMonitorController.deleteTestCase);

// ============================================================================
// GOAL-ORIENTED TEST CASE ROUTES
// ============================================================================

// GET /api/test-monitor/goal-tests - List all goal-based test cases
router.get('/goal-tests', testMonitorController.getGoalTestCases);

// POST /api/test-monitor/goal-tests - Create new goal-based test case
router.post('/goal-tests', testMonitorController.createGoalTestCase);

// POST /api/test-monitor/goal-tests/:caseId/clone - Clone goal test case
router.post('/goal-tests/:caseId/clone', testMonitorController.cloneGoalTestCase);

// GET /api/test-monitor/goal-tests/:caseId - Get single goal-based test case
router.get('/goal-tests/:caseId', testMonitorController.getGoalTestCase);

// PUT /api/test-monitor/goal-tests/:caseId - Update goal-based test case
router.put('/goal-tests/:caseId', testMonitorController.updateGoalTestCase);

// DELETE /api/test-monitor/goal-tests/:caseId - Archive/delete goal-based test case
router.delete('/goal-tests/:caseId', testMonitorController.deleteGoalTestCase);

// POST /api/test-monitor/goal-tests/validate - Validate goal test case without saving
router.post('/goal-tests/validate', testMonitorController.validateGoalTestCase);

// POST /api/test-monitor/goal-tests/sync - Sync goal test cases to TypeScript files
router.post('/goal-tests/sync', testMonitorController.syncGoalTestCases);

// GET /api/test-monitor/goal-tests/personas - List available persona presets
router.get('/goal-tests/personas', testMonitorController.getPersonaPresets);

export default router;

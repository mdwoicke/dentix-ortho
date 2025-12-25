/**
 * Test Monitor API Service
 * API calls for Flowise test monitoring dashboard
 */

import { get, put, post } from './client';
import type {
  TestRun,
  TestRunWithResults,
  TestResult,
  ConversationTurn,
  ApiCall,
  Finding,
  Recommendation,
  GeneratedFix,
  PromptFile,
  PromptContent,
  PromptVersionHistory,
  ApplyFixResult,
  TestMonitorApiResponse,
  TestScenario,
  StartExecutionRequest,
  StartExecutionResponse,
} from '../../types/testMonitor.types';

// Base API URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * SSE Event types
 */
export type TestRunStreamEvent =
  | { type: 'run-update'; data: TestRun }
  | { type: 'results-update'; data: TestResult[] }
  | { type: 'findings-update'; data: Finding[] }
  | { type: 'transcript-update'; data: ConversationTurn[] }
  | { type: 'api-calls-update'; data: ApiCall[] }
  | { type: 'complete'; data: { status: string } }
  | { type: 'error'; data: { message: string } };

/**
 * Subscribe to real-time test run updates via SSE
 * Returns an EventSource that can be closed when done
 */
export function subscribeToTestRun(
  runId: string,
  testId: string | null,
  onEvent: (event: TestRunStreamEvent) => void,
  onError?: (error: Event) => void
): EventSource {
  let url = `${API_BASE_URL}/test-monitor/runs/${runId}/stream`;
  if (testId) {
    url += `?testId=${testId}`;
  }

  const eventSource = new EventSource(url);

  // Handle specific event types
  eventSource.addEventListener('run-update', (e) => {
    onEvent({ type: 'run-update', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('results-update', (e) => {
    onEvent({ type: 'results-update', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('findings-update', (e) => {
    onEvent({ type: 'findings-update', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('transcript-update', (e) => {
    onEvent({ type: 'transcript-update', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('api-calls-update', (e) => {
    onEvent({ type: 'api-calls-update', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('complete', (e) => {
    onEvent({ type: 'complete', data: JSON.parse(e.data) });
    eventSource.close();
  });

  eventSource.addEventListener('error', (e) => {
    if (e.type === 'error') {
      try {
        const eventWithData = e as MessageEvent;
        if (eventWithData.data) {
          onEvent({ type: 'error', data: JSON.parse(eventWithData.data) });
        }
      } catch {
        // SSE connection error, not a custom error event
      }
    }
    if (onError) {
      onError(e);
    }
  });

  return eventSource;
}

/**
 * Get all test runs
 */
export async function getTestRuns(
  limit: number = 50,
  offset: number = 0
): Promise<TestRun[]> {
  const response = await get<TestMonitorApiResponse<TestRun[]>>(
    `/test-monitor/runs?limit=${limit}&offset=${offset}`
  );
  return response.data;
}

/**
 * Get a single test run with its results
 */
export async function getTestRun(runId: string): Promise<TestRunWithResults> {
  const response = await get<TestMonitorApiResponse<TestRunWithResults>>(
    `/test-monitor/runs/${runId}`
  );
  return response.data;
}

/**
 * Get conversation transcript for a test
 */
export async function getTranscript(
  testId: string,
  runId?: string
): Promise<ConversationTurn[]> {
  let url = `/test-monitor/tests/${testId}/transcript`;
  if (runId) {
    url += `?runId=${runId}`;
  }
  const response = await get<TestMonitorApiResponse<ConversationTurn[]>>(url);
  return response.data;
}

/**
 * Get API calls for a test
 */
export async function getApiCalls(
  testId: string,
  runId?: string
): Promise<ApiCall[]> {
  let url = `/test-monitor/tests/${testId}/api-calls`;
  if (runId) {
    url += `?runId=${runId}`;
  }
  const response = await get<TestMonitorApiResponse<ApiCall[]>>(url);
  return response.data;
}

/**
 * Get all findings
 */
export async function getFindings(runId?: string): Promise<Finding[]> {
  let url = '/test-monitor/findings';
  if (runId) {
    url += `?runId=${runId}`;
  }
  const response = await get<TestMonitorApiResponse<Finding[]>>(url);
  return response.data;
}

/**
 * Get all recommendations
 */
export async function getRecommendations(runId?: string): Promise<Recommendation[]> {
  let url = '/test-monitor/recommendations';
  if (runId) {
    url += `?runId=${runId}`;
  }
  const response = await get<TestMonitorApiResponse<Recommendation[]>>(url);
  return response.data;
}

/**
 * Get generated fixes with optional filters
 */
export async function getFixes(options?: {
  runId?: string;
  status?: string;
  type?: string;
}): Promise<GeneratedFix[]> {
  const params = new URLSearchParams();
  if (options?.runId) params.append('runId', options.runId);
  if (options?.status) params.append('status', options.status);
  if (options?.type) params.append('type', options.type);

  const queryString = params.toString();
  const url = `/test-monitor/fixes${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<GeneratedFix[]>>(url);
  return response.data;
}

/**
 * Get fixes for a specific test run
 */
export async function getFixesForRun(runId: string): Promise<GeneratedFix[]> {
  const response = await get<TestMonitorApiResponse<GeneratedFix[]>>(
    `/test-monitor/runs/${runId}/fixes`
  );
  return response.data;
}

/**
 * Update fix status
 */
export async function updateFixStatus(
  fixId: string,
  status: 'pending' | 'applied' | 'rejected' | 'verified'
): Promise<{ success: boolean; message: string }> {
  const response = await put<{ success: boolean; message: string }>(
    `/test-monitor/fixes/${fixId}/status`,
    { status }
  );
  return response;
}

// ============================================================================
// PROMPT VERSION MANAGEMENT API
// ============================================================================

/**
 * Get all prompt files with version info
 */
export async function getPromptFiles(): Promise<PromptFile[]> {
  const response = await get<TestMonitorApiResponse<PromptFile[]>>(
    '/test-monitor/prompts'
  );
  return response.data;
}

/**
 * Get current content of a prompt file
 */
export async function getPromptContent(fileKey: string): Promise<PromptContent> {
  const response = await get<TestMonitorApiResponse<PromptContent>>(
    `/test-monitor/prompts/${fileKey}`
  );
  return response.data;
}

/**
 * Get version history for a prompt file
 */
export async function getPromptHistory(
  fileKey: string,
  limit: number = 20
): Promise<PromptVersionHistory[]> {
  const response = await get<TestMonitorApiResponse<PromptVersionHistory[]>>(
    `/test-monitor/prompts/${fileKey}/history?limit=${limit}`
  );
  return response.data;
}

/**
 * Get content of a specific version
 */
export async function getPromptVersionContent(
  fileKey: string,
  version: number
): Promise<PromptContent> {
  const response = await get<TestMonitorApiResponse<PromptContent>>(
    `/test-monitor/prompts/${fileKey}/version/${version}`
  );
  return response.data;
}

/**
 * Apply a fix to a prompt and create a new version
 */
export async function applyFixToPrompt(
  fileKey: string,
  fixId: string
): Promise<ApplyFixResult> {
  const response = await post<TestMonitorApiResponse<ApplyFixResult>>(
    `/test-monitor/prompts/${fileKey}/apply-fix`,
    { fixId }
  );
  return response.data;
}

/**
 * Sync working copy to disk
 */
export async function syncPromptToDisk(
  fileKey: string
): Promise<{ success: boolean; message: string }> {
  const response = await post<{ success: boolean; message: string }>(
    `/test-monitor/prompts/${fileKey}/sync`,
    {}
  );
  return response;
}

// ============================================================================
// TEST EXECUTION API
// ============================================================================

/**
 * Get available test scenarios
 */
export async function getScenarios(): Promise<TestScenario[]> {
  const response = await get<{ success: boolean; scenarios: TestScenario[] }>(
    '/test-monitor/scenarios'
  );
  return response.scenarios;
}

/**
 * Start test execution
 */
export async function startExecution(
  request: StartExecutionRequest
): Promise<StartExecutionResponse> {
  const response = await post<{
    success: boolean;
    runId: string;
    status: string;
    message: string;
  }>('/test-monitor/runs/start', request);
  return { runId: response.runId, status: response.status as 'started' };
}

/**
 * Stop test execution
 */
export async function stopExecution(runId: string): Promise<{ success: boolean; message: string }> {
  const response = await post<{ success: boolean; message: string }>(
    `/test-monitor/runs/${runId}/stop`,
    {}
  );
  return response;
}

/**
 * Pause test execution
 */
export async function pauseExecution(runId: string): Promise<{ success: boolean; message: string }> {
  const response = await post<{ success: boolean; message: string }>(
    `/test-monitor/runs/${runId}/pause`,
    {}
  );
  return response;
}

/**
 * Resume test execution
 */
export async function resumeExecution(runId: string): Promise<{ success: boolean; message: string }> {
  const response = await post<{ success: boolean; message: string }>(
    `/test-monitor/runs/${runId}/resume`,
    {}
  );
  return response;
}

// ============================================================================
// DIAGNOSIS / AGENT TUNING API
// ============================================================================

export interface DiagnosisResult {
  success: boolean;
  message: string;
  fixesGenerated: number;
  analyzedCount?: number;
  totalFailures?: number;
  summary?: {
    promptFixes: number;
    toolFixes: number;
    highConfidenceFixes: number;
    rootCauseBreakdown: Record<string, number>;
  };
  error?: string;
}

/**
 * Run failure analysis on a test run and generate fixes
 */
export async function runDiagnosis(
  runId: string,
  options?: { useLLM?: boolean }
): Promise<DiagnosisResult> {
  const response = await post<DiagnosisResult>(
    `/test-monitor/runs/${runId}/diagnose`,
    { useLLM: options?.useLLM ?? true }
  );
  return response;
}

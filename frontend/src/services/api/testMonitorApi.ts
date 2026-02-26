/**
 * Test Monitor API Service
 * API calls for Flowise test monitoring dashboard
 */

import { get, put, post, del } from './client';
import { API_CONFIG } from '../../utils/constants';
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
  GoalTestCaseRecord,
  TestCaseStats,
  UserPersonaDTO,
  ConversationGoalDTO,
  TestConstraintDTO,
  ResponseConfigDTO,
  PromptContext,
  ProductionTrace,
  ProductionTraceDetail,
  ProductionTracesResponse,
  ImportResult,
  ImportHistoryEntry,
  ProductionSession,
  ProductionSessionsResponse,
  ProductionSessionDetailResponse,
  TraceInsightsResponse,
  ReplayRequest,
  ReplayResponse,
  ReplayEndpoints,
  HarnessRequest,
  HarnessResponse,
  HarnessVariantInfo,
  HarnessCompareRequest,
  HarnessCompareResponse,
  CacheHealthResponse,
  CacheOperationResponse,
  TierSlotsResponse,
} from '../../types/testMonitor.types';

// Base API URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

// ============================================================================
// EXECUTION STATUS SSE
// ============================================================================

/**
 * Execution SSE Event types
 */
export type ExecutionStreamEvent =
  | { type: 'execution-started'; data: { runId: string; status: string; concurrency: number } }
  | { type: 'progress-update'; data: { total: number; completed: number; passed: number; failed: number; skipped: number } }
  | { type: 'workers-update'; data: Array<{ workerId: number; status: string; currentTestId: string | null; currentTestName: string | null }> }
  | { type: 'worker-status'; data: { workerId: number; status: string; currentTestId: string | null; currentTestName: string | null } }
  | { type: 'execution-completed'; data: { runId: string; status: string; progress: any } }
  | { type: 'execution-stopped'; data: { runId: string; status: string } }
  | { type: 'execution-error'; data: { error: string } }
  | { type: 'complete'; data: { status: string } }
  | { type: 'error'; data: { error: string } }
  // Real-time conversation streaming events
  | { type: 'conversation-update'; data: { testId: string; turn: ConversationTurn; turnIndex: number; totalTurns: number } }
  | { type: 'api-call-update'; data: { testId: string; apiCall: ApiCall } };

/**
 * Subscribe to real-time execution status updates via SSE
 */
export function subscribeToExecution(
  runId: string,
  onEvent: (event: ExecutionStreamEvent) => void,
  onError?: (error: Event) => void
): EventSource {
  const url = `${API_BASE_URL}/test-monitor/execution/${runId}/stream`;
  const eventSource = new EventSource(url);

  // Handle specific event types
  eventSource.addEventListener('execution-started', (e) => {
    onEvent({ type: 'execution-started', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('progress-update', (e) => {
    onEvent({ type: 'progress-update', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('workers-update', (e) => {
    onEvent({ type: 'workers-update', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('worker-status', (e) => {
    onEvent({ type: 'worker-status', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('execution-completed', (e) => {
    onEvent({ type: 'execution-completed', data: JSON.parse(e.data) });
    eventSource.close();
  });

  eventSource.addEventListener('execution-stopped', (e) => {
    onEvent({ type: 'execution-stopped', data: JSON.parse(e.data) });
    eventSource.close();
  });

  eventSource.addEventListener('execution-error', (e) => {
    onEvent({ type: 'execution-error', data: JSON.parse(e.data) });
  });

  // Real-time conversation streaming events
  eventSource.addEventListener('conversation-update', (e) => {
    onEvent({ type: 'conversation-update', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('api-call-update', (e) => {
    onEvent({ type: 'api-call-update', data: JSON.parse(e.data) });
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
 * Get live conversation for a running test
 */
export async function getLiveConversation(
  runId: string,
  testId: string
): Promise<{ transcript: ConversationTurn[]; apiCalls: ApiCall[]; lastUpdated: number | null }> {
  const response = await get<TestMonitorApiResponse<{
    transcript: ConversationTurn[];
    apiCalls: ApiCall[];
    lastUpdated: number | null;
  }>>(`/test-monitor/execution/${runId}/conversation/${testId}`);
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
  console.log(`[Fixes:API] getFixesForRun called with runId: ${runId}`);
  const response = await get<TestMonitorApiResponse<GeneratedFix[]>>(
    `/test-monitor/runs/${runId}/fixes`
  );
  console.log(`[Fixes:API] getFixesForRun response:`, {
    success: response.success,
    fixCount: response.data?.length ?? 0,
    fixIds: response.data?.map(f => f.fixId) ?? [],
  });
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
export async function getPromptFiles(context: PromptContext = 'production'): Promise<PromptFile[]> {
  const response = await get<TestMonitorApiResponse<PromptFile[]>>(
    `/test-monitor/prompts?context=${context}`
  );
  return response.data;
}

/**
 * Get current content of a prompt file
 */
export async function getPromptContent(fileKey: string, context: PromptContext = 'production'): Promise<PromptContent> {
  const response = await get<TestMonitorApiResponse<PromptContent>>(
    `/test-monitor/prompts/${fileKey}?context=${context}`
  );
  return response.data;
}

/**
 * Get version history for a prompt file
 */
export async function getPromptHistory(
  fileKey: string,
  limit: number = 20,
  context: PromptContext = 'production'
): Promise<PromptVersionHistory[]> {
  const response = await get<TestMonitorApiResponse<PromptVersionHistory[]>>(
    `/test-monitor/prompts/${fileKey}/history?limit=${limit}&context=${context}`
  );
  return response.data;
}

/**
 * Get content of a specific version
 */
export async function getPromptVersionContent(
  fileKey: string,
  version: number,
  context: PromptContext = 'production'
): Promise<PromptContent> {
  const response = await get<TestMonitorApiResponse<PromptContent>>(
    `/test-monitor/prompts/${fileKey}/version/${version}?context=${context}`
  );
  return response.data;
}

/**
 * Copy a production file to a sandbox
 */
export async function copyToSandbox(
  fileKey: string,
  sandboxId: 'sandbox_a' | 'sandbox_b'
): Promise<{ fileKey: string; sandboxId: string; version: number; copiedFromVersion: number; message: string }> {
  const response = await post<TestMonitorApiResponse<{
    fileKey: string;
    sandboxId: string;
    version: number;
    copiedFromVersion: number;
    message: string;
  }>>(
    `/test-monitor/prompts/${fileKey}/copy-to-sandbox`,
    { sandboxId }
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

/**
 * Apply multiple fixes to their respective target files
 * Handles automatic file detection and curly brace escaping for Flowise
 */
export interface BatchApplyResult {
  results: Array<{
    fixId: string;
    success: boolean;
    fileKey?: string;
    newVersion?: number;
    error?: string;
    warnings?: string[];
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    filesModified: string[];
  };
}

export async function applyBatchFixes(
  fixIds: string[]
): Promise<BatchApplyResult> {
  const response = await post<TestMonitorApiResponse<BatchApplyResult>>(
    '/test-monitor/prompts/apply-batch',
    { fixIds }
  );
  return response.data;
}

/**
 * Save new prompt version (manual edit)
 */
export async function savePromptVersion(
  fileKey: string,
  content: string,
  changeDescription: string
): Promise<{ newVersion: number; message: string; warnings?: string[] }> {
  const response = await post<TestMonitorApiResponse<{
    newVersion: number;
    message: string;
    warnings?: string[];
  }> & { error?: string }>(
    `/test-monitor/prompts/${fileKey}/save`,
    { content, changeDescription }
  );

  // Check for error response (backend returns success: false with error)
  if (!response.success && response.error) {
    throw new Error(response.error);
  }

  if (!response.data) {
    throw new Error('Invalid response from server');
  }

  return response.data;
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
 * Active execution response type
 */
export interface ActiveExecutionResponse {
  active: boolean;
  runId: string | null;
  status?: 'running' | 'paused';
  progress?: {
    total: number;
    completed: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  workers?: Array<{
    workerId: number;
    status: string;
    currentTestId: string | null;
    currentTestName: string | null;
  }>;
  concurrency?: number;
}

/**
 * Check for active execution
 */
export async function getActiveExecution(): Promise<ActiveExecutionResponse> {
  const response = await get<{ success: boolean } & ActiveExecutionResponse>(
    '/test-monitor/execution/active'
  );
  return response;
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
  runId?: string; // Added for trace diagnosis - contains the diagnosis run ID
  analysis?: {
    summary?: string;
    issues?: string[];
    rootCause?: string;
  };
  provider?: string;
  durationMs?: number;
}

/**
 * Run failure analysis on a test run and generate fixes
 * Uses extended timeout for LLM analysis (can take 30-90+ seconds)
 */
export async function runDiagnosis(
  runId: string,
  options?: { useLLM?: boolean }
): Promise<DiagnosisResult> {
  const response = await post<DiagnosisResult>(
    `/test-monitor/runs/${runId}/diagnose`,
    { useLLM: options?.useLLM ?? true },
    { timeout: API_CONFIG.AI_TIMEOUT }
  );
  return response;
}

// ============================================================================
// VERIFICATION API
// ============================================================================

import type { VerificationSummary } from '../../types/testMonitor.types';

/**
 * Verify fixes by re-running affected tests
 * Compares results before and after to determine fix effectiveness
 */
export async function verifyFixes(
  fixIds: string[]
): Promise<VerificationSummary> {
  const response = await post<TestMonitorApiResponse<VerificationSummary>>(
    '/test-monitor/fixes/verify',
    { fixIds }
  );
  return response.data;
}

// ============================================================================
// DEPLOYMENT TRACKING API (Phase 5: Flowise Sync)
// ============================================================================

export interface DeploymentRecord {
  version: number;
  deployedAt: string;
  deployedBy?: string;
  notes?: string;
}

/**
 * Get deployed versions for all prompt files
 */
export async function getDeployedVersions(context: PromptContext = 'production'): Promise<Record<string, number>> {
  const response = await get<TestMonitorApiResponse<Record<string, number>>>(
    `/test-monitor/prompts/deployed?context=${context}`
  );
  return response.data;
}

/**
 * Mark a prompt version as deployed to Flowise
 */
export async function markPromptAsDeployed(
  fileKey: string,
  version: number,
  notes?: string
): Promise<{ success: boolean; message: string }> {
  const response = await post<{ success: boolean; message: string }>(
    `/test-monitor/prompts/${fileKey}/mark-deployed`,
    { version, notes }
  );
  return response;
}

/**
 * Get deployment history for a prompt file
 */
export async function getDeploymentHistory(
  fileKey: string,
  limit: number = 10
): Promise<DeploymentRecord[]> {
  const response = await get<TestMonitorApiResponse<DeploymentRecord[]>>(
    `/test-monitor/prompts/${fileKey}/deployment-history?limit=${limit}`
  );
  return response.data;
}

/**
 * Escape curly brackets for Flowise templating system
 * Converts single { and } to {{ and }} to prevent Flowise from interpreting them as variables
 * Only applies to system_prompt, not to tool files which use JavaScript
 */
function escapeForFlowise(content: string): string {
  // Escape { to {{ and } to }}
  // We need to be careful not to double-escape already escaped brackets
  // First, temporarily mark already-escaped brackets, then escape singles, then restore
  return content
    .replace(/\{\{/g, '\x00DOUBLE_OPEN\x00')
    .replace(/\}\}/g, '\x00DOUBLE_CLOSE\x00')
    .replace(/\{/g, '{{')
    .replace(/\}/g, '}}')
    .replace(/\x00DOUBLE_OPEN\x00/g, '{{')
    .replace(/\x00DOUBLE_CLOSE\x00/g, '}}');
}

/**
 * Copy full prompt content for pasting into Flowise
 * Returns the full prompt content for clipboard copy
 * For system_prompt, escapes curly brackets to prevent Flowise template interpretation
 */
export async function getPromptForFlowise(fileKey: string): Promise<string> {
  const content = await getPromptContent(fileKey);

  // Only escape curly brackets for system_prompt (markdown prompt)
  // Tool files (patient_tool, scheduling_tool) are JavaScript and need their brackets intact
  if (fileKey === 'system_prompt') {
    return escapeForFlowise(content.content);
  }

  return content.content;
}

// ============================================================================
// VERSION ROLLBACK API (Phase 8)
// ============================================================================

export interface RollbackResult {
  newVersion: number;
  originalVersion: number;
  rolledBackTo: number;
  message: string;
}

export interface VersionDiff {
  version1Lines: number;
  version2Lines: number;
  addedLines: number;
  removedLines: number;
  changedLines: number;
}

/**
 * Rollback a prompt to a previous version
 */
export async function rollbackPromptVersion(
  fileKey: string,
  targetVersion: number
): Promise<RollbackResult> {
  const response = await post<TestMonitorApiResponse<RollbackResult>>(
    `/test-monitor/prompts/${fileKey}/rollback`,
    { targetVersion }
  );
  return response.data;
}

/**
 * Get diff between two prompt versions
 */
export async function getPromptVersionDiff(
  fileKey: string,
  version1: number,
  version2: number
): Promise<VersionDiff> {
  const response = await get<TestMonitorApiResponse<VersionDiff>>(
    `/test-monitor/prompts/${fileKey}/diff?version1=${version1}&version2=${version2}`
  );
  return response.data;
}

// ============================================================================
// GOAL-ORIENTED TEST CASE API
// ============================================================================

export interface GoalTestCaseListResponse {
  testCases: GoalTestCaseRecord[];
  stats: TestCaseStats;
  tags: string[];
}

export interface GoalTestPresetsResponse {
  personas: Array<{
    id: string;
    name: string;
    description: string;
    inventory: any;
    traits: any;
  }>;
  collectableFields: Array<{ value: string; label: string }>;
  goalTypes: Array<{ value: string; label: string; description: string }>;
  constraintTypes: Array<{ value: string; label: string; description: string }>;
}

export interface GoalTestValidationError {
  field: string;
  message: string;
}

/**
 * Get all goal-based test cases
 */
export async function getGoalTestCases(options?: {
  category?: string;
  includeArchived?: boolean;
}): Promise<GoalTestCaseListResponse> {
  const params = new URLSearchParams();
  if (options?.category) params.append('category', options.category);
  if (options?.includeArchived) params.append('includeArchived', 'true');

  const queryString = params.toString();
  const url = `/test-monitor/goal-tests${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<GoalTestCaseListResponse>>(url);
  return response.data;
}

/**
 * Get a single goal-based test case
 */
export async function getGoalTestCase(caseId: string): Promise<GoalTestCaseRecord> {
  const response = await get<TestMonitorApiResponse<GoalTestCaseRecord>>(
    `/test-monitor/goal-tests/${caseId}`
  );
  return response.data;
}

/**
 * Create a new goal-based test case
 */
export async function createGoalTestCase(testCase: {
  caseId?: string;
  name: string;
  description?: string;
  category: 'happy-path' | 'edge-case' | 'error-handling';
  tags?: string[];
  persona: UserPersonaDTO;
  goals: ConversationGoalDTO[];
  constraints?: TestConstraintDTO[];
  responseConfig?: ResponseConfigDTO;
  initialMessage: string;
}): Promise<GoalTestCaseRecord> {
  const response = await post<TestMonitorApiResponse<GoalTestCaseRecord>>(
    '/test-monitor/goal-tests',
    testCase
  );
  return response.data;
}

/**
 * Update a goal-based test case
 */
export async function updateGoalTestCase(
  caseId: string,
  updates: Partial<{
    name: string;
    description: string;
    category: 'happy-path' | 'edge-case' | 'error-handling';
    tags: string[];
    persona: UserPersonaDTO;
    goals: ConversationGoalDTO[];
    constraints: TestConstraintDTO[];
    responseConfig: ResponseConfigDTO;
    initialMessage: string;
    isArchived: boolean;
  }>
): Promise<GoalTestCaseRecord> {
  const response = await put<TestMonitorApiResponse<GoalTestCaseRecord>>(
    `/test-monitor/goal-tests/${caseId}`,
    updates
  );
  return response.data;
}

/**
 * Delete (archive) a goal-based test case
 */
export async function deleteGoalTestCase(
  caseId: string,
  permanent?: boolean
): Promise<{ success: boolean; message: string }> {
  const url = `/test-monitor/goal-tests/${caseId}${permanent ? '?permanent=true' : ''}`;
  // Using fetch directly since we don't have a delete helper in client
  const response = await fetch(`${API_BASE_URL}${url}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json();
}

/**
 * Clone a goal-based test case
 */
export async function cloneGoalTestCase(
  caseId: string,
  newCaseId?: string
): Promise<GoalTestCaseRecord> {
  const response = await post<TestMonitorApiResponse<GoalTestCaseRecord>>(
    `/test-monitor/goal-tests/${caseId}/clone`,
    { newCaseId }
  );
  return response.data;
}

/**
 * Validate a goal-based test case without saving
 */
export async function validateGoalTestCase(
  testCase: Partial<GoalTestCaseRecord>
): Promise<{ valid: boolean; errors: GoalTestValidationError[] }> {
  const response = await post<{ success: boolean; valid: boolean; errors: GoalTestValidationError[] }>(
    '/test-monitor/goal-tests/validate',
    testCase
  );
  return { valid: response.valid, errors: response.errors };
}

/**
 * Sync goal test cases to TypeScript files
 */
export async function syncGoalTestCases(): Promise<{
  success: boolean;
  message: string;
  filesWritten: string[];
}> {
  const response = await post<{
    success: boolean;
    message: string;
    filesWritten: string[];
  }>('/test-monitor/goal-tests/sync', {});
  return response;
}

/**
 * Get persona presets and configuration options
 */
export async function getGoalTestPresets(): Promise<GoalTestPresetsResponse> {
  const response = await get<TestMonitorApiResponse<GoalTestPresetsResponse>>(
    '/test-monitor/goal-tests/personas'
  );
  return response.data;
}

// ============================================================================
// AI SUGGESTION API
// ============================================================================

/**
 * AI suggestion request parameters
 */
export interface AISuggestionRequest {
  name: string;
  category: 'happy-path' | 'edge-case' | 'error-handling';
  description?: string;
  personaTraits?: {
    verbosity?: 'terse' | 'normal' | 'verbose';
    providesExtraInfo?: boolean;
    patienceLevel?: 'patient' | 'moderate' | 'impatient';
    techSavviness?: 'low' | 'moderate' | 'high';
  };
  tags?: string[];
  model?: 'fast' | 'standard' | 'detailed';
}

/**
 * Individual suggestion item with explanation
 */
export interface SuggestionItem<T> {
  data: T;
  explanation: string;
  confidence: number;
  accepted?: boolean;
}

/**
 * AI suggestion response
 */
export interface AISuggestionResponse {
  success: boolean;
  suggestions: {
    goals: SuggestionItem<ConversationGoalDTO>[];
    constraints: SuggestionItem<TestConstraintDTO>[];
    initialMessage?: {
      message: string;
      explanation: string;
    };
    reasoning: string;
  } | null;
  metadata: {
    model: string;
    processingTimeMs: number;
    tokensUsed?: number;
  };
  error?: string;
}

/**
 * AI suggestion service status
 */
export interface AISuggestionServiceStatus {
  available: boolean;
  models: Array<'fast' | 'standard' | 'detailed'>;
  message: string;
}

/**
 * Check AI suggestion service availability
 */
export async function getAISuggestionServiceStatus(): Promise<AISuggestionServiceStatus> {
  const response = await get<TestMonitorApiResponse<AISuggestionServiceStatus>>(
    '/test-monitor/goal-tests/suggest/status'
  );
  return response.data;
}

/**
 * Generate AI-powered goal and constraint suggestions
 */
export async function generateAISuggestions(
  request: AISuggestionRequest
): Promise<AISuggestionResponse> {
  const response = await post<TestMonitorApiResponse<AISuggestionResponse>>(
    '/test-monitor/goal-tests/suggest',
    request
  );
  return response.data;
}

// ============================================================================
// AI GOAL ANALYSIS API (Step 0 - AI Analyzer)
// ============================================================================

import type { GoalAnalysisResult } from '../../types/goalTestWizard.types';

/**
 * AI goal analysis request parameters
 */
export interface GoalAnalysisRequest {
  description: string;
  model?: 'fast' | 'standard' | 'detailed';
}

/**
 * Analyze a natural language goal description and generate wizard form data
 */
export async function analyzeGoalDescription(
  request: GoalAnalysisRequest
): Promise<GoalAnalysisResult> {
  const response = await post<TestMonitorApiResponse<GoalAnalysisResult>>(
    '/test-monitor/goal-tests/analyze',
    request
  );
  return response.data;
}

// ============================================================================
// AI ENHANCEMENT API
// ============================================================================

import type {
  EnhanceRequest,
  EnhanceResult,
  EnhancementTemplate,
  EnhancementHistory,
  ApplyEnhancementResult,
  QualityScore,
  ReferenceDocument,
  UpdateReferenceDocumentRequest,
} from '../../types/aiPrompting.types';

/**
 * Get available enhancement templates
 */
export async function getEnhancementTemplates(): Promise<EnhancementTemplate[]> {
  const response = await get<TestMonitorApiResponse<EnhancementTemplate[]>>(
    '/test-monitor/prompts/enhance/templates'
  );
  return response.data;
}

/**
 * Preview an enhancement without saving
 * Uses extended timeout for AI operations
 */
export async function previewEnhancement(
  fileKey: string,
  request: Omit<EnhanceRequest, 'fileKey'>
): Promise<EnhanceResult> {
  const response = await post<TestMonitorApiResponse<EnhanceResult>>(
    `/test-monitor/prompts/${fileKey}/enhance/preview`,
    request,
    { timeout: API_CONFIG.AI_TIMEOUT }
  );
  return response.data;
}

/**
 * Generate an enhancement and save to database
 * Uses extended timeout for AI operations
 */
export async function enhancePrompt(
  fileKey: string,
  request: Omit<EnhanceRequest, 'fileKey'>
): Promise<EnhanceResult> {
  const response = await post<TestMonitorApiResponse<EnhanceResult>>(
    `/test-monitor/prompts/${fileKey}/enhance`,
    request,
    { timeout: API_CONFIG.AI_TIMEOUT }
  );
  return response.data;
}

/**
 * Get enhancement history for a file
 */
export async function getEnhancementHistory(
  fileKey: string,
  limit?: number,
  context: PromptContext = 'production'
): Promise<EnhancementHistory[]> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  params.append('context', context);
  const queryString = `?${params.toString()}`;

  const response = await get<TestMonitorApiResponse<EnhancementHistory[]>>(
    `/test-monitor/prompts/${fileKey}/enhancements${queryString}`
  );
  return response.data;
}

/**
 * Apply an enhancement - saves to AI Enhancements storage (NOT to main prompt files)
 * Use promoteToProduction() to actually save to the main prompt files
 * @param description - Optional custom description for when promoted
 */
export async function applyEnhancement(
  fileKey: string,
  enhancementId: string,
  description?: string
): Promise<ApplyEnhancementResult> {
  const response = await post<TestMonitorApiResponse<ApplyEnhancementResult>>(
    `/test-monitor/prompts/${fileKey}/enhancements/${enhancementId}/apply`,
    { description }
  );
  return response.data;
}

/**
 * Promote an applied enhancement to production (main prompt files)
 * This creates a new version in the main prompt file
 * @param description - Optional custom description override
 */
export async function promoteToProduction(
  fileKey: string,
  enhancementId: string,
  description?: string
): Promise<ApplyEnhancementResult> {
  const response = await post<TestMonitorApiResponse<ApplyEnhancementResult>>(
    `/test-monitor/prompts/${fileKey}/enhancements/${enhancementId}/promote`,
    { description }
  );
  return response.data;
}

/**
 * Discard an enhancement
 */
export async function discardEnhancement(
  fileKey: string,
  enhancementId: string
): Promise<void> {
  await post<TestMonitorApiResponse<void>>(
    `/test-monitor/prompts/${fileKey}/enhancements/${enhancementId}/discard`,
    {}
  );
}

/**
 * Get quality score for a prompt
 * Uses extended timeout for AI operations (may be cached)
 */
export async function getQualityScore(
  fileKey: string,
  version?: number,
  context: PromptContext = 'production'
): Promise<QualityScore> {
  const params = new URLSearchParams();
  if (version) params.append('version', version.toString());
  params.append('context', context);
  const queryString = `?${params.toString()}`;

  const response = await get<TestMonitorApiResponse<QualityScore>>(
    `/test-monitor/prompts/${fileKey}/quality-score${queryString}`,
    { timeout: API_CONFIG.AI_TIMEOUT }
  );
  return response.data;
}

/**
 * Get enhancement by ID
 */
export async function getEnhancement(
  enhancementId: string
): Promise<EnhancementHistory> {
  const response = await get<TestMonitorApiResponse<EnhancementHistory>>(
    `/test-monitor/enhancements/${enhancementId}`
  );
  return response.data;
}

// ============================================================================
// REFERENCE DOCUMENT API
// ============================================================================

/**
 * Upload a reference document for a file type
 */
export async function uploadReferenceDocument(
  fileKey: string,
  file: File
): Promise<ReferenceDocument> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(
    `${API_BASE_URL}/test-monitor/prompts/${fileKey}/references`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

/**
 * Get all reference documents for a file type
 */
export async function getReferenceDocuments(
  fileKey: string
): Promise<ReferenceDocument[]> {
  const response = await get<TestMonitorApiResponse<ReferenceDocument[]>>(
    `/test-monitor/prompts/${fileKey}/references`
  );
  return response.data;
}

/**
 * Update a reference document (label or display order)
 */
export async function updateReferenceDocument(
  documentId: string,
  updates: UpdateReferenceDocumentRequest
): Promise<ReferenceDocument> {
  const response = await put<TestMonitorApiResponse<ReferenceDocument>>(
    `/test-monitor/references/${documentId}`,
    updates
  );
  return response.data;
}

/**
 * Delete a reference document
 */
export async function deleteReferenceDocument(
  documentId: string
): Promise<void> {
  await fetch(`${API_BASE_URL}/test-monitor/references/${documentId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// PRODUCTION CALLS API
// ============================================================================

/**
 * Get list of imported production traces
 */
export async function getProductionTraces(options?: {
  configId?: number;
  limit?: number;
  offset?: number;
  fromDate?: string;
  toDate?: string;
  sessionId?: string;
  callerPhone?: string;
}): Promise<ProductionTracesResponse> {
  const params = new URLSearchParams();
  if (options?.configId) params.append('configId', options.configId.toString());
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());
  if (options?.fromDate) params.append('fromDate', options.fromDate);
  if (options?.toDate) params.append('toDate', options.toDate);
  if (options?.sessionId) params.append('sessionId', options.sessionId);
  if (options?.callerPhone) params.append('callerPhone', options.callerPhone);

  const queryString = params.toString();
  const url = `/test-monitor/production-calls${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<ProductionTracesResponse>>(url);
  return response.data;
}

/**
 * Get single production trace with transcript
 */
export async function getProductionTrace(traceId: string, options?: { configId?: number }): Promise<ProductionTraceDetail> {
  const params = new URLSearchParams();
  if (options?.configId) {
    params.append('configId', options.configId.toString());
  }
  const queryString = params.toString();
  const url = `/test-monitor/production-calls/${traceId}${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<ProductionTraceDetail>>(url);
  return response.data;
}

/**
 * Analysis result from LLM analysis of a production trace
 */
export interface TraceAnalysisResult {
  traceId: string;
  analysis: {
    summary: string;
    outcome: 'success' | 'partial_success' | 'failure' | 'unknown';
    outcomeDescription?: string;
    issues: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }>;
    rootCause?: string;
    recommendations: Array<{
      description: string;
      target: 'prompt' | 'tool' | 'flow' | 'api';
      priority: 'low' | 'medium' | 'high';
    }>;
    bookingCompleted?: boolean;
    userSatisfied?: boolean | 'unknown';
    parseError?: boolean;
  };
  transcript: ConversationTurn[];
  apiCallErrors: number;
  provider: 'api' | 'cli' | 'none';
  durationMs?: number;
}

/**
 * Analyze a single production trace with LLM
 */
export async function analyzeProductionTrace(traceId: string): Promise<TraceAnalysisResult> {
  const response = await post<TestMonitorApiResponse<TraceAnalysisResult>>(
    `/test-monitor/production-calls/${traceId}/analyze`,
    {}
  );
  return response.data;
}

/**
 * Diagnose a production trace and generate fixes (like runDiagnosis for test runs)
 */
export async function diagnoseProductionTrace(
  traceId: string,
  options?: { useLLM?: boolean; configId?: number; sessionId?: string }
): Promise<DiagnosisResult> {
  const response = await post<DiagnosisResult>(
    `/test-monitor/production-calls/${traceId}/diagnose`,
    { useLLM: options?.useLLM ?? true, configId: options?.configId, sessionId: options?.sessionId },
    { timeout: API_CONFIG.AI_TIMEOUT }
  );
  return response;
}

/**
 * Diagnose all traces in a production session and generate fixes
 */
export async function diagnoseProductionSession(
  sessionId: string,
  options?: { useLLM?: boolean }
): Promise<DiagnosisResult> {
  const response = await post<DiagnosisResult>(
    `/test-monitor/production-calls/sessions/${encodeURIComponent(sessionId)}/diagnose`,
    { useLLM: options?.useLLM ?? true },
    { timeout: API_CONFIG.AI_TIMEOUT }
  );
  return response;
}

/**
 * Goal test status for a session
 */
export interface SessionGoalStatus {
  hasGoalTest: boolean;
  status?: 'passed' | 'failed' | 'skipped' | 'error' | 'running';
  passed?: boolean;
  testName?: string;
  summary?: string;
  errorMessage?: string;
  runId?: string;
  testId?: string;
}

/**
 * Get goal test status for a production session
 */
export async function getSessionGoalStatus(sessionId: string): Promise<SessionGoalStatus> {
  const response = await get<TestMonitorApiResponse<SessionGoalStatus>>(
    `/test-monitor/production-calls/sessions/${encodeURIComponent(sessionId)}/goal-status`
  );
  return response.data;
}

/**
 * Existing session fixes result
 */
export interface SessionExistingFixes {
  hasExistingFixes: boolean;
  runId?: string;
  fixesCount: number;
  summary?: {
    promptFixes: number;
    toolFixes: number;
    highConfidenceFixes: number;
  };
  fixes: Array<{
    fixId: string;
    runId: string;
    type: string;
    targetFile: string;
    changeDescription: string;
    changeCode: string;
    priority: string;
    confidence: number;
    status: string;
    createdAt: string;
    rootCause?: { type: string; evidence: string };
    classification?: { issueLocation: string; source: string };
  }>;
}

/**
 * Get existing fixes for a production session
 */
export async function getSessionExistingFixes(sessionId: string): Promise<SessionExistingFixes> {
  // Backend returns data directly, not wrapped in a data property
  return get<SessionExistingFixes>(
    `/test-monitor/production-calls/sessions/${encodeURIComponent(sessionId)}/fixes`
  );
}

/**
 * Import traces from Langfuse
 * @param options.refreshObservations - If true, re-fetch observations for existing traces (useful for getting updated error counts)
 */
export async function importProductionTraces(options: {
  configId: number;
  fromDate: string;
  toDate?: string;
  refreshObservations?: boolean;
}): Promise<ImportResult> {
  const response = await post<TestMonitorApiResponse<ImportResult>>(
    '/test-monitor/production-calls/import',
    options,
    { timeout: API_CONFIG.AI_TIMEOUT } // 10 min — import fetches many pages from Langfuse
  );
  return response.data;
}

/**
 * Get import history
 */
export async function getImportHistory(configId?: number, limit?: number): Promise<ImportHistoryEntry[]> {
  const params = new URLSearchParams();
  if (configId) params.append('configId', configId.toString());
  if (limit) params.append('limit', limit.toString());

  const queryString = params.toString();
  const url = `/test-monitor/production-calls/import-history${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<ImportHistoryEntry[]>>(url);
  return response.data;
}

/**
 * Get last import date for a config
 */
export async function getLastImportDate(configId: number): Promise<string | null> {
  const response = await get<TestMonitorApiResponse<{ lastImportDate: string | null }>>(
    `/test-monitor/production-calls/last-import/${configId}`
  );
  return response.data.lastImportDate;
}

// ============================================================================
// PRODUCTION SESSIONS API - Grouped Conversations
// ============================================================================

/**
 * Get aggregated session stats (computed from observation data, not cached flags)
 */
export async function getProductionSessionStats(options?: {
  fromDate?: string;
  toDate?: string;
}): Promise<{ total: number; transfers: number; bookings: number; errors: number }> {
  const params = new URLSearchParams();
  if (options?.fromDate) params.append('fromDate', options.fromDate);
  if (options?.toDate) params.append('toDate', options.toDate);

  const queryString = params.toString();
  const url = `/test-monitor/production-calls/session-stats${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<{ total: number; transfers: number; bookings: number; errors: number }>>(url);
  return response.data;
}

/**
 * Get list of production sessions (grouped conversations)
 */
export async function getProductionSessions(options?: {
  configId?: number;
  limit?: number;
  offset?: number;
  fromDate?: string;
  toDate?: string;
  userId?: string;
  callerPhone?: string;
  disposition?: 'bookings' | 'errors' | 'transfers';
}): Promise<ProductionSessionsResponse> {
  const params = new URLSearchParams();
  if (options?.configId) params.append('configId', options.configId.toString());
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());
  if (options?.fromDate) params.append('fromDate', options.fromDate);
  if (options?.toDate) params.append('toDate', options.toDate);
  if (options?.userId) params.append('userId', options.userId);
  if (options?.callerPhone) params.append('callerPhone', options.callerPhone);
  if (options?.disposition) params.append('disposition', options.disposition);

  const queryString = params.toString();
  const url = `/test-monitor/production-calls/sessions${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<ProductionSessionsResponse>>(url);
  return response.data;
}

/**
 * Get single production session with all traces and combined transcript
 */
export async function getProductionSession(
  sessionId: string,
  configId?: number
): Promise<ProductionSessionDetailResponse> {
  const params = new URLSearchParams();
  if (configId) params.append('configId', configId.toString());

  const queryString = params.toString();
  const url = `/test-monitor/production-calls/sessions/${encodeURIComponent(sessionId)}${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<ProductionSessionDetailResponse>>(url);
  return response.data;
}

/**
 * Refresh a single session's observations from Langfuse and recompute cached flags
 * Used when an appointment was booked after the call ended and the session needs updating
 */
export async function refreshProductionSession(
  sessionId: string,
  configId?: number
): Promise<ProductionSessionDetailResponse> {
  const response = await post<TestMonitorApiResponse<ProductionSessionDetailResponse>>(
    `/test-monitor/production-calls/sessions/${encodeURIComponent(sessionId)}/refresh`,
    { configId }
  );
  return response.data;
}

/**
 * Rebuild session aggregates from existing traces
 */
export async function rebuildProductionSessions(configId?: number): Promise<{ sessionsCreated: number; sessionsUpdated: number }> {
  const response = await post<TestMonitorApiResponse<{ sessionsCreated: number; sessionsUpdated: number }>>(
    '/test-monitor/production-calls/sessions/rebuild',
    { configId }
  );
  return response.data;
}

// ============================================================================
// SESSION APPOINTMENT DATA API
// ============================================================================

export interface SessionAppointment {
  appointmentId: string | null;
  patientId: string | null;
  patientName: string | null;
  patientEmail?: string | null;
  patientPhone?: string | null;
  patientDob?: string | null;
  providerId: string | null;
  providerName?: string | null;
  startTime: string | null;
  endTime: string | null;
  appointmentTypeName?: string | null;
  operatoryId?: string | null;
  operatoryName?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  locationPhone?: string | null;
  timezone?: string | null;
  note?: string | null;
  status: 'booked' | 'confirmed' | 'cancelled' | 'unknown';
  source: 'observation' | 'nexhealth_live';
  observationId?: string;
  childLabel?: string;
}

export interface SessionAppointmentsResponse {
  appointments: SessionAppointment[];
  sessionId: string;
  tenant: string;
  message?: string;
  verifiedAt?: string;
  cached?: boolean;
}

/**
 * Get extracted appointment/booking data from session observations.
 * Only returns data for Chord tenant sessions.
 * Pass verify=true to also validate against NexHealth live data.
 */
export async function getSessionAppointments(
  sessionId: string,
  configId?: number,
  verify?: boolean
): Promise<SessionAppointmentsResponse> {
  const params = new URLSearchParams();
  if (configId) params.append('configId', configId.toString());
  if (verify) params.append('verify', 'true');

  const queryString = params.toString();
  const url = `/test-monitor/production-calls/sessions/${encodeURIComponent(sessionId)}/appointments${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<SessionAppointmentsResponse>>(url);
  return response.data;
}

export interface PatientAppointment {
  appointmentId: string | null;
  patientId: string;
  providerId: string | null;
  startTime: string | null;
  endTime: string | null;
  appointmentTypeName: string | null;
  operatoryId: string | null;
  operatoryName: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationPhone: string | null;
  status: 'booked' | 'confirmed' | 'cancelled' | 'unknown';
  createdAt: string | null;
}

export interface PatientAppointmentsResponse {
  patientId: string;
  appointments: PatientAppointment[];
  total: number;
}

/**
 * Get all NexHealth appointments for a patient.
 */
export async function getPatientAllAppointments(
  patientId: string
): Promise<PatientAppointmentsResponse> {
  const url = `/test-monitor/patient/${encodeURIComponent(patientId)}/appointments`;
  const response = await get<TestMonitorApiResponse<PatientAppointmentsResponse>>(url);
  return response.data;
}

// ============================================================================
// TRACE INSIGHTS API
// ============================================================================

/**
 * Get comprehensive trace insights for a date range
 */
export async function getTraceInsights(options: {
  configId: number;
  fromDate?: string;
  toDate?: string;
  lastDays?: number;
}): Promise<TraceInsightsResponse> {
  const params = new URLSearchParams();
  params.append('configId', options.configId.toString());
  if (options.fromDate) params.append('fromDate', options.fromDate);
  if (options.toDate) params.append('toDate', options.toDate);
  if (options.lastDays) params.append('lastDays', options.lastDays.toString());

  const queryString = params.toString();
  const url = `/test-monitor/production-calls/insights?${queryString}`;
  const response = await get<TestMonitorApiResponse<TraceInsightsResponse>>(url);
  return response.data;
}

// ============================================================================
// PRODUCTION TEST DATA TRACKER API
// ============================================================================

export interface ProdTestRecord {
  id: number;
  record_type: 'patient' | 'appointment';
  patient_guid: string;
  appointment_guid: string | null;
  patient_id: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  patient_birthdate: string | null;
  appointment_datetime: string | null;
  appointment_type: string | null;
  appointment_type_guid: string | null;
  appointment_minutes: number | null;
  location_guid: string | null;
  location_name: string | null;
  provider_guid: string | null;
  provider_name: string | null;
  schedule_view_guid: string | null;
  schedule_column_guid: string | null;
  trace_id: string | null;
  observation_id: string | null;
  session_id: string | null;
  langfuse_config_id: number | null;
  status: 'active' | 'cancelled' | 'deleted' | 'cleanup_failed';
  cancelled_at: string | null;
  deleted_at: string | null;
  cleanup_notes: string | null;
  cleanup_error: string | null;
  created_at: string;
  updated_at: string;
  cloud9_created_at: string | null;
  note: string | null;

  // v72 Individual Patient Model fields
  family_id: string | null;           // Links all family members together
  is_child: boolean;                  // True if this is a child record
  parent_patient_guid: string | null; // For child records, references parent
}

export interface ProdTestRecordStats {
  totalPatients: number;
  totalAppointments: number;
  activePatients: number;
  activeAppointments: number;
  cancelledAppointments: number;
  deletedRecords: number;
}

export interface ProdTestRecordImportResult {
  patientsFound: number;
  appointmentsFound: number;
  duplicatesSkipped: number;
  tracesAlreadyImported: number;
  tracesScanned: number;
  errors: string[];
}

export interface CancelResult {
  success: boolean;
  appointmentGuid: string;
  message: string;
  error?: string;
}

/**
 * Get all production test records
 */
export async function getProdTestRecords(options?: {
  recordType?: 'patient' | 'appointment';
  status?: string;
  langfuseConfigId?: number;
  limit?: number;
  offset?: number;
  fromDate?: string;
  toDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<{ records: ProdTestRecord[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.recordType) params.append('recordType', options.recordType);
  if (options?.status) params.append('status', options.status);
  if (options?.langfuseConfigId) params.append('langfuseConfigId', options.langfuseConfigId.toString());
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());
  if (options?.fromDate) params.append('fromDate', options.fromDate);
  if (options?.toDate) params.append('toDate', options.toDate);
  if (options?.sortBy) params.append('sortBy', options.sortBy);
  if (options?.sortOrder) params.append('sortOrder', options.sortOrder);

  const queryString = params.toString();
  const url = `/test-monitor/prod-test-records${queryString ? `?${queryString}` : ''}`;
  const response = await get<{ success: boolean; data: ProdTestRecord[]; total: number }>(url);
  return { records: response.data, total: response.total };
}

/**
 * Get production test record statistics
 */
export async function getProdTestRecordStats(): Promise<ProdTestRecordStats> {
  const response = await get<TestMonitorApiResponse<ProdTestRecordStats>>('/test-monitor/prod-test-records/stats');
  return response.data;
}

/**
 * Import records from Langfuse traces
 */
export async function importProdTestRecords(options: {
  configId: number;
  fromDate: string;
  toDate?: string;
}): Promise<ProdTestRecordImportResult> {
  const response = await post<TestMonitorApiResponse<ProdTestRecordImportResult>>(
    '/test-monitor/prod-test-records/import',
    options
  );
  return response.data;
}

/**
 * Manually add a production test record
 */
export async function addProdTestRecord(record: Partial<ProdTestRecord>): Promise<{ id: number }> {
  const response = await post<TestMonitorApiResponse<{ id: number }>>(
    '/test-monitor/prod-test-records/manual',
    record
  );
  return response.data;
}

/**
 * Update record status
 */
export async function updateProdTestRecordStatus(
  id: number,
  status: string,
  notes?: string
): Promise<void> {
  await put<TestMonitorApiResponse<void>>(
    `/test-monitor/prod-test-records/${id}/status`,
    { status, notes }
  );
}

/**
 * Cancel appointment via Cloud9 API
 */
export async function cancelProdTestAppointment(id: number): Promise<CancelResult> {
  const response = await post<TestMonitorApiResponse<CancelResult>>(
    `/test-monitor/prod-test-records/${id}/cancel`,
    {}
  );
  return response.data;
}

/**
 * Bulk cancel multiple appointments
 */
export async function bulkCancelProdTestAppointments(ids: number[]): Promise<{
  results: CancelResult[];
  summary: { total: number; succeeded: number; failed: number };
}> {
  const response = await post<TestMonitorApiResponse<{
    results: CancelResult[];
    summary: { total: number; succeeded: number; failed: number };
  }>>('/test-monitor/prod-test-records/bulk-cancel', { ids });
  return response.data;
}

// ============================================================================
// STREAMING CANCELLATION API
// ============================================================================

/**
 * Streaming cancellation item type
 */
export interface StreamingCancellationItem {
  id: number;
  appointmentGuid: string;
  patientName: string;
  appointmentDate: string | null;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'already_cancelled';
  error?: string;
}

/**
 * Streaming cancellation summary type
 */
export interface StreamingCancellationSummary {
  operationId: string;
  total: number;
  succeeded: number;
  failed: number;
  alreadyCancelled: number;
}

/**
 * Start streaming cancellation operation
 * Returns an operation ID that can be used to subscribe to progress
 */
export async function startStreamingCancellation(ids: number[]): Promise<{
  success: boolean;
  operationId: string;
  total: number;
  estimatedTimeMs: number;
}> {
  const response = await post<{
    success: boolean;
    operationId: string;
    total: number;
    estimatedTimeMs: number;
  }>('/test-monitor/prod-test-records/bulk-cancel-stream', { ids });
  return response;
}

/**
 * Subscribe to cancellation progress via SSE
 * Returns an EventSource that emits events:
 * - cancellation-started: { operationId, total, items[] }
 * - cancellation-progress: { operationId, item, currentIndex, total }
 * - cancellation-completed: { operationId, total, succeeded, failed, alreadyCancelled }
 */
export function subscribeToCancellation(
  operationId: string,
  callbacks: {
    onStarted?: (data: { operationId: string; total: number; items: StreamingCancellationItem[] }) => void;
    onProgress?: (data: { operationId: string; item: StreamingCancellationItem; currentIndex: number; total: number }) => void;
    onCompleted?: (data: StreamingCancellationSummary) => void;
    onError?: (error: Error) => void;
  }
): EventSource {
  // Get the base URL for SSE (we need the full URL for EventSource)
  const baseUrl = import.meta.env.VITE_API_URL || '/api';
  const url = baseUrl.startsWith('http')
    ? `${baseUrl}/test-monitor/prod-test-records/cancel-stream/${operationId}`
    : `${window.location.origin}${baseUrl}/test-monitor/prod-test-records/cancel-stream/${operationId}`;

  const eventSource = new EventSource(url);

  eventSource.addEventListener('cancellation-started', (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data);
      callbacks.onStarted?.(data);
    } catch (err) {
      console.error('[SSE] Failed to parse cancellation-started event:', err);
    }
  });

  eventSource.addEventListener('cancellation-progress', (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data);
      callbacks.onProgress?.(data);
    } catch (err) {
      console.error('[SSE] Failed to parse cancellation-progress event:', err);
    }
  });

  eventSource.addEventListener('cancellation-completed', (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data);
      callbacks.onCompleted?.(data);
      eventSource.close();
    } catch (err) {
      console.error('[SSE] Failed to parse cancellation-completed event:', err);
    }
  });

  eventSource.onerror = (error) => {
    console.error('[SSE] EventSource error:', error);
    callbacks.onError?.(new Error('SSE connection error'));
    eventSource.close();
  };

  return eventSource;
}

/**
 * Get cancellation operation status (non-streaming)
 */
export async function getCancellationStatus(operationId: string): Promise<{
  success: boolean;
  operationId: string;
  total: number;
  completed: boolean;
  summary: StreamingCancellationSummary | null;
  startedAt: string;
}> {
  const response = await get<{
    success: boolean;
    operationId: string;
    total: number;
    completed: boolean;
    summary: StreamingCancellationSummary | null;
    startedAt: string;
  }>(`/test-monitor/prod-test-records/cancel-status/${operationId}`);
  return response;
}

/**
 * Delete a production test record
 */
export async function deleteProdTestRecord(id: number): Promise<void> {
  await del<TestMonitorApiResponse<void>>(`/test-monitor/prod-test-records/${id}`);
}

/**
 * Get appointments by patient GUID from local database (fast, no Cloud9 API call)
 * This is used for quick loading of patient appointments without waiting for Cloud9
 */
export async function getLocalAppointmentsByPatientGuid(patientGuid: string): Promise<{
  appointments: any[];
  count: number;
  source: string;
}> {
  const response = await get<{
    success: boolean;
    data: any[];
    count: number;
    source: string;
  }>(`/test-monitor/prod-test-records/patient/${patientGuid}/appointments`);
  return {
    appointments: response.data,
    count: response.count,
    source: response.source,
  };
}

/**
 * Import Langfuse traces for a specific patient
 * This finds any booking traces for the patient and imports the notes to local database
 */
export async function importTracesByPatientGuid(patientGuid: string): Promise<{
  appointmentsImported: number;
  appointmentsUpdated: number;
  errors: string[];
}> {
  const response = await post<{
    success: boolean;
    data: {
      appointmentsImported: number;
      appointmentsUpdated: number;
      errors: string[];
    };
  }>(`/test-monitor/prod-test-records/patient/${patientGuid}/import-traces`, {});
  return response.data;
}

// ============================================================================
// API REPLAY
// ============================================================================

/**
 * Execute a replay of a tool call against Node-RED endpoints
 */
export async function executeReplay(request: ReplayRequest): Promise<ReplayResponse> {
  const response = await post<ReplayResponse>('/test-monitor/replay', request);
  return response;
}

/**
 * Get available replay endpoints
 */
export async function getReplayEndpoints(): Promise<ReplayEndpoints> {
  const response = await get<TestMonitorApiResponse<ReplayEndpoints>>('/test-monitor/replay/endpoints');
  return response.data;
}

// ============================================================================
// TOOL HARNESS API (VM-based execution of actual tool JavaScript)
// ============================================================================

/**
 * Execute a tool in the VM harness (runs real tool JS in Node.js VM)
 */
export async function executeHarnessReplay(request: HarnessRequest): Promise<HarnessResponse> {
  const response = await post<HarnessResponse>('/test-monitor/replay/harness', request);
  return response;
}

/**
 * Get available tool variants with version metadata
 */
export async function getHarnessVariants(tenantId?: number): Promise<HarnessVariantInfo[]> {
  const params = new URLSearchParams();
  if (tenantId) params.append('tenantId', tenantId.toString());
  const queryString = params.toString();
  const url = `/test-monitor/replay/harness/variants${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<HarnessVariantInfo[]>>(url);
  return response.data;
}

/**
 * Compare the same input across two tool variants
 */
export async function compareHarnessVariants(request: HarnessCompareRequest): Promise<HarnessCompareResponse> {
  const response = await post<HarnessCompareResponse>('/test-monitor/replay/harness/compare', request);
  return response;
}

// ============================================================================
// QUEUE ACTIVITY API
// ============================================================================

/**
 * Queue operation summary type
 */
export interface QueueOperation {
  operationId: string;
  patientGuid: string | null;
  patientName: string | null;
  appointmentDatetime: string | null;
  finalStatus: 'completed' | 'failed' | 'pending' | 'expired';
  totalAttempts: number;
  maxAttempts: number;
  appointmentGuid: string | null;
  finalError: string | null;
  eventCount: number;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
}

/**
 * Queue event detail type
 */
export interface QueueEvent {
  id: number;
  operationId: string;
  eventType: 'queued' | 'retry_attempt' | 'completed' | 'failed' | 'expired';
  attemptNumber: number;
  maxAttempts: number;
  patientGuid: string | null;
  patientName: string | null;
  appointmentDatetime: string | null;
  scheduleViewGuid: string | null;
  scheduleColumnGuid: string | null;
  appointmentTypeGuid: string | null;
  appointmentGuid: string | null;
  errorMessage: string | null;
  cloud9Response: string | null;
  backoffMs: number | null;
  nextRetryAt: string | null;
  durationMs: number | null;
  uui: string | null;
  sessionId: string | null;
  source: string | null;
  eventTimestamp: string;
  createdAt: string;
}

/**
 * Queue statistics type
 */
export interface QueueStats {
  totalOperations: number;
  completedOperations: number;
  failedOperations: number;
  pendingOperations: number;
  expiredOperations: number;
  totalEvents: number;
  averageAttempts: number;
  successRate: number;
  averageDurationMs: number | null;
}

/**
 * Get queue activity statistics
 */
export async function getQueueStats(hours?: number): Promise<QueueStats> {
  const params = new URLSearchParams();
  if (hours) params.append('hours', hours.toString());

  const queryString = params.toString();
  const url = `/test-monitor/queue-activity/stats${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<QueueStats>>(url);
  return response.data;
}

/**
 * Get queue operations
 */
export async function getQueueOperations(options?: {
  limit?: number;
  offset?: number;
  status?: 'completed' | 'failed' | 'pending' | 'expired';
  hours?: number;
  patientName?: string;
}): Promise<{ operations: QueueOperation[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());
  if (options?.status) params.append('status', options.status);
  if (options?.hours) params.append('hours', options.hours.toString());
  if (options?.patientName) params.append('patientName', options.patientName);

  const queryString = params.toString();
  const url = `/test-monitor/queue-activity/operations${queryString ? `?${queryString}` : ''}`;
  const response = await get<TestMonitorApiResponse<{
    operations: QueueOperation[];
    total: number;
    limit: number;
    offset: number;
  }>>(url);
  return response.data;
}

/**
 * Get operation detail with all events
 */
export async function getQueueOperationDetail(operationId: string): Promise<{
  operationId: string;
  events: QueueEvent[];
}> {
  const response = await get<TestMonitorApiResponse<{
    operationId: string;
    events: QueueEvent[];
  }>>(`/test-monitor/queue-activity/operations/${encodeURIComponent(operationId)}`);
  return response.data;
}

// ============================================================================
// REDIS SLOT CACHE HEALTH API
// ============================================================================

/**
 * Get cache health status from Node-RED
 * Returns overall health status, tier details, refresh history, and configuration
 */
export async function getCacheHealth(): Promise<CacheHealthResponse> {
  const response = await get<TestMonitorApiResponse<CacheHealthResponse>>(
    '/test-monitor/cache-health'
  );
  return response.data;
}

/**
 * Force refresh the slot cache
 * Bypasses business hours check and triggers immediate cache refresh
 * @param tier - Optional tier to refresh (1, 2, 3, or 'all'). Defaults to 'all'
 */
export async function forceCacheRefresh(tier?: number | 'all'): Promise<CacheOperationResponse> {
  const response = await post<TestMonitorApiResponse<CacheOperationResponse>>(
    '/test-monitor/cache-health/refresh',
    { tier: tier || 'all' }
  );
  return response.data;
}

/**
 * Clear the slot cache
 * Clears cache data, forcing API fallback until next refresh
 * @param tier - Optional tier to clear (1, 2, 3, or 'all'). Defaults to 'all'
 */
export async function clearCache(tier?: number | 'all'): Promise<CacheOperationResponse> {
  const params = new URLSearchParams();
  if (tier) params.append('tier', tier.toString());

  const queryString = params.toString();
  const url = `/test-monitor/cache-health/cache${queryString ? `?${queryString}` : ''}`;
  const response = await del<TestMonitorApiResponse<CacheOperationResponse>>(url);
  return response.data;
}

/**
 * Purge and refresh all cache tiers
 * Clears all cache keys, then refreshes all tiers with fresh data
 * This resets the cache age to 0
 */
export async function purgeAndRefreshCache(): Promise<CacheOperationResponse> {
  const response = await post<TestMonitorApiResponse<CacheOperationResponse>>(
    '/test-monitor/cache-health/purge-and-refresh',
    {}
  );
  return response.data;
}

// ============================================================================
// TRACE ANALYSIS API
// ============================================================================

export interface TraceAnalysisTranscriptTurn {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: string;
}

export interface TraceAnalysisIntent {
  type: string;
  confidence: number;
  summary: string;
  bookingDetails?: {
    childCount: number;
    childNames: string[];
    parentName: string | null;
    parentPhone: string | null;
    requestedDates: string[];
  };
}

export interface TraceAnalysisExpectedStep {
  toolName: string;
  action?: string;
  description: string;
  occurrences: 'once' | 'per_child';
  optional?: boolean;
}

export interface TraceAnalysisStepStatus {
  step: TraceAnalysisExpectedStep;
  status: 'completed' | 'failed' | 'missing';
  actualCount: number;
  expectedCount: number;
  observationIds: string[];
  errors: string[];
}

export interface TraceAnalysisToolSequence {
  expectedSteps: TraceAnalysisExpectedStep[];
  stepStatuses: TraceAnalysisStepStatus[];
  completionRate: number;
}

export interface TraceAnalysisVerification {
  status: 'verified' | 'partial' | 'failed' | 'no_claims';
  verifications: Array<{
    claimed: { type: string; guid: string; claimedName?: string; claimedDate?: string; childName?: string; source: string };
    exists: boolean;
    mismatches: Array<{ field: string; claimed: string; actual: string }>;
    error?: string;
  }>;
  childVerifications: Array<{
    childName: string;
    patientRecordStatus: 'pass' | 'fail' | 'skipped';
    appointmentRecordStatus: 'pass' | 'fail' | 'skipped';
    details: any[];
  }>;
  summary: string;
  verifiedAt: string;
}

export interface TraceAnalysisTrace {
  traceId: string;
  timestamp: string;
  name: string;
}

export interface CurrentBookingPatient {
  patientGUID: string;
  name: string;
  dob: string | null;
  phone: string | null;
  email: string | null;
}

export interface CurrentBookingAppointment {
  appointmentGUID: string;
  dateTime: string;
  type: string | null;
  status: string | null;
  location: string | null;
}

export interface CurrentBookingChild {
  patientGUID: string;
  name: string;
  dob: string | null;
  appointments: CurrentBookingAppointment[];
}

export interface CurrentBookingData {
  parent: CurrentBookingPatient | null;
  children: CurrentBookingChild[];
  queriedAt: string;
  errors: string[];
}

// ============================================================================
// INTENT VS DELIVERY COMPARISON TYPES
// ============================================================================

export interface ChildComparison {
  childName: string;
  requested: {
    name: string;
    date: string | null;
  };
  delivered: {
    appointmentBooked: boolean;
    appointmentGUID: string | null;
    actualSlot: string | null;
    error: string | null;
  };
  status: 'match' | 'date_mismatch' | 'failed' | 'queued' | 'not_attempted';
  discrepancy: string | null;
}

export interface TransferComparison {
  requested: boolean;
  delivered: boolean;
  status: 'match' | 'mismatch';
}

export interface IntentDeliveryComparison {
  children: ChildComparison[];
  transfer: TransferComparison | null;
  overallStatus: 'match' | 'partial' | 'mismatch' | 'pending';
}

export interface TraceAnalysisResponse {
  sessionId: string;
  traces: TraceAnalysisTrace[];
  transcript: TraceAnalysisTranscriptTurn[];
  intent: TraceAnalysisIntent | null;
  toolSequence: TraceAnalysisToolSequence | null;
  verification?: TraceAnalysisVerification | null;
  callReport?: CallReport | null;
  currentBookingData?: CurrentBookingData | null;
  intentDeliveryComparison?: IntentDeliveryComparison | null;
  analyzedAt: string;
  cached: boolean;
}

export interface CallReportToolCall {
  name: string;
  action: string;
  timestamp: string;
  durationMs: number | null;
  inputSummary: string;
  outputSummary: string;
  status: 'success' | 'error' | 'partial';
  fullInput?: Record<string, any>;
  fullOutput?: Record<string, any>;
  statusMessage?: string;
  errorAnalysis?: string;
}

export interface CallReportBookingResult {
  childName: string | null;
  patientGUID: string | null;
  appointmentGUID: string | null;
  booked: boolean;
  queued: boolean;
  error: string | null;
  slot: string | null;
  scheduleViewGUID?: string;
  scheduleColumnGUID?: string;
  appointmentTypeGUID?: string;
}

export interface CallReport {
  callerName: string | null;
  callerPhone: string | null;
  callerDOB: string | null;
  callerEmail: string | null;
  parentPatientGUID: string | null;
  children: Array<{ name: string; dob: string | null }>;
  location: string | null;
  insurance: string | null;
  toolCalls: CallReportToolCall[];
  bookingResults: CallReportBookingResult[];
  bookingElapsedMs: number | null;
  bookingOverall: 'success' | 'partial' | 'failed' | 'none';
  discrepancies: Array<{ aspect: string; said: string; actual: string }>;
  issues: string[];
}

/**
 * Analyze a session by ID - returns traces, transcript, intent, tool sequence
 */
export async function getTraceAnalysis(
  sessionId: string,
  options?: { verify?: boolean; force?: boolean; configId?: number }
): Promise<TraceAnalysisResponse> {
  const params = new URLSearchParams();
  if (options?.verify) params.append('verify', 'true');
  if (options?.force) params.append('force', 'true');
  if (options?.configId) params.append('configId', options.configId.toString());

  const queryString = params.toString();
  const url = `/trace-analysis/${encodeURIComponent(sessionId)}${queryString ? `?${queryString}` : ''}`;
  const response = await get<TraceAnalysisResponse>(url, { timeout: API_CONFIG.AI_TIMEOUT });
  return response;
}

// ============================================================================
// MONITORING RESULTS API
// ============================================================================

export interface MonitoringResult {
  id: number;
  session_id: string;
  intent_type: string | null;
  intent_confidence: number | null;
  verification_status: string;
  verdict_summary: string | null;
  diagnostic_status: string | null;
  analyzed_at: string;
  caller_intent_summary?: string | null;
}

export interface MonitoringFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  intentType?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export async function getMonitoringResults(filters: MonitoringFilters): Promise<{ results: MonitoringResult[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.status) params.set('status', filters.status);
  if (filters.intentType) params.set('intentType', filters.intentType);
  if (filters.sessionId) params.set('sessionId', filters.sessionId);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  const response = await get<{ results: MonitoringResult[]; total: number }>(
    `/trace-analysis/monitoring-results?${params}`
  );
  return response;
}

/**
 * Get all cached slots for a specific tier
 * Returns full slot data with filtering/sorting capabilities
 * @param tier - Tier number (1, 2, or 3)
 */
export async function getTierSlots(tier: number): Promise<TierSlotsResponse> {
  const response = await get<TierSlotsResponse>(
    `/test-monitor/cache-health/tier/${tier}/slots`
  );
  return response;
}

// ============================================================================
// BOOKING CORRECTION API
// ============================================================================

export interface SlotAlternative {
  startTime: string;
  scheduleViewGUID: string;
  scheduleColumnGUID: string;
  minutesFromIntended: number;
}

export interface SlotCheckResult {
  slotAvailable: boolean;
  intendedSlot: SlotAlternative | null;
  alternatives: SlotAlternative[];
}

export interface CorrectionResult {
  success: boolean;
  appointmentGUID?: string;
  oldAppointmentGUID?: string;
  newAppointmentGUID?: string;
  message: string;
  error?: string;
}

export interface BookingCorrectionRecord {
  id: number;
  session_id: string;
  action: string;
  child_name: string | null;
  patient_guid: string | null;
  appointment_guid_before: string | null;
  appointment_guid_after: string | null;
  slot_before: string | null;
  slot_after: string | null;
  status: string;
  error: string | null;
  performed_at: string;
}

export async function checkSlotAvailability(
  sessionId: string,
  params: { patientGUID: string; intendedStartTime: string; date: string; scheduleViewGUID?: string }
): Promise<SlotCheckResult> {
  return post<SlotCheckResult>(`/trace-analysis/${encodeURIComponent(sessionId)}/correction/check-slot`, params);
}

export async function bookCorrection(
  sessionId: string,
  params: {
    patientGUID: string; startTime: string; scheduleViewGUID: string;
    scheduleColumnGUID: string; appointmentTypeGUID?: string; minutes?: number; childName?: string;
  }
): Promise<CorrectionResult> {
  return post<CorrectionResult>(`/trace-analysis/${encodeURIComponent(sessionId)}/correction/book`, params);
}

export async function cancelCorrection(
  sessionId: string,
  params: { appointmentGUID: string; childName?: string }
): Promise<CorrectionResult> {
  return post<CorrectionResult>(`/trace-analysis/${encodeURIComponent(sessionId)}/correction/cancel`, params);
}

export async function rescheduleCorrection(
  sessionId: string,
  params: {
    appointmentGUID: string; patientGUID: string; newStartTime: string;
    scheduleViewGUID: string; scheduleColumnGUID: string; childName?: string;
  }
): Promise<CorrectionResult> {
  return post<CorrectionResult>(`/trace-analysis/${encodeURIComponent(sessionId)}/correction/reschedule`, params);
}

export async function getCorrectionHistory(sessionId: string): Promise<{ corrections: BookingCorrectionRecord[] }> {
  return get<{ corrections: BookingCorrectionRecord[] }>(`/trace-analysis/${encodeURIComponent(sessionId)}/correction/history`);
}

// ── Booking Investigation ───────────────────────────────────────────────────

export interface InvestigationToolCall {
  index: number;
  name: string;
  action: string;
  level: string;
  isError: boolean;
  statusMessage: string | null;
  input: Record<string, any>;
  output: Record<string, any>;
  timestamp: string;
}

export interface PayloadFinding {
  traceId: string;
  timestamp: string;
  apptIds: string[];
  apptGuids: string[];
  patientIds: string[];
  childNames: string[];
  callerName: string | null;
  parentPatientId: string | null;
  payloadJson: any;
}

export type InvestigationClassification = 'CLEAN' | 'LEGITIMATE' | 'FALSE_POSITIVE' | 'FALSE_POSITIVE_WITH_TOOL' | 'INCONCLUSIVE';

export interface InvestigationResult {
  sessionId: string;
  classification: InvestigationClassification;
  configName: string;
  session: {
    configId: number;
    hasSuccessfulBooking: number;
    hasTransfer: number;
    hasOrder: number;
    traceCount: number;
    errorCount: number;
    firstTraceAt: string;
    lastTraceAt: string;
    userId: string | null;
  };
  toolCalls: InvestigationToolCall[];
  bookingToolCallCount: number;
  payloadFindings: PayloadFinding[];
  allExtractedIds: string[];
  placeholderIds: string[];
  callerName: string | null;
  childNames: string[];
  phone: string | null;
}

/**
 * Investigate a session for false positive booking detection.
 */
export async function investigateSessionBooking(sessionId: string): Promise<InvestigationResult> {
  const response = await get<TestMonitorApiResponse<InvestigationResult>>(
    `/trace-analysis/${encodeURIComponent(sessionId)}/investigate`
  );
  return response.data;
}

/**
 * Get a full markdown investigation report for a session.
 */
export async function getInvestigationReport(sessionId: string): Promise<{ markdown: string; classification: string; sessionId: string }> {
  const response = await get<TestMonitorApiResponse<{ markdown: string; classification: string; sessionId: string }>>(
    `/trace-analysis/${encodeURIComponent(sessionId)}/investigate/report`
  );
  return response.data;
}

// ── Call Lookup ────────────────────────────────────────────────

export interface CallLookupResult {
  found: boolean;
  searchId: string;
  idType: string | null;
  traceId: string | null;
  langfuseSessionId: string | null;
  formattedSessionId: string | null;
  configId: number | null;
  configName: string | null;
  timestamp: string | null;
  phone: string | null;
  callSummary: Record<string, unknown> | null;
  booking: Record<string, unknown> | null;
  toolCalls: Array<Record<string, unknown>>;
  sessionStats: Record<string, unknown> | null;
  allSessionIds: string[];
}

/**
 * Lookup a call by any ID (location_config_id, trace ID, session ID, phone, etc.)
 */
export async function callLookup(id: string, options?: { configs?: string; days?: number }): Promise<CallLookupResult> {
  const params = new URLSearchParams();
  if (options?.configs) params.append('configs', options.configs);
  if (options?.days) params.append('days', String(options.days));
  const qs = params.toString();
  const response = await get<TestMonitorApiResponse<CallLookupResult>>(
    `/trace-analysis/call-lookup/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`
  );
  return response.data;
}

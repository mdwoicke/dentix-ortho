/**
 * Test Monitor API Service
 * API calls for Flowise test monitoring dashboard
 */

import { get, put, post } from './client';
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
} from '../../types/testMonitor.types';

// Base API URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
  | { type: 'error'; data: { error: string } };

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
export async function getDeployedVersions(): Promise<Record<string, number>> {
  const response = await get<TestMonitorApiResponse<Record<string, number>>>(
    '/test-monitor/prompts/deployed'
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
  PromptContext,
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

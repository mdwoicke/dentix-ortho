/**
 * Sandbox API Service
 * API calls for A/B Testing Sandbox management and comparison testing
 */

import { get, put, post } from './client';
import type {
  Sandbox,
  SandboxFile,
  SandboxFileHistory,
  SandboxApiResponse,
  SaveFileResponse,
  CopyFromProductionResponse,
  ResetSandboxResponse,
  RollbackResponse,
  AvailableGoalTest,
  ComparisonRequest,
  ComparisonResult,
  ComparisonRun,
  ComparisonProgress,
  TestEndpointResponse,
  StartComparisonResponse,
} from '../../types/sandbox.types';

// Base API URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ============================================================================
// SANDBOX MANAGEMENT API
// ============================================================================

/**
 * Get all sandboxes
 */
export async function getSandboxes(): Promise<Sandbox[]> {
  const response = await get<SandboxApiResponse<Sandbox[]>>(
    '/test-monitor/sandboxes'
  );
  return response.data;
}

/**
 * Get a single sandbox by ID
 */
export async function getSandbox(sandboxId: string): Promise<Sandbox> {
  const response = await get<SandboxApiResponse<Sandbox>>(
    `/test-monitor/sandboxes/${sandboxId}`
  );
  return response.data;
}

/**
 * Update sandbox configuration
 */
export async function updateSandbox(
  sandboxId: string,
  updates: Partial<{
    name: string;
    description: string;
    flowiseEndpoint: string;
    flowiseApiKey: string;
    langfuseHost: string;
    langfusePublicKey: string;
    langfuseSecretKey: string;
  }>
): Promise<Sandbox> {
  const response = await put<SandboxApiResponse<Sandbox>>(
    `/test-monitor/sandboxes/${sandboxId}`,
    updates
  );
  return response.data;
}

// ============================================================================
// SANDBOX FILE MANAGEMENT API
// ============================================================================

/**
 * Get all files for a sandbox
 */
export async function getSandboxFiles(sandboxId: string): Promise<SandboxFile[]> {
  const response = await get<SandboxApiResponse<SandboxFile[]>>(
    `/test-monitor/sandboxes/${sandboxId}/files`
  );
  return response.data;
}

/**
 * Get a specific sandbox file
 */
export async function getSandboxFile(
  sandboxId: string,
  fileKey: string
): Promise<SandboxFile> {
  const response = await get<SandboxApiResponse<SandboxFile>>(
    `/test-monitor/sandboxes/${sandboxId}/files/${fileKey}`
  );
  return response.data;
}

/**
 * Get version history for a sandbox file
 */
export async function getSandboxFileHistory(
  sandboxId: string,
  fileKey: string,
  limit: number = 20
): Promise<SandboxFileHistory[]> {
  const response = await get<SandboxApiResponse<SandboxFileHistory[]>>(
    `/test-monitor/sandboxes/${sandboxId}/files/${fileKey}/history?limit=${limit}`
  );
  return response.data;
}

/**
 * Save sandbox file (creates new version)
 */
export async function saveSandboxFile(
  sandboxId: string,
  fileKey: string,
  content: string,
  changeDescription: string
): Promise<SaveFileResponse> {
  const response = await post<SandboxApiResponse<SaveFileResponse>>(
    `/test-monitor/sandboxes/${sandboxId}/files/${fileKey}/save`,
    { content, changeDescription }
  );
  return response.data;
}

/**
 * Copy a file from production to sandbox
 */
export async function copySandboxFileFromProduction(
  sandboxId: string,
  fileKey: string
): Promise<CopyFromProductionResponse> {
  const response = await post<SandboxApiResponse<CopyFromProductionResponse>>(
    `/test-monitor/sandboxes/${sandboxId}/files/${fileKey}/copy`,
    {}
  );
  return response.data;
}

/**
 * Rollback a sandbox file to a previous version
 */
export async function rollbackSandboxFile(
  sandboxId: string,
  fileKey: string,
  targetVersion: number
): Promise<RollbackResponse> {
  const response = await post<SandboxApiResponse<RollbackResponse>>(
    `/test-monitor/sandboxes/${sandboxId}/files/${fileKey}/rollback`,
    { targetVersion }
  );
  return response.data;
}

/**
 * Reset all sandbox files to production versions
 */
export async function resetSandbox(sandboxId: string): Promise<ResetSandboxResponse> {
  const response = await post<SandboxApiResponse<ResetSandboxResponse>>(
    `/test-monitor/sandboxes/${sandboxId}/reset`,
    {}
  );
  return response.data;
}

/**
 * Copy all files from production to sandbox
 */
export async function copySandboxAllFromProduction(
  sandboxId: string
): Promise<ResetSandboxResponse> {
  const response = await post<SandboxApiResponse<ResetSandboxResponse>>(
    `/test-monitor/sandboxes/${sandboxId}/copy-all`,
    {}
  );
  return response.data;
}

// ============================================================================
// COMPARISON API
// ============================================================================

/**
 * Get available goal tests for comparison
 */
export async function getComparisonTests(): Promise<AvailableGoalTest[]> {
  const response = await get<SandboxApiResponse<AvailableGoalTest[]>>(
    '/test-monitor/sandboxes/comparison/tests'
  );
  return response.data;
}

/**
 * Start a comparison run (async - returns immediately, runs in background)
 * Poll getComparisonRun() for status updates
 */
export async function startComparison(
  request: ComparisonRequest
): Promise<StartComparisonResponse> {
  const response = await post<SandboxApiResponse<StartComparisonResponse>>(
    '/test-monitor/sandboxes/comparison/run',
    request
  );
  return response.data;
}

/**
 * Get a comparison run by ID
 */
export async function getComparisonRun(comparisonId: string): Promise<ComparisonRun> {
  const response = await get<SandboxApiResponse<ComparisonRun>>(
    `/test-monitor/sandboxes/comparison/${comparisonId}`
  );
  return response.data;
}

/**
 * Get comparison run history
 */
export async function getComparisonHistory(limit: number = 20): Promise<ComparisonRun[]> {
  const response = await get<SandboxApiResponse<ComparisonRun[]>>(
    `/test-monitor/sandboxes/comparison?limit=${limit}`
  );
  return response.data;
}

// ============================================================================
// SSE STREAMING FOR COMPARISON PROGRESS
// ============================================================================

/**
 * Comparison SSE Event types
 */
export type ComparisonStreamEvent =
  | { type: 'comparison-started'; data: { comparisonId: string } }
  | { type: 'progress-update'; data: ComparisonProgress }
  | { type: 'comparison-completed'; data: ComparisonResult }
  | { type: 'comparison-error'; data: { error: string } }
  | { type: 'complete'; data: { status: string } }
  | { type: 'error'; data: { error: string } };

/**
 * Subscribe to real-time comparison progress updates via SSE
 * Note: This is a placeholder - actual SSE endpoint would need to be implemented
 */
export function subscribeToComparison(
  comparisonId: string,
  onEvent: (event: ComparisonStreamEvent) => void,
  onError?: (error: Event) => void
): EventSource {
  const url = `${API_BASE_URL}/test-monitor/sandboxes/comparison/${comparisonId}/stream`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener('comparison-started', (e) => {
    onEvent({ type: 'comparison-started', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('progress-update', (e) => {
    onEvent({ type: 'progress-update', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('comparison-completed', (e) => {
    onEvent({ type: 'comparison-completed', data: JSON.parse(e.data) });
    eventSource.close();
  });

  eventSource.addEventListener('comparison-error', (e) => {
    onEvent({ type: 'comparison-error', data: JSON.parse(e.data) });
  });

  eventSource.addEventListener('complete', (e) => {
    onEvent({ type: 'complete', data: JSON.parse(e.data) });
    eventSource.close();
  });

  eventSource.addEventListener('error', (e) => {
    if (onError) {
      onError(e);
    }
  });

  return eventSource;
}

// ============================================================================
// ENDPOINT TESTING API
// ============================================================================

/**
 * Test a Flowise endpoint connection
 */
export async function testEndpoint(
  endpoint: string
): Promise<TestEndpointResponse> {
  const response = await post<SandboxApiResponse<TestEndpointResponse>>(
    '/test-monitor/sandboxes/test-endpoint',
    { endpoint }
  );
  return response.data;
}

/**
 * Test a LangFuse connection
 */
export async function testLangfuseConnection(
  host: string,
  publicKey: string,
  secretKey: string
): Promise<TestEndpointResponse> {
  const response = await post<SandboxApiResponse<TestEndpointResponse>>(
    '/test-monitor/sandboxes/test-langfuse',
    { host, publicKey, secretKey }
  );
  return response.data;
}

/**
 * Test a Flowise endpoint connection
 */
export async function testFlowiseConnection(
  endpoint: string,
  apiKey?: string
): Promise<TestEndpointResponse> {
  const response = await post<SandboxApiResponse<TestEndpointResponse>>(
    '/test-monitor/sandboxes/test-flowise',
    { endpoint, apiKey }
  );
  return response.data;
}

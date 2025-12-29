/**
 * A/B Testing Sandbox Types
 * Types for sandbox management and three-way comparison testing
 * @module sandbox.types
 */

// ============================================================================
// SANDBOX CONFIGURATION TYPES
// ============================================================================

/**
 * Sandbox configuration record
 */
export interface Sandbox {
  id: number;
  sandboxId: 'sandbox_a' | 'sandbox_b';
  name: string;
  description: string | null;
  flowiseEndpoint: string | null;
  flowiseApiKey: string | null;
  langfuseHost: string | null;
  langfusePublicKey: string | null;
  langfuseSecretKey: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sandbox file content and metadata
 */
export interface SandboxFile {
  id: number;
  sandboxId: string;
  fileKey: 'system_prompt' | 'patient_tool' | 'scheduling_tool';
  fileType: 'markdown' | 'json';
  displayName: string;
  content: string;
  version: number;
  baseVersion: number | null;
  changeDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sandbox file version history entry
 */
export interface SandboxFileHistory {
  id: number;
  sandboxId: string;
  fileKey: string;
  version: number;
  content: string;
  changeDescription: string | null;
  createdAt: string;
}

// ============================================================================
// COMPARISON TYPES
// ============================================================================

/**
 * Goal result from a test run
 */
export interface GoalResult {
  goalId: string;
  passed: boolean;
  message: string;
}

/**
 * Constraint violation from a test run
 */
export interface ConstraintViolation {
  type: string;
  description: string;
  turnNumber?: number;
  severity?: string;
  context?: string;
}

/**
 * Issue from a test run
 */
export interface TestIssue {
  type: string;
  description: string;
  turnNumber?: number;
  severity?: string;
  context?: string;
}

/**
 * Transcript entry from a conversation
 */
export interface TranscriptEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  responseTimeMs?: number;
  stepId?: string;
}

/**
 * Individual endpoint test result (basic)
 */
export interface EndpointTestResult {
  passed: boolean;
  turnCount: number;
  durationMs: number;
}

/**
 * Detailed endpoint test result (full data)
 */
export interface DetailedEndpointResult extends EndpointTestResult {
  goalResults?: GoalResult[];
  constraintViolations?: (string | ConstraintViolation)[];
  summary?: string;
  transcript?: TranscriptEntry[];
  issues?: (string | TestIssue)[];
}

/**
 * Single test comparison across endpoints
 */
export interface TestComparisonResult {
  testId: string;
  production: EndpointTestResult | null;
  sandboxA: EndpointTestResult | null;
  sandboxB: EndpointTestResult | null;
}

/**
 * Comparison summary with pass rates and changes
 */
export interface ComparisonSummary {
  productionPassRate: number;
  sandboxAPassRate: number;
  sandboxBPassRate: number;
  totalTests: number;
  improvements: Array<{ testId: string; from: string; to: string }>;
  regressions: Array<{ testId: string; from: string; to: string }>;
}

/**
 * Full comparison run result
 */
export interface ComparisonResult {
  comparisonId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  testResults: TestComparisonResult[];
  summary: ComparisonSummary;
  message?: string;
  // Raw results for detail panel (populated from ComparisonRun)
  productionResults?: Record<string, any> | null;
  sandboxAResults?: Record<string, any> | null;
  sandboxBResults?: Record<string, any> | null;
}

/**
 * Comparison run record (from database)
 */
export interface ComparisonRun {
  id: number;
  comparisonId: string;
  name: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  testIds: string[];
  productionResults: Record<string, any> | null;
  sandboxAResults: Record<string, any> | null;
  sandboxBResults: Record<string, any> | null;
  summary: ComparisonSummary | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/**
 * Request to start a comparison run
 */
export interface ComparisonRequest {
  testIds: string[];
  runProduction: boolean;
  runSandboxA: boolean;
  runSandboxB: boolean;
  name?: string;
}

/**
 * Response from starting a comparison (async - returns immediately)
 */
export interface StartComparisonResponse {
  comparisonId: string;
  status: 'running';
  message: string;
}

/**
 * Progress update during comparison
 */
export interface ComparisonProgress {
  stage: 'production' | 'sandboxA' | 'sandboxB';
  testId: string;
  testIndex: number;
  totalTests: number;
  status: 'running' | 'completed' | 'failed';
}

// ============================================================================
// AVAILABLE TEST TYPES
// ============================================================================

/**
 * Available goal test for selection
 */
export interface AvailableGoalTest {
  id: string;
  name: string;
  category: string;
  source: 'built-in' | 'database';
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * Selected sandbox in the UI
 */
export type SelectedSandbox = 'sandbox_a' | 'sandbox_b';

/**
 * File keys for the three Flowise files
 */
export type SandboxFileKey = 'system_prompt' | 'patient_tool' | 'scheduling_tool';

/**
 * File display configuration
 */
export const SANDBOX_FILE_CONFIG: Record<SandboxFileKey, { label: string; type: 'markdown' | 'json' }> = {
  system_prompt: { label: 'System Prompt', type: 'markdown' },
  patient_tool: { label: 'Patient Tool', type: 'json' },
  scheduling_tool: { label: 'Scheduling Tool', type: 'json' },
};

/**
 * Sandbox display names
 */
export const SANDBOX_NAMES: Record<SelectedSandbox, string> = {
  sandbox_a: 'Sandbox A',
  sandbox_b: 'Sandbox B',
};

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Generic API response wrapper
 */
export interface SandboxApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Save file response
 */
export interface SaveFileResponse {
  newVersion: number;
  message: string;
}

/**
 * Copy from production response
 */
export interface CopyFromProductionResponse {
  file: SandboxFile;
  message: string;
}

/**
 * Reset sandbox response
 */
export interface ResetSandboxResponse {
  message: string;
  filesReset: number;
}

/**
 * Rollback response
 */
export interface RollbackResponse {
  newVersion: number;
  message: string;
}

/**
 * Test endpoint response
 */
export interface TestEndpointResponse {
  success: boolean;
  message: string;
  responseTimeMs?: number;
}

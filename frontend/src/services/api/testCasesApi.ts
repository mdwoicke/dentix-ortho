/**
 * Test Cases API Service
 * API calls for test case management (CRUD operations)
 */

import { get, post, put, del } from './client';
import type {
  TestCaseRecord,
  TestCaseListResponse,
  TestCaseValidationError,
  TestCasePresets,
  TestMonitorApiResponse,
} from '../../types/testMonitor.types';

// ============================================================================
// TEST CASE CRUD OPERATIONS
// ============================================================================

/**
 * Get all test cases with optional filtering
 */
export async function getTestCases(options?: {
  category?: string;
  includeArchived?: boolean;
}): Promise<TestCaseListResponse> {
  const params = new URLSearchParams();
  if (options?.category) params.set('category', options.category);
  if (options?.includeArchived) params.set('includeArchived', 'true');

  const queryString = params.toString();
  const url = `/test-monitor/test-cases${queryString ? `?${queryString}` : ''}`;

  const response = await get<TestMonitorApiResponse<TestCaseListResponse>>(url);
  return response.data;
}

/**
 * Get a single test case by ID
 */
export async function getTestCase(caseId: string): Promise<TestCaseRecord> {
  const response = await get<TestMonitorApiResponse<TestCaseRecord>>(
    `/test-monitor/test-cases/${caseId}`
  );
  return response.data;
}

/**
 * Create a new test case
 */
export async function createTestCase(
  testCase: Omit<TestCaseRecord, 'id' | 'version' | 'createdAt' | 'updatedAt'>
): Promise<TestCaseRecord> {
  const response = await post<TestMonitorApiResponse<TestCaseRecord>>(
    '/test-monitor/test-cases',
    testCase
  );
  return response.data;
}

/**
 * Update an existing test case
 */
export async function updateTestCase(
  caseId: string,
  updates: Partial<Omit<TestCaseRecord, 'id' | 'caseId' | 'createdAt'>>
): Promise<TestCaseRecord> {
  const response = await put<TestMonitorApiResponse<TestCaseRecord>>(
    `/test-monitor/test-cases/${caseId}`,
    updates
  );
  return response.data;
}

/**
 * Delete (archive) a test case
 */
export async function deleteTestCase(
  caseId: string,
  permanent = false
): Promise<{ message: string }> {
  const url = permanent
    ? `/test-monitor/test-cases/${caseId}?permanent=true`
    : `/test-monitor/test-cases/${caseId}`;

  const response = await del<TestMonitorApiResponse<{ message: string }>>(url);
  return response.data;
}

/**
 * Clone a test case
 */
export async function cloneTestCase(
  caseId: string,
  newCaseId?: string
): Promise<TestCaseRecord> {
  const response = await post<TestMonitorApiResponse<TestCaseRecord>>(
    `/test-monitor/test-cases/${caseId}/clone`,
    { newCaseId }
  );
  return response.data;
}

// ============================================================================
// VALIDATION AND SYNC
// ============================================================================

/**
 * Validate a test case without saving
 */
export async function validateTestCase(
  testCase: Partial<TestCaseRecord>
): Promise<{ valid: boolean; errors: TestCaseValidationError[] }> {
  const response = await post<
    TestMonitorApiResponse<{ valid: boolean; errors: TestCaseValidationError[] }>
  >('/test-monitor/test-cases/validate', testCase);
  return response.data;
}

/**
 * Sync test cases to TypeScript files
 */
export async function syncTestCasesToTypeScript(): Promise<{
  message: string;
  filesWritten: string[];
}> {
  const response = await post<
    TestMonitorApiResponse<{ message: string; filesWritten: string[] }>
  >('/test-monitor/test-cases/sync', {});
  return response.data;
}

// ============================================================================
// PRESETS
// ============================================================================

/**
 * Get semantic and negative expectation presets
 */
export async function getTestCasePresets(): Promise<TestCasePresets> {
  const response = await get<TestMonitorApiResponse<TestCasePresets>>(
    '/test-monitor/test-cases/presets'
  );
  return response.data;
}

/**
 * App Settings API Service
 * API calls for application settings management
 */

import { get, put, post, del } from './client';
import type {
  AppSettings,
  UpdateAppSettingsRequest,
  UpdateAppSettingsResponse,
  TestFlowiseResponse,
  TestLangfuseResponse,
  LangfuseConfig,
  FlowiseConfigProfile,
  FlowiseConfigRequest,
  LangfuseConfigProfile,
  LangfuseConfigRequest,
  ConfigTestResult,
  TestEnvironmentPreset,
  TestEnvironmentPresetRequest,
  TestEnvironmentPresetWithNames,
} from '../../types/appSettings.types';

// ============================================================================
// APP SETTINGS API
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Get all application settings
 */
export async function getAppSettings(): Promise<AppSettings> {
  const response = await get<ApiResponse<AppSettings>>(
    '/test-monitor/app-settings'
  );
  return response.data;
}

/**
 * Update application settings
 */
export async function updateAppSettings(
  updates: UpdateAppSettingsRequest
): Promise<UpdateAppSettingsResponse> {
  const response = await put<ApiResponse<UpdateAppSettingsResponse>>(
    '/test-monitor/app-settings',
    updates
  );
  return response.data;
}

/**
 * Test the production Flowise connection using saved settings
 */
export async function testProductionFlowiseConnection(): Promise<TestFlowiseResponse> {
  const response = await post<ApiResponse<TestFlowiseResponse>>(
    '/test-monitor/app-settings/test-flowise',
    {}
  );
  return response.data;
}

/**
 * Test the Langfuse connection using saved settings
 */
export async function testLangfuseConnection(): Promise<TestLangfuseResponse> {
  const response = await post<ApiResponse<TestLangfuseResponse>>(
    '/test-monitor/app-settings/test-langfuse',
    {}
  );
  return response.data;
}

/**
 * Get Langfuse configuration (unmasked) for internal use
 */
export async function getLangfuseConfig(): Promise<LangfuseConfig> {
  const response = await get<ApiResponse<LangfuseConfig>>(
    '/test-monitor/app-settings/langfuse-config'
  );
  return response.data;
}

// ============================================================================
// FLOWISE CONFIGURATION PROFILES API
// ============================================================================

/**
 * Get all Flowise configuration profiles
 */
export async function getFlowiseConfigs(): Promise<FlowiseConfigProfile[]> {
  const response = await get<ApiResponse<FlowiseConfigProfile[]>>(
    '/test-monitor/flowise-configs'
  );
  return response.data;
}

/**
 * Get active (default) Flowise configuration
 */
export async function getActiveFlowiseConfig(): Promise<FlowiseConfigProfile | null> {
  const response = await get<ApiResponse<FlowiseConfigProfile | null>>(
    '/test-monitor/flowise-configs/active'
  );
  return response.data;
}

/**
 * Create a new Flowise configuration
 */
export async function createFlowiseConfig(
  config: FlowiseConfigRequest
): Promise<FlowiseConfigProfile> {
  const response = await post<ApiResponse<FlowiseConfigProfile>>(
    '/test-monitor/flowise-configs',
    config
  );
  return response.data;
}

/**
 * Update a Flowise configuration
 */
export async function updateFlowiseConfig(
  id: number,
  config: FlowiseConfigRequest
): Promise<FlowiseConfigProfile> {
  const response = await put<ApiResponse<FlowiseConfigProfile>>(
    `/test-monitor/flowise-configs/${id}`,
    config
  );
  return response.data;
}

/**
 * Delete a Flowise configuration
 */
export async function deleteFlowiseConfig(id: number): Promise<void> {
  await del<ApiResponse<{ message: string }>>(
    `/test-monitor/flowise-configs/${id}`
  );
}

/**
 * Set a Flowise configuration as default
 */
export async function setFlowiseConfigDefault(id: number): Promise<void> {
  await post<ApiResponse<{ message: string }>>(
    `/test-monitor/flowise-configs/${id}/set-default`,
    {}
  );
}

/**
 * Test a Flowise configuration connection
 */
export async function testFlowiseConfig(id: number): Promise<ConfigTestResult> {
  const response = await post<ApiResponse<ConfigTestResult>>(
    `/test-monitor/flowise-configs/${id}/test`,
    {}
  );
  return response.data;
}

// ============================================================================
// LANGFUSE CONFIGURATION PROFILES API
// ============================================================================

/**
 * Get all Langfuse configuration profiles
 */
export async function getLangfuseConfigs(): Promise<LangfuseConfigProfile[]> {
  const response = await get<ApiResponse<LangfuseConfigProfile[]>>(
    '/test-monitor/langfuse-configs'
  );
  return response.data;
}

/**
 * Get active (default) Langfuse configuration
 */
export async function getActiveLangfuseConfig(): Promise<LangfuseConfigProfile | null> {
  const response = await get<ApiResponse<LangfuseConfigProfile | null>>(
    '/test-monitor/langfuse-configs/active'
  );
  return response.data;
}

/**
 * Create a new Langfuse configuration
 */
export async function createLangfuseConfig(
  config: LangfuseConfigRequest
): Promise<LangfuseConfigProfile> {
  const response = await post<ApiResponse<LangfuseConfigProfile>>(
    '/test-monitor/langfuse-configs',
    config
  );
  return response.data;
}

/**
 * Update a Langfuse configuration
 */
export async function updateLangfuseConfig(
  id: number,
  config: LangfuseConfigRequest
): Promise<LangfuseConfigProfile> {
  const response = await put<ApiResponse<LangfuseConfigProfile>>(
    `/test-monitor/langfuse-configs/${id}`,
    config
  );
  return response.data;
}

/**
 * Delete a Langfuse configuration
 */
export async function deleteLangfuseConfig(id: number): Promise<void> {
  await del<ApiResponse<{ message: string }>>(
    `/test-monitor/langfuse-configs/${id}`
  );
}

/**
 * Set a Langfuse configuration as default
 */
export async function setLangfuseConfigDefault(id: number): Promise<void> {
  await post<ApiResponse<{ message: string }>>(
    `/test-monitor/langfuse-configs/${id}/set-default`,
    {}
  );
}

/**
 * Test a Langfuse configuration connection
 */
export async function testLangfuseConfigConnection(id: number): Promise<ConfigTestResult> {
  const response = await post<ApiResponse<ConfigTestResult>>(
    `/test-monitor/langfuse-configs/${id}/test`,
    {}
  );
  return response.data;
}

// ============================================================================
// TEST ENVIRONMENT PRESETS API
// ============================================================================

/**
 * Get all test environment presets
 */
export async function getTestEnvironmentPresets(): Promise<TestEnvironmentPresetWithNames[]> {
  const response = await get<ApiResponse<TestEnvironmentPresetWithNames[]>>(
    '/test-monitor/environment-presets'
  );
  return response.data;
}

/**
 * Get active (default) test environment preset
 */
export async function getActiveTestEnvironmentPreset(): Promise<TestEnvironmentPresetWithNames | null> {
  const response = await get<ApiResponse<TestEnvironmentPresetWithNames | null>>(
    '/test-monitor/environment-presets/active'
  );
  return response.data;
}

/**
 * Create a new test environment preset
 */
export async function createTestEnvironmentPreset(
  preset: TestEnvironmentPresetRequest
): Promise<TestEnvironmentPreset> {
  const response = await post<ApiResponse<TestEnvironmentPreset>>(
    '/test-monitor/environment-presets',
    preset
  );
  return response.data;
}

/**
 * Update a test environment preset
 */
export async function updateTestEnvironmentPreset(
  id: number,
  preset: TestEnvironmentPresetRequest
): Promise<TestEnvironmentPreset> {
  const response = await put<ApiResponse<TestEnvironmentPreset>>(
    `/test-monitor/environment-presets/${id}`,
    preset
  );
  return response.data;
}

/**
 * Delete a test environment preset
 */
export async function deleteTestEnvironmentPreset(id: number): Promise<void> {
  await del<ApiResponse<{ message: string }>>(
    `/test-monitor/environment-presets/${id}`
  );
}

/**
 * Set a test environment preset as default
 */
export async function setTestEnvironmentPresetDefault(id: number): Promise<void> {
  await post<ApiResponse<{ message: string }>>(
    `/test-monitor/environment-presets/${id}/set-default`,
    {}
  );
}

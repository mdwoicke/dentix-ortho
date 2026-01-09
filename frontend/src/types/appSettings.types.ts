/**
 * Application Settings Types
 * Types for global application configuration
 */

/**
 * Individual setting value with metadata
 */
export interface AppSettingValue {
  value: string;
  hasValue: boolean;
  type: 'string' | 'url' | 'secret' | 'number' | 'boolean';
  description: string;
  updatedAt: string | null;
  isDefault?: boolean;
}

/**
 * All application settings
 */
export interface AppSettings {
  flowiseProductionUrl: AppSettingValue;
  flowiseProductionApiKey: AppSettingValue;
  langfuseHost: AppSettingValue;
  langfusePublicKey: AppSettingValue;
  langfuseSecretKey: AppSettingValue;
  langfuseProjectId: AppSettingValue;
  [key: string]: AppSettingValue;
}

/**
 * Request to update settings
 */
export interface UpdateAppSettingsRequest {
  flowiseProductionUrl?: string;
  flowiseProductionApiKey?: string;
  langfuseHost?: string;
  langfusePublicKey?: string;
  langfuseSecretKey?: string;
  langfuseProjectId?: string;
  [key: string]: string | undefined;
}

/**
 * Response from updating settings
 */
export interface UpdateAppSettingsResponse {
  updatedKeys: string[];
  message: string;
}

/**
 * Test Flowise connection response
 */
export interface TestFlowiseResponse {
  success: boolean;
  message: string;
  responseTimeMs?: number;
  endpoint?: string;
}

/**
 * Test Langfuse connection response
 */
export interface TestLangfuseResponse {
  success: boolean;
  message: string;
  responseTimeMs?: number;
  host?: string;
}

/**
 * Langfuse configuration (unmasked, for internal use)
 */
export interface LangfuseConfig {
  host: string;
  publicKey: string;
  secretKey: string;
  projectId?: string;
}

// ============================================================================
// CONFIGURATION PROFILES
// ============================================================================

/**
 * Flowise configuration profile
 */
export interface FlowiseConfigProfile {
  id: number;
  name: string;
  url: string;
  apiKey?: string;
  hasApiKey: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to create/update Flowise configuration
 */
export interface FlowiseConfigRequest {
  name: string;
  url: string;
  apiKey?: string;
  isDefault?: boolean;
}

/**
 * Langfuse configuration profile
 */
export interface LangfuseConfigProfile {
  id: number;
  name: string;
  host: string;
  publicKey: string;
  secretKey?: string;
  hasSecretKey: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to create/update Langfuse configuration
 */
export interface LangfuseConfigRequest {
  name: string;
  host: string;
  publicKey: string;
  secretKey?: string;
  isDefault?: boolean;
}

/**
 * Connection test result
 */
export interface ConfigTestResult {
  success: boolean;
  message: string;
  responseTimeMs?: number;
}

/**
 * Debug Flow Types
 * Type definitions for the layer-by-layer debugging framework
 */

// ============================================================================
// ENVIRONMENT TYPES
// ============================================================================

export type Environment = 'production' | 'sandbox_a' | 'sandbox_b';
export type Layer = 'cloud9' | 'nodered' | 'flowise' | 'e2e';

export interface Cloud9Credentials {
  clientId: string;
  userName: string;
  password: string;
  vendorUserName: string;
}

export interface EnvironmentConfig {
  name: Environment;
  displayName: string;

  // Flowise endpoint (Layer 4)
  flowiseEndpoint?: string;
  flowiseApiKey?: string;

  // Node-RED base URL (Layer 2)
  noderedBase: string;
  noderedAuth: string;  // Base64 encoded auth

  // Cloud9 API (Layer 1)
  cloud9Endpoint: string;
  cloud9Credentials: Cloud9Credentials;

  // Default GUIDs for testing
  defaults: {
    locationGUID?: string;
    providerGUID?: string;
    appointmentTypeGUID?: string;
    scheduleViewGUID?: string;
    scheduleColumnGUID?: string;
  };
}

// ============================================================================
// TEST RESULT TYPES
// ============================================================================

export interface LayerTestResult {
  layer: Layer;
  testName: string;
  passed: boolean;
  durationMs: number;
  request: any;
  response: any;
  error?: string;
  details?: string;
}

export interface LayerSummary {
  layer: Layer;
  passed: number;
  failed: number;
  skipped: number;
  results: LayerTestResult[];
}

export interface DebugReport {
  environment: Environment;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;

  // First failure info
  firstFailurePoint?: {
    layer: Layer;
    testName: string;
    error: string;
  };

  // Layer summaries
  summary: Record<Layer, { passed: number; failed: number; skipped: number }>;
  layerResults: Record<Layer, LayerTestResult[]>;

  // Diagnosis
  recommendation?: string;
  rootCause?: string;
}

// ============================================================================
// LAYER-SPECIFIC TYPES
// ============================================================================

// Cloud9 Layer
export interface Cloud9TestCase {
  name: string;
  procedure: string;
  params: Record<string, any>;
  expectedFields?: string[];
  expectRecords?: boolean;
}

// Node-RED Layer
export interface NodeRedTestCase {
  name: string;
  endpoint: string;
  payload: Record<string, any>;
  expectedFields?: string[];
  expectSuccess?: boolean;
}

// Flowise Layer
export interface FlowiseToolTestCase {
  name: string;
  toolKey: 'scheduling_tool' | 'patient_tool';
  simulatedParams: Record<string, any>;
  expectedBehavior?: string;
}

// E2E Layer
export interface E2ETestCase {
  name: string;
  goalTestId: string;
  maxTurns?: number;
  expectSuccess?: boolean;
}

// ============================================================================
// CLI OPTIONS
// ============================================================================

export interface DebugFlowOptions {
  environment: Environment;
  layers?: Layer[];
  testCase?: string;
  verbose?: boolean;
  stopOnFirstFailure?: boolean;
}

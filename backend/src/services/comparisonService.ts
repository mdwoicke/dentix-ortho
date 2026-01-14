/**
 * Comparison Service
 * Wraps the test-agent's SandboxComparisonService for use in the backend
 */

import path from 'path';

// Import from test-agent's compiled code
const testAgentPath = path.resolve(__dirname, '../../../test-agent/dist/test-agent/src');
const testAgentRoot = path.resolve(__dirname, '../../../test-agent');
const { Database } = require(`${testAgentPath}/storage/database`);
const { SandboxService } = require(`${testAgentPath}/services/sandbox/sandbox-service`);
const { SandboxComparisonService } = require(`${testAgentPath}/services/sandbox/comparison-service`);

export interface ComparisonRequest {
  testIds: string[];
  runProduction: boolean;
  runSandboxA: boolean;
  runSandboxB: boolean;
  name?: string;
}

export interface TestComparisonResult {
  testId: string;
  production: { passed: boolean; turnCount: number; durationMs: number; ranAt?: string } | null;
  sandboxA: { passed: boolean; turnCount: number; durationMs: number; ranAt?: string } | null;
  sandboxB: { passed: boolean; turnCount: number; durationMs: number; ranAt?: string } | null;
}

export interface ComparisonResult {
  comparisonId: string;
  status: 'completed' | 'failed';
  testResults: TestComparisonResult[];
  summary: {
    productionPassRate: number;
    sandboxAPassRate: number;
    sandboxBPassRate: number;
    totalTests: number;
    improvements: { testId: string; from: string; to: string }[];
    regressions: { testId: string; from: string; to: string }[];
  };
}

export interface ProgressCallback {
  (progress: {
    stage: 'production' | 'sandboxA' | 'sandboxB';
    testId: string;
    testIndex: number;
    totalTests: number;
    status: 'running' | 'completed' | 'failed';
  }): void;
}

// Singleton instances
let database: any = null;
let sandboxService: any = null;
let comparisonService: any = null;

/**
 * Initialize the comparison service (lazy singleton)
 * Uses the test-agent directory as working dir to ensure correct database path
 */
function getComparisonService(): any {
  if (!comparisonService) {
    // Save current working directory
    const originalCwd = process.cwd();

    try {
      // Change to test-agent directory so Database uses correct path
      process.chdir(testAgentRoot);

      database = new Database();
      database.initialize();

      sandboxService = new SandboxService(database);
      sandboxService.initializeSandboxes();

      comparisonService = new SandboxComparisonService(database, sandboxService);
    } finally {
      // Restore original working directory
      process.chdir(originalCwd);
    }
  }
  return comparisonService;
}

/**
 * Run a comparison across endpoints (synchronous - waits for completion)
 * @deprecated Use startComparisonAsync for API calls to avoid timeout issues
 */
export async function runComparison(
  request: ComparisonRequest,
  onProgress?: ProgressCallback
): Promise<ComparisonResult> {
  const service = getComparisonService();
  return service.runComparison(request, onProgress);
}

/**
 * Start a comparison asynchronously (returns immediately)
 * The comparison runs in the background - poll getComparisonRun for updates
 */
export async function startComparisonAsync(
  request: ComparisonRequest
): Promise<{ comparisonId: string }> {
  const service = getComparisonService();
  return service.startComparisonAsync(request);
}

/**
 * Get a comparison run by ID
 */
export function getComparisonRun(comparisonId: string): any {
  const service = getComparisonService();
  return service.getComparisonRun(comparisonId);
}

/**
 * Get comparison history
 */
export function getComparisonHistory(limit: number = 20): any[] {
  const service = getComparisonService();
  return service.getComparisonHistory(limit);
}

/**
 * Get available tests for comparison
 */
export function getAvailableTests(): { id: string; name: string; category: string }[] {
  const service = getComparisonService();
  return service.getAvailableTests();
}

/**
 * Reset singleton (for testing purposes)
 */
export function resetService(): void {
  database = null;
  sandboxService = null;
  comparisonService = null;
}

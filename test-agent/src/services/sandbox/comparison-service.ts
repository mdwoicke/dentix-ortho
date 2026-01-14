/**
 * Sandbox Comparison Service
 *
 * Runs tests against multiple Flowise endpoints (Production, Sandbox A, Sandbox B)
 * and compares results to evaluate which configuration performs better.
 */

import { v4 as uuidv4 } from 'uuid';
import { FlowiseClient } from '../../core/flowise-client';
import { Database, ABSandboxComparisonRun } from '../../storage/database';
import { SandboxService } from './sandbox-service';
import { GoalTestRunner, createGoalTestRunner } from '../../tests/goal-test-runner';
import { IntentDetector } from '../intent-detector';
import type { GoalOrientedTestCase, GoalTestResult } from '../../tests/types/goal-test';
import { config } from '../../config/config';

// Import goal test scenarios
import { goalHappyPathScenarios } from '../../tests/scenarios/goal-happy-path';

export interface ComparisonRequest {
  /** Test IDs to run (e.g., ['GOAL-HAPPY-001', 'GOAL-EDGE-001']) */
  testIds: string[];
  /** Whether to run against production endpoint */
  runProduction: boolean;
  /** Whether to run against Sandbox A */
  runSandboxA: boolean;
  /** Whether to run against Sandbox B */
  runSandboxB: boolean;
  /** Optional name for the comparison run */
  name?: string;
}

export interface TestComparisonResult {
  testId: string;
  production: { passed: boolean; turnCount: number; durationMs: number; ranAt: string } | null;
  sandboxA: { passed: boolean; turnCount: number; durationMs: number; ranAt: string } | null;
  sandboxB: { passed: boolean; turnCount: number; durationMs: number; ranAt: string } | null;
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

export class SandboxComparisonService {
  private goalTestsByid: Map<string, GoalOrientedTestCase>;

  constructor(
    private db: Database,
    private sandboxService: SandboxService
  ) {
    // Build lookup map for goal tests
    this.goalTestsByid = new Map();
    for (const test of goalHappyPathScenarios) {
      this.goalTestsByid.set(test.id, test);
    }
    // Note: Database-loaded tests would be added here if needed
  }

  /**
   * Get available goal tests
   */
  getAvailableTests(): { id: string; name: string; category: string }[] {
    return Array.from(this.goalTestsByid.values()).map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
    }));
  }

  /**
   * Start a comparison asynchronously (returns immediately, runs in background)
   * This is the preferred method for API calls to avoid timeout issues
   */
  async startComparisonAsync(
    request: ComparisonRequest
  ): Promise<{ comparisonId: string }> {
    const comparisonId = `CMP-${new Date().toISOString().split('T')[0]}-${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();

    // Validate test IDs first
    const testCases: GoalOrientedTestCase[] = [];
    for (const testId of request.testIds) {
      const testCase = this.goalTestsByid.get(testId);
      if (!testCase) {
        console.warn(`[ComparisonService] Test not found: ${testId}`);
        continue;
      }
      testCases.push(testCase);
    }

    if (testCases.length === 0) {
      throw new Error('No valid test cases found');
    }

    // Create comparison run record with 'running' status
    this.db.createComparisonRun({
      comparisonId,
      name: request.name || `Comparison ${comparisonId}`,
      status: 'running',
      testIds: request.testIds,
      startedAt: now,
    });

    // Run the comparison in the background (don't await)
    this.runComparisonInBackground(comparisonId, request, testCases).catch(error => {
      console.error(`[ComparisonService] Background comparison ${comparisonId} failed:`, error);
    });

    // Return immediately with the comparison ID
    return { comparisonId };
  }

  /**
   * Internal method to run comparison in background
   */
  private async runComparisonInBackground(
    comparisonId: string,
    request: ComparisonRequest,
    testCases: GoalOrientedTestCase[]
  ): Promise<void> {
    const productionResults: Record<string, GoalTestResult> = {};
    const sandboxAResults: Record<string, GoalTestResult> = {};
    const sandboxBResults: Record<string, GoalTestResult> = {};
    const testResults: TestComparisonResult[] = [];

    try {
      // Run production tests using active config from settings
      if (request.runProduction) {
        console.log(`[ComparisonService] ${comparisonId} - Running production tests...`);
        const prodClient = await FlowiseClient.forActiveConfig();
        const prodRunner = createGoalTestRunner(prodClient, this.db);

        for (let i = 0; i < testCases.length; i++) {
          const testCase = testCases[i];
          const runId = `${comparisonId}-prod`;
          const result = await prodRunner.runTest(testCase, runId);
          (result as any).ranAt = new Date().toISOString();
          productionResults[testCase.id] = result;
        }
      }

      // Run Sandbox A tests
      if (request.runSandboxA) {
        const sandboxA = this.sandboxService.getSandbox('sandbox_a');
        if (sandboxA?.flowiseEndpoint) {
          console.log(`[ComparisonService] ${comparisonId} - Running Sandbox A tests...`);
          const sandboxAClient = FlowiseClient.forSandbox(sandboxA.flowiseEndpoint);
          const sandboxARunner = createGoalTestRunner(sandboxAClient, this.db);

          for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            const runId = `${comparisonId}-sandboxA`;
            const result = await sandboxARunner.runTest(testCase, runId);
            (result as any).ranAt = new Date().toISOString();
            sandboxAResults[testCase.id] = result;
          }
        }
      }

      // Run Sandbox B tests
      if (request.runSandboxB) {
        const sandboxB = this.sandboxService.getSandbox('sandbox_b');
        if (sandboxB?.flowiseEndpoint) {
          console.log(`[ComparisonService] ${comparisonId} - Running Sandbox B tests...`);
          const sandboxBClient = FlowiseClient.forSandbox(sandboxB.flowiseEndpoint);
          const sandboxBRunner = createGoalTestRunner(sandboxBClient, this.db);

          for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            const runId = `${comparisonId}-sandboxB`;
            const result = await sandboxBRunner.runTest(testCase, runId);
            (result as any).ranAt = new Date().toISOString();
            sandboxBResults[testCase.id] = result;
          }
        }
      }

      // Aggregate results
      const aggregationTime = new Date().toISOString();
      for (const testCase of testCases) {
        const prodResult = productionResults[testCase.id];
        const sandboxAResult = sandboxAResults[testCase.id];
        const sandboxBResult = sandboxBResults[testCase.id];

        testResults.push({
          testId: testCase.id,
          production: prodResult ? {
            passed: prodResult.passed,
            turnCount: prodResult.turnCount,
            durationMs: prodResult.durationMs,
            ranAt: (prodResult as any).ranAt || aggregationTime,
          } : null,
          sandboxA: sandboxAResult ? {
            passed: sandboxAResult.passed,
            turnCount: sandboxAResult.turnCount,
            durationMs: sandboxAResult.durationMs,
            ranAt: (sandboxAResult as any).ranAt || aggregationTime,
          } : null,
          sandboxB: sandboxBResult ? {
            passed: sandboxBResult.passed,
            turnCount: sandboxBResult.turnCount,
            durationMs: sandboxBResult.durationMs,
            ranAt: (sandboxBResult as any).ranAt || aggregationTime,
          } : null,
        });
      }

      // Calculate summary
      const summary = this.calculateSummary(testResults);

      // Update comparison run with results
      this.db.updateComparisonRun(comparisonId, {
        status: 'completed',
        productionResults: productionResults,
        sandboxAResults: sandboxAResults,
        sandboxBResults: sandboxBResults,
        summary,
        completedAt: new Date().toISOString(),
      });

      console.log(`[ComparisonService] ${comparisonId} - Completed successfully`);
    } catch (error: any) {
      console.error(`[ComparisonService] ${comparisonId} - Failed:`, error);

      this.db.updateComparisonRun(comparisonId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Run a comparison across endpoints (synchronous - waits for completion)
   * @deprecated Use startComparisonAsync for API calls to avoid timeout issues
   */
  async runComparison(
    request: ComparisonRequest,
    onProgress?: ProgressCallback
  ): Promise<ComparisonResult> {
    const comparisonId = `CMP-${new Date().toISOString().split('T')[0]}-${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();

    // Create comparison run record
    this.db.createComparisonRun({
      comparisonId,
      name: request.name || `Comparison ${comparisonId}`,
      status: 'running',
      testIds: request.testIds,
      startedAt: now,
    });

    // Validate test IDs
    const testCases: GoalOrientedTestCase[] = [];
    for (const testId of request.testIds) {
      const testCase = this.goalTestsByid.get(testId);
      if (!testCase) {
        console.warn(`[ComparisonService] Test not found: ${testId}`);
        continue;
      }
      testCases.push(testCase);
    }

    if (testCases.length === 0) {
      this.db.updateComparisonRun(comparisonId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
      });
      throw new Error('No valid test cases found');
    }

    const testResults: TestComparisonResult[] = [];
    const productionResults: Record<string, GoalTestResult> = {};
    const sandboxAResults: Record<string, GoalTestResult> = {};
    const sandboxBResults: Record<string, GoalTestResult> = {};

    try {
      // Run production tests using active config from settings
      if (request.runProduction) {
        console.log('[ComparisonService] Running production tests...');
        const prodClient = await FlowiseClient.forActiveConfig();
        const prodRunner = createGoalTestRunner(prodClient, this.db);

        for (let i = 0; i < testCases.length; i++) {
          const testCase = testCases[i];
          onProgress?.({
            stage: 'production',
            testId: testCase.id,
            testIndex: i,
            totalTests: testCases.length,
            status: 'running',
          });

          const runId = `${comparisonId}-prod`;
          const result = await prodRunner.runTest(testCase, runId);
          (result as any).ranAt = new Date().toISOString();
          productionResults[testCase.id] = result;

          onProgress?.({
            stage: 'production',
            testId: testCase.id,
            testIndex: i,
            totalTests: testCases.length,
            status: 'completed',
          });
        }
      }

      // Run Sandbox A tests
      if (request.runSandboxA) {
        const sandboxA = this.sandboxService.getSandbox('sandbox_a');
        if (sandboxA?.flowiseEndpoint) {
          console.log('[ComparisonService] Running Sandbox A tests...');
          const sandboxAClient = FlowiseClient.forSandbox(sandboxA.flowiseEndpoint);
          const sandboxARunner = createGoalTestRunner(sandboxAClient, this.db);

          for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            onProgress?.({
              stage: 'sandboxA',
              testId: testCase.id,
              testIndex: i,
              totalTests: testCases.length,
              status: 'running',
            });

            const runId = `${comparisonId}-sandboxA`;
            const result = await sandboxARunner.runTest(testCase, runId);
            (result as any).ranAt = new Date().toISOString();
            sandboxAResults[testCase.id] = result;

            onProgress?.({
              stage: 'sandboxA',
              testId: testCase.id,
              testIndex: i,
              totalTests: testCases.length,
              status: 'completed',
            });
          }
        } else {
          console.warn('[ComparisonService] Sandbox A has no endpoint configured');
        }
      }

      // Run Sandbox B tests
      if (request.runSandboxB) {
        const sandboxB = this.sandboxService.getSandbox('sandbox_b');
        if (sandboxB?.flowiseEndpoint) {
          console.log('[ComparisonService] Running Sandbox B tests...');
          const sandboxBClient = FlowiseClient.forSandbox(sandboxB.flowiseEndpoint);
          const sandboxBRunner = createGoalTestRunner(sandboxBClient, this.db);

          for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            onProgress?.({
              stage: 'sandboxB',
              testId: testCase.id,
              testIndex: i,
              totalTests: testCases.length,
              status: 'running',
            });

            const runId = `${comparisonId}-sandboxB`;
            const result = await sandboxBRunner.runTest(testCase, runId);
            (result as any).ranAt = new Date().toISOString();
            sandboxBResults[testCase.id] = result;

            onProgress?.({
              stage: 'sandboxB',
              testId: testCase.id,
              testIndex: i,
              totalTests: testCases.length,
              status: 'completed',
            });
          }
        } else {
          console.warn('[ComparisonService] Sandbox B has no endpoint configured');
        }
      }

      // Aggregate results
      const aggregationTime = new Date().toISOString();
      for (const testCase of testCases) {
        const prodResult = productionResults[testCase.id];
        const sandboxAResult = sandboxAResults[testCase.id];
        const sandboxBResult = sandboxBResults[testCase.id];

        testResults.push({
          testId: testCase.id,
          production: prodResult ? {
            passed: prodResult.passed,
            turnCount: prodResult.turnCount,
            durationMs: prodResult.durationMs,
            ranAt: (prodResult as any).ranAt || aggregationTime,
          } : null,
          sandboxA: sandboxAResult ? {
            passed: sandboxAResult.passed,
            turnCount: sandboxAResult.turnCount,
            durationMs: sandboxAResult.durationMs,
            ranAt: (sandboxAResult as any).ranAt || aggregationTime,
          } : null,
          sandboxB: sandboxBResult ? {
            passed: sandboxBResult.passed,
            turnCount: sandboxBResult.turnCount,
            durationMs: sandboxBResult.durationMs,
            ranAt: (sandboxBResult as any).ranAt || aggregationTime,
          } : null,
        });
      }

      // Calculate summary
      const summary = this.calculateSummary(testResults);

      // Update comparison run with results
      this.db.updateComparisonRun(comparisonId, {
        status: 'completed',
        productionResults: productionResults,
        sandboxAResults: sandboxAResults,
        sandboxBResults: sandboxBResults,
        summary,
        completedAt: new Date().toISOString(),
      });

      return {
        comparisonId,
        status: 'completed',
        testResults,
        summary,
      };
    } catch (error: any) {
      console.error('[ComparisonService] Comparison failed:', error);

      this.db.updateComparisonRun(comparisonId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Run a single test against all configured endpoints
   * Useful for quick iteration during development
   */
  async runSingleTestComparison(testId: string): Promise<ComparisonResult> {
    return this.runComparison({
      testIds: [testId],
      runProduction: true,
      runSandboxA: true,
      runSandboxB: true,
      name: `Quick test: ${testId}`,
    });
  }

  /**
   * Get a comparison run by ID
   */
  getComparisonRun(comparisonId: string): ABSandboxComparisonRun | null {
    return this.db.getComparisonRun(comparisonId);
  }

  /**
   * Get comparison history
   */
  getComparisonHistory(limit: number = 20): ABSandboxComparisonRun[] {
    return this.db.getComparisonRunHistory(limit);
  }

  /**
   * Calculate summary statistics from test results
   */
  private calculateSummary(testResults: TestComparisonResult[]): ComparisonResult['summary'] {
    let prodPassed = 0, prodTotal = 0;
    let sandboxAPassed = 0, sandboxATotal = 0;
    let sandboxBPassed = 0, sandboxBTotal = 0;

    const improvements: { testId: string; from: string; to: string }[] = [];
    const regressions: { testId: string; from: string; to: string }[] = [];

    for (const result of testResults) {
      // Production stats
      if (result.production !== null) {
        prodTotal++;
        if (result.production.passed) prodPassed++;
      }

      // Sandbox A stats
      if (result.sandboxA !== null) {
        sandboxATotal++;
        if (result.sandboxA.passed) sandboxAPassed++;

        // Compare to production
        if (result.production !== null) {
          if (!result.production.passed && result.sandboxA.passed) {
            improvements.push({ testId: result.testId, from: 'Production', to: 'Sandbox A' });
          } else if (result.production.passed && !result.sandboxA.passed) {
            regressions.push({ testId: result.testId, from: 'Sandbox A', to: 'Production' });
          }
        }
      }

      // Sandbox B stats
      if (result.sandboxB !== null) {
        sandboxBTotal++;
        if (result.sandboxB.passed) sandboxBPassed++;

        // Compare to production
        if (result.production !== null) {
          if (!result.production.passed && result.sandboxB.passed) {
            improvements.push({ testId: result.testId, from: 'Production', to: 'Sandbox B' });
          } else if (result.production.passed && !result.sandboxB.passed) {
            regressions.push({ testId: result.testId, from: 'Sandbox B', to: 'Production' });
          }
        }
      }
    }

    return {
      productionPassRate: prodTotal > 0 ? (prodPassed / prodTotal) * 100 : 0,
      sandboxAPassRate: sandboxATotal > 0 ? (sandboxAPassed / sandboxATotal) * 100 : 0,
      sandboxBPassRate: sandboxBTotal > 0 ? (sandboxBPassed / sandboxBTotal) * 100 : 0,
      totalTests: testResults.length,
      improvements,
      regressions,
    };
  }
}

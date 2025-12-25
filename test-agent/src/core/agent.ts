/**
 * Main Test Agent Orchestrator
 * Coordinates test execution, analysis, and reporting
 * Supports parallel execution with configurable concurrency
 */

import { EventEmitter } from 'events';
import { FlowiseClient } from './flowise-client';
import { Cloud9Client } from './cloud9-client';
import { TestRunner } from '../tests/test-runner';
import { ResponseAnalyzer } from '../analysis/response-analyzer';
import { RecommendationEngine, Recommendation } from '../analysis/recommendation-engine';
import { Database, TestRun, TestResult } from '../storage/database';
import { ConsoleReporter } from '../reporters/console-reporter';
import { MarkdownReporter } from '../reporters/markdown-reporter';
import { TestCase, TestContext } from '../tests/test-case';
import { allScenarios } from '../tests/scenarios';

export interface AgentOptions {
  category?: 'happy-path' | 'edge-case' | 'error-handling';
  scenario?: string;
  failedOnly?: boolean;
  watch?: boolean;
  concurrency?: number; // Number of parallel workers (1-10, default 1)
}

export interface WorkerStatus {
  workerId: number;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentTestId: string | null;
  currentTestName: string | null;
  startedAt: string | null;
}

export interface ExecutionProgress {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface TestSuiteResult {
  runId: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
}

export class TestAgent extends EventEmitter {
  private flowiseClient: FlowiseClient;
  private cloud9Client: Cloud9Client;
  private testRunner: TestRunner;
  private analyzer: ResponseAnalyzer;
  private recommendationEngine: RecommendationEngine;
  private database: Database;
  private consoleReporter: ConsoleReporter;
  private markdownReporter: MarkdownReporter;

  // Worker status tracking
  private workerStatuses: Map<number, WorkerStatus> = new Map();
  private progress: ExecutionProgress = {
    total: 0,
    completed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  constructor() {
    super();
    this.flowiseClient = new FlowiseClient();
    this.cloud9Client = new Cloud9Client();
    this.analyzer = new ResponseAnalyzer();
    this.recommendationEngine = new RecommendationEngine();
    this.database = new Database();
    this.consoleReporter = new ConsoleReporter();
    this.markdownReporter = new MarkdownReporter();
    this.testRunner = new TestRunner(
      this.flowiseClient,
      this.cloud9Client,
      this.analyzer,
      this.database
    );
  }

  /**
   * Run the full test suite or filtered tests
   * Supports parallel execution with configurable concurrency
   */
  async run(options: AgentOptions = {}): Promise<TestSuiteResult> {
    const concurrency = Math.min(Math.max(options.concurrency || 1, 1), 10);

    console.log('\n=== E2E Test Agent Starting ===\n');

    // Warn about rate limits for high concurrency
    if (concurrency > 3) {
      console.log(`⚠️  WARNING: Running with ${concurrency} workers may trigger API rate limits.`);
      console.log('   Consider using concurrency <= 3 for stable execution.\n');
    }

    if (concurrency > 1) {
      console.log(`🔄 Parallel execution enabled with ${concurrency} workers\n`);
    }

    // Fetch sandbox data
    console.log('Fetching sandbox data...');
    await this.cloud9Client.refreshAllData();

    // Get test scenarios
    let scenarios = this.getScenarios(options);
    console.log(`Found ${scenarios.length} test scenarios to run\n`);

    // Create test run record
    const runId = this.database.createTestRun();

    // Initialize progress tracking
    this.progress = {
      total: scenarios.length,
      completed: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    // Emit execution started event
    this.emit('execution-started', { runId, config: { concurrency } });

    // Run tests
    const startTime = Date.now();
    let results: TestResult[];

    if (concurrency === 1) {
      // Sequential execution (original behavior)
      results = await this.runSequential(scenarios, runId);
    } else {
      // Parallel execution with worker pool
      results = await this.runParallel(scenarios, runId, concurrency);
    }

    const duration = Date.now() - startTime;

    // Calculate summary
    const summary: TestSuiteResult = {
      runId,
      totalTests: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      duration,
      results,
    };

    // Update run record
    this.database.completeTestRun(runId, summary);

    // Emit execution completed event
    this.emit('execution-completed', { runId, summary });

    // Print summary
    this.consoleReporter.printSummary(summary);

    // Analyze and generate recommendations
    const recommendations = await this.generateRecommendations(results);
    if (recommendations.length > 0) {
      this.consoleReporter.printRecommendations(recommendations);
    }

    return summary;
  }

  /**
   * Run tests sequentially (original behavior)
   */
  private async runSequential(scenarios: TestCase[], runId: string): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const scenario of scenarios) {
      this.consoleReporter.printTestStart(scenario);

      try {
        const result = await this.testRunner.runTest(scenario, runId);
        results.push(result);
        this.consoleReporter.printTestResult(result);

        // Update progress
        this.updateProgress(result.status);

        // Save transcript
        this.database.saveTranscript(result.id!, result.transcript);
      } catch (error: any) {
        const errorResult: TestResult = {
          runId,
          testId: scenario.id,
          testName: scenario.name,
          category: scenario.category,
          status: 'error',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
          errorMessage: error.message,
          transcript: [],
          findings: [],
        };
        results.push(errorResult);
        this.database.saveTestResult(errorResult);
        this.consoleReporter.printTestResult(errorResult);
        this.updateProgress('failed');
      }
    }

    return results;
  }

  /**
   * Run tests in parallel using a worker pool
   */
  private async runParallel(scenarios: TestCase[], runId: string, concurrency: number): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const queue = [...scenarios];

    // Initialize workers
    for (let i = 0; i < concurrency; i++) {
      this.workerStatuses.set(i, {
        workerId: i,
        status: 'idle',
        currentTestId: null,
        currentTestName: null,
        startedAt: null,
      });
    }

    // Emit initial worker statuses
    this.emitWorkerStatuses();

    // Create worker promises
    const workerPromises: Promise<TestResult[]>[] = [];

    for (let workerId = 0; workerId < concurrency; workerId++) {
      workerPromises.push(this.runWorker(workerId, queue, runId));
    }

    // Wait for all workers to complete
    const workerResults = await Promise.all(workerPromises);

    // Flatten results
    for (const workerResult of workerResults) {
      results.push(...workerResult);
    }

    return results;
  }

  /**
   * Worker function that processes tests from the shared queue
   */
  private async runWorker(workerId: number, queue: TestCase[], runId: string): Promise<TestResult[]> {
    const results: TestResult[] = [];

    while (queue.length > 0) {
      // Get next scenario from queue (thread-safe pop)
      const scenario = queue.shift();
      if (!scenario) break;

      // Update worker status
      this.updateWorkerStatus(workerId, 'running', scenario.id, scenario.name);

      console.log(`[Worker ${workerId}] Starting: ${scenario.id} - ${scenario.name}`);

      try {
        const result = await this.testRunner.runTest(scenario, runId);
        results.push(result);

        // Update progress
        this.updateProgress(result.status);

        // Save transcript
        this.database.saveTranscript(result.id!, result.transcript);

        const statusIcon = result.status === 'passed' ? '✓' : '✗';
        console.log(`[Worker ${workerId}] ${statusIcon} Completed: ${scenario.id} (${result.durationMs}ms)`);
      } catch (error: any) {
        const errorResult: TestResult = {
          runId,
          testId: scenario.id,
          testName: scenario.name,
          category: scenario.category,
          status: 'error',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
          errorMessage: error.message,
          transcript: [],
          findings: [],
        };
        results.push(errorResult);
        this.database.saveTestResult(errorResult);
        this.updateProgress('failed');

        console.log(`[Worker ${workerId}] ✗ Error: ${scenario.id} - ${error.message}`);
      }

      // Mark worker as idle
      this.updateWorkerStatus(workerId, 'idle', null, null);
    }

    // Mark worker as completed
    this.updateWorkerStatus(workerId, 'completed', null, null);
    console.log(`[Worker ${workerId}] Finished - no more tests in queue`);

    return results;
  }

  /**
   * Update worker status and emit event
   */
  private updateWorkerStatus(
    workerId: number,
    status: WorkerStatus['status'],
    testId: string | null,
    testName: string | null
  ): void {
    const workerStatus: WorkerStatus = {
      workerId,
      status,
      currentTestId: testId,
      currentTestName: testName,
      startedAt: status === 'running' ? new Date().toISOString() : null,
    };
    this.workerStatuses.set(workerId, workerStatus);
    this.emit('worker-status', workerStatus);
    this.emitWorkerStatuses();
  }

  /**
   * Emit all worker statuses
   */
  private emitWorkerStatuses(): void {
    const statuses = Array.from(this.workerStatuses.values());
    this.emit('workers-update', statuses);
  }

  /**
   * Update and emit progress
   */
  private updateProgress(status: string): void {
    this.progress.completed++;
    if (status === 'passed') {
      this.progress.passed++;
    } else if (status === 'failed' || status === 'error') {
      this.progress.failed++;
    } else if (status === 'skipped') {
      this.progress.skipped++;
    }
    this.emit('progress-update', { ...this.progress });
  }

  /**
   * Run only previously failed tests
   */
  async runFailed(): Promise<TestSuiteResult> {
    const lastRun = this.database.getLastTestRun();
    if (!lastRun) {
      console.log('No previous test run found.');
      return this.run();
    }

    const failedTests = this.database.getFailedTestIds(lastRun.runId);
    if (failedTests.length === 0) {
      console.log('No failed tests from last run.');
      return {
        runId: '',
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        results: [],
      };
    }

    return this.run({ failedOnly: true });
  }

  /**
   * Get filtered scenarios based on options
   */
  private getScenarios(options: AgentOptions): TestCase[] {
    let scenarios = [...allScenarios];

    if (options.scenario) {
      scenarios = scenarios.filter(s => s.id === options.scenario);
    }

    if (options.category) {
      scenarios = scenarios.filter(s => s.category === options.category);
    }

    if (options.failedOnly) {
      const lastRun = this.database.getLastTestRun();
      if (lastRun) {
        const failedIds = this.database.getFailedTestIds(lastRun.runId);
        scenarios = scenarios.filter(s => failedIds.includes(s.id));
      }
    }

    return scenarios;
  }

  /**
   * Generate recommendations from test results
   */
  async generateRecommendations(results: TestResult[]): Promise<Recommendation[]> {
    const failedResults = results.filter(r => r.status === 'failed' || r.status === 'error');

    if (failedResults.length === 0) {
      return [];
    }

    return this.recommendationEngine.generateFromResults(failedResults);
  }

  /**
   * Get recommendations for display
   */
  getRecommendations(): Recommendation[] {
    return this.database.getRecommendations();
  }

  /**
   * Get results from last run
   */
  getLastResults(): TestResult[] {
    const lastRun = this.database.getLastTestRun();
    if (!lastRun) {
      return [];
    }
    return this.database.getTestResults(lastRun.runId);
  }

  /**
   * Get transcript for a specific test
   */
  getTranscript(testId: string, runId?: string): any[] {
    return this.database.getTranscript(testId, runId);
  }

  /**
   * Generate markdown report
   */
  async generateReport(format: 'markdown' | 'json' = 'markdown'): Promise<string> {
    const lastRun = this.database.getLastTestRun();
    if (!lastRun) {
      return 'No test runs found.';
    }

    const results = this.database.getTestResults(lastRun.runId);
    const recommendations = await this.generateRecommendations(results);

    if (format === 'markdown') {
      return this.markdownReporter.generateReport(lastRun, results, recommendations);
    }

    return JSON.stringify({ run: lastRun, results, recommendations }, null, 2);
  }

  /**
   * Check for regressions compared to previous run
   */
  checkRegressions(): { test: string; type: string; details: string }[] {
    const runs = this.database.getRecentRuns(2);
    if (runs.length < 2) {
      return [];
    }

    const [currentRun, previousRun] = runs;
    const currentResults = this.database.getTestResults(currentRun.runId);
    const previousResults = this.database.getTestResults(previousRun.runId);

    const regressions: { test: string; type: string; details: string }[] = [];

    for (const current of currentResults) {
      const previous = previousResults.find(p => p.testId === current.testId);

      if (previous && previous.status === 'passed' && current.status === 'failed') {
        regressions.push({
          test: current.testId,
          type: 'new-failure',
          details: `Test "${current.testName}" was passing but now fails: ${current.errorMessage || 'Unknown error'}`,
        });
      }
    }

    return regressions;
  }

  /**
   * Initialize database (create tables)
   */
  initialize(): void {
    this.database.initialize();
  }
}

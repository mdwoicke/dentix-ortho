/**
 * Main Test Agent Orchestrator
 * Coordinates test execution, analysis, and reporting
 * Supports parallel execution with configurable concurrency
 * Enhanced with Langfuse tracing for comprehensive observability
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
import {
  getLangfuseService,
  runWithTrace,
  createTraceContext,
  scoreTestRun,
} from '../../../shared/services';
import {
  AdaptiveConcurrencyManager,
  getAdaptiveConcurrencyManager,
  ConcurrencyConfig,
} from './adaptive-concurrency';

export interface AgentOptions {
  category?: 'happy-path' | 'edge-case' | 'error-handling';
  scenario?: string;
  scenarioIds?: string[]; // Run multiple specific scenarios by ID
  failedOnly?: boolean;
  watch?: boolean;
  concurrency?: number; // Number of parallel workers (1-10, default 1)
  adaptiveScaling?: boolean; // Enable adaptive concurrency (default false)
  adaptiveConfig?: Partial<ConcurrencyConfig>; // Adaptive scaling configuration
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
  langfuseTraceId?: string;
}

export class TestAgent extends EventEmitter {
  private flowiseClient!: FlowiseClient;
  private cloud9Client: Cloud9Client;
  private testRunner!: TestRunner;
  private analyzer: ResponseAnalyzer;
  private recommendationEngine: RecommendationEngine;
  private database: Database;
  private consoleReporter: ConsoleReporter;
  private markdownReporter: MarkdownReporter;
  private initialized: boolean = false;

  // Worker status tracking
  private workerStatuses: Map<number, WorkerStatus> = new Map();
  private progress: ExecutionProgress = {
    total: 0,
    completed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  // Adaptive concurrency
  private adaptiveConcurrency: AdaptiveConcurrencyManager | null = null;

  constructor() {
    super();
    this.cloud9Client = new Cloud9Client();
    this.analyzer = new ResponseAnalyzer();
    this.recommendationEngine = new RecommendationEngine();
    this.database = new Database();
    this.consoleReporter = new ConsoleReporter();
    this.markdownReporter = new MarkdownReporter();
  }

  /**
   * Initialize the Flowise client with active configuration from settings
   */
  private async initializeFlowiseClient(): Promise<void> {
    if (this.initialized) return;

    // Get Flowise client from active settings
    this.flowiseClient = await FlowiseClient.forActiveConfig();
    console.log(`[TestAgent] Initialized with endpoint: ${this.flowiseClient.getEndpoint().substring(0, 60)}...`);

    this.testRunner = new TestRunner(
      this.flowiseClient,
      this.cloud9Client,
      this.analyzer,
      this.database
    );

    this.initialized = true;
  }

  /**
   * Run the full test suite or filtered tests
   * Supports parallel execution with configurable concurrency
   * Includes Langfuse trace lifecycle management for observability
   */
  async run(options: AgentOptions = {}): Promise<TestSuiteResult> {
    // Initialize Flowise client with active config from settings
    await this.initializeFlowiseClient();

    // Initialize adaptive concurrency if enabled
    const adaptiveScaling = options.adaptiveScaling ?? false;
    let concurrency = Math.min(Math.max(options.concurrency || 1, 1), 20);

    if (adaptiveScaling) {
      this.adaptiveConcurrency = getAdaptiveConcurrencyManager({
        initialConcurrency: concurrency,
        maxConcurrency: 20,
        ...options.adaptiveConfig,
      });
      concurrency = this.adaptiveConcurrency.getConcurrency();
      console.log('\n=== E2E Test Agent Starting (Adaptive Concurrency Enabled) ===\n');
      console.log(`📈 Adaptive scaling enabled: starting with ${concurrency} workers`);
      console.log(`   Will scale between ${options.adaptiveConfig?.minConcurrency || 1} and ${options.adaptiveConfig?.maxConcurrency || 20} based on API latency\n`);
    } else {
      console.log('\n=== E2E Test Agent Starting ===\n');

      // Warn about rate limits for high concurrency
      if (concurrency > 3) {
        console.log(`⚠️  WARNING: Running with ${concurrency} workers may trigger API rate limits.`);
        console.log('   Consider using concurrency <= 3 for stable execution.\n');
      }
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

    // Initialize Langfuse trace for this run
    const langfuse = getLangfuseService();
    let trace: any = null;

    if (await langfuse.ensureInitialized()) {
      try {
        trace = await langfuse.createTrace({
          name: `test-run-${runId}`,
          sessionId: runId,
          userId: 'test-agent',
          metadata: {
            totalTests: scenarios.length,
            concurrency,
            category: options.category,
            scenario: options.scenario,
            failedOnly: options.failedOnly,
            environment: process.env.NODE_ENV || 'development',
          },
          tags: [
            process.env.NODE_ENV || 'development',
            `concurrency-${concurrency}`,
            options.category || 'all-categories',
          ],
        });
        console.log(`[TestAgent] Langfuse trace created: ${trace?.id || 'unknown'}`);
      } catch (e: any) {
        console.warn(`[TestAgent] Langfuse trace creation failed: ${e.message}`);
      }
    }

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

    // Run tests within trace context
    const startTime = Date.now();
    let results: TestResult[];

    // Create trace context for propagation
    const traceContext = trace ? createTraceContext(trace.id, runId) : null;

    // Execute tests with or without trace context
    const executeTests = async () => {
      if (concurrency === 1) {
        // Sequential execution (original behavior)
        return this.runSequential(scenarios, runId);
      } else {
        // Parallel execution with worker pool
        return this.runParallel(scenarios, runId, concurrency);
      }
    };

    // Run with trace context if available
    if (traceContext) {
      results = await runWithTrace(traceContext, executeTests);
    } else {
      results = await executeTests();
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

    // Score the test run in Langfuse
    if (trace) {
      try {
        // Map TestResult[] to TestResultForScoring[] for Langfuse scoring
        const resultsForScoring = results.map(r => ({
          passed: r.status === 'passed',
          status: r.status,
          durationMs: r.durationMs,
          transcript: r.transcript?.map(t => ({ responseTimeMs: t.responseTimeMs })),
          findings: r.findings,
          errorMessage: r.errorMessage,
        }));
        await scoreTestRun(trace.id, resultsForScoring);
        console.log(`[TestAgent] Langfuse scores submitted for trace ${trace.id}`);
      } catch (e: any) {
        console.warn(`[TestAgent] Langfuse scoring failed: ${e.message}`);
      }
    }

    // Flush Langfuse traces
    try {
      await langfuse.flush();
    } catch (e: any) {
      console.warn(`[TestAgent] Langfuse flush failed: ${e.message}`);
    }

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
   * Each worker gets its own FlowiseClient and TestRunner to prevent session bleeding
   */
  private async runWorker(workerId: number, queue: TestCase[], runId: string): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Create per-worker FlowiseClient and TestRunner to ensure session isolation
    // Uses active config from settings with API key support
    const workerFlowiseClient = await FlowiseClient.forActiveConfig();
    const workerTestRunner = new TestRunner(
      workerFlowiseClient,
      this.cloud9Client,  // Cloud9Client can be shared (stateless HTTP client)
      this.analyzer,
      this.database
    );

    console.log(`[Worker ${workerId}] Initialized with session: ${workerFlowiseClient.getSessionId()}`);

    while (queue.length > 0) {
      // Get next scenario from queue (thread-safe pop)
      const scenario = queue.shift();
      if (!scenario) break;

      // Update worker status
      this.updateWorkerStatus(workerId, 'running', scenario.id, scenario.name);

      console.log(`[Worker ${workerId}] Starting: ${scenario.id} - ${scenario.name}`);

      try {
        const result = await workerTestRunner.runTest(scenario, runId);
        results.push(result);

        // Record latency for adaptive concurrency
        if (this.adaptiveConcurrency && result.durationMs > 0) {
          this.adaptiveConcurrency.recordLatency(result.durationMs);
        }

        // Update progress
        this.updateProgress(result.status);

        // Save transcript
        this.database.saveTranscript(result.id!, result.transcript);

        const statusIcon = result.status === 'passed' ? '✓' : '✗';
        console.log(`[Worker ${workerId}] ${statusIcon} Completed: ${scenario.id} (${result.durationMs}ms)`);

        // Check if this worker should gracefully exit (adaptive scaling down)
        const activeWorkers = Array.from(this.workerStatuses.values())
          .filter(w => w.status === 'running' || w.status === 'idle').length;
        if (this.adaptiveConcurrency?.shouldRemoveWorker(activeWorkers)) {
          console.log(`[Worker ${workerId}] Exiting due to adaptive scaling down`);
          break;
        }
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

    // Filter by multiple scenario IDs (takes priority)
    if (options.scenarioIds && options.scenarioIds.length > 0) {
      scenarios = scenarios.filter(s => options.scenarioIds!.includes(s.id));
      console.log(`Filtered to ${scenarios.length} scenarios by IDs: ${options.scenarioIds.join(', ')}`);
    } else if (options.scenario) {
      // Filter by single scenario ID
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

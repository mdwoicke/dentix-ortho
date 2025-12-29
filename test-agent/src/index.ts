#!/usr/bin/env node
/**
 * E2E Test Agent CLI
 * Command-line interface for running tests and viewing results
 */

import 'dotenv/config';
import { Command } from 'commander';
import { TestAgent } from './core/agent';
import { ConsoleReporter } from './reporters/console-reporter';
import { MarkdownReporter } from './reporters/markdown-reporter';
import { Database } from './storage/database';
import { getScenarioSummary, getScenarioById } from './tests/scenarios';
import { AgentFailureAnalyzer } from './analysis/agent-failure-analyzer';
import { FlowiseClient } from './core/flowise-client';
import { GoalTestRunner } from './tests/goal-test-runner';
import { IntentDetector } from './services/intent-detector';
import { goalHappyPathScenarios } from './tests/scenarios/goal-happy-path';
import type { GoalOrientedTestCase } from './tests/types/goal-test';
import type { TestResult } from './storage/database';
import type { TestSuiteResult } from './core/agent';
import * as fs from 'fs';
import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

/**
 * Load goal test cases from database (GOAL-EDGE-* and GOAL-ERR-* tests)
 */
function loadGoalTestsFromDatabase(): GoalOrientedTestCase[] {
  const dbPath = path.resolve(__dirname, '../data/test-results.db');
  if (!fs.existsSync(dbPath)) {
    console.log('[GoalTest] Database not found, using TypeScript scenarios only');
    return [];
  }

  try {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const rows = db.prepare(`
      SELECT case_id, name, description, category, tags_json, persona_json,
             goals_json, constraints_json, response_config_json, initial_message
      FROM goal_test_cases
      WHERE is_archived = 0 AND (case_id LIKE 'GOAL-EDGE-%' OR case_id LIKE 'GOAL-ERR-%')
    `).all() as any[];
    db.close();

    return rows.map((row: any) => ({
      id: row.case_id,
      name: row.name,
      description: row.description,
      category: row.category,
      tags: JSON.parse(row.tags_json || '[]'),
      persona: JSON.parse(row.persona_json),
      goals: JSON.parse(row.goals_json),
      constraints: JSON.parse(row.constraints_json || '[]'),
      responseConfig: JSON.parse(row.response_config_json),
      initialMessage: row.initial_message,
    }));
  } catch (error: any) {
    console.log(`[GoalTest] Error loading from database: ${error.message}`);
    return [];
  }
}

/**
 * Run goal-oriented tests
 */
async function runGoalTests(
  scenarioIds: string[],
  concurrency: number,
  db: Database
): Promise<TestSuiteResult> {
  console.log('\n=== Goal-Oriented Test Runner ===\n');
  console.log(`Running ${scenarioIds.length} goal test(s) with concurrency ${concurrency}\n`);

  // Get all available goal scenarios (TypeScript + database)
  const dbScenarios = loadGoalTestsFromDatabase();
  const allGoalScenarios: GoalOrientedTestCase[] = [...goalHappyPathScenarios, ...dbScenarios];
  console.log(`[GoalTest] Loaded ${goalHappyPathScenarios.length} TS scenarios + ${dbScenarios.length} DB scenarios`);

  // Map scenario IDs to actual scenarios (preserving duplicates for run count feature)
  // This allows the same scenario to run multiple times when requested
  const scenariosToRun: GoalOrientedTestCase[] = [];
  for (const id of scenarioIds) {
    const scenario = allGoalScenarios.find(s => s.id === id);
    if (scenario) {
      scenariosToRun.push(scenario);
    }
  }

  if (scenariosToRun.length === 0) {
    console.log('No matching goal scenarios found.');
    console.log(`Available: ${allGoalScenarios.map(s => s.id).join(', ')}`);
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

  console.log(`Found ${scenariosToRun.length} goal test(s) to run\n`);

  // Create run record
  const runId = db.createTestRun();
  const startTime = Date.now();
  const results: TestResult[] = [];

  // Track run counts per scenario for proper indexing when same test runs multiple times
  const runCountPerScenario = new Map<string, number>();

  // Run tests (sequential for now, can add parallel later)
  for (const scenario of scenariosToRun) {
    // Increment run count for this scenario
    const currentCount = (runCountPerScenario.get(scenario.id) || 0) + 1;
    runCountPerScenario.set(scenario.id, currentCount);

    // Generate unique test ID with run index (e.g., GOAL-HAPPY-001#2 for second run)
    const testIdWithRun = currentCount > 1 ? `${scenario.id}#${currentCount}` : scenario.id;

    console.log(`[GoalTest] Starting: ${testIdWithRun} - ${scenario.name}`);

    // Create per-test runner with fresh session
    const flowiseClient = new FlowiseClient();
    const intentDetector = new IntentDetector();
    const runner = new GoalTestRunner(flowiseClient, db, intentDetector);

    try {
      // Pass testIdWithRun to ensure multiple runs of same test are stored separately
      const result = await runner.runTest(scenario, runId, testIdWithRun);

      const testResult: TestResult = {
        runId,
        testId: testIdWithRun,
        testName: currentCount > 1 ? `${scenario.name} (Run ${currentCount})` : scenario.name,
        category: scenario.category,
        status: result.passed ? 'passed' : 'failed',
        startedAt: new Date(Date.now() - result.durationMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        errorMessage: result.passed ? undefined : result.issues.map(i => i.description).join('; '),
        transcript: result.transcript,
        findings: result.issues.map(issue => ({
          type: issue.type === 'error' ? 'bug' as const : 'prompt-issue' as const,
          severity: issue.severity,
          title: `Issue: ${issue.type}`,
          description: issue.description,
          affectedStep: `turn-${issue.turnNumber}`,
        })),
      };

      results.push(testResult);
      const status = result.passed ? '✓ PASSED' : '✗ FAILED';
      console.log(`[GoalTest] ${status}: ${testIdWithRun} (${result.durationMs}ms, ${result.turnCount} turns)`);
    } catch (error: any) {
      const errorResult: TestResult = {
        runId,
        testId: testIdWithRun,
        testName: currentCount > 1 ? `${scenario.name} (Run ${currentCount})` : scenario.name,
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
      db.saveTestResult(errorResult);
      console.log(`[GoalTest] ✗ ERROR: ${testIdWithRun} - ${error.message}`);
    }
  }

  const duration = Date.now() - startTime;
  const summary: TestSuiteResult = {
    runId,
    totalTests: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed' || r.status === 'error').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    duration,
    results,
  };

  // Update run record
  db.completeTestRun(runId, summary);

  console.log('\n=== Goal Test Results ===');
  console.log(`Passed: ${summary.passed}, Failed: ${summary.failed}, Total: ${summary.totalTests}`);
  console.log(`Duration: ${(duration / 1000).toFixed(1)}s\n`);

  return summary;
}

const program = new Command();
const reporter = new ConsoleReporter();
const markdownReporter = new MarkdownReporter();

program
  .name('test-agent')
  .description('E2E Testing Agent for Flowise Dental Appointment Chatbot')
  .version('1.0.0');

// Run command
program
  .command('run')
  .description('Run test scenarios')
  .option('-c, --category <category>', 'Run tests in specific category (happy-path, edge-case, error-handling)')
  .option('-s, --scenario <id>', 'Run specific scenario by ID')
  .option('--scenarios <ids>', 'Run multiple scenarios by comma-separated IDs (e.g., HAPPY-001,HAPPY-002)')
  .option('-f, --failed', 'Re-run only previously failed tests')
  .option('-w, --watch', 'Watch mode - show real-time output')
  .option('-n, --concurrency <number>', 'Number of parallel workers (1-10, default: 1)', '1')
  .action(async (options) => {
    try {
      const agent = new TestAgent();
      agent.initialize();

      console.log('\n E2E Test Agent\n');

      // Load goal tests for summary
      const dbGoalTests = loadGoalTestsFromDatabase();
      const allGoalTests = [...goalHappyPathScenarios, ...dbGoalTests];
      const goalTestCount = allGoalTests.length;

      const summary = getScenarioSummary();
      console.log(`Available scenarios: ${summary.total + goalTestCount}`);
      console.log(`  - Goal Tests: ${goalTestCount} (dynamic flow)`);
      console.log(`  - Happy Path: ${summary.byCategory['happy-path']} (legacy)`);
      console.log(`  - Edge Cases: ${summary.byCategory['edge-case']} (legacy)`);
      console.log(`  - Error Handling: ${summary.byCategory['error-handling']} (legacy)`);
      console.log('');

      // Parse scenarios option (comma-separated) - also handle single --scenario
      let scenarioIds: string[] | undefined = options.scenarios
        ? options.scenarios.split(',').map((s: string) => s.trim())
        : undefined;

      // If --scenario (singular) is provided, add it to scenarioIds
      if (options.scenario) {
        scenarioIds = scenarioIds ? [...scenarioIds, options.scenario] : [options.scenario];
      }

      if (scenarioIds) {
        console.log(`Filtering to scenarios: ${scenarioIds.join(', ')}`);
      }

      // Parse concurrency option
      const concurrency = parseInt(options.concurrency, 10) || 1;

      // Check if any scenario IDs are goal-oriented tests (start with "GOAL-")
      const hasGoalTests = scenarioIds?.some(id => id.startsWith('GOAL-')) || false;
      const goalScenarioIds = scenarioIds?.filter(id => id.startsWith('GOAL-')) || [];
      const regularScenarioIds = scenarioIds?.filter(id => !id.startsWith('GOAL-'));

      let result;

      if (hasGoalTests && goalScenarioIds.length > 0) {
        // Run goal-oriented tests using GoalTestRunner
        console.log('\nDetected goal-oriented test IDs, using GoalTestRunner...\n');
        const db = new Database();
        db.initialize();
        result = await runGoalTests(goalScenarioIds, concurrency, db);

        // If there are also regular tests, run those too
        if (regularScenarioIds && regularScenarioIds.length > 0) {
          console.log('\nAlso running regular tests...\n');
          const regularResult = await agent.run({
            category: options.category,
            scenarioIds: regularScenarioIds,
            failedOnly: options.failed,
            watch: options.watch,
            concurrency,
          });

          // Combine results
          result = {
            runId: result.runId,
            totalTests: result.totalTests + regularResult.totalTests,
            passed: result.passed + regularResult.passed,
            failed: result.failed + regularResult.failed,
            skipped: result.skipped + regularResult.skipped,
            duration: result.duration + regularResult.duration,
            results: [...result.results, ...regularResult.results],
          };
        }
      } else {
        // Run regular tests using TestAgent
        result = await agent.run({
          category: options.category,
          scenarioIds, // Unified handling for single and multiple scenarios
          failedOnly: options.failed,
          watch: options.watch,
          concurrency,
        });
      }

      // Save recommendations if there were failures
      if (result.failed > 0) {
        const recommendations = await agent.generateRecommendations(result.results);
        const db = new Database();
        db.initialize();
        db.saveRecommendations(result.runId, recommendations);
      }

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Results command
program
  .command('results')
  .description('View test results')
  .option('-r, --run <runId>', 'View results for specific run')
  .option('-l, --last', 'View results from last run')
  .option('--list', 'List all test runs')
  .action((options) => {
    try {
      const db = new Database();
      db.initialize();

      if (options.list) {
        const runs = db.getRecentRuns(10);

        if (runs.length === 0) {
          console.log('\nNo test runs found.\n');
          return;
        }

        console.log('\n Recent Test Runs\n');
        console.log('─'.repeat(80));

        for (const run of runs) {
          const passRate = run.totalTests > 0 ? ((run.passed / run.totalTests) * 100).toFixed(1) : 0;
          const status = run.failed === 0 ? '' : '';

          console.log(`${status} ${run.runId}`);
          console.log(`   Date: ${run.startedAt}`);
          console.log(`   Tests: ${run.passed}/${run.totalTests} passed (${passRate}%)`);
          console.log('');
        }
        return;
      }

      let runId: string;

      if (options.run) {
        runId = options.run;
      } else {
        const lastRun = db.getLastTestRun();
        if (!lastRun) {
          console.log('\nNo test runs found. Run tests first with: npx ts-node src/index.ts run\n');
          return;
        }
        runId = lastRun.runId;
      }

      const results = db.getTestResults(runId);

      if (results.length === 0) {
        console.log(`\nNo results found for run: ${runId}\n`);
        return;
      }

      console.log(`\n Results for ${runId}\n`);
      console.log('─'.repeat(60));

      for (const result of results) {
        reporter.printTestResult(result);
      }

      const passed = results.filter(r => r.status === 'passed').length;
      const failed = results.filter(r => r.status === 'failed' || r.status === 'error').length;

      console.log('─'.repeat(60));
      console.log(`Total: ${passed} passed, ${failed} failed\n`);

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Transcript command
program
  .command('transcript <testId>')
  .description('View conversation transcript for a test')
  .option('-r, --run <runId>', 'Specify run ID')
  .action((testId, options) => {
    try {
      const db = new Database();
      db.initialize();

      const transcript = db.getTranscript(testId, options.run);

      if (transcript.length === 0) {
        console.log(`\nNo transcript found for test: ${testId}\n`);
        return;
      }

      reporter.printTranscript(testId, transcript);

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Recommendations command
program
  .command('recommendations')
  .description('View recommendations from test failures')
  .option('-t, --type <type>', 'Filter by type (flowise-prompt, function-tool, node-red, backend)')
  .option('-p, --priority <min>', 'Minimum priority (1-10)', '1')
  .action((options) => {
    try {
      const db = new Database();
      db.initialize();

      let recommendations = db.getRecommendations();

      if (recommendations.length === 0) {
        console.log('\nNo recommendations found. Run tests first to generate recommendations.\n');
        return;
      }

      // Filter by type
      if (options.type) {
        recommendations = recommendations.filter(r => r.type === options.type);
      }

      // Filter by priority
      const minPriority = parseInt(options.priority, 10);
      recommendations = recommendations.filter(r => r.priority >= minPriority);

      if (recommendations.length === 0) {
        console.log('\nNo recommendations match the filters.\n');
        return;
      }

      reporter.printRecommendations(recommendations);

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Report command
program
  .command('report')
  .description('Generate a detailed report')
  .option('-f, --format <format>', 'Output format (markdown, json)', 'markdown')
  .option('-o, --output <file>', 'Output file path')
  .action(async (options) => {
    try {
      const agent = new TestAgent();
      agent.initialize();

      const report = await agent.generateReport(options.format);

      if (options.output) {
        fs.writeFileSync(options.output, report, 'utf-8');
        reporter.printSuccess(`Report saved to: ${options.output}`);
      } else if (options.format === 'markdown') {
        const filepath = markdownReporter.saveReport(report);
        reporter.printSuccess(`Report saved to: ${filepath}`);
        console.log('\n' + report);
      } else {
        console.log(report);
      }

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Regression check command
program
  .command('regression-check')
  .description('Check for regressions compared to previous run')
  .action(() => {
    try {
      const agent = new TestAgent();
      agent.initialize();

      const regressions = agent.checkRegressions();

      if (regressions.length === 0) {
        console.log('\n No regressions detected!\n');
        return;
      }

      console.log('\n  Regressions Detected\n');
      console.log('─'.repeat(60));

      for (const reg of regressions) {
        console.log(`\n ${reg.test}`);
        console.log(`   Type: ${reg.type}`);
        console.log(`   Details: ${reg.details}`);
      }

      console.log('\n' + '─'.repeat(60));
      console.log(`Total: ${regressions.length} regression(s)\n`);

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Scenarios command
program
  .command('scenarios')
  .description('List available test scenarios')
  .option('-c, --category <category>', 'Filter by category')
  .option('-g, --goal-tests', 'Show only goal-oriented tests')
  .option('-a, --all', 'Show both legacy and goal-oriented tests')
  .action((options) => {
    try {
      const { allScenarios } = require('./tests/scenarios');

      // Load goal tests (TypeScript + database)
      const dbGoalTests = loadGoalTestsFromDatabase();
      const allGoalTests = [...goalHappyPathScenarios, ...dbGoalTests];

      // Determine what to show
      const showGoalTests = options.goalTests || options.all || !options.category;
      const showLegacyTests = !options.goalTests || options.all;

      let scenarios = showLegacyTests ? allScenarios : [];
      let goalTests = showGoalTests ? allGoalTests : [];

      if (options.category) {
        scenarios = scenarios.filter((s: any) => s.category === options.category);
        goalTests = goalTests.filter((s: any) => s.category === options.category);
      }

      console.log('\n Available Test Scenarios\n');
      console.log('─'.repeat(70));

      // Show goal-oriented tests first
      if (goalTests.length > 0) {
        console.log('\n GOAL-ORIENTED TESTS (Dynamic Flow)');
        console.log('');

        const goalCategories = ['happy-path', 'edge-case', 'error-handling'];
        for (const cat of goalCategories) {
          const catTests = goalTests.filter((s: any) => s.category === cat);
          if (catTests.length === 0) continue;

          console.log(`  ${cat.toUpperCase().replace('-', ' ')}`);
          for (const test of catTests) {
            console.log(`    ${test.id}`);
            console.log(`      ${test.name}`);
            console.log(`      Goals: ${test.goals?.length || 0} | Persona: ${test.persona?.name || 'N/A'}`);
          }
          console.log('');
        }
      }

      // Show legacy tests
      if (scenarios.length > 0) {
        console.log('\n LEGACY TESTS (Script-Based)');

        const categories = ['happy-path', 'edge-case', 'error-handling'];
        for (const cat of categories) {
          const catScenarios = scenarios.filter((s: any) => s.category === cat);
          if (catScenarios.length === 0) continue;

          console.log(`\n  ${cat.toUpperCase().replace('-', ' ')}`);

          for (const scenario of catScenarios) {
            console.log(`    ${scenario.id}`);
            console.log(`      ${scenario.name}`);
            console.log(`      Steps: ${scenario.steps.length} | Tags: ${scenario.tags.join(', ')}`);
          }
        }
      }

      console.log('\n' + '─'.repeat(70));
      console.log(`Total: ${goalTests.length} goal tests + ${scenarios.length} legacy tests = ${goalTests.length + scenarios.length} scenarios`);
      console.log('\nUsage:');
      console.log('  npm run run -- --scenario GOAL-HAPPY-001   # Run single goal test');
      console.log('  npm run run -- --scenarios GOAL-HAPPY-001,GOAL-HAPPY-002');
      console.log('  npm run run -- --scenario HAPPY-001        # Run single legacy test');
      console.log('');

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Clear command
program
  .command('clear')
  .description('Clear all test data')
  .option('-f, --force', 'Skip confirmation')
  .action((options) => {
    try {
      if (!options.force) {
        console.log('\nThis will delete all test runs, results, and recommendations.');
        console.log('Use --force to confirm.\n');
        return;
      }

      const db = new Database();
      db.initialize();
      db.clear();

      reporter.printSuccess('All test data cleared.');

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// ============================================================================
// DYNAMIC AGENT TUNING COMMANDS
// ============================================================================

// Diagnose command - Run tests and analyze failures with LLM
program
  .command('diagnose')
  .description('Run tests and generate agent fix recommendations using LLM analysis')
  .option('-c, --category <category>', 'Run tests in specific category')
  .option('-s, --scenario <id>', 'Run specific scenario by ID')
  .option('-n, --concurrency <number>', 'Number of parallel workers (1-10, default: 1)', '1')
  .option('--no-llm', 'Use rule-based analysis only (no Claude API)')
  .action(async (options) => {
    try {
      const db = new Database();
      db.initialize();

      const agent = new TestAgent();
      agent.initialize();

      console.log('\n DYNAMIC AGENT TUNING\n');
      console.log('═'.repeat(60));

      // Run tests
      console.log('\n Phase 1: Running Tests...\n');

      // Parse concurrency option
      const concurrency = parseInt(options.concurrency, 10) || 1;

      const result = await agent.run({
        category: options.category,
        scenario: options.scenario,
        concurrency,
      });

      if (result.failed === 0) {
        console.log('\n All tests passed! No diagnosis needed.\n');
        return;
      }

      // Analyze failures
      console.log('\n Phase 2: Analyzing Failures...\n');

      const analyzer = new AgentFailureAnalyzer(db);
      const report = await analyzer.analyzeRun(result.runId, {
        useLLM: options.llm !== false,
        saveToDatabase: true,
      });

      // Print summary
      console.log('\n');
      console.log('═'.repeat(60));
      console.log(' ANALYSIS COMPLETE');
      console.log('═'.repeat(60));

      console.log(`\n Failures Analyzed: ${report.analyzedCount}/${report.totalFailures}`);
      console.log(` Fixes Generated: ${report.generatedFixes.length}`);
      console.log(`   - Prompt fixes: ${report.summary.promptFixes}`);
      console.log(`   - Tool fixes: ${report.summary.toolFixes}`);
      console.log(`   - High confidence (80%+): ${report.summary.highConfidenceFixes}`);

      if (Object.keys(report.summary.rootCauseBreakdown).length > 0) {
        console.log('\n Root Cause Breakdown:');
        for (const [cause, count] of Object.entries(report.summary.rootCauseBreakdown)) {
          console.log(`   - ${cause}: ${count}`);
        }
      }

      if (report.generatedFixes.length > 0) {
        console.log('\n View fixes with: npm run fixes');
        console.log(' Generate report: npm run fix-report\n');
      }

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Fixes command - View generated fixes
program
  .command('fixes')
  .description('View generated agent fixes')
  .option('-t, --type <type>', 'Filter by type (prompt, tool)')
  .option('-s, --status <status>', 'Filter by status (pending, applied, verified, rejected)')
  .option('-r, --run <runId>', 'Filter by run ID')
  .action((options) => {
    try {
      const db = new Database();
      db.initialize();

      let fixes = db.getGeneratedFixes(options.run, options.status);

      if (options.type) {
        fixes = fixes.filter(f => f.type === options.type);
      }

      if (fixes.length === 0) {
        console.log('\n No fixes found matching criteria.');
        console.log(' Run "npm run diagnose" to generate fixes.\n');
        return;
      }

      console.log('\n');
      console.log('═'.repeat(70));
      console.log(' AGENT TUNING RECOMMENDATIONS');
      console.log('═'.repeat(70));

      const stats = db.getFixStatistics();
      console.log(`\n Total: ${stats.total} | Pending: ${stats.pending} | Applied: ${stats.applied} | Verified: ${stats.verified}\n`);

      for (let i = 0; i < fixes.length; i++) {
        const fix = fixes[i];
        const confidencePct = (fix.confidence * 100).toFixed(0);
        const typeLabel = fix.type === 'prompt' ? 'PROMPT' : 'TOOL';

        console.log('─'.repeat(70));
        console.log(`FIX #${i + 1} [${typeLabel}] Priority: ${fix.priority.toUpperCase()} | Confidence: ${confidencePct}%`);
        console.log('─'.repeat(70));

        console.log(`\n ID: ${fix.fixId}`);
        console.log(` Status: ${fix.status}`);
        console.log(` File: ${fix.targetFile}`);

        if (fix.location) {
          if (fix.location.section) console.log(` Section: ${fix.location.section}`);
          if (fix.location.function) console.log(` Function: ${fix.location.function}`);
        }

        console.log(`\n Problem: ${fix.changeDescription}`);

        if (fix.rootCause) {
          console.log(` Root Cause: ${fix.rootCause.type}`);
        }

        console.log(`\n Affected Tests: ${fix.affectedTests.join(', ')}`);

        console.log('\n Suggested Code:');
        console.log(' ┌' + '─'.repeat(66) + '┐');
        const codeLines = fix.changeCode.split('\n');
        for (const line of codeLines.slice(0, 15)) {
          const truncatedLine = line.substring(0, 64);
          console.log(` │ ${truncatedLine.padEnd(64)} │`);
        }
        if (codeLines.length > 15) {
          console.log(` │ ${'... (truncated)'.padEnd(64)} │`);
        }
        console.log(' └' + '─'.repeat(66) + '┘');

        console.log('');
      }

      console.log('═'.repeat(70));
      console.log('\n To apply: Update the target file with the suggested code');
      console.log(' Then re-run tests: npm run run:happy\n');

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Fix report command - Generate markdown report
program
  .command('fix-report')
  .description('Generate a markdown report of agent fixes')
  .option('-o, --output <file>', 'Output file path')
  .action((options) => {
    try {
      const db = new Database();
      db.initialize();

      const fixes = db.getGeneratedFixes();
      const stats = db.getFixStatistics();
      const lastRun = db.getLastTestRun();

      if (fixes.length === 0) {
        console.log('\n No fixes found. Run "npm run diagnose" first.\n');
        return;
      }

      // Generate markdown report
      let report = `# Agent Tuning Report\n\n`;
      report += `**Generated:** ${new Date().toISOString()}\n`;
      if (lastRun) {
        report += `**Last Run:** ${lastRun.runId}\n`;
        const passRate = lastRun.totalTests > 0
          ? ((lastRun.passed / lastRun.totalTests) * 100).toFixed(1)
          : 0;
        report += `**Pass Rate:** ${passRate}% (${lastRun.passed}/${lastRun.totalTests})\n`;
      }
      report += `\n---\n\n`;

      report += `## Summary\n\n`;
      report += `| Metric | Count |\n`;
      report += `|--------|-------|\n`;
      report += `| Total Fixes | ${stats.total} |\n`;
      report += `| Pending | ${stats.pending} |\n`;
      report += `| Applied | ${stats.applied} |\n`;
      report += `| Verified | ${stats.verified} |\n`;
      report += `| Rejected | ${stats.rejected} |\n`;
      report += `\n`;

      // Group by type
      const promptFixes = fixes.filter(f => f.type === 'prompt');
      const toolFixes = fixes.filter(f => f.type === 'tool');

      if (promptFixes.length > 0) {
        report += `## Prompt Fixes (${promptFixes.length})\n\n`;
        for (const fix of promptFixes) {
          report += `### ${fix.fixId}\n\n`;
          report += `- **Priority:** ${fix.priority}\n`;
          report += `- **Confidence:** ${(fix.confidence * 100).toFixed(0)}%\n`;
          report += `- **File:** \`${fix.targetFile}\`\n`;
          report += `- **Status:** ${fix.status}\n`;
          if (fix.location?.section) {
            report += `- **Section:** ${fix.location.section}\n`;
          }
          report += `- **Affected Tests:** ${fix.affectedTests.join(', ')}\n\n`;
          report += `**Problem:** ${fix.changeDescription}\n\n`;
          report += `**Suggested Change:**\n\`\`\`\n${fix.changeCode}\n\`\`\`\n\n`;
          report += `---\n\n`;
        }
      }

      if (toolFixes.length > 0) {
        report += `## Tool Fixes (${toolFixes.length})\n\n`;
        for (const fix of toolFixes) {
          report += `### ${fix.fixId}\n\n`;
          report += `- **Priority:** ${fix.priority}\n`;
          report += `- **Confidence:** ${(fix.confidence * 100).toFixed(0)}%\n`;
          report += `- **File:** \`${fix.targetFile}\`\n`;
          report += `- **Status:** ${fix.status}\n`;
          if (fix.location?.function) {
            report += `- **Function:** ${fix.location.function}\n`;
          }
          report += `- **Affected Tests:** ${fix.affectedTests.join(', ')}\n\n`;
          report += `**Problem:** ${fix.changeDescription}\n\n`;
          report += `**Suggested Code:**\n\`\`\`javascript\n${fix.changeCode}\n\`\`\`\n\n`;
          report += `---\n\n`;
        }
      }

      report += `\n*Report generated by E2E Test Agent - Dynamic Agent Tuning System*\n`;

      // Save or print
      if (options.output) {
        fs.writeFileSync(options.output, report, 'utf-8');
        reporter.printSuccess(`Report saved to: ${options.output}`);
      } else {
        const outputPath = `./data/reports/fixes-${new Date().toISOString().slice(0, 10)}.md`;
        const dir = './data/reports';
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(outputPath, report, 'utf-8');
        reporter.printSuccess(`Report saved to: ${outputPath}`);
        console.log('\n' + report);
      }

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Fix status command - Update fix status
program
  .command('fix-status <fixId> <status>')
  .description('Update the status of a fix (pending, applied, rejected, verified)')
  .action((fixId, status) => {
    try {
      const validStatuses = ['pending', 'applied', 'rejected', 'verified'];
      if (!validStatuses.includes(status)) {
        console.log(`\n Invalid status. Use one of: ${validStatuses.join(', ')}\n`);
        return;
      }

      const db = new Database();
      db.initialize();

      const fix = db.getGeneratedFix(fixId);
      if (!fix) {
        console.log(`\n Fix not found: ${fixId}\n`);
        return;
      }

      db.updateFixStatus(fixId, status as any);
      reporter.printSuccess(`Fix ${fixId} marked as ${status}`);

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Analyze command - Analyze failures from an existing run (without running tests)
program
  .command('analyze <runId>')
  .description('Analyze failures from an existing test run and generate fixes')
  .option('--no-llm', 'Use rule-based analysis only (no Claude API)')
  .action(async (runId, options) => {
    try {
      const db = new Database();
      db.initialize();

      // Verify run exists
      const runs = db.getRecentRuns(100);
      const run = runs.find(r => r.runId === runId);
      if (!run) {
        console.error(`\n Error: Run not found: ${runId}\n`);
        process.exit(1);
      }

      console.log('\n ANALYZING TEST RUN\n');
      console.log('═'.repeat(60));
      console.log(`Run ID: ${runId}`);
      console.log(`Status: ${run.status}`);
      console.log(`Tests: ${run.passed}/${run.totalTests} passed, ${run.failed} failed`);

      if (run.failed === 0) {
        console.log('\n All tests passed! No failures to analyze.\n');
        // Output JSON for backend parsing
        console.log('\n__RESULT_JSON__');
        console.log(JSON.stringify({ success: true, fixesGenerated: 0, message: 'No failures to analyze' }));
        process.exit(0);
      }

      console.log('\n Analyzing Failures...\n');

      const analyzer = new AgentFailureAnalyzer(db);
      const report = await analyzer.analyzeRun(runId, {
        useLLM: options.llm !== false,
        saveToDatabase: true,
      });

      // Print summary
      console.log('\n');
      console.log('═'.repeat(60));
      console.log(' ANALYSIS COMPLETE');
      console.log('═'.repeat(60));

      console.log(`\n Failures Analyzed: ${report.analyzedCount}/${report.totalFailures}`);
      console.log(` Fixes Generated: ${report.generatedFixes.length}`);
      console.log(`   - Prompt fixes: ${report.summary.promptFixes}`);
      console.log(`   - Tool fixes: ${report.summary.toolFixes}`);
      console.log(`   - High confidence (80%+): ${report.summary.highConfidenceFixes}`);

      if (Object.keys(report.summary.rootCauseBreakdown).length > 0) {
        console.log('\n Root Cause Breakdown:');
        for (const [cause, count] of Object.entries(report.summary.rootCauseBreakdown)) {
          console.log(`   - ${cause}: ${count}`);
        }
      }

      // Output JSON for backend parsing
      console.log('\n__RESULT_JSON__');
      console.log(JSON.stringify({
        success: true,
        fixesGenerated: report.generatedFixes.length,
        analyzedCount: report.analyzedCount,
        totalFailures: report.totalFailures,
        summary: report.summary,
      }));

    } catch (error: any) {
      console.error(`\n Error: ${error.message}\n`);
      console.log('\n__RESULT_JSON__');
      console.log(JSON.stringify({ success: false, error: error.message }));
      process.exit(1);
    }
  });

// ============================================================================
// A/B TESTING COMMANDS
// ============================================================================

import { getABTestingServices } from './services/ab-testing';

// AB Create command - Create an experiment from a fix
program
  .command('ab-create')
  .description('Create an A/B experiment from a pending fix')
  .requiredOption('-f, --fix <fixId>', 'Fix ID to test')
  .option('-n, --name <name>', 'Experiment name')
  .option('-t, --tests <ids>', 'Test IDs (comma-separated)')
  .option('--min-samples <n>', 'Minimum sample size per variant', '10')
  .action(async (options) => {
    try {
      const db = new Database();
      db.initialize();

      const { variantService, triggerService, experimentService } = getABTestingServices(db);

      // Get the fix
      const fix = db.getGeneratedFix(options.fix);
      if (!fix) {
        console.log(`\n Fix not found: ${options.fix}\n`);
        process.exit(1);
      }

      console.log('\n A/B EXPERIMENT CREATION\n');
      console.log('═'.repeat(60));

      // Assess impact
      const impact = triggerService.assessFixImpact(fix);
      console.log(`\n Impact Assessment:`);
      console.log(`   Level: ${impact.impactLevel.toUpperCase()}`);
      console.log(`   Should Test: ${impact.shouldTest ? 'YES' : 'NO'}`);
      console.log(`   Reason: ${impact.reason}`);

      if (!impact.shouldTest) {
        console.log(`\n This fix has minimal impact and may not warrant A/B testing.`);
        console.log(` Proceeding anyway as requested...\n`);
      }

      // Capture baseline if needed
      console.log(`\n Capturing baseline for ${fix.targetFile}...`);
      await variantService.captureCurrentBaselines();

      // Create variant from fix
      console.log(` Creating treatment variant from fix...`);
      const treatmentVariant = await variantService.createVariantFromFix(fix);
      console.log(`   Variant ID: ${treatmentVariant.variantId}`);

      // Get control (baseline) variant
      const controlVariant = variantService.getBaselineVariant(fix.targetFile);
      if (!controlVariant) {
        console.log(`\n Error: No baseline found for ${fix.targetFile}\n`);
        process.exit(1);
      }

      // Determine test IDs
      const testIds = options.tests
        ? options.tests.split(',').map((t: string) => t.trim())
        : impact.affectedTests.length > 0
          ? impact.affectedTests
          : ['GOAL-HAPPY-001'];

      // Create experiment
      const experiment = experimentService.createExperiment({
        name: options.name || `Test: ${fix.changeDescription.substring(0, 40)}`,
        hypothesis: `Applying this fix will improve pass rate for ${testIds.join(', ')}`,
        experimentType: fix.type,
        controlVariantId: controlVariant.variantId,
        treatmentVariantIds: [treatmentVariant.variantId],
        testIds,
        minSampleSize: parseInt(options.minSamples, 10) || 10,
      });

      console.log(`\n Experiment Created!`);
      console.log('─'.repeat(60));
      console.log(`   ID: ${experiment.experimentId}`);
      console.log(`   Name: ${experiment.name}`);
      console.log(`   Status: ${experiment.status}`);
      console.log(`   Control: ${controlVariant.variantId}`);
      console.log(`   Treatment: ${treatmentVariant.variantId}`);
      console.log(`   Tests: ${testIds.join(', ')}`);
      console.log(`   Min Samples: ${experiment.minSampleSize} per variant`);

      console.log(`\n Next steps:`);
      console.log(`   1. Start experiment: npm run ab-run ${experiment.experimentId}`);
      console.log(`   2. View status: npm run ab-status ${experiment.experimentId}`);
      console.log(`   3. Conclude: npm run ab-conclude ${experiment.experimentId}\n`);

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// AB Run command - Run an experiment
program
  .command('ab-run <experimentId>')
  .description('Run an A/B experiment')
  .option('-n, --iterations <n>', 'Number of iterations per variant', '10')
  .action(async (experimentId, options) => {
    try {
      const db = new Database();
      db.initialize();

      const { experimentService, variantService } = getABTestingServices(db);

      // Get experiment
      const experiment = experimentService.getExperiment(experimentId);
      if (!experiment) {
        console.log(`\n Experiment not found: ${experimentId}\n`);
        process.exit(1);
      }

      console.log('\n A/B EXPERIMENT RUNNER\n');
      console.log('═'.repeat(60));
      console.log(`   Experiment: ${experiment.name}`);
      console.log(`   ID: ${experimentId}`);
      console.log(`   Status: ${experiment.status}`);

      // Start experiment if in draft
      if (experiment.status === 'draft') {
        experimentService.startExperiment(experimentId);
        console.log(`   Status updated to: running`);
      } else if (experiment.status !== 'running') {
        console.log(`\n Experiment is ${experiment.status}, cannot run.\n`);
        process.exit(1);
      }

      const iterations = parseInt(options.iterations, 10) || 10;
      const totalRuns = iterations * 2; // Control + treatment
      console.log(`\n Running ${totalRuns} test iterations (${iterations} per variant)...\n`);

      // Get goal test scenarios
      const dbScenarios = loadGoalTestsFromDatabase();
      const allGoalScenarios = [...goalHappyPathScenarios, ...dbScenarios];

      let controlRuns = 0;
      let treatmentRuns = 0;
      let controlPassed = 0;
      let treatmentPassed = 0;

      // Run iterations
      for (let i = 0; i < totalRuns; i++) {
        // Select variant
        const selection = experimentService.selectVariant(experimentId, experiment.testIds[0]);
        const isControl = selection.role === 'control';

        console.log(`[${i + 1}/${totalRuns}] Running with ${isControl ? 'CONTROL' : 'TREATMENT'} variant...`);

        // Apply variant
        await variantService.applyVariant(selection.variantId);

        try {
          // Run a random test from the experiment's test IDs
          const testId = experiment.testIds[Math.floor(Math.random() * experiment.testIds.length)];
          const scenario = allGoalScenarios.find(s => s.id === testId);

          if (!scenario) {
            console.log(`   Skipping: Test ${testId} not found`);
            continue;
          }

          // Create runner
          const flowiseClient = new FlowiseClient();
          const intentDetector = new IntentDetector();
          const runner = new GoalTestRunner(flowiseClient, db, intentDetector);

          const runId = db.createTestRun();
          const result = await runner.runTest(scenario, runId);

          // Record experiment run
          experimentService.recordTestResult(experimentId, runId, testId, selection, {
            passed: result.passed,
            turnCount: result.turnCount,
            durationMs: result.durationMs,
            goalCompletionRate: result.goalResults.filter(g => g.passed).length / Math.max(result.goalResults.length, 1),
            constraintViolations: result.constraintViolations.length,
            errorOccurred: !!result.issues.find(i => i.type === 'error'),
            goalsCompleted: result.goalResults.filter(g => g.passed).length,
            goalsTotal: result.goalResults.length,
            issuesDetected: result.issues.length,
          });

          // Track stats
          if (isControl) {
            controlRuns++;
            if (result.passed) controlPassed++;
          } else {
            treatmentRuns++;
            if (result.passed) treatmentPassed++;
          }

          const status = result.passed ? '✓' : '✗';
          console.log(`   ${status} ${testId} (${result.turnCount} turns, ${result.durationMs}ms)`);

        } finally {
          // Always rollback
          await variantService.rollback(selection.targetFile);
        }
      }

      // Print summary
      console.log('\n');
      console.log('═'.repeat(60));
      console.log(' EXPERIMENT PROGRESS');
      console.log('═'.repeat(60));
      console.log(`\n Control:   ${controlPassed}/${controlRuns} passed (${controlRuns > 0 ? ((controlPassed / controlRuns) * 100).toFixed(1) : 0}%)`);
      console.log(` Treatment: ${treatmentPassed}/${treatmentRuns} passed (${treatmentRuns > 0 ? ((treatmentPassed / treatmentRuns) * 100).toFixed(1) : 0}%)`);

      // Check if should conclude
      const conclusion = experimentService.shouldConcludeExperiment(experimentId);
      console.log(`\n ${conclusion.message}`);

      if (conclusion.shouldConclude) {
        console.log(`\n Ready to conclude. Run: npm run ab-conclude ${experimentId}\n`);
      } else {
        console.log(`\n Continue running: npm run ab-run ${experimentId} -n ${iterations}\n`);
      }

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// AB Status command - View experiment status
program
  .command('ab-status [experimentId]')
  .description('View A/B experiment status and results')
  .option('-a, --all', 'Show all experiments')
  .action((experimentId, options) => {
    try {
      const db = new Database();
      db.initialize();

      const { experimentService } = getABTestingServices(db);

      if (options.all || !experimentId) {
        // List all experiments
        const experiments = experimentService.getAllExperiments({ limit: 20 });

        if (experiments.length === 0) {
          console.log('\n No experiments found.');
          console.log(' Create one with: npm run ab-create --fix <fixId>\n');
          return;
        }

        console.log('\n A/B EXPERIMENTS\n');
        console.log('═'.repeat(70));

        for (const exp of experiments) {
          const summary = experimentService.getExperimentSummary(exp.experimentId);
          const statusIcon = exp.status === 'running' ? '▶' :
                            exp.status === 'completed' ? '✓' :
                            exp.status === 'aborted' ? '✗' : '○';

          console.log(`\n${statusIcon} ${exp.experimentId}`);
          console.log(`  Name: ${exp.name}`);
          console.log(`  Status: ${exp.status}`);
          console.log(`  Samples: Control ${summary.controlSamples}/${exp.minSampleSize}, Treatment ${summary.treatmentSamples}/${exp.minSampleSize}`);

          if (summary.controlPassRate !== undefined) {
            console.log(`  Pass Rates: Control ${(summary.controlPassRate * 100).toFixed(1)}%, Treatment ${(summary.treatmentPassRate! * 100).toFixed(1)}%`);
          }

          if (summary.isSignificant !== undefined) {
            console.log(`  Significant: ${summary.isSignificant ? 'YES' : 'NO'} (p=${summary.pValue?.toFixed(4)})`);
          }

          if (summary.conclusion) {
            console.log(`  Conclusion: ${summary.conclusion}`);
          }
        }

        console.log('\n' + '═'.repeat(70) + '\n');
        return;
      }

      // Show specific experiment
      const experiment = experimentService.getExperiment(experimentId);
      if (!experiment) {
        console.log(`\n Experiment not found: ${experimentId}\n`);
        process.exit(1);
      }

      const summary = experimentService.getExperimentSummary(experimentId);
      const analysis = experiment.status === 'running' || experiment.status === 'completed'
        ? experimentService.getExperimentStats(experimentId)
        : null;

      console.log('\n A/B EXPERIMENT DETAILS\n');
      console.log('═'.repeat(70));

      console.log(`\n Experiment: ${experiment.name}`);
      console.log(` ID: ${experimentId}`);
      console.log(` Status: ${experiment.status}`);
      console.log(` Hypothesis: ${experiment.hypothesis}`);
      console.log(` Tests: ${experiment.testIds.join(', ')}`);
      console.log(` Created: ${experiment.createdAt}`);
      if (experiment.startedAt) console.log(` Started: ${experiment.startedAt}`);
      if (experiment.completedAt) console.log(` Completed: ${experiment.completedAt}`);

      console.log('\n VARIANTS');
      console.log('─'.repeat(70));
      for (const v of experiment.variants) {
        console.log(`   ${v.role.toUpperCase()}: ${v.variantId} (${v.weight}% traffic)`);
      }

      console.log('\n SAMPLE SIZES');
      console.log('─'.repeat(70));
      console.log(`   Control: ${summary.controlSamples}/${experiment.minSampleSize} (min required)`);
      console.log(`   Treatment: ${summary.treatmentSamples}/${experiment.minSampleSize} (min required)`);

      if (analysis) {
        console.log('\n RESULTS');
        console.log('─'.repeat(70));
        console.log(`   Control Pass Rate: ${(analysis.controlPassRate * 100).toFixed(1)}%`);
        console.log(`   Treatment Pass Rate: ${(analysis.treatmentPassRate * 100).toFixed(1)}%`);
        console.log(`   Difference: ${analysis.passRateDifference >= 0 ? '+' : ''}${(analysis.passRateDifference * 100).toFixed(1)}%`);
        console.log(`   Lift: ${analysis.passRateLift >= 0 ? '+' : ''}${analysis.passRateLift.toFixed(1)}%`);

        console.log('\n STATISTICAL SIGNIFICANCE');
        console.log('─'.repeat(70));
        console.log(`   Pass Rate p-value: ${analysis.passRatePValue.toFixed(4)}`);
        console.log(`   Significant (p < 0.05): ${analysis.passRateSignificant ? 'YES' : 'NO'}`);
        console.log(`   Confidence Level: ${(analysis.confidenceLevel * 100).toFixed(1)}%`);

        console.log('\n RECOMMENDATION');
        console.log('─'.repeat(70));
        console.log(`   ${analysis.recommendationReason}`);
        console.log(`   Action: ${analysis.recommendation.toUpperCase()}`);
      }

      if (experiment.conclusion) {
        console.log('\n CONCLUSION');
        console.log('─'.repeat(70));
        console.log(`   ${experiment.conclusion}`);
        if (experiment.winningVariantId) {
          console.log(`   Winner: ${experiment.winningVariantId}`);
        }
      }

      console.log('\n' + '═'.repeat(70) + '\n');

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// AB Conclude command - Conclude an experiment
program
  .command('ab-conclude <experimentId>')
  .description('Conclude an experiment and optionally adopt winner')
  .option('--adopt', 'Adopt winning variant as new baseline')
  .action(async (experimentId, options) => {
    try {
      const db = new Database();
      db.initialize();

      const { experimentService } = getABTestingServices(db);

      const experiment = experimentService.getExperiment(experimentId);
      if (!experiment) {
        console.log(`\n Experiment not found: ${experimentId}\n`);
        process.exit(1);
      }

      if (experiment.status === 'completed') {
        console.log(`\n Experiment already completed.\n`);

        if (options.adopt && experiment.winningVariantId) {
          console.log(` Adopting winner...`);
          await experimentService.adoptWinner(experimentId);
          console.log(` Winner ${experiment.winningVariantId} adopted as new baseline.\n`);
        }
        return;
      }

      console.log('\n CONCLUDING EXPERIMENT\n');
      console.log('═'.repeat(60));

      // Get final analysis
      const analysis = experimentService.getExperimentStats(experimentId);

      console.log(`\n Final Results:`);
      console.log(`   Control: ${(analysis.controlPassRate * 100).toFixed(1)}% pass rate (n=${analysis.controlSampleSize})`);
      console.log(`   Treatment: ${(analysis.treatmentPassRate * 100).toFixed(1)}% pass rate (n=${analysis.treatmentSampleSize})`);
      console.log(`   p-value: ${analysis.passRatePValue.toFixed(4)}`);
      console.log(`   Significant: ${analysis.isSignificant ? 'YES' : 'NO'}`);

      // Conclude
      experimentService.completeExperiment(experimentId);

      const updatedExp = experimentService.getExperiment(experimentId);
      console.log(`\n Conclusion: ${updatedExp?.conclusion}`);

      if (updatedExp?.winningVariantId) {
        console.log(` Winner: ${updatedExp.winningVariantId}`);

        if (options.adopt) {
          console.log(`\n Adopting winner as new baseline...`);
          await experimentService.adoptWinner(experimentId);
          console.log(` Done! The winning variant is now the baseline.\n`);
        } else {
          console.log(`\n To adopt the winner: npm run ab-conclude ${experimentId} --adopt\n`);
        }
      } else {
        console.log(`\n No clear winner. Consider keeping the control variant.\n`);
      }

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// AB Stats command - View A/B testing statistics
program
  .command('ab-stats')
  .description('View A/B testing framework statistics')
  .action(() => {
    try {
      const db = new Database();
      db.initialize();

      const stats = db.getABTestingStats();

      console.log('\n A/B TESTING STATISTICS\n');
      console.log('═'.repeat(50));
      console.log(`\n Experiments:`);
      console.log(`   Total: ${stats.totalExperiments}`);
      console.log(`   Running: ${stats.runningExperiments}`);
      console.log(`   Completed: ${stats.completedExperiments}`);
      console.log(`\n Variants: ${stats.totalVariants}`);
      console.log(` Experiment Runs: ${stats.totalRuns}`);
      console.log('\n' + '═'.repeat(50) + '\n');

    } catch (error: any) {
      reporter.printError(error.message);
      process.exit(1);
    }
  });

// Parse and run
program.parse();

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
import * as fs from 'fs';

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
  .option('-f, --failed', 'Re-run only previously failed tests')
  .option('-w, --watch', 'Watch mode - show real-time output')
  .action(async (options) => {
    try {
      const agent = new TestAgent();
      agent.initialize();

      console.log('\n E2E Test Agent\n');

      const summary = getScenarioSummary();
      console.log(`Available scenarios: ${summary.total}`);
      console.log(`  - Happy Path: ${summary.byCategory['happy-path']}`);
      console.log(`  - Edge Cases: ${summary.byCategory['edge-case']}`);
      console.log(`  - Error Handling: ${summary.byCategory['error-handling']}`);
      console.log('');

      const result = await agent.run({
        category: options.category,
        scenario: options.scenario,
        failedOnly: options.failed,
        watch: options.watch,
      });

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
  .action((options) => {
    try {
      const { allScenarios } = require('./tests/scenarios');
      let scenarios = allScenarios;

      if (options.category) {
        scenarios = scenarios.filter((s: any) => s.category === options.category);
      }

      console.log('\n Available Test Scenarios\n');
      console.log('─'.repeat(70));

      const categories = ['happy-path', 'edge-case', 'error-handling'];

      for (const cat of categories) {
        const catScenarios = scenarios.filter((s: any) => s.category === cat);
        if (catScenarios.length === 0) continue;

        console.log(`\n${cat.toUpperCase().replace('-', ' ')}`);
        console.log('');

        for (const scenario of catScenarios) {
          console.log(`  ${scenario.id}`);
          console.log(`    ${scenario.name}`);
          console.log(`    Steps: ${scenario.steps.length} | Tags: ${scenario.tags.join(', ')}`);
        }
      }

      console.log('\n' + '─'.repeat(70));
      console.log(`Total: ${scenarios.length} scenarios\n`);

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

      const result = await agent.run({
        category: options.category,
        scenario: options.scenario,
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

// Parse and run
program.parse();

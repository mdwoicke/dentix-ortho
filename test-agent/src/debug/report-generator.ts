/**
 * Report Generator
 * Formats and outputs debug flow results
 */

import { DebugReport, Layer, LayerTestResult } from './types';

// ============================================================================
// LAYER METADATA
// ============================================================================

const LAYER_DISPLAY: Record<Layer, { num: number; name: string }> = {
  cloud9: { num: 1, name: 'CLOUD9 DIRECT API' },
  nodered: { num: 2, name: 'NODE-RED ENDPOINTS' },
  flowise: { num: 3, name: 'FLOWISE TOOLS' },
  e2e: { num: 4, name: 'END-TO-END TESTS' },
};

// ============================================================================
// CONSOLE OUTPUT
// ============================================================================

/**
 * Print the debug report to console
 */
export function printReportToConsole(report: DebugReport): void {
  const divider = '='.repeat(80);
  const subDivider = '-'.repeat(80);

  console.log(`\n${divider}`);
  console.log('FINAL SUMMARY');
  console.log(divider);

  // Overall status
  const totalPassed = Object.values(report.summary).reduce((sum, s) => sum + s.passed, 0);
  const totalFailed = Object.values(report.summary).reduce((sum, s) => sum + s.failed, 0);
  const totalSkipped = Object.values(report.summary).reduce((sum, s) => sum + s.skipped, 0);
  const overallStatus = totalFailed === 0 ? 'PASSED' : 'FAILED';

  console.log(`\nOverall: ${overallStatus} (${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped)`);
  console.log(`Duration: ${(report.totalDurationMs / 1000).toFixed(2)}s`);

  // Layer summaries
  console.log(`\n${subDivider}`);
  console.log('Layer Summary:');
  console.log(subDivider);

  for (const layer of ['cloud9', 'nodered', 'flowise', 'e2e'] as Layer[]) {
    const info = LAYER_DISPLAY[layer];
    const summary = report.summary[layer];
    const results = report.layerResults[layer];
    const total = summary.passed + summary.failed + summary.skipped;

    if (total === 0) {
      console.log(`  Layer ${info.num} (${info.name}): SKIPPED`);
    } else {
      const status = summary.failed === 0 ? '\u2713' : '\u2717';
      console.log(`  Layer ${info.num} (${info.name}): ${status} ${summary.passed}/${total} passed`);

      // Show failures
      const failures = results.filter((r) => !r.passed);
      for (const failure of failures) {
        console.log(`    - ${failure.testName}: ${failure.error}`);
      }
    }
  }

  // First failure point
  if (report.firstFailurePoint) {
    console.log(`\n${subDivider}`);
    console.log('FIRST FAILURE POINT:');
    console.log(subDivider);

    const layerInfo = LAYER_DISPLAY[report.firstFailurePoint.layer];
    console.log(`  Layer: ${layerInfo.num} - ${layerInfo.name}`);
    console.log(`  Test: ${report.firstFailurePoint.testName}`);
    console.log(`  Error: ${report.firstFailurePoint.error}`);
  }

  // Recommendation
  if (report.recommendation) {
    console.log(`\n${subDivider}`);
    console.log('RECOMMENDATION:');
    console.log(subDivider);
    console.log(`  ${report.recommendation}`);
  }

  console.log(`\n${divider}\n`);
}

// ============================================================================
// MARKDOWN OUTPUT
// ============================================================================

/**
 * Generate a markdown report
 */
export function generateMarkdownReport(report: DebugReport): string {
  const lines: string[] = [];

  lines.push(`# Debug Flow Report`);
  lines.push(``);
  lines.push(`**Environment:** ${report.environment}`);
  lines.push(`**Started:** ${report.startedAt}`);
  lines.push(`**Completed:** ${report.completedAt}`);
  lines.push(`**Duration:** ${(report.totalDurationMs / 1000).toFixed(2)}s`);
  lines.push(``);

  // Overall status
  const totalFailed = Object.values(report.summary).reduce((sum, s) => sum + s.failed, 0);
  const overallStatus = totalFailed === 0 ? 'PASSED' : 'FAILED';
  lines.push(`## Overall Status: ${overallStatus}`);
  lines.push(``);

  // Layer table
  lines.push(`| Layer | Status | Passed | Failed | Skipped |`);
  lines.push(`|-------|--------|--------|--------|---------|`);

  for (const layer of ['cloud9', 'nodered', 'flowise', 'e2e'] as Layer[]) {
    const info = LAYER_DISPLAY[layer];
    const summary = report.summary[layer];
    const total = summary.passed + summary.failed + summary.skipped;
    const status = total === 0 ? 'SKIPPED' : summary.failed === 0 ? '\u2705' : '\u274c';
    lines.push(
      `| ${info.num}. ${info.name} | ${status} | ${summary.passed} | ${summary.failed} | ${summary.skipped} |`
    );
  }

  lines.push(``);

  // First failure
  if (report.firstFailurePoint) {
    lines.push(`## First Failure Point`);
    lines.push(``);
    const layerInfo = LAYER_DISPLAY[report.firstFailurePoint.layer];
    lines.push(`- **Layer:** ${layerInfo.num} - ${layerInfo.name}`);
    lines.push(`- **Test:** ${report.firstFailurePoint.testName}`);
    lines.push(`- **Error:** ${report.firstFailurePoint.error}`);
    lines.push(``);
  }

  // Recommendation
  if (report.recommendation) {
    lines.push(`## Recommendation`);
    lines.push(``);
    lines.push(report.recommendation);
    lines.push(``);
  }

  // Detailed results per layer
  lines.push(`## Detailed Results`);
  lines.push(``);

  for (const layer of ['cloud9', 'nodered', 'flowise', 'e2e'] as Layer[]) {
    const info = LAYER_DISPLAY[layer];
    const results = report.layerResults[layer];

    if (results.length === 0) continue;

    lines.push(`### Layer ${info.num}: ${info.name}`);
    lines.push(``);
    lines.push(`| Test | Status | Duration | Details |`);
    lines.push(`|------|--------|----------|---------|`);

    for (const result of results) {
      const status = result.passed ? '\u2705' : '\u274c';
      const duration = `${result.durationMs}ms`;
      const details = result.error || result.details || '';
      lines.push(`| ${result.testName} | ${status} | ${duration} | ${details} |`);
    }

    lines.push(``);
  }

  return lines.join('\n');
}

// ============================================================================
// JSON OUTPUT
// ============================================================================

/**
 * Generate a JSON report (for API responses)
 */
export function generateJsonReport(report: DebugReport): object {
  return {
    environment: report.environment,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    totalDurationMs: report.totalDurationMs,
    overallPassed:
      Object.values(report.summary).reduce((sum, s) => sum + s.failed, 0) === 0,
    summary: report.summary,
    firstFailurePoint: report.firstFailurePoint || null,
    recommendation: report.recommendation || null,
    layerResults: Object.fromEntries(
      Object.entries(report.layerResults).map(([layer, results]) => [
        layer,
        results.map((r) => ({
          testName: r.testName,
          passed: r.passed,
          durationMs: r.durationMs,
          error: r.error || null,
          details: r.details || null,
        })),
      ])
    ),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a summary string for quick display
 */
export function getQuickSummary(report: DebugReport): string {
  const totalFailed = Object.values(report.summary).reduce(
    (sum, s) => sum + s.failed,
    0
  );

  if (totalFailed === 0) {
    return `All layers passed in ${(report.totalDurationMs / 1000).toFixed(1)}s`;
  }

  if (report.firstFailurePoint) {
    const info = LAYER_DISPLAY[report.firstFailurePoint.layer];
    return `Failed at Layer ${info.num} (${info.name}): ${report.firstFailurePoint.testName}`;
  }

  return `${totalFailed} test(s) failed`;
}

/**
 * Generate report in specified format
 */
export function generateReport(
  report: DebugReport,
  format: 'console' | 'markdown' | 'json' = 'console'
): string | object | void {
  switch (format) {
    case 'console':
      printReportToConsole(report);
      return;
    case 'markdown':
      return generateMarkdownReport(report);
    case 'json':
      return generateJsonReport(report);
    default:
      printReportToConsole(report);
  }
}

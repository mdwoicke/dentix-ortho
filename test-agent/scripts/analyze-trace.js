#!/usr/bin/env node
/**
 * analyze-trace.js
 *
 * Extracts and formats test trace data for troubleshooting analysis.
 *
 * Usage:
 *   node scripts/analyze-trace.js                                    # Most recent run
 *   node scripts/analyze-trace.js --run-id run-2026-01-13-54752399   # Specific run
 *   node scripts/analyze-trace.js --test-id GOAL-HAPPY-001           # Latest run with test
 *   node scripts/analyze-trace.js --trace-id d286c5c8-...            # By Langfuse trace ID
 *   node scripts/analyze-trace.js --run-id run-A --compare run-B     # Compare two runs
 */

const Database = require('better-sqlite3');
const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    runId: null,
    testId: null,
    traceId: null,
    compareRunId: null,
    format: 'json', // json or pretty
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--run-id':
        options.runId = args[++i];
        break;
      case '--test-id':
        options.testId = args[++i];
        break;
      case '--trace-id':
        options.traceId = args[++i];
        break;
      case '--compare':
        options.compareRunId = args[++i];
        break;
      case '--pretty':
        options.format = 'pretty';
        break;
      case '--help':
        console.log(`
Usage: node scripts/analyze-trace.js [options]

Options:
  --run-id <id>      Analyze specific run by run_id
  --test-id <id>     Analyze latest run containing test_id
  --trace-id <id>    Analyze by Langfuse trace ID
  --compare <id>     Compare with another run_id
  --pretty           Output human-readable format instead of JSON
  --help             Show this help message

Examples:
  node scripts/analyze-trace.js                                    # Most recent run
  node scripts/analyze-trace.js --run-id run-2026-01-13-54752399   # Specific run
  node scripts/analyze-trace.js --test-id GOAL-HAPPY-001           # Latest run with test
  node scripts/analyze-trace.js --compare run-old                  # Compare most recent with old
`);
        process.exit(0);
    }
  }

  return options;
}

// Initialize database connection
function getDatabase() {
  const dbPath = path.join(__dirname, '..', 'data', 'test-results.db');
  return new Database(dbPath, { readonly: true });
}

// Get Langfuse config for URL construction
function getLangfuseConfig(db) {
  try {
    const config = db.prepare(`
      SELECT * FROM langfuse_configs WHERE is_default = 1 LIMIT 1
    `).get();
    return config;
  } catch (e) {
    return null;
  }
}

// Find run_id based on options
function resolveRunId(db, options) {
  // If trace_id provided, find associated run
  if (options.traceId) {
    // First check production_traces table
    const trace = db.prepare(`
      SELECT session_id FROM production_traces WHERE trace_id = ?
    `).get(options.traceId);

    if (trace && trace.session_id) {
      // Try to find a goal test result with matching flowise_session_id
      const result = db.prepare(`
        SELECT run_id FROM goal_test_results
        WHERE flowise_session_id = ?
        ORDER BY started_at DESC LIMIT 1
      `).get(trace.session_id);

      if (result) return result.run_id;
    }

    // Also check if langfuse_trace_id is directly stored
    const directMatch = db.prepare(`
      SELECT run_id FROM goal_test_results
      WHERE langfuse_trace_id = ?
      ORDER BY started_at DESC LIMIT 1
    `).get(options.traceId);

    if (directMatch) return directMatch.run_id;

    console.error(`No test run found for trace_id: ${options.traceId}`);
    process.exit(1);
  }

  // If test_id provided, find latest run with that test
  if (options.testId) {
    const result = db.prepare(`
      SELECT run_id FROM goal_test_results
      WHERE test_id = ?
      ORDER BY started_at DESC LIMIT 1
    `).get(options.testId);

    if (result) return result.run_id;

    console.error(`No run found for test_id: ${options.testId}`);
    process.exit(1);
  }

  // If run_id provided, validate it exists
  if (options.runId) {
    const result = db.prepare(`
      SELECT run_id FROM goal_test_results WHERE run_id = ? LIMIT 1
    `).get(options.runId);

    if (result) return result.run_id;

    console.error(`Run not found: ${options.runId}`);
    process.exit(1);
  }

  // Default: most recent run
  const result = db.prepare(`
    SELECT run_id FROM goal_test_results ORDER BY started_at DESC LIMIT 1
  `).get();

  if (result) return result.run_id;

  console.error('No test runs found in database');
  process.exit(1);
}

// Extract all data for a run
function extractRunData(db, runId, langfuseConfig) {
  const data = {
    metadata: {
      runId,
      testId: null,
      langfuseTraceId: null,
      langfuseUrl: null,
      flowiseSessionId: null,
      startedAt: null,
      completedAt: null,
    },
    summary: {
      passed: false,
      turnCount: 0,
      durationMs: 0,
      goalsAchieved: 0,
      goalsFailed: 0,
      constraintViolations: 0,
    },
    goalResults: [],
    transcript: [],
    apiCalls: [],
    progressSnapshots: [],
    findings: [],
  };

  // 1. Get goal test result
  const testResult = db.prepare(`
    SELECT * FROM goal_test_results WHERE run_id = ? ORDER BY started_at DESC LIMIT 1
  `).get(runId);

  if (testResult) {
    data.metadata.testId = testResult.test_id;
    data.metadata.langfuseTraceId = testResult.langfuse_trace_id;
    data.metadata.flowiseSessionId = testResult.flowise_session_id;
    data.metadata.startedAt = testResult.started_at;
    data.metadata.completedAt = testResult.completed_at;

    data.summary.passed = testResult.passed === 1;
    data.summary.turnCount = testResult.turn_count || 0;
    data.summary.durationMs = testResult.duration_ms || 0;

    // Construct Langfuse URL if we have trace ID and config
    if (testResult.langfuse_trace_id && langfuseConfig) {
      data.metadata.langfuseUrl = `${langfuseConfig.host}/traces/${testResult.langfuse_trace_id}`;
    }

    // Parse goal results
    if (testResult.goal_results_json) {
      try {
        data.goalResults = JSON.parse(testResult.goal_results_json);
        data.summary.goalsAchieved = data.goalResults.filter(g => g.achieved).length;
        data.summary.goalsFailed = data.goalResults.filter(g => !g.achieved).length;
      } catch (e) {
        // Keep empty array
      }
    }

    // Parse constraint violations
    if (testResult.constraint_violations_json) {
      try {
        const violations = JSON.parse(testResult.constraint_violations_json);
        data.summary.constraintViolations = violations.length;
      } catch (e) {
        // Keep 0
      }
    }
  }

  // 2. Get transcript
  const transcriptRow = db.prepare(`
    SELECT transcript_json FROM transcripts WHERE run_id = ? ORDER BY id DESC LIMIT 1
  `).get(runId);

  if (transcriptRow && transcriptRow.transcript_json) {
    try {
      const transcript = JSON.parse(transcriptRow.transcript_json);
      data.transcript = transcript.map((msg, idx) => ({
        turn: Math.floor(idx / 2) + 1,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        responseTimeMs: msg.responseTimeMs,
      }));
    } catch (e) {
      // Keep empty array
    }
  }

  // 3. Get API calls
  const apiCalls = db.prepare(`
    SELECT tool_name, status, duration_ms, timestamp, request_payload, response_payload
    FROM api_calls
    WHERE run_id = ?
    ORDER BY timestamp ASC
  `).all(runId);

  data.apiCalls = apiCalls.map(call => {
    let response = null;
    try {
      response = JSON.parse(call.response_payload);
    } catch (e) {
      response = call.response_payload;
    }

    return {
      toolName: call.tool_name,
      status: call.status,
      durationMs: call.duration_ms,
      timestamp: call.timestamp,
      response,
    };
  });

  // 4. Get progress snapshots
  const snapshots = db.prepare(`
    SELECT turn_number, collected_fields_json
    FROM goal_progress_snapshots
    WHERE run_id = ?
    ORDER BY turn_number DESC
    LIMIT 5
  `).all(runId);

  data.progressSnapshots = snapshots.map(s => {
    let collectedFields = [];
    try {
      const parsed = JSON.parse(s.collected_fields_json);
      // Handle array of [key, value] pairs or object
      if (Array.isArray(parsed)) {
        collectedFields = parsed.map(([key, val]) => ({
          field: key,
          value: typeof val === 'object' ? val.value : val,
          turn: typeof val === 'object' ? val.collectedAtTurn : null,
        }));
      }
    } catch (e) {
      // Keep empty
    }

    return {
      turn: s.turn_number,
      collectedFields,
    };
  });

  // 5. Get findings
  const findings = db.prepare(`
    SELECT type, severity, title, description, expected_behavior, actual_behavior, recommendation
    FROM findings
    WHERE run_id = ?
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END
  `).all(runId);

  data.findings = findings.map(f => ({
    type: f.type,
    severity: f.severity,
    title: f.title,
    description: f.description,
    expectedBehavior: f.expected_behavior,
    actualBehavior: f.actual_behavior,
    recommendation: f.recommendation,
  }));

  return data;
}

// Compare two runs
function compareRuns(baseline, current) {
  const diff = {
    summary: {
      passedChanged: baseline.summary.passed !== current.summary.passed,
      turnCountDiff: current.summary.turnCount - baseline.summary.turnCount,
      durationDiff: current.summary.durationMs - baseline.summary.durationMs,
      goalsAchievedDiff: current.summary.goalsAchieved - baseline.summary.goalsAchieved,
    },
    goalChanges: [],
    newFindings: [],
    resolvedFindings: [],
  };

  // Compare goals
  const baselineGoals = new Map(baseline.goalResults.map(g => [g.goalId, g.achieved]));
  const currentGoals = new Map(current.goalResults.map(g => [g.goalId, g.achieved]));

  for (const [goalId, achieved] of currentGoals) {
    const wasAchieved = baselineGoals.get(goalId);
    if (wasAchieved !== undefined && wasAchieved !== achieved) {
      diff.goalChanges.push({
        goalId,
        change: achieved ? 'improved' : 'regressed',
        baseline: wasAchieved,
        current: achieved,
      });
    }
  }

  // Compare findings
  const baselineTitles = new Set(baseline.findings.map(f => f.title));
  const currentTitles = new Set(current.findings.map(f => f.title));

  diff.newFindings = current.findings.filter(f => !baselineTitles.has(f.title));
  diff.resolvedFindings = baseline.findings.filter(f => !currentTitles.has(f.title));

  return diff;
}

// Format output for pretty printing
function formatPretty(data, comparison = null) {
  let output = [];

  output.push('═'.repeat(80));
  output.push('TRACE ANALYSIS REPORT');
  output.push('═'.repeat(80));
  output.push('');

  // Metadata
  output.push('## Metadata');
  output.push(`Run ID:           ${data.metadata.runId}`);
  output.push(`Test ID:          ${data.metadata.testId}`);
  output.push(`Started:          ${data.metadata.startedAt}`);
  output.push(`Completed:        ${data.metadata.completedAt}`);
  if (data.metadata.langfuseUrl) {
    output.push(`Langfuse:         ${data.metadata.langfuseUrl}`);
  }
  output.push('');

  // Summary
  output.push('## Summary');
  output.push(`Status:           ${data.summary.passed ? 'PASSED' : 'FAILED'}`);
  output.push(`Goals:            ${data.summary.goalsAchieved}/${data.summary.goalsAchieved + data.summary.goalsFailed} achieved`);
  output.push(`Turns:            ${data.summary.turnCount}`);
  output.push(`Duration:         ${data.summary.durationMs}ms`);
  output.push(`Violations:       ${data.summary.constraintViolations}`);
  output.push('');

  // Goal Results
  output.push('## Goal Results');
  for (const goal of data.goalResults) {
    const status = goal.achieved ? '✓' : '✗';
    output.push(`  ${status} ${goal.goalId}`);
    if (!goal.achieved && goal.failureReason) {
      output.push(`      Reason: ${goal.failureReason}`);
    }
  }
  output.push('');

  // API Calls
  output.push('## API Calls');
  for (const call of data.apiCalls) {
    const statusIcon = call.status === 'completed' || call.status === 'success' ? '✓' : '✗';
    output.push(`  ${statusIcon} ${call.toolName} (${call.status}) - ${call.durationMs || '?'}ms`);
    if (call.status !== 'completed' && call.status !== 'success' && call.response) {
      const respStr = typeof call.response === 'string'
        ? call.response.substring(0, 200)
        : JSON.stringify(call.response).substring(0, 200);
      output.push(`      Response: ${respStr}...`);
    }
  }
  output.push('');

  // Findings
  if (data.findings.length > 0) {
    output.push('## Findings');
    for (const finding of data.findings) {
      output.push(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
      output.push(`      ${finding.description}`);
      if (finding.recommendation) {
        output.push(`      → ${finding.recommendation}`);
      }
    }
    output.push('');
  }

  // Collected Fields (latest snapshot)
  if (data.progressSnapshots.length > 0) {
    output.push('## Collected Fields (Turn ' + data.progressSnapshots[0].turn + ')');
    for (const field of data.progressSnapshots[0].collectedFields) {
      output.push(`  • ${field.field}: ${field.value}`);
    }
    output.push('');
  }

  // Comparison
  if (comparison) {
    output.push('═'.repeat(80));
    output.push('COMPARISON WITH BASELINE');
    output.push('═'.repeat(80));
    output.push('');

    output.push(`Pass Status Changed: ${comparison.summary.passedChanged ? 'YES' : 'No'}`);
    output.push(`Turn Count Diff:     ${comparison.summary.turnCountDiff > 0 ? '+' : ''}${comparison.summary.turnCountDiff}`);
    output.push(`Goals Diff:          ${comparison.summary.goalsAchievedDiff > 0 ? '+' : ''}${comparison.summary.goalsAchievedDiff}`);
    output.push('');

    if (comparison.goalChanges.length > 0) {
      output.push('Goal Changes:');
      for (const change of comparison.goalChanges) {
        const icon = change.change === 'improved' ? '↑' : '↓';
        output.push(`  ${icon} ${change.goalId}: ${change.change}`);
      }
      output.push('');
    }

    if (comparison.newFindings.length > 0) {
      output.push('New Issues:');
      for (const f of comparison.newFindings) {
        output.push(`  + [${f.severity}] ${f.title}`);
      }
      output.push('');
    }

    if (comparison.resolvedFindings.length > 0) {
      output.push('Resolved Issues:');
      for (const f of comparison.resolvedFindings) {
        output.push(`  - [${f.severity}] ${f.title}`);
      }
      output.push('');
    }
  }

  // Transcript summary
  output.push('## Transcript Summary');
  const userMessages = data.transcript.filter(t => t.role === 'user');
  const assistantMessages = data.transcript.filter(t => t.role === 'assistant');
  output.push(`  User messages:      ${userMessages.length}`);
  output.push(`  Assistant messages: ${assistantMessages.length}`);

  // Show last few turns
  output.push('');
  output.push('Last 3 Exchanges:');
  const lastMessages = data.transcript.slice(-6);
  for (const msg of lastMessages) {
    const role = msg.role === 'user' ? 'USER' : 'ASST';
    const content = msg.content.substring(0, 100).replace(/\n/g, ' ');
    output.push(`  [${role}] ${content}...`);
  }

  output.push('');
  output.push('═'.repeat(80));

  return output.join('\n');
}

// Main execution
function main() {
  const options = parseArgs();
  const db = getDatabase();
  const langfuseConfig = getLangfuseConfig(db);

  // Resolve primary run_id
  const runId = resolveRunId(db, options);

  // Extract data for primary run
  const data = extractRunData(db, runId, langfuseConfig);

  // Handle comparison if requested
  let comparison = null;
  if (options.compareRunId) {
    const baselineData = extractRunData(db, options.compareRunId, langfuseConfig);
    comparison = compareRuns(baselineData, data);
    data.comparison = {
      baselineRunId: options.compareRunId,
      diff: comparison,
    };
  }

  // Output
  if (options.format === 'pretty') {
    console.log(formatPretty(data, comparison));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }

  db.close();
}

main();

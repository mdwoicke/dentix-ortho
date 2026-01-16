const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db', { readonly: true });

// Check schema first
console.log('=== DATABASE SCHEMA ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => {
  console.log(`\nTable: ${t.name}`);
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
  cols.forEach(c => console.log(`  - ${c.name} (${c.type})`));
});

// Get the most recent GOAL test results (what we care about)
console.log('\n=== RECENT GOAL TEST RESULTS ===');
const goalResults = db.prepare(`
  SELECT *
  FROM goal_test_results
  ORDER BY started_at DESC
  LIMIT 3
`).all();

goalResults.forEach(r => {
  console.log(`\nRun ID: ${r.run_id}`);
  console.log(`Test ID: ${r.test_id}`);
  console.log(`Passed: ${r.passed}`);
  console.log(`Turns: ${r.turn_count}`);
  console.log(`Duration: ${r.duration_ms}ms`);
  console.log(`Started: ${r.started_at}`);

  if (r.goal_results_json) {
    console.log('\nGoal Results:');
    try {
      const goals = JSON.parse(r.goal_results_json);
      goals.forEach(g => {
        console.log(`  ${g.goalId}: ${g.achieved ? 'ACHIEVED' : 'FAILED'}`);
        if (g.evidence) console.log(`    Evidence: ${g.evidence.substring(0, 200)}`);
        if (g.failureReason) console.log(`    Failure: ${g.failureReason}`);
      });
    } catch (e) {}
  }

  if (r.summary_text) {
    console.log(`\nSummary: ${r.summary_text}`);
  }
});

// Get conversation for most recent goal test
if (goalResults.length > 0) {
  const latestGoal = goalResults[0];

  // Try to get transcript from transcripts table
  console.log('\n=== TRANSCRIPT FOR MOST RECENT RUN ===');
  const transcripts = db.prepare(`
    SELECT * FROM transcripts WHERE run_id = ?
  `).all(latestGoal.run_id);

  if (transcripts.length > 0) {
    transcripts.forEach(t => {
      console.log(`\nTranscript for test: ${t.test_id}`);
      console.log(`Session: ${t.session_id}`);
      if (t.transcript_json) {
        try {
          const transcript = JSON.parse(t.transcript_json);
          console.log(`Total messages: ${transcript.length}`);
          // Show ALL messages
          transcript.forEach((msg, i) => {
            console.log(`\n======= Message ${i + 1} [${msg.role}] =======`);
            console.log(msg.content || '(no content)');
          });
        } catch (e) {
          console.log('Error parsing transcript:', e.message);
        }
      }
    });
  } else {
    console.log('No transcripts found for this run');
  }

  // Also get findings
  console.log('\n=== FINDINGS FOR THIS RUN ===');
  const findings = db.prepare(`
    SELECT * FROM findings WHERE run_id = ?
  `).all(latestGoal.run_id);

  if (findings.length > 0) {
    findings.forEach(f => {
      console.log(`\n[${f.severity}] ${f.title}`);
      console.log(`Description: ${f.description}`);
      if (f.actual_behavior) console.log(`Actual: ${f.actual_behavior}`);
      if (f.expected_behavior) console.log(`Expected: ${f.expected_behavior}`);
      if (f.recommendation) console.log(`Recommendation: ${f.recommendation}`);
    });
  } else {
    console.log('No findings found for this run');
  }

  // Get goal progress snapshots
  console.log('\n=== GOAL PROGRESS SNAPSHOTS ===');
  const snapshots = db.prepare(`
    SELECT * FROM goal_progress_snapshots WHERE run_id = ? ORDER BY turn_number DESC LIMIT 5
  `).all(latestGoal.run_id);

  snapshots.forEach(s => {
    console.log(`\nTurn ${s.turn_number}:`);
    if (s.collected_fields_json) {
      try {
        const fields = JSON.parse(s.collected_fields_json);
        console.log('Collected fields:', JSON.stringify(fields, null, 2));
      } catch (e) {}
    }
  });

  // Get API calls
  console.log('\n=== API CALLS FOR THIS RUN ===');
  const apiCalls = db.prepare(`
    SELECT tool_name, status, duration_ms, timestamp, substr(response_payload, 1, 500) as response_preview
    FROM api_calls WHERE run_id = ? ORDER BY timestamp DESC LIMIT 10
  `).all(latestGoal.run_id);

  apiCalls.forEach(a => {
    console.log(`\n${a.tool_name} - ${a.status} (${a.duration_ms}ms)`);
    if (a.response_preview) {
      console.log(`Response: ${a.response_preview}`);
    }
  });
}

// Get the most recent test run
const runs = db.prepare(`
  SELECT *
  FROM test_runs
  ORDER BY started_at DESC
  LIMIT 1
`).all();

console.log('\n=== RECENT TEST RUNS ===');
runs.forEach(r => {
  console.log(`\nRun ID: ${r.run_id || r.id}`);
  console.log(JSON.stringify(r, null, 2));
});

// Get the last conversation turns from most recent run
const latestRun = runs[0];
if (latestRun) {
  const runId = latestRun.run_id || latestRun.id;

  // Check if test_conversations table exists
  const hasConversations = tables.some(t => t.name === 'test_conversations');
  if (hasConversations) {
    console.log('\n=== LAST 15 CONVERSATION TURNS ===');
    const turns = db.prepare(`
      SELECT *
      FROM test_conversations
      WHERE run_id = ?
      ORDER BY turn_number DESC
      LIMIT 15
    `).all(runId);

    turns.reverse().forEach(t => {
      console.log(`\n--- Turn ${t.turn_number} [${t.role}] ---`);
      console.log(t.content || '(no content)');
      if (t.tool_calls) {
        console.log('Tool calls:', t.tool_calls.substring(0, 500));
      }
    });
  }

  // Check for goal achievements
  const hasGoals = tables.some(t => t.name === 'goal_achievements');
  if (hasGoals) {
    console.log('\n=== GOAL ACHIEVEMENTS ===');
    const goals = db.prepare(`
      SELECT *
      FROM goal_achievements
      WHERE run_id = ?
    `).all(runId);

    goals.forEach(g => {
      console.log(`${g.goal_id}: ${g.achieved ? 'ACHIEVED' : 'NOT ACHIEVED'}`);
      if (g.evidence) {
        console.log(`  Evidence: ${g.evidence.substring(0, 400)}`);
      }
    });
  }

  // Check for comparison results
  const hasComparisons = tables.some(t => t.name === 'comparison_results');
  if (hasComparisons) {
    console.log('\n=== COMPARISON RESULTS ===');
    const comparisons = db.prepare(`
      SELECT *
      FROM comparison_results
      WHERE run_id = ?
    `).all(runId);

    comparisons.forEach(c => {
      console.log(JSON.stringify(c, null, 2).substring(0, 2000));
    });
  }
}

db.close();

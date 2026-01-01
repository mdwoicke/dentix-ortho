const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db', { readonly: true });

// Get the most recent test runs
const runs = db.prepare(`
  SELECT id, run_id, status, started_at, completed_at, total_tests, passed, failed
  FROM test_runs
  ORDER BY started_at DESC
  LIMIT 3
`).all();

console.log('=== Recent Test Runs ===');
runs.forEach(r => {
  console.log(`Run ${r.run_id}: ${r.status} - ${r.passed}/${r.total_tests} passed`);
});

// Get the latest run_id
const latestRunId = runs[0]?.run_id;
console.log(`\nLatest run_id: ${latestRunId}`);

// Get test results for latest run
const results = db.prepare(`
  SELECT test_id, test_name, status, error_message, duration_ms
  FROM test_results
  WHERE run_id = ?
  ORDER BY test_id
`).all(latestRunId);

console.log('\n=== Latest Run - Test Results ===');
results.forEach(r => {
  console.log(`${r.test_id}: ${r.status} (${r.duration_ms}ms)`);
  if (r.error_message) console.log(`  Error: ${r.error_message}`);
});

// Get transcript for HAPPY-001
const transcript = db.prepare(`
  SELECT transcript_json
  FROM transcripts
  WHERE run_id = ? AND test_id = 'HAPPY-001'
`).get(latestRunId);

if (transcript) {
  console.log('\n=== HAPPY-001 Transcript (last 3 turns) ===');
  try {
    const data = JSON.parse(transcript.transcript_json);
    const turns = data.turns || data.conversation || [];
    const lastTurns = turns.slice(-3);
    lastTurns.forEach((t, i) => {
      console.log(`\n--- Turn ${turns.length - 2 + i} ---`);
      if (t.user) console.log(`User: ${t.user.substring(0, 150)}...`);
      if (t.agent) console.log(`Agent: ${t.agent.substring(0, 300)}...`);
      if (t.toolCalls || t.tool_calls) {
        console.log(`Tools: ${JSON.stringify(t.toolCalls || t.tool_calls).substring(0, 500)}...`);
      }
    });
    // Check for booking result
    if (data.outcome) {
      console.log('\n=== Outcome ===');
      console.log(JSON.stringify(data.outcome, null, 2));
    }
  } catch (e) {
    console.log('Error parsing transcript:', e.message);
    console.log('Raw transcript (first 1000 chars):', transcript.transcript_json.substring(0, 1000));
  }
}

// Check goal_test_results for more details
const goalResults = db.prepare(`
  SELECT test_id, passed, turn_count, summary_text, goal_results_json
  FROM goal_test_results
  WHERE run_id = ?
`).all(latestRunId);

if (goalResults.length > 0) {
  console.log('\n=== Goal Test Results ===');
  goalResults.forEach(g => {
    console.log(`${g.test_id}: passed=${g.passed}, turns=${g.turn_count}`);
    console.log(`Summary: ${g.summary_text || 'N/A'}`);
  });
}

db.close();

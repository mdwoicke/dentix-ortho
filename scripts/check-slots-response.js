const Database = require('better-sqlite3');
const db = new Database('test-agent/data/test-results.db');

// Get the most recent test run
const run = db.prepare(`
  SELECT * FROM goal_test_results
  WHERE goal_id = 'GOAL-HAPPY-001'
  ORDER BY created_at DESC LIMIT 1
`).get();

if (run) {
  console.log('=== MOST RECENT TEST RUN ===');
  console.log('Run ID:', run.run_id);
  console.log('Status:', run.status);
  console.log('Created:', run.created_at);

  // Get API calls for this run
  const calls = db.prepare(`
    SELECT tool_name, action, request_payload, response_payload, duration_ms, error
    FROM api_calls
    WHERE run_id = ?
    ORDER BY created_at ASC
  `).all(run.run_id);

  console.log('\n=== API CALLS ===');
  for (const call of calls) {
    console.log('\n--- ' + call.tool_name + ' (' + (call.action || 'N/A') + ') ---');
    console.log('Duration:', call.duration_ms + 'ms');
    if (call.error) console.log('ERROR:', call.error);

    // Parse and show slot-related responses
    if (call.action === 'slots' || call.tool_name.includes('schedule')) {
      try {
        const resp = JSON.parse(call.response_payload);
        console.log('Response:', JSON.stringify(resp, null, 2).substring(0, 1500));
      } catch(e) {
        console.log('Response:', String(call.response_payload).substring(0, 1500));
      }
    }
  }
}

db.close();

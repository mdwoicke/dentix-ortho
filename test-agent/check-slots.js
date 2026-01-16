const Database = require('better-sqlite3');
const db = new Database('data/test-results.db');

// Check table schema
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// Check goal_test_results schema
try {
  const cols = db.prepare("PRAGMA table_info(goal_test_results)").all();
  console.log('\ngoal_test_results columns:', cols.map(c => c.name).join(', '));
} catch(e) {
  console.log('Error:', e.message);
}

// Check api_calls schema
const apiCols = db.prepare("PRAGMA table_info(api_calls)").all();
console.log('\napi_calls columns:', apiCols.map(c => c.name).join(', '));

// Get most recent test
const runs = db.prepare("SELECT * FROM goal_test_results ORDER BY started_at DESC LIMIT 3").all();
for (const run of runs) {
  console.log('\n=== RUN:', run.run_id, '===');
  console.log('Passed:', run.passed);
  console.log('Started:', run.started_at);
  console.log('Turn Count:', run.turn_count);

  // Get API calls
  const calls = db.prepare("SELECT * FROM api_calls WHERE run_id = ? ORDER BY id ASC").all(run.run_id);
  console.log('API Calls:', calls.length);

  for (const call of calls) {
    console.log('\n---', call.tool_name, '---');
    console.log('Duration:', call.duration_ms + 'ms');
    if (call.error) console.log('ERROR:', call.error);
    if (call.tool_name && call.tool_name.includes('schedule')) {
      console.log('Request:', call.request_payload ? call.request_payload.substring(0, 500) : 'null');
      console.log('Response:', call.response_payload ? call.response_payload.substring(0, 2000) : 'null');
    }
  }
  break; // Only show most recent
}
db.close();

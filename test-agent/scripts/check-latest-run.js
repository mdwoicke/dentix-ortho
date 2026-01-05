const Database = require('better-sqlite3');
const db = new Database('data/test-results.db');

const latestRun = db.prepare('SELECT run_id FROM test_runs ORDER BY started_at DESC LIMIT 1').get();
console.log('Run:', latestRun.run_id);

const apiCalls = db.prepare("SELECT tool_name, test_id, response_payload FROM api_calls WHERE run_id = ? AND tool_name = 'schedule_appointment_ortho'").all(latestRun.run_id);

console.log('\nScheduling API Calls:', apiCalls.length);
apiCalls.forEach((call, i) => {
  if (!call.response_payload) {
    console.log('Test:', call.test_id, '- No response');
    return;
  }
  try {
    const resp = JSON.parse(call.response_payload);
    console.log('Test:', call.test_id);
    console.log('  Version:', resp._toolVersion || 'undefined');
    console.log('  Slots:', resp.slots ? resp.slots.length : (resp.groups ? resp.groups.length : 0));
    if (resp.slots && resp.slots.length > 0) {
      console.log('  First slot:', resp.slots[0].StartTime);
    }
  } catch (e) {
    console.log('Test:', call.test_id, '- Parse error:', e.message);
  }
});

// Get goal test results
console.log('\n--- Goal Results ---');
const results = db.prepare('SELECT test_id, passed, goal_results_json FROM goal_test_results WHERE run_id = ?').all(latestRun.run_id);
results.forEach(r => {
  console.log(r.test_id + ':', r.passed ? 'PASSED' : 'FAILED');
  if (!r.passed && r.goal_results_json) {
    const goals = JSON.parse(r.goal_results_json);
    goals.filter(g => !g.passed).forEach(g => {
      console.log('  Failed:', g.goalId, '-', g.message);
    });
  }
});

db.close();

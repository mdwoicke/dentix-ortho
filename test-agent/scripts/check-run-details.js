const Database = require('better-sqlite3');
const db = new Database('data/test-results.db');

const latestRun = process.argv[2] || db.prepare('SELECT run_id FROM test_runs ORDER BY started_at DESC LIMIT 1').get().run_id;

console.log('Analyzing run:', latestRun);

const results = db.prepare('SELECT test_id, status, error_message FROM test_results WHERE run_id = ?').all(latestRun);

console.log('\nTest Results:');
results.forEach(r => {
  console.log('  ' + r.test_id + ': ' + r.status);
  if (r.error_message) {
    console.log('    Error: ' + r.error_message.substring(0, 120));
  }
});

// Check for goal results
console.log('\nGoal Results:');
const goals = db.prepare('SELECT test_id, passed, goal_results_json FROM goal_test_results WHERE run_id = ?').all(latestRun);
goals.forEach(g => {
  console.log('  ' + g.test_id + ': ' + (g.passed ? 'PASSED' : 'FAILED'));
  if (!g.passed && g.goal_results_json) {
    try {
      const goalList = JSON.parse(g.goal_results_json);
      goalList.filter(gl => !gl.passed).forEach(gl => {
        console.log('    Failed: ' + gl.goalId + ' - ' + (gl.message || '').substring(0, 80));
      });
    } catch (e) {
      console.log('    Parse error:', e.message);
    }
  }
});

// Check API calls for tool version
console.log('\nAPI Calls (schedule_appointment_ortho):');
const apiCalls = db.prepare("SELECT test_id, response_payload FROM api_calls WHERE run_id = ? AND tool_name = 'schedule_appointment_ortho'").all(latestRun);
apiCalls.forEach(c => {
  if (c.response_payload) {
    try {
      const resp = JSON.parse(c.response_payload);
      console.log('  ' + c.test_id + ': v=' + (resp._toolVersion || 'N/A') + ', slots=' + (resp.slots ? resp.slots.length : (resp.groups ? resp.groups.length : 'N/A')));
      if (resp._debug_error) console.log('    DEBUG: ' + resp._debug_error.substring(0, 100));
    } catch(e) {
      console.log('  ' + c.test_id + ': parse error');
    }
  } else {
    console.log('  ' + c.test_id + ': No response');
  }
});

db.close();

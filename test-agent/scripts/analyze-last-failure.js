const Database = require('better-sqlite3');
const db = new Database('data/test-results.db');

const runId = 'run-2026-01-04-64e99a56';

// Get all failed tests from this run
const results = db.prepare('SELECT test_id, goal_results_json, constraint_violations_json FROM goal_test_results WHERE run_id = ?').all(runId);

console.log('=== ALL FAILED TESTS ANALYSIS ===\n');

results.forEach(result => {
  console.log('-------------------------------------------');
  console.log('Test:', result.test_id);

  const goals = JSON.parse(result.goal_results_json);
  goals.forEach(g => {
    if (!g.passed) {
      console.log(`  FAILED GOAL: ${g.goalId}`);
      console.log(`    Message: ${g.message}`);
      if (g.details) {
        console.log(`    Details: ${JSON.stringify(g.details)}`);
      }
    }
  });

  if (result.constraint_violations_json) {
    const violations = JSON.parse(result.constraint_violations_json);
    violations.forEach(v => {
      console.log(`  VIOLATION: ${v.constraint.description}`);
      console.log(`    Turn: ${v.turnNumber}`);
      console.log(`    Message: ${v.message?.substring(0, 150)}...`);
    });
  }
  console.log('');
});

// Get full transcript for one test to see what happened at the end
console.log('\n\n=== FULL TRANSCRIPT FOR GOAL-HAPPY-001 ===\n');
const transcript = db.prepare('SELECT transcript_json FROM transcripts WHERE run_id = ? AND test_id = ?').get(runId, 'GOAL-HAPPY-001');
if (transcript) {
  const messages = JSON.parse(transcript.transcript_json);
  console.log(`Total messages: ${messages.length}`);

  // Show last 10 messages
  console.log('\n--- Last 10 messages ---\n');
  const lastMessages = messages.slice(-10);
  lastMessages.forEach((m, i) => {
    console.log(`[${messages.length - 10 + i + 1}] ${m.role.toUpperCase()}:`);
    const content = m.content || '';
    console.log(content.substring(0, 1500));
    console.log('---\n');
  });
}

db.close();

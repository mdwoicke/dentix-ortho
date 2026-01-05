// Debug GOAL-EDGE-009 test result
const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db', { readonly: true });

// Get latest test result for GOAL-EDGE-009
const result = db.prepare(`
  SELECT gtr.*, t.transcript_json
  FROM goal_test_results gtr
  LEFT JOIN transcripts t ON gtr.run_id = t.run_id AND gtr.test_id = t.test_id
  WHERE gtr.test_id = 'GOAL-EDGE-009'
  ORDER BY gtr.completed_at DESC
  LIMIT 1
`).get();

if (!result) {
  console.log('No test result found for GOAL-EDGE-009');
  process.exit(1);
}

console.log('=== GOAL-EDGE-009 Latest Test Result ===');
console.log('Run ID:', result.run_id);
console.log('Passed:', result.passed ? 'YES' : 'NO');
console.log('Turn Count:', result.turn_count);
console.log('');

console.log('=== Goal Results ===');
const goals = JSON.parse(result.goal_results_json);
goals.forEach(g => {
  console.log(`- ${g.goalId}: ${g.passed ? 'PASSED' : 'FAILED'} - ${g.message}`);
});
console.log('');

console.log('=== Transcript (last 10 turns) ===');
if (result.transcript_json) {
  const transcript = JSON.parse(result.transcript_json);
  const lastTurns = transcript.slice(-10);
  lastTurns.forEach((turn, i) => {
    const idx = transcript.length - 10 + i + 1;
    console.log(`\n[Turn ${idx}] ${turn.role}:`);
    console.log(turn.content.substring(0, 500));
  });
} else {
  console.log('No transcript found');
}

db.close();

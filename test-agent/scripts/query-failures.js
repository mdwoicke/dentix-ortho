const db = require('better-sqlite3')('data/test-results.db');

// Get latest test run for each test from goal_test_results
const runs = db.prepare(`
  SELECT test_id, passed, turn_count, summary_text, goal_results_json
  FROM goal_test_results
  WHERE test_id LIKE 'GOAL-%'
  ORDER BY completed_at DESC
`).all();

const latest = {};
runs.forEach(r => {
  if (!(r.test_id in latest)) {
    latest[r.test_id] = r;
  }
});

// Filter to show only failures (excluding HAPPY-002 and EDGE-002 which are API no-slot issues)
const failures = Object.values(latest).filter(r =>
  r.passed === 0 &&
  r.test_id !== 'GOAL-HAPPY-002' &&
  r.test_id !== 'GOAL-EDGE-002'
);

console.log('=== FAILED TESTS (excluding API no-slot issues) ===\n');
failures.forEach(f => {
  console.log(`${f.test_id}: turns=${f.turn_count}`);
  console.log(`  Summary: ${f.summary_text}`);
  try {
    const goals = JSON.parse(f.goal_results_json || '[]');
    const failed = goals.filter(g => !g.achieved);
    console.log(`  Failed goals: ${failed.map(g => g.id).join(', ')}`);
  } catch(e) {}
  console.log('');
});

// Get transcript for each failure
console.log('\n=== TRANSCRIPTS (last 8 turns) ===\n');
for (const f of failures) {
  const detail = db.prepare(`
    SELECT transcript_json FROM transcripts
    WHERE test_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(f.test_id);

  console.log(`\n--- ${f.test_id} ---`);
  if (detail && detail.transcript_json) {
    const transcript = JSON.parse(detail.transcript_json);
    // Show last 8 turns
    const lastTurns = transcript.slice(-8);
    lastTurns.forEach(t => {
      const content = t.content || t.text || '';
      console.log(`[${t.role || t.speaker}]: ${content.substring(0, 300)}${content.length > 300 ? '...' : ''}`);
    });
  } else {
    console.log('  (no transcript found)');
  }
}

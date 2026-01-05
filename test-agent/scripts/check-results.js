const db = require('better-sqlite3')('./data/test-results.db');

const results = db.prepare(`
  SELECT test_id, passed, goal_results_json, summary_text
  FROM goal_test_results
  ORDER BY id DESC
  LIMIT 5
`).all();

results.forEach(row => {
  console.log('---');
  console.log(row.test_id, row.passed ? 'PASSED' : 'FAILED');
  if (row.summary_text) {
    console.log('Summary:', row.summary_text.slice(0, 200));
  }
  if (row.goal_results_json) {
    const goals = JSON.parse(row.goal_results_json);
    goals.filter(g => g.passed === false).forEach(g => {
      console.log('  FAILED:', g.goalId, '-', g.message);
    });
  }
});

db.close();

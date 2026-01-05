const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db');

const tests = db.prepare(`
  SELECT id, name, goals_json FROM goal_test_cases
  WHERE name LIKE '%Address%' OR name LIKE '%Out-of-Network%'
`).all();

tests.forEach(t => {
  console.log('=== ' + t.id + ': ' + t.name + ' ===');
  const goals = JSON.parse(t.goals_json || '[]');
  console.log(JSON.stringify(goals, null, 2));
});

db.close();

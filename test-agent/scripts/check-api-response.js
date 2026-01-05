#!/usr/bin/env node
const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db', { readonly: true });

const testId = process.argv[2] || 'GOAL-HAPPY-002';
const result = db.prepare('SELECT run_id FROM goal_test_results WHERE test_id = ? ORDER BY id DESC LIMIT 1').get(testId);

if (!result) {
  console.log('No results found for', testId);
  process.exit(1);
}

console.log('Run:', result.run_id);

const calls = db.prepare('SELECT tool_name, request_payload, response_payload FROM api_calls WHERE run_id = ?').all(result.run_id);

calls.forEach(c => {
  if (c.tool_name.includes('schedule')) {
    console.log('\n=== ' + c.tool_name + ' ===');
    console.log('Request:', c.request_payload);
    console.log('Response:', c.response_payload);
  }
});

db.close();

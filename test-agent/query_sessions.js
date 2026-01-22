const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db');
const sessionIds = [
  '2ed8f066-778a-4919-831c-dc314d031602',
  '3c8eacfc-cca7-4b28-975c-bc26bfd85c44',
  'c831a64d-38e7-447d-8023-9e9665fa5df0'
];

console.log('=== FAILED SESSION TEST DATA ===\n');

for (const sessionId of sessionIds) {
  console.log('\n' + '='.repeat(80));
  console.log('Session ID: ' + sessionId);
  console.log('='.repeat(80));
  
  const results = db.prepare(`
    SELECT 
      id,
      run_id,
      test_id,
      passed,
      started_at,
      resolved_persona_json,
      summary_text
    FROM goal_test_results 
    WHERE run_id = ?
    ORDER BY started_at ASC
  `).all(sessionId);
  
  if (results.length === 0) {
    console.log('No test records found for this session ID\n');
    continue;
  }
  
  console.log('Found ' + results.length + ' test(s) in this session\n');
  
  results.forEach((row, idx) => {
    console.log('\nTest #' + (idx + 1) + ': ' + row.test_id);
    console.log('├─ Passed: ' + (row.passed === 1 ? 'YES' : 'NO'));
    console.log('├─ Started: ' + row.started_at);
    console.log('├─ Summary: ' + (row.summary_text ? row.summary_text.substring(0, 100) : 'N/A') + '...');
    
    if (row.resolved_persona_json) {
      try {
        const persona = JSON.parse(row.resolved_persona_json);
        console.log('└─ TEST DATA:');
        console.log(JSON.stringify(persona, null, 2));
      } catch (e) {
        console.log('└─ [Error parsing persona JSON: ' + e.message + ']');
      }
    } else {
      console.log('└─ No persona data available');
    }
  });
}

db.close();

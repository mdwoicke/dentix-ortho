const Database = require('better-sqlite3');
const db = new Database('data/test-results.db');

const run = process.argv[2] || db.prepare('SELECT run_id FROM test_runs ORDER BY started_at DESC LIMIT 1').get().run_id;

console.log('Analyzing run:', run);

const transcripts = db.prepare('SELECT test_id, transcript_json FROM transcripts WHERE run_id = ?').all(run);
const results = db.prepare('SELECT test_id, status FROM test_results WHERE run_id = ?').all(run);

const failedTests = results.filter(r => r.status === 'failed').map(r => r.test_id);
console.log('Failed tests:', failedTests.join(', '));

transcripts.filter(t => failedTests.includes(t.test_id)).forEach(t => {
  console.log('\n========== ' + t.test_id + ' ==========');
  try {
    const msgs = JSON.parse(t.transcript_json);
    // Show last 8 messages
    const lastMsgs = msgs.slice(-10);
    lastMsgs.forEach(m => {
      const role = m.role || m.type || 'unknown';
      const content = (m.content || m.text || '').substring(0, 300);
      console.log('[' + role + ']: ' + content);
    });
  } catch (e) {
    console.log('Parse error:', e.message);
  }
});

db.close();

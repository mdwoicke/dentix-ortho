const BetterSqlite3 = require('better-sqlite3');
const db = new BetterSqlite3('./data/test-results.db');

const sessionId = 'conv_2_+19546824812_1768598936933';

const obs = db.prepare(`
  SELECT observation_id, name, type, level, output
  FROM production_trace_observations
  WHERE trace_id IN (SELECT trace_id FROM production_traces WHERE session_id = ?)
  AND name LIKE '%schedule%'
`).all(sessionId);

console.log('Found', obs.length, 'schedule observations for session', sessionId);
obs.forEach(o => {
  const output = o.output ? (typeof o.output === 'string' ? o.output : JSON.stringify(o.output)).substring(0, 500) : 'null';
  console.log('---');
  console.log('Name:', o.name);
  console.log('Type:', o.type);
  console.log('Level:', o.level || 'DEFAULT');
  console.log('Output has _debug_error:', output.includes('_debug_error'));
  console.log('Output has success:false:', output.includes('"success":false') || output.includes('"success": false'));
  if (output.includes('_debug_error') || output.includes('"success":false')) {
    console.log('OUTPUT SNIPPET:', output);
  }
});
db.close();

const Database = require('better-sqlite3');
const db = new Database('./test-agent/data/test-results.db');

// Check observation names with errors
const rows = db.prepare(`
  SELECT DISTINCT name, type
  FROM production_trace_observations
  WHERE (output LIKE '%"success":false%' OR output LIKE '%"success": false%' OR level = 'ERROR')
  LIMIT 30
`).all();

console.log('Observation names with errors:');
rows.forEach(r => console.log('  Name:', r.name, '| Type:', r.type));

// Also check if any have 'tool' or 'api' in name
const toolRows = db.prepare(`
  SELECT DISTINCT name, type
  FROM production_trace_observations
  WHERE (output LIKE '%"success":false%' OR output LIKE '%"success": false%' OR level = 'ERROR')
    AND (LOWER(name) LIKE '%tool%' OR LOWER(name) LIKE '%api%')
`).all();

console.log('\nObservation names with errors AND tool/api in name:');
toolRows.forEach(r => console.log('  Name:', r.name, '| Type:', r.type));

// Check sample of all observation names
const allNames = db.prepare(`
  SELECT DISTINCT name, COUNT(*) as cnt
  FROM production_trace_observations
  GROUP BY name
  ORDER BY cnt DESC
  LIMIT 20
`).all();

console.log('\nTop 20 observation names by count:');
allNames.forEach(r => console.log('  ', r.cnt, '-', r.name));

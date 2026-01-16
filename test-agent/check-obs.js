const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db');

// Check all distinct observation names
const allNames = db.prepare(`
  SELECT DISTINCT name, type, COUNT(*) as cnt
  FROM production_trace_observations
  GROUP BY name, type
  ORDER BY cnt DESC
`).all();

console.log('All observation names:');
allNames.forEach(r => console.log(`  ${r.cnt} - ${r.name} (${r.type})`));

// Check names that would match tool/api filter
const toolApiNames = db.prepare(`
  SELECT DISTINCT name
  FROM production_trace_observations
  WHERE LOWER(name) LIKE '%tool%' OR LOWER(name) LIKE '%api%'
`).all();

console.log('\nNames matching tool/api filter:');
toolApiNames.forEach(r => console.log(`  ${r.name}`));

// Count errors with old vs new logic
const oldLogicCount = db.prepare(`
  SELECT COUNT(*) as cnt
  FROM production_trace_observations
  WHERE (
    level = 'ERROR'
    OR (output LIKE '%"success"%' AND output LIKE '%false%')
    OR output LIKE '%_debug_error%'
    OR output LIKE '%"error":%'
    OR status_message LIKE '%error%'
  )
`).get();

const newLogicCount = db.prepare(`
  SELECT COUNT(*) as cnt
  FROM production_trace_observations
  WHERE (
    level = 'ERROR'
    OR output LIKE '%"success":false%'
    OR output LIKE '%"success": false%'
    OR output LIKE '%_debug_error%'
  )
  AND (
    LOWER(name) LIKE '%tool%'
    OR LOWER(name) LIKE '%api%'
  )
`).get();

console.log('\nError counts:');
console.log(`  Old logic (broad): ${oldLogicCount.cnt}`);
console.log(`  New logic (strict): ${newLogicCount.cnt}`);

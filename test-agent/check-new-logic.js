const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db');

// Count errors with the NEW corrected logic
const newLogicCount = db.prepare(`
  SELECT COUNT(*) as cnt
  FROM production_trace_observations
  WHERE (
    level = 'ERROR'
    OR output LIKE '%"success":false%'
    OR output LIKE '%"success": false%'
    OR output LIKE '%_debug_error%'
  )
  AND name IN ('chord_ortho_patient', 'schedule_appointment_ortho', 'current_date_time', 'chord_handleEscalation')
`).get();

console.log(`Error count with new logic: ${newLogicCount.cnt}`);

// Check individual tool error counts
const toolErrors = db.prepare(`
  SELECT name, COUNT(*) as cnt
  FROM production_trace_observations
  WHERE (
    level = 'ERROR'
    OR output LIKE '%"success":false%'
    OR output LIKE '%"success": false%'
    OR output LIKE '%_debug_error%'
  )
  AND name IN ('chord_ortho_patient', 'schedule_appointment_ortho', 'current_date_time', 'chord_handleEscalation')
  GROUP BY name
`).all();

console.log('\nErrors by tool:');
toolErrors.forEach(r => console.log(`  ${r.name}: ${r.cnt}`));

// Sample a few error outputs to verify they're real errors
const samples = db.prepare(`
  SELECT name, substr(output, 1, 200) as output_preview
  FROM production_trace_observations
  WHERE (
    output LIKE '%"success":false%'
    OR output LIKE '%"success": false%'
  )
  AND name IN ('chord_ortho_patient', 'schedule_appointment_ortho', 'current_date_time', 'chord_handleEscalation')
  LIMIT 5
`).all();

console.log('\nSample error outputs:');
samples.forEach((r, i) => console.log(`  ${i+1}. ${r.name}: ${r.output_preview}...`));

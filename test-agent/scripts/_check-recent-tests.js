/**
 * Check all recent test records
 */
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const db = new BetterSqlite3(path.join(__dirname, '../data/test-results.db'));

// Get all recent Test/Child records
const records = db.prepare(`
    SELECT id, patient_first_name, patient_last_name, patient_guid, appointment_guid,
           appointment_datetime, is_child, family_id, session_id, created_at
    FROM prod_test_records
    WHERE (patient_first_name LIKE 'Test%' OR patient_first_name LIKE 'Child%')
      AND created_at > datetime('now', '-1 day')
    ORDER BY created_at DESC
`).all();

console.log('=== Recent Test Records (last 24h) ===');
console.log('Found:', records.length);
console.log('');

for (const r of records) {
    const name = (r.patient_first_name || '') + ' ' + (r.patient_last_name || '');
    const apptTime = r.appointment_datetime || '(no appt)';
    const familyShort = r.family_id ? r.family_id.substring(0, 8) : 'none';
    const apptShort = r.appointment_guid ? r.appointment_guid.substring(0, 8) : 'none';
    console.log(name.trim().padEnd(25), '| Family:', familyShort, '| Appt:', apptShort, '|', apptTime);
}

// Summary by family
console.log('\n=== Summary by Family ===');
const families = {};
for (const r of records) {
    const fam = r.family_id || 'no_family';
    if (!families[fam]) families[fam] = { count: 0, withAppt: 0, names: [] };
    families[fam].count++;
    families[fam].names.push(r.patient_first_name);
    if (r.appointment_guid) families[fam].withAppt++;
}

for (const [fam, data] of Object.entries(families)) {
    const famShort = fam.substring(0, 8);
    console.log(`Family ${famShort}: ${data.count} members, ${data.withAppt} with appointments`);
    console.log(`  Names: ${data.names.join(', ')}`);
}

db.close();

/**
 * Check multi-child test records in Prod Tracker
 */
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const db = new BetterSqlite3(path.join(__dirname, '../data/test-results.db'));

// Look for records from our multi-child tests
// Test5968 (2 children) and Test2730 (3 children)
const records = db.prepare(`
    SELECT id, patient_first_name, patient_last_name, patient_guid, appointment_guid,
           appointment_datetime, is_child, family_id, parent_patient_guid, session_id, created_at
    FROM prod_test_records
    WHERE (patient_first_name LIKE 'Child%5968%'
           OR patient_first_name LIKE 'Child%2730%'
           OR patient_first_name LIKE 'Test5968%'
           OR patient_first_name LIKE 'Test2730%')
    ORDER BY family_id, created_at DESC
`).all();

console.log('=== Multi-Child Test Records in Prod Tracker ===');
console.log('Found:', records.length, 'records\n');

// Group by family_id
const families = {};
for (const r of records) {
    const fam = r.family_id || 'no_family';
    if (!families[fam]) families[fam] = [];
    families[fam].push(r);
}

for (const [familyId, members] of Object.entries(families)) {
    console.log('='.repeat(60));
    console.log('FAMILY:', familyId);
    console.log('='.repeat(60));

    for (const r of members) {
        console.log('');
        console.log('  Patient:', r.patient_first_name, r.patient_last_name || '');
        console.log('  Patient GUID:', r.patient_guid);
        console.log('  Appt GUID:', r.appointment_guid || '(none)');
        console.log('  Appt Time:', r.appointment_datetime || '(none)');
        console.log('  Is Child:', r.is_child);
        console.log('  Parent GUID:', r.parent_patient_guid || '(none)');
        console.log('  Session:', (r.session_id || '').substring(0, 60));
    }
}

// Also check prod_test_tracker table for QA multi-child entries
console.log('\n\n=== Prod Test Tracker Entries ===');
const trackerRecords = db.prepare(`
    SELECT * FROM prod_test_tracker
    WHERE test_type = 'qa_multi_child'
    ORDER BY created_at DESC
    LIMIT 5
`).all();

console.log('Found:', trackerRecords.length, 'QA multi-child entries\n');

for (const r of trackerRecords) {
    console.log('-'.repeat(50));
    console.log('Test Code:', r.test_code);
    console.log('Patient Names:', r.patient_name);
    console.log('Status:', r.status);
    console.log('Notes:', r.notes);
    console.log('Created:', r.created_at);
}

db.close();

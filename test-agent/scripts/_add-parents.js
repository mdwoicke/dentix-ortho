/**
 * Add parent records for multi-child tests
 */
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const db = new BetterSqlite3(path.join(__dirname, '../data/test-results.db'));

const parents = [
    {
        patient_first_name: 'Test5968',
        patient_last_name: 'Parent',
        patient_guid: '0B87ABD0-0906-463C-9AB8-06738C63569B',
        family_id: '8de8f757-68d8-47e3-89bb-511268a8643d',
        session_id: 'conv_2_unknown_1770187615711',
        trace_id: '8f902e4f-48dc-45c8-8c59-0c014d6ffcc7'
    },
    {
        patient_first_name: 'Test2730',
        patient_last_name: 'Parent',
        patient_guid: '768B4884-D4BB-45FB-A224-D0470A55EEEF',
        family_id: 'a55363ca-2523-4b98-8c6e-ff666d7ae207',
        session_id: 'conv_2_unknown_1770188299695',
        trace_id: '4d7126f1-005d-48e7-bb0f-6eb6860b75f3'
    }
];

const stmt = db.prepare(`
    INSERT INTO prod_test_records (
        record_type, patient_first_name, patient_last_name, patient_guid,
        is_child, family_id, session_id, trace_id, created_at
    ) VALUES ('patient', ?, ?, ?, 0, ?, ?, ?, datetime('now'))
`);

console.log('=== Adding Parent Records ===\n');

for (const p of parents) {
    const result = stmt.run(
        p.patient_first_name,
        p.patient_last_name,
        p.patient_guid,
        p.family_id,
        p.session_id,
        p.trace_id
    );
    console.log('Added:', p.patient_first_name, p.patient_last_name, '(id:', result.lastInsertRowid, ')');
}

// Verify - show complete family structure
console.log('\n=== Complete Family Records ===');

const records = db.prepare(`
    SELECT patient_first_name, patient_last_name, patient_guid, is_child,
           appointment_guid, appointment_datetime, family_id
    FROM prod_test_records
    WHERE family_id IN ('8de8f757-68d8-47e3-89bb-511268a8643d', 'a55363ca-2523-4b98-8c6e-ff666d7ae207')
    ORDER BY family_id, is_child, appointment_datetime
`).all();

let currentFamily = '';
for (const r of records) {
    if (r.family_id !== currentFamily) {
        currentFamily = r.family_id;
        console.log('\n--- Family:', currentFamily.substring(0, 8) + '... ---');
    }
    const role = r.is_child ? 'Child ' : 'PARENT';
    const name = (r.patient_first_name + ' ' + (r.patient_last_name || '')).trim();
    const appt = r.appointment_guid ? r.appointment_guid.substring(0, 8) : '(no appt)';
    const time = r.appointment_datetime || '';
    console.log(`  [${role}] ${name.padEnd(20)} | ${appt} | ${time}`);
}

db.close();
console.log('\nDone!');

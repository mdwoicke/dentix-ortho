/**
 * Import missing children from multi-child booking tests to prod_test_records
 */
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const db = new BetterSqlite3(path.join(__dirname, '../data/test-results.db'));

// Data from the trace observations
const missingRecords = [
    // 2-child test - Child2_5968 is missing
    {
        patient_first_name: 'Child2_5968',
        patient_last_name: 'Parent',
        patient_guid: 'BD3068AC-F20C-4571-8EEB-18A9D3CA171A',
        appointment_guid: '648702B3-D8C0-4E8F-9604-0ED63FDBBC18',
        appointment_datetime: '3/30/2026 2:20:00 PM',
        is_child: 1,
        family_id: '8de8f757-68d8-47e3-89bb-511268a8643d',
        parent_patient_guid: '0B87ABD0-0906-463C-9AB8-06738C63569B',
        session_id: 'conv_2_unknown_1770187615711',
        trace_id: '8f902e4f-48dc-45c8-8c59-0c014d6ffcc7'
    },
    // 3-child test - Child1_ and Child2_ are missing
    {
        patient_first_name: 'Child1_2730',
        patient_last_name: 'Parent',
        patient_guid: '66F99EEF-10D9-49BA-A04C-3238A32785FB',
        appointment_guid: '53858D81-BBAB-45E6-9183-E5B6E48E1A07',
        appointment_datetime: '3/31/2026 9:50:00 AM',
        is_child: 1,
        family_id: 'a55363ca-2523-4b98-8c6e-ff666d7ae207',
        parent_patient_guid: '768B4884-D4BB-45FB-A224-D0470A55EEEF',
        session_id: 'conv_2_unknown_1770188299695',
        trace_id: '4d7126f1-005d-48e7-bb0f-6eb6860b75f3'
    },
    {
        patient_first_name: 'Child2_2730',
        patient_last_name: 'Parent',
        patient_guid: 'CE3BB01F-3F45-4048-ADFB-65444E9920F3',
        appointment_guid: '547B33B7-3A37-4987-ACA5-23E3E73157BF',
        appointment_datetime: '3/31/2026 10:30:00 AM',
        is_child: 1,
        family_id: 'a55363ca-2523-4b98-8c6e-ff666d7ae207',
        parent_patient_guid: '768B4884-D4BB-45FB-A224-D0470A55EEEF',
        session_id: 'conv_2_unknown_1770188299695',
        trace_id: '4d7126f1-005d-48e7-bb0f-6eb6860b75f3'
    }
];

// Also need to update the existing Test2730 record to use correct family_id
console.log('=== Fixing Test2730 family_id ===');
const fixResult = db.prepare(`
    UPDATE prod_test_records
    SET family_id = 'a55363ca-2523-4b98-8c6e-ff666d7ae207'
    WHERE patient_guid = 'E06AC1EA-8A82-4972-B2C6-FB779C7BBF94'
`).run();
console.log('Updated:', fixResult.changes, 'records');

// Insert missing records
console.log('\n=== Inserting Missing Children ===');

const insertStmt = db.prepare(`
    INSERT INTO prod_test_records (
        record_type, patient_first_name, patient_last_name, patient_guid, appointment_guid,
        appointment_datetime, is_child, family_id, parent_patient_guid,
        session_id, trace_id, created_at
    ) VALUES ('appointment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

for (const record of missingRecords) {
    // Check if already exists
    const existing = db.prepare(`SELECT id FROM prod_test_records WHERE appointment_guid = ?`).get(record.appointment_guid);
    if (existing) {
        console.log('Already exists:', record.patient_first_name);
        continue;
    }

    try {
        const result = insertStmt.run(
            record.patient_first_name,
            record.patient_last_name,
            record.patient_guid,
            record.appointment_guid,
            record.appointment_datetime,
            record.is_child,
            record.family_id,
            record.parent_patient_guid,
            record.session_id,
            record.trace_id
        );
        console.log('Inserted:', record.patient_first_name, '(id:', result.lastInsertRowid, ')');
    } catch (e) {
        console.log('Error inserting', record.patient_first_name, ':', e.message);
    }
}

// Verify the records
console.log('\n=== Verification ===');
const records = db.prepare(`
    SELECT patient_first_name, patient_guid, appointment_guid, appointment_datetime, family_id
    FROM prod_test_records
    WHERE family_id IN ('8de8f757-68d8-47e3-89bb-511268a8643d', 'a55363ca-2523-4b98-8c6e-ff666d7ae207')
    ORDER BY family_id, appointment_datetime
`).all();

console.log('Records by family:\n');
let currentFamily = '';
for (const r of records) {
    if (r.family_id !== currentFamily) {
        currentFamily = r.family_id;
        console.log('Family:', currentFamily.substring(0, 8) + '...');
    }
    console.log('  ', r.patient_first_name.padEnd(15), '|', r.appointment_datetime, '|', r.appointment_guid.substring(0, 8));
}

db.close();
console.log('\nDone!');

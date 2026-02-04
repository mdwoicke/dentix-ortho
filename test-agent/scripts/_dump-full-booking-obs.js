/**
 * Dump full booking observation for multi-child tests
 */
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const db = new BetterSqlite3(path.join(__dirname, '../data/test-results.db'));

// Get the schedule_appointment_ortho observation for 5968
console.log('=== 2-Child Test (Test5968) - Full Booking Output ===\n');
const obs5968 = db.prepare(`
    SELECT observation_id, trace_id, name, output
    FROM production_trace_observations
    WHERE output LIKE '%5968%'
      AND name = 'schedule_appointment_ortho'
    LIMIT 1
`).get();

if (obs5968) {
    try {
        const output = JSON.parse(obs5968.output);
        console.log('Trace:', obs5968.trace_id);
        console.log('Success:', output.success);
        console.log('\nPARENT:');
        console.log('  Name:', output.parent.firstName, output.parent.lastName);
        console.log('  Patient GUID:', output.parent.patientGUID);
        console.log('  Family ID:', output.parent.familyId);

        console.log('\nCHILDREN:');
        for (let i = 0; i < output.children.length; i++) {
            const child = output.children[i];
            console.log(`\n  Child ${i + 1}: ${child.firstName}`);
            console.log('    Patient GUID:', child.patientGUID);
            console.log('    Created:', child.created);
            console.log('    Success:', child.success);
            console.log('    Appointment GUID:', child.appointment?.appointmentGUID);
            console.log('    Appointment Time:', child.appointment?.startTime);
            console.log('    Booked:', child.appointment?.booked);
        }
    } catch (e) {
        console.log('Parse error:', e.message);
        console.log('Raw output:', obs5968.output);
    }
} else {
    console.log('No observation found for Test5968');
}

// Get the schedule_appointment_ortho observation for 2730
console.log('\n\n=== 3-Child Test (Test2730) - Full Booking Output ===\n');
const obs2730 = db.prepare(`
    SELECT observation_id, trace_id, name, output
    FROM production_trace_observations
    WHERE output LIKE '%2730%'
      AND name = 'schedule_appointment_ortho'
    LIMIT 1
`).get();

if (obs2730) {
    try {
        const output = JSON.parse(obs2730.output);
        console.log('Trace:', obs2730.trace_id);
        console.log('Success:', output.success);
        console.log('\nPARENT:');
        console.log('  Name:', output.parent.firstName, output.parent.lastName);
        console.log('  Patient GUID:', output.parent.patientGUID);
        console.log('  Family ID:', output.parent.familyId);

        console.log('\nCHILDREN:');
        for (let i = 0; i < output.children.length; i++) {
            const child = output.children[i];
            console.log(`\n  Child ${i + 1}: ${child.firstName}`);
            console.log('    Patient GUID:', child.patientGUID);
            console.log('    Created:', child.created);
            console.log('    Success:', child.success);
            console.log('    Appointment GUID:', child.appointment?.appointmentGUID);
            console.log('    Appointment Time:', child.appointment?.startTime);
            console.log('    Booked:', child.appointment?.booked);
        }
    } catch (e) {
        console.log('Parse error:', e.message);
        console.log('Raw output:', obs2730.output);
    }
} else {
    console.log('No observation found for Test2730');
}

db.close();

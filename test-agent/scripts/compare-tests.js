const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'test-results.db'), { readonly: true });

const failedRunId = 'run-2026-01-14-e51f9957';
const successRunId = 'run-2026-01-11-8e139157';

function analyzeRun(runId, label) {
    console.log('\n' + '='.repeat(60));
    console.log(label + ': ' + runId);
    console.log('='.repeat(60));

    const apiCalls = db.prepare(`
        SELECT tool_name, response_payload
        FROM api_calls
        WHERE run_id = ?
        ORDER BY timestamp
    `).all(runId);

    let patientLocation = null;
    let slotLocation = null;
    let patientGUID = null;

    apiCalls.forEach(call => {
        if (!call.response_payload) return;

        try {
            const resp = JSON.parse(call.response_payload);

            // chord_ortho_patient - location info
            if (call.tool_name.includes('patient') && resp.location) {
                patientLocation = resp.location;
                console.log('\n[chord_ortho_patient] Patient Location:');
                console.log('  Name:', resp.location.LocationName);
                console.log('  GUID:', resp.location.LocationGUID);
            }

            // chord_ortho_patient - patient created
            if (call.tool_name.includes('patient') && resp.patientGUID) {
                patientGUID = resp.patientGUID;
                console.log('\n[chord_ortho_patient] Patient Created:');
                console.log('  PatientGUID:', resp.patientGUID);
            }

            // schedule_appointment_ortho - slots
            if (call.tool_name.includes('schedule') && resp.slots && resp.slots.length > 0) {
                const slot = resp.slots[0];
                slotLocation = slot.LocationGUID;
                console.log('\n[schedule_appointment_ortho] First Slot:');
                console.log('  StartTime:', slot.startTime || slot.StartTime);
                console.log('  LocationGUID:', slot.LocationGUID);
                console.log('  LocationName:', slot.ScheduleViewDescription);
                console.log('  scheduleViewGUID:', slot.scheduleViewGUID || slot.ScheduleViewGUID);
                console.log('  scheduleColumnGUID:', slot.scheduleColumnGUID || slot.ScheduleColumnGUID);
            }

            // schedule_appointment_ortho - booking result
            if (call.tool_name.includes('schedule') && resp._debug) {
                console.log('\n[schedule_appointment_ortho] Booking Attempt:');
                console.log('  Success:', resp.success);
                if (resp._debug.request_params) {
                    console.log('  Booked with scheduleViewGUID:', resp._debug.request_params.scheduleViewGUID);
                    console.log('  Booked with patientGUID:', resp._debug.request_params.patientGUID);
                }
                if (resp._debug_error) {
                    console.log('  ERROR:', resp._debug_error);
                }
                if (resp.appointmentGUID) {
                    console.log('  AppointmentGUID:', resp.appointmentGUID);
                }
            }

            // Failed booking
            if (call.tool_name.includes('schedule') && resp.success === false && resp._debug_error) {
                console.log('\n[schedule_appointment_ortho] BOOKING FAILED:');
                console.log('  Error:', resp._debug_error);
            }

        } catch (e) {}
    });

    // Summary
    console.log('\n--- SUMMARY ---');
    if (patientLocation && slotLocation) {
        const match = patientLocation.LocationGUID === slotLocation;
        console.log('Patient Location:', patientLocation.LocationName, '(' + patientLocation.LocationGUID.substring(0,8) + '...)');
        console.log('Slot Location:', slotLocation.substring(0,8) + '...');
        console.log('LOCATION MATCH:', match ? '✓ YES' : '✗ NO - THIS IS THE PROBLEM!');
    }
}

analyzeRun(successRunId, 'SUCCESSFUL TEST');
analyzeRun(failedRunId, 'FAILED TEST');

console.log('\n\n' + '='.repeat(60));
console.log('ROOT CAUSE ANALYSIS');
console.log('='.repeat(60));
console.log(`
The FAILED test creates a patient at CDH Allegheny (799d413a...)
but the slots returned are from OTHER locations.

Cloud9 rejects the booking because you cannot book a patient
from one location using a slot from another location.

FIX OPTIONS:
1. Don't filter slots by CDH Allegheny - let system pick a location with slots
2. Create patient at the same location where slots are available
3. Configure CDH Allegheny in Cloud9 to have online reservation slots
`);

db.close();

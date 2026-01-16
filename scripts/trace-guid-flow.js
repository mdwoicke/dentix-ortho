/**
 * GUID Flow Tracer - End-to-End Test
 *
 * This script traces GUIDs through the entire booking flow:
 * 1. Fetch available slots from Node-RED (simulating what Flowise does)
 * 2. Log exact GUIDs received
 * 3. Attempt booking with those exact GUIDs
 * 4. Compare what was sent vs what the response says
 *
 * This helps identify if GUIDs are being transformed anywhere in the pipeline.
 */

const https = require('https');

const NODE_RED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd';
const AUTH_HEADER = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const TEST_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

// Use a future date (Cloud9 sandbox minimum)
const TEST_DATE = '01/14/2026';

function makeRequest(endpoint, body) {
    return new Promise((resolve, reject) => {
        const url = `${NODE_RED_BASE}${endpoint}`;
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': AUTH_HEADER,
            },
            timeout: 30000,
        };

        console.log(`\n[REQUEST] POST ${endpoint}`);
        console.log('[BODY]', JSON.stringify(body, null, 2));

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[RESPONSE] Status: ${res.statusCode}`);
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                      GUID FLOW TRACER - END-TO-END TEST                      ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log(`\nDate: ${new Date().toISOString()}`);
    console.log(`UUI: ${TEST_UUI.substring(0, 40)}...`);
    console.log(`Test Date: ${TEST_DATE}`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 1: Fetch Available Slots
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('STEP 1: FETCHING AVAILABLE SLOTS');
    console.log('═'.repeat(80));

    const slotsResult = await makeRequest('/getApptSlots', {
        uui: TEST_UUI,
        startDate: TEST_DATE,
        endDate: TEST_DATE,
    });

    if (!slotsResult.data.slots || slotsResult.data.slots.length === 0) {
        console.log('❌ ERROR: No slots returned');
        console.log(JSON.stringify(slotsResult.data, null, 2));
        return;
    }

    console.log(`\n[SUCCESS] Received ${slotsResult.data.slots.length} slots`);

    // Pick the first available slot
    const slot = slotsResult.data.slots[0];

    console.log('\n[SELECTED SLOT] First available slot:');
    console.log('─'.repeat(60));
    console.log(`  startTime:           "${slot.startTime}"`);
    console.log(`  scheduleViewGUID:    "${slot.scheduleViewGUID}"`);
    console.log(`  scheduleColumnGUID:  "${slot.scheduleColumnGUID}"`);
    console.log(`  appointmentTypeGUID: "${slot.appointmentTypeGUID}"`);
    console.log(`  minutes:             ${slot.minutes}`);
    console.log('─'.repeat(60));

    // Log all GUIDs for comparison
    const originalGUIDs = {
        scheduleViewGUID: slot.scheduleViewGUID,
        scheduleColumnGUID: slot.scheduleColumnGUID,
        appointmentTypeGUID: slot.appointmentTypeGUID,
    };
    console.log('\n[ORIGINAL GUIDs TO BE SENT]:');
    console.log(JSON.stringify(originalGUIDs, null, 2));

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 2: Build Booking Request (exactly as Flowise tool would)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('STEP 2: BUILDING BOOKING REQUEST');
    console.log('═'.repeat(80));

    // Use test patient
    const testPatientGUID = 'E4DC31A2-6657-4505-A824-B49A7299E6AE';

    const bookingRequest = {
        uui: TEST_UUI,
        patientGUID: testPatientGUID,
        startTime: slot.startTime,
        scheduleViewGUID: slot.scheduleViewGUID,
        scheduleColumnGUID: slot.scheduleColumnGUID,
        appointmentTypeGUID: slot.appointmentTypeGUID,
        minutes: parseInt(slot.minutes),
    };

    console.log('\n[BOOKING REQUEST TO SEND]:');
    console.log(JSON.stringify(bookingRequest, null, 2));

    // Verify GUIDs match
    console.log('\n[GUID VERIFICATION]:');
    console.log(`  scheduleViewGUID:    ${originalGUIDs.scheduleViewGUID === bookingRequest.scheduleViewGUID ? '✓ MATCH' : '✗ MISMATCH'}`);
    console.log(`  scheduleColumnGUID:  ${originalGUIDs.scheduleColumnGUID === bookingRequest.scheduleColumnGUID ? '✓ MATCH' : '✗ MISMATCH'}`);
    console.log(`  appointmentTypeGUID: ${originalGUIDs.appointmentTypeGUID === bookingRequest.appointmentTypeGUID ? '✓ MATCH' : '✗ MISMATCH'}`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 3: Send Booking Request
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('STEP 3: SENDING BOOKING REQUEST');
    console.log('═'.repeat(80));

    const bookResult = await makeRequest('/createAppt', bookingRequest);

    console.log('\n[BOOKING RESPONSE]:');
    console.log(JSON.stringify(bookResult.data, null, 2));

    if (bookResult.data.success && bookResult.data.appointmentGUID) {
        console.log('\n✅ BOOKING SUCCEEDED');
        console.log(`   appointmentGUID: ${bookResult.data.appointmentGUID}`);

        // ═══════════════════════════════════════════════════════════════════════════════
        // STEP 4: Verify the Booked Appointment
        // ═══════════════════════════════════════════════════════════════════════════════
        console.log('\n' + '═'.repeat(80));
        console.log('STEP 4: VERIFYING BOOKED APPOINTMENT');
        console.log('═'.repeat(80));

        const verifyResult = await makeRequest('/getAppointmentsByPatient', {
            uui: TEST_UUI,
            patientGUID: testPatientGUID,
        });

        if (verifyResult.data.appointments && verifyResult.data.appointments.length > 0) {
            const bookedAppt = verifyResult.data.appointments.find(
                a => a.AppointmentGUID === bookResult.data.appointmentGUID
            );

            if (bookedAppt) {
                console.log('\n[BOOKED APPOINTMENT DETAILS]:');
                console.log(JSON.stringify(bookedAppt, null, 2));
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // STEP 5: Clean Up
        // ═══════════════════════════════════════════════════════════════════════════════
        console.log('\n' + '═'.repeat(80));
        console.log('STEP 5: CLEANING UP (CANCELING TEST APPOINTMENT)');
        console.log('═'.repeat(80));

        await makeRequest('/cancelAppt', {
            uui: TEST_UUI,
            appointmentGUID: bookResult.data.appointmentGUID,
        });
        console.log('✓ Appointment canceled');

    } else {
        console.log('\n❌ BOOKING FAILED');
        console.log(`   Error: ${bookResult.data.message || bookResult.data.error || 'Unknown error'}`);

        // ═══════════════════════════════════════════════════════════════════════════════
        // STEP 4 (Alternative): Debug Failed Booking
        // ═══════════════════════════════════════════════════════════════════════════════
        console.log('\n' + '═'.repeat(80));
        console.log('STEP 4: DEBUGGING FAILED BOOKING');
        console.log('═'.repeat(80));

        // Check if slot is still in the available list
        console.log('\n[Re-checking slot availability...]');
        const recheckSlots = await makeRequest('/getApptSlots', {
            uui: TEST_UUI,
            startDate: TEST_DATE,
            endDate: TEST_DATE,
        });

        const stillAvailable = recheckSlots.data.slots?.find(s =>
            s.startTime === slot.startTime &&
            s.scheduleViewGUID === slot.scheduleViewGUID &&
            s.scheduleColumnGUID === slot.scheduleColumnGUID
        );

        if (stillAvailable) {
            console.log('⚠️  Slot is STILL available - something else caused the failure');
            console.log('   Possible causes:');
            console.log('   - Rate limiting from Cloud9');
            console.log('   - Patient already has appointment at this time');
            console.log('   - UUI context mismatch');
        } else {
            console.log('   Slot is NO LONGER available (may have been booked by another test)');
        }

        // Check patient's existing appointments
        console.log('\n[Checking patient existing appointments...]');
        const appts = await makeRequest('/getAppointmentsByPatient', {
            uui: TEST_UUI,
            patientGUID: testPatientGUID,
        });

        if (appts.data.appointments && appts.data.appointments.length > 0) {
            console.log(`   Patient has ${appts.data.appointments.length} existing appointments:`);
            appts.data.appointments.forEach((a, i) => {
                const time = a.AppointmentDateTime || a.StartTime;
                const status = a.AppointmentStatusDescription || a.Status;
                console.log(`   [${i+1}] ${time} - ${status}`);
            });
        } else {
            console.log('   Patient has no existing appointments');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('SUMMARY');
    console.log('═'.repeat(80));
    console.log(`\n[TEST RESULT]: ${bookResult.data.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log('\n[GUID INTEGRITY CHECK]:');
    console.log('  If this direct API test SUCCEEDS but Flowise tests FAIL,');
    console.log('  the issue is in how Flowise passes the GUIDs to Node-RED.');
    console.log('');
    console.log('  Possible culprits:');
    console.log('  1. LLM is selecting different slot from prompt (slot mixing)');
    console.log('  2. Flowise variable binding is incorrect');
    console.log('  3. UUI passed by Flowise differs from test UUI');
    console.log('  4. Race condition in parallel test runs');
}

main().catch(console.error);

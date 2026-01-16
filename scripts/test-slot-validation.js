/**
 * Slot Validation Test Script
 *
 * Tests if a specific slot combination exists and is bookable.
 * Helps diagnose whether LLM is mixing slot data or if Cloud9 is rejecting valid slots.
 */

const https = require('https');

const NODE_RED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd';
const AUTH_HEADER = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const TEST_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

// FAILED BOOKING DATA FROM SCREENSHOT
const FAILED_SLOT = {
    startTime: '1/13/2026 7:00:00 AM',
    scheduleViewGUID: 'ed92750a-fdf8-4a09-8219-a1a130c0b822',
    scheduleColumnGUID: '5273a655-b606-4902-bcc7-04ee42a04ee8'
};

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

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
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
    console.log('╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║              SLOT VALIDATION DIAGNOSTIC                                ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝');

    console.log('\n[FAILED BOOKING DATA FROM SCREENSHOT]');
    console.log('  startTime:', FAILED_SLOT.startTime);
    console.log('  scheduleViewGUID:', FAILED_SLOT.scheduleViewGUID);
    console.log('  scheduleColumnGUID:', FAILED_SLOT.scheduleColumnGUID);

    // Step 1: Get available slots for the date range
    console.log('\n' + '='.repeat(70));
    console.log('[STEP 1] Fetching available slots for 1/13/2026...');
    console.log('='.repeat(70));

    const slotsResult = await makeRequest('/getApptSlots', {
        uui: TEST_UUI,
        startDate: '01/13/2026',
        endDate: '01/14/2026'
    });

    if (!slotsResult.data.slots) {
        console.log('ERROR: No slots returned');
        console.log(JSON.stringify(slotsResult.data, null, 2));
        return;
    }

    console.log(`Found ${slotsResult.data.slots.length} total slots`);

    // Step 2: Check if the failed slot combination exists
    console.log('\n' + '='.repeat(70));
    console.log('[STEP 2] Searching for the EXACT failed slot combination...');
    console.log('='.repeat(70));

    const matchingSlot = slotsResult.data.slots.find(slot =>
        slot.startTime === FAILED_SLOT.startTime &&
        slot.scheduleViewGUID === FAILED_SLOT.scheduleViewGUID &&
        slot.scheduleColumnGUID === FAILED_SLOT.scheduleColumnGUID
    );

    if (matchingSlot) {
        console.log('✅ EXACT MATCH FOUND! The slot combination EXISTS.');
        console.log('   This means Cloud9 should accept this booking.');
        console.log('   Slot details:', JSON.stringify(matchingSlot, null, 2));
    } else {
        console.log('❌ NO EXACT MATCH! The slot combination DOES NOT EXIST.');
        console.log('   This confirms the LLM is mixing slot data.');

        // Find partial matches
        console.log('\n   Searching for partial matches...');

        const timeMatches = slotsResult.data.slots.filter(s => s.startTime === FAILED_SLOT.startTime);
        const viewMatches = slotsResult.data.slots.filter(s => s.scheduleViewGUID === FAILED_SLOT.scheduleViewGUID);
        const columnMatches = slotsResult.data.slots.filter(s => s.scheduleColumnGUID === FAILED_SLOT.scheduleColumnGUID);

        console.log(`\n   Slots with startTime "${FAILED_SLOT.startTime}": ${timeMatches.length}`);
        if (timeMatches.length > 0 && timeMatches.length <= 5) {
            timeMatches.forEach((s, i) => {
                console.log(`     [${i+1}] viewGUID: ${s.scheduleViewGUID.substring(0,8)}..., columnGUID: ${s.scheduleColumnGUID.substring(0,8)}...`);
            });
        }

        console.log(`\n   Slots with scheduleViewGUID "${FAILED_SLOT.scheduleViewGUID.substring(0,8)}...": ${viewMatches.length}`);
        if (viewMatches.length > 0 && viewMatches.length <= 5) {
            viewMatches.forEach((s, i) => {
                console.log(`     [${i+1}] startTime: ${s.startTime}, columnGUID: ${s.scheduleColumnGUID.substring(0,8)}...`);
            });
        } else if (viewMatches.length > 5) {
            console.log(`     First slot: ${viewMatches[0].startTime}`);
            console.log(`     Last slot: ${viewMatches[viewMatches.length-1].startTime}`);
        }

        console.log(`\n   Slots with scheduleColumnGUID "${FAILED_SLOT.scheduleColumnGUID.substring(0,8)}...": ${columnMatches.length}`);
        if (columnMatches.length > 0 && columnMatches.length <= 5) {
            columnMatches.forEach((s, i) => {
                console.log(`     [${i+1}] startTime: ${s.startTime}, viewGUID: ${s.scheduleViewGUID.substring(0,8)}...`);
            });
        }
    }

    // Step 3: Show first few available slots
    console.log('\n' + '='.repeat(70));
    console.log('[STEP 3] First 5 ACTUAL available slots on 1/13/2026:');
    console.log('='.repeat(70));

    const jan13Slots = slotsResult.data.slots.filter(s => s.startTime.startsWith('1/13/2026'));
    console.log(`\nFound ${jan13Slots.length} slots on 1/13/2026`);

    jan13Slots.slice(0, 5).forEach((slot, i) => {
        console.log(`\n[Slot ${i+1}]`);
        console.log(`  startTime: ${slot.startTime}`);
        console.log(`  scheduleViewGUID: ${slot.scheduleViewGUID}`);
        console.log(`  scheduleColumnGUID: ${slot.scheduleColumnGUID}`);
        console.log(`  appointmentTypeGUID: ${slot.appointmentTypeGUID}`);
        console.log(`  minutes: ${slot.minutes}`);
    });

    // Step 4: Test booking with the FIRST valid slot
    if (jan13Slots.length > 0) {
        console.log('\n' + '='.repeat(70));
        console.log('[STEP 4] Testing ACTUAL booking with first valid slot...');
        console.log('='.repeat(70));

        const testSlot = jan13Slots[0];
        const testPatientGUID = 'E4DC31A2-6657-4505-A824-B49A7299E6AE'; // From screenshot

        console.log('\nBooking request:');
        console.log(`  patientGUID: ${testPatientGUID}`);
        console.log(`  startTime: ${testSlot.startTime}`);
        console.log(`  scheduleViewGUID: ${testSlot.scheduleViewGUID}`);
        console.log(`  scheduleColumnGUID: ${testSlot.scheduleColumnGUID}`);

        const bookResult = await makeRequest('/createAppt', {
            uui: TEST_UUI,
            patientGUID: testPatientGUID,
            startTime: testSlot.startTime,
            scheduleViewGUID: testSlot.scheduleViewGUID,
            scheduleColumnGUID: testSlot.scheduleColumnGUID,
            appointmentTypeGUID: testSlot.appointmentTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705',
            minutes: parseInt(testSlot.minutes) || 40
        });

        console.log('\nBooking result:');
        console.log(JSON.stringify(bookResult.data, null, 2));

        if (bookResult.data.success && bookResult.data.appointmentGUID) {
            console.log('\n✅ BOOKING SUCCEEDED with valid slot data!');
            console.log('   appointmentGUID:', bookResult.data.appointmentGUID);

            // Cancel the test appointment
            console.log('\n   Canceling test appointment...');
            await makeRequest('/cancelAppt', {
                uui: TEST_UUI,
                appointmentGUID: bookResult.data.appointmentGUID
            });
            console.log('   Canceled.');
        } else {
            console.log('\n❌ BOOKING FAILED even with valid slot data!');
            console.log('   This indicates an issue with Node-RED or Cloud9.');
        }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('[SUMMARY]');
    console.log('='.repeat(70));

    if (!matchingSlot) {
        console.log('\n❌ CONFIRMED: The LLM is mixing slot data from different sources.');
        console.log('   The combination of startTime + scheduleViewGUID + scheduleColumnGUID');
        console.log('   from the failed booking does NOT exist in the available slots.');
        console.log('\n   SOLUTION: The LLM must use the bookingToken system or');
        console.log('   ensure ALL slot fields come from the SAME slot object.');
    }
}

main().catch(console.error);

/**
 * Test what happens when trying to book the same slot twice
 * This simulates what might happen if parallel test runs compete for slots
 */

const https = require('https');

const NODE_RED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd';
const AUTH_HEADER = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const TEST_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

function makeRequest(endpoint, body) {
    return new Promise((resolve, reject) => {
        const url = `${NODE_RED_BASE}${endpoint}`;
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': AUTH_HEADER },
            timeout: 30000,
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    console.log('=== DOUBLE BOOKING TEST ===\n');

    // First, get an available slot
    console.log('[1] Getting available slots...');
    const slotsResult = await makeRequest('/getApptSlots', {
        uui: TEST_UUI,
        startDate: '01/13/2026',
        endDate: '01/14/2026'
    });

    const slot = slotsResult.data.slots[0];
    console.log('Using slot:', slot.startTime, 'at', slot.scheduleViewGUID.substring(0,8) + '...');

    // First booking with patient A
    console.log('\n[2] Booking slot with Patient A...');
    const booking1 = await makeRequest('/createAppt', {
        uui: TEST_UUI,
        patientGUID: 'E4DC31A2-6657-4505-A824-B49A7299E6AE', // Patient A
        startTime: slot.startTime,
        scheduleViewGUID: slot.scheduleViewGUID,
        scheduleColumnGUID: slot.scheduleColumnGUID,
        appointmentTypeGUID: slot.appointmentTypeGUID,
        minutes: parseInt(slot.minutes)
    });

    console.log('Result:', booking1.data.success ? 'SUCCESS' : 'FAILED');
    if (booking1.data.appointmentGUID) {
        console.log('Appointment GUID:', booking1.data.appointmentGUID);
    } else {
        console.log('Error:', booking1.data.message || booking1.data.error);
    }

    // Try same slot with different patient B
    console.log('\n[3] Trying SAME slot with Patient B (should fail)...');
    const booking2 = await makeRequest('/createAppt', {
        uui: TEST_UUI,
        patientGUID: '990111FA-D7D1-416B-88A7-1ACE9AB75272', // Different patient
        startTime: slot.startTime,
        scheduleViewGUID: slot.scheduleViewGUID,
        scheduleColumnGUID: slot.scheduleColumnGUID,
        appointmentTypeGUID: slot.appointmentTypeGUID,
        minutes: parseInt(slot.minutes)
    });

    console.log('Result:', booking2.data.success ? 'SUCCESS (unexpected!)' : 'FAILED (expected)');
    console.log('Error message:', booking2.data.message || booking2.data.error || 'none');

    // Try same slot same patient A again
    console.log('\n[4] Trying SAME slot with Patient A again (should fail)...');
    const booking3 = await makeRequest('/createAppt', {
        uui: TEST_UUI,
        patientGUID: 'E4DC31A2-6657-4505-A824-B49A7299E6AE', // Same patient
        startTime: slot.startTime,
        scheduleViewGUID: slot.scheduleViewGUID,
        scheduleColumnGUID: slot.scheduleColumnGUID,
        appointmentTypeGUID: slot.appointmentTypeGUID,
        minutes: parseInt(slot.minutes)
    });

    console.log('Result:', booking3.data.success ? 'SUCCESS (unexpected!)' : 'FAILED (expected)');
    console.log('Error message:', booking3.data.message || booking3.data.error || 'none');

    // Cleanup
    if (booking1.data.appointmentGUID) {
        console.log('\n[5] Cleaning up - canceling appointment...');
        await makeRequest('/cancelAppt', { uui: TEST_UUI, appointmentGUID: booking1.data.appointmentGUID });
        console.log('Canceled.');
    }
    if (booking2.data.appointmentGUID) {
        await makeRequest('/cancelAppt', { uui: TEST_UUI, appointmentGUID: booking2.data.appointmentGUID });
    }

    console.log('\n=== TEST COMPLETE ===');
}

main().catch(console.error);

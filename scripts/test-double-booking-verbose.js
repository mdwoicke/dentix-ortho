/**
 * Verbose double booking test - show full response
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
    // Get a slot
    const slotsResult = await makeRequest('/getApptSlots', {
        uui: TEST_UUI, startDate: '01/13/2026', endDate: '01/14/2026'
    });
    const slot = slotsResult.data.slots[0];
    console.log('Using slot:', slot.startTime);

    // First booking
    console.log('\n[1] First booking...');
    const booking1 = await makeRequest('/createAppt', {
        uui: TEST_UUI,
        patientGUID: 'E4DC31A2-6657-4505-A824-B49A7299E6AE',
        startTime: slot.startTime,
        scheduleViewGUID: slot.scheduleViewGUID,
        scheduleColumnGUID: slot.scheduleColumnGUID,
        appointmentTypeGUID: slot.appointmentTypeGUID,
        minutes: parseInt(slot.minutes)
    });
    console.log('FULL RESPONSE:');
    console.log(JSON.stringify(booking1.data, null, 2));

    // Second booking (should fail)
    console.log('\n[2] Second booking (same slot, should fail)...');
    const booking2 = await makeRequest('/createAppt', {
        uui: TEST_UUI,
        patientGUID: '990111FA-D7D1-416B-88A7-1ACE9AB75272',
        startTime: slot.startTime,
        scheduleViewGUID: slot.scheduleViewGUID,
        scheduleColumnGUID: slot.scheduleColumnGUID,
        appointmentTypeGUID: slot.appointmentTypeGUID,
        minutes: parseInt(slot.minutes)
    });
    console.log('FULL RESPONSE:');
    console.log(JSON.stringify(booking2.data, null, 2));

    // Cleanup
    if (booking1.data.appointmentGUID) {
        await makeRequest('/cancelAppt', { uui: TEST_UUI, appointmentGUID: booking1.data.appointmentGUID });
        console.log('\nCleaned up appointment.');
    }
}

main().catch(console.error);

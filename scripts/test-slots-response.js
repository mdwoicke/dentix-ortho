/**
 * Test Slots Response - Verify bookingTokens are returned
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
    console.log('Testing slots response for bookingToken...\n');

    const result = await makeRequest('/getApptSlots', {
        uui: TEST_UUI,
        startDate: '01/13/2026',
        endDate: '01/14/2026'
    });

    if (!result.data.slots || result.data.slots.length === 0) {
        console.log('No slots returned!');
        return;
    }

    console.log(`Found ${result.data.slots.length} slots\n`);

    // Check first slot
    const slot = result.data.slots[0];
    console.log('FIRST SLOT:');
    console.log(JSON.stringify(slot, null, 2));

    console.log('\n--- ANALYSIS ---');
    console.log(`Has startTime: ${!!slot.startTime}`);
    console.log(`Has scheduleViewGUID: ${!!slot.scheduleViewGUID}`);
    console.log(`Has scheduleColumnGUID: ${!!slot.scheduleColumnGUID}`);
    console.log(`Has appointmentTypeGUID: ${!!slot.appointmentTypeGUID}`);
    console.log(`Has bookingToken: ${!!slot.bookingToken}`);
    console.log(`Has displayTime: ${!!slot.displayTime}`);

    if (slot.bookingToken) {
        console.log('\n✅ bookingToken IS present in Node-RED response');
        console.log(`Token: ${slot.bookingToken}`);

        // Decode it
        try {
            const decoded = JSON.parse(Buffer.from(slot.bookingToken, 'base64').toString('utf8'));
            console.log('\nDecoded bookingToken:');
            console.log(JSON.stringify(decoded, null, 2));
        } catch (e) {
            console.log('Failed to decode token:', e.message);
        }
    } else {
        console.log('\n❌ bookingToken is NOT present in Node-RED response!');
        console.log('   This means the Node-RED flow is not adding bookingTokens.');
        console.log('   The Flowise tool adds tokens, but Node-RED does not.');
    }
}

main().catch(console.error);

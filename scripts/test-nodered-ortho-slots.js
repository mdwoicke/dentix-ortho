/**
 * Test Node-RED /ortho/getApptSlots endpoint directly
 * To diagnose the .split() error
 */

const https = require('https');

const NODERED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io';
const AUTH = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

function formatDate(d) {
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${month}/${day}/${d.getFullYear()}`;
}

const startDate = formatDate(new Date(Date.now() + 86400000)); // Tomorrow
const endDate = formatDate(new Date(Date.now() + 15 * 86400000)); // 15 days

// Test payloads - trying different formats
const testCases = [
    {
        name: 'Standard payload (what tool sends)',
        body: {
            uui: 'test-debug-12345',
            startDate: startDate,
            endDate: endDate,
            locationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db'
        }
    },
    {
        name: 'With scheduleViewGUIDs',
        body: {
            uui: 'test-debug-12345',
            startDate: startDate,
            endDate: endDate,
            scheduleViewGUIDs: '2544683a-8e79-4b32-a4d4-bf851996bac3',
            locationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db'
        }
    },
    {
        name: 'Empty body (should use defaults)',
        body: {
            uui: 'test-debug-12345'
        }
    }
];

async function testEndpoint(path, testCase) {
    return new Promise((resolve, reject) => {
        const url = new URL(NODERED_BASE + path);
        const bodyStr = JSON.stringify(testCase.body);

        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + AUTH,
                'Content-Length': Buffer.byteLength(bodyStr)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    data: data
                });
            });
        });

        req.on('error', e => reject(e));
        req.write(bodyStr);
        req.end();
    });
}

async function runTests() {
    console.log('=== Testing Node-RED /ortho/getApptSlots ===\n');

    for (const testCase of testCases) {
        console.log(`--- ${testCase.name} ---`);
        console.log('Request body:', JSON.stringify(testCase.body, null, 2));

        try {
            const result = await testEndpoint('/FabricWorkflow/api/chord/ortho/getApptSlots', testCase);
            console.log('Status:', result.statusCode);

            if (result.statusCode === 500) {
                console.log('ERROR RESPONSE:', result.data);
            } else {
                // Parse and summarize
                try {
                    const parsed = JSON.parse(result.data);
                    console.log('Slots count:', parsed.count || (parsed.slots?.length || 0));
                    if (parsed.error) console.log('Error:', parsed.error, parsed.message);
                } catch (e) {
                    console.log('Raw response (first 500 chars):', result.data.substring(0, 500));
                }
            }
        } catch (err) {
            console.log('Request error:', err.message);
        }

        console.log('');
    }

    // Also test /ortho-prd/ for comparison
    console.log('=== Testing Node-RED /ortho-prd/getApptSlots (PRODUCTION - for comparison) ===\n');
    const prodTest = testCases[0];
    console.log(`--- ${prodTest.name} ---`);
    try {
        const result = await testEndpoint('/FabricWorkflow/api/chord/ortho-prd/getApptSlots', prodTest);
        console.log('Status:', result.statusCode);
        if (result.statusCode === 200) {
            const parsed = JSON.parse(result.data);
            console.log('Slots count:', parsed.count || (parsed.slots?.length || 0));
        } else {
            console.log('Response:', result.data.substring(0, 500));
        }
    } catch (err) {
        console.log('Request error:', err.message);
    }
}

runTests().catch(console.error);

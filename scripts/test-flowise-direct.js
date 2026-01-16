/**
 * Test Flowise API Directly
 *
 * This test simulates what the goal test runner does:
 * 1. Send a booking request message to Flowise
 * 2. Capture and analyze the tool calls made
 * 3. Check what GUIDs were actually passed to Node-RED
 */

const https = require('https');
const http = require('http');

// Flowise endpoint from config
const FLOWISE_URL = 'https://flowise.c1conversations.cloud.c1.io/api/v1/prediction/';
const CHATFLOW_ID = 'fa62d099-6d0b-47f9-89b9-c426f9f4e6e9'; // Production chatflow

async function sendToFlowise(message, sessionId) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${FLOWISE_URL}${CHATFLOW_ID}`);

        const payload = JSON.stringify({
            question: message,
            overrideConfig: {
                sessionId: sessionId,
            }
        });

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 120000,
        };

        console.log(`\n[FLOWISE] Sending message to ${url.pathname}`);
        console.log(`[FLOWISE] Message: "${message.substring(0, 100)}..."`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[FLOWISE] Response status: ${res.statusCode}`);
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    resolve({ rawText: data });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(payload);
        req.end();
    });
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         FLOWISE DIRECT API TEST                              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

    const sessionId = `test-${Date.now()}`;
    console.log(`\nSession ID: ${sessionId}`);

    try {
        // Step 1: Initial greeting
        console.log('\n' + '═'.repeat(80));
        console.log('STEP 1: INITIAL GREETING');
        console.log('═'.repeat(80));

        const greeting = "Hi, I'd like to schedule an appointment for my son";
        const response1 = await sendToFlowise(greeting, sessionId);
        console.log('\n[AGENT RESPONSE]:');
        console.log(response1.text || response1.rawText?.substring(0, 500) || JSON.stringify(response1).substring(0, 500));

        // Pause for rate limiting
        await new Promise(r => setTimeout(r, 2000));

        // Step 2: Provide child info
        console.log('\n' + '═'.repeat(80));
        console.log('STEP 2: PROVIDE CHILD INFO');
        console.log('═'.repeat(80));

        const childInfo = "His name is Mike Johnson, he's 10 years old, born March 15 2015";
        const response2 = await sendToFlowise(childInfo, sessionId);
        console.log('\n[AGENT RESPONSE]:');
        console.log(response2.text || response2.rawText?.substring(0, 500) || JSON.stringify(response2).substring(0, 500));

        // Pause for rate limiting
        await new Promise(r => setTimeout(r, 2000));

        // Step 3: Request time slots
        console.log('\n' + '═'.repeat(80));
        console.log('STEP 3: ASK FOR SLOTS');
        console.log('═'.repeat(80));

        const requestSlots = "What times do you have available next week?";
        const response3 = await sendToFlowise(requestSlots, sessionId);
        console.log('\n[AGENT RESPONSE]:');
        console.log(response3.text || response3.rawText?.substring(0, 500) || JSON.stringify(response3).substring(0, 500));

        // Check if we can see tool calls in the response
        if (response3.usedTools || response3.agentReasoning) {
            console.log('\n[TOOL CALLS DETECTED]:');
            console.log(JSON.stringify(response3.usedTools || response3.agentReasoning, null, 2));
        }

        // Pause for rate limiting
        await new Promise(r => setTimeout(r, 2000));

        // Step 4: Select a time
        console.log('\n' + '═'.repeat(80));
        console.log('STEP 4: SELECT TIME SLOT');
        console.log('═'.repeat(80));

        const selectTime = "I'll take that first available time";
        const response4 = await sendToFlowise(selectTime, sessionId);
        console.log('\n[AGENT RESPONSE]:');
        console.log(response4.text || response4.rawText?.substring(0, 1000) || JSON.stringify(response4).substring(0, 1000));

        // Check if we can see tool calls
        if (response4.usedTools || response4.agentReasoning) {
            console.log('\n[TOOL CALLS DETECTED]:');
            console.log(JSON.stringify(response4.usedTools || response4.agentReasoning, null, 2));
        }

        console.log('\n' + '═'.repeat(80));
        console.log('TEST COMPLETE');
        console.log('═'.repeat(80));
        console.log('\n[SUMMARY]:');
        console.log('  If booking failed, check the Node-RED logs for what GUIDs were received.');
        console.log('  Compare with the GUIDs from the slots response to see if there\'s mismatch.');

    } catch (error) {
        console.error('\n[ERROR]:', error.message);
    }
}

main();

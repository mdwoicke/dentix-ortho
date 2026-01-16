#!/usr/bin/env node
/**
 * Test script to verify what tool versions are deployed in Sandbox A
 */

const fetch = require('node-fetch');

const SANDBOX_A_ENDPOINT = 'https://flowiseai-helnl-u15194.vm.elestio.app/api/v1/prediction/6fe5b0ca-b99a-4065-b881-a898df72a3a3';

async function testFlowiseToolVersion() {
    console.log('=== Testing Sandbox A Flowise Tool Versions ===\n');

    // Generate unique session ID
    const sessionId = `test-version-${Date.now()}`;

    // First message to get the agent started
    console.log('1. Sending initial message...');
    const initResponse = await fetch(SANDBOX_A_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: 'I need to schedule an orthodontic appointment',
            overrideConfig: { sessionId }
        })
    });

    const initData = await initResponse.json();
    console.log('Initial response:', initData.text?.substring(0, 100), '...\n');

    // Now provide enough info to trigger a slots call
    console.log('2. Providing info to trigger slots call...');
    const infoMessages = [
        'My name is Test User',
        'T-E-S-T U-S-E-R',
        '2155551234',
        'No, first visit',
        'No previous treatment',
        'One child',
        'Test Child',
        '01/01/2015',
        'Keystone First',
        'No special needs',
        'test@email.com',
        'Any time works'
    ];

    let lastResponse = initData;
    for (const msg of infoMessages) {
        console.log(`   Sending: "${msg.substring(0, 30)}..."`);
        const resp = await fetch(SANDBOX_A_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: msg,
                overrideConfig: { sessionId }
            })
        });
        lastResponse = await resp.json();

        // Check if tool was invoked by looking for slot-related response
        if (lastResponse.text?.includes('AM') || lastResponse.text?.includes('PM') ||
            lastResponse.text?.includes('available') || lastResponse.text?.includes('slot')) {
            console.log('\n   Got scheduling response:', lastResponse.text?.substring(0, 150));
            break;
        }

        // Wait a bit between messages
        await new Promise(r => setTimeout(r, 500));
    }

    // Try to confirm and see what happens during booking
    console.log('\n3. Attempting to trigger booking...');
    const confirmResp = await fetch(SANDBOX_A_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: 'Yes, that time works perfectly',
            overrideConfig: { sessionId }
        })
    });

    const confirmData = await confirmResp.json();
    console.log('Confirmation response:', confirmData.text?.substring(0, 200));

    console.log('\n=== Test Complete ===');
    console.log('Session ID:', sessionId);
    console.log('\nCheck Langfuse trace for tool version details:');
    console.log('https://langfuse-6x3cj-u15194.vm.elestio.app/traces');
}

testFlowiseToolVersion().catch(console.error);

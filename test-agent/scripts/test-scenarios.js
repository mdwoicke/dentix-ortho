/**
 * Test both old and new code scenarios to understand behavior
 */
const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

async function testBothScenarios() {
    console.log('=== TESTING BOTH SCENARIOS ===\n');

    // Test 1: WITHOUT scheduleViewGUIDs filter (old buggy code)
    console.log('1. WITHOUT scheduleViewGUIDs filter (OLD CODE):');
    const body1 = {
        uui: 'test-old-' + Date.now(),
        startDate: '01/13/2026',
        endDate: '03/10/2026',
        locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b'
    };

    const r1 = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + credentials },
        body: JSON.stringify(body1)
    });
    const data1 = await r1.json();
    console.log('   Slots:', data1.slots ? data1.slots.length : 0);
    if (data1.slots && data1.slots.length > 0) {
        console.log('   First slot scheduleViewGUID:', data1.slots[0].scheduleViewGUID);
    }

    // Test 2: WITH scheduleViewGUIDs filter (NEW CODE)
    console.log('\n2. WITH scheduleViewGUIDs filter (NEW CODE):');
    const body2 = {
        uui: 'test-new-' + Date.now(),
        startDate: '01/13/2026',
        endDate: '03/10/2026',
        locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b',
        scheduleViewGUIDs: '4c9e9333-4951-4eb0-8d97-e1ad83ef422d'
    };

    const r2 = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + credentials },
        body: JSON.stringify(body2)
    });
    const data2 = await r2.json();
    console.log('   Slots:', data2.slots ? data2.slots.length : 0);
    if (data2.slots && data2.slots.length > 0) {
        console.log('   First slot:', data2.slots[0].startTime);
        console.log('   scheduleViewGUID:', data2.slots[0].scheduleViewGUID);
    }

    console.log('\n=== ANALYSIS ===');
    console.log('Without filter:', data1.slots ? data1.slots.length : 0, 'slots');
    console.log('With filter:', data2.slots ? data2.slots.length : 0, 'slots');

    if (data2.slots && data2.slots.length > 0) {
        console.log('\nThe filter IS working - slots exist for this schedule view!');
        console.log('Flowise tool should be finding these slots with the new code.');
    } else {
        console.log('\nNo slots with filter - this location might not have availability for this schedule view.');
    }
}

testBothScenarios().catch(e => console.error('Error:', e.message));

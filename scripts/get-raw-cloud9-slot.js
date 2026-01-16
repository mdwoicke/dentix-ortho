#!/usr/bin/env node
/**
 * Get raw Cloud9 slot response to see ALL returned fields
 * Uses Node Red endpoint which has correct credentials
 */

const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + credentials
};
const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

async function main() {
    console.log('=== GET SLOT WITH ALL FIELDS ===\n');

    const response = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            uui,
            startDate: '02/15/2026',
            endDate: '03/15/2026'
        })
    });

    const data = await response.json();

    if (data.slots && data.slots.length > 0) {
        console.log('First slot (all fields):');
        console.log(JSON.stringify(data.slots[0], null, 2));

        console.log('\n=== All slot keys ===');
        console.log(Object.keys(data.slots[0]).join(', '));
    } else {
        console.log('No slots found');
        console.log('Response:', JSON.stringify(data, null, 2).substring(0, 1000));
    }
}

main().catch(e => console.error('Error:', e.message));

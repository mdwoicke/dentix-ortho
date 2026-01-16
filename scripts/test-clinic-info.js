const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

async function testClinicInfo() {
    const endpoint = `${BASE_URL}/ortho/getLocation`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const body = {
        uui: uui,
        locationGUID: '799d413a-5e1a-46a2-b169-e2108bf517d6'  // CDH - Allegheny 300M
    };

    console.log('Testing clinic_info for CDH - Allegheny 300M...');
    console.log('Request:', JSON.stringify(body, null, 2));

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        console.log('\nResponse Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));

        // Look for orthodontist info
        if (data.location) {
            console.log('\n=== LOCATION INFO ===');
            console.log('Name:', data.location.Name || data.location.name);
            console.log('OrthodontistGUID:', data.location.OrthodontistGUID || data.location.orthodontistGUID);
            console.log('OrthodontistName:', data.location.OrthodontistName || data.location.orthodontistName);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testClinicInfo();

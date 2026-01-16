const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

async function testCreatePatient() {
    const endpoint = `${BASE_URL}/ortho/createPatient`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    // Test with different provider GUID
    const ALTERNATE_PROVIDER_GUID = '98b9876e-04b5-46c9-bf03-00a8341d6bd5';
    const LOCATION_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';  // CDH - Allegheny 300M

    const body = {
        uui: uui,
        patientFirstName: 'TestAlt',
        patientLastName: 'ProviderTest',
        birthdayDateTime: '06/21/1985',
        phoneNumber: '2155559999',
        emailAddress: 'test-alt@example.com',
        providerGUID: ALTERNATE_PROVIDER_GUID,
        locationGUID: LOCATION_GUID
    };

    console.log('Testing patient create with ALTERNATE provider GUID...');
    console.log('providerGUID:', ALTERNATE_PROVIDER_GUID);
    console.log('locationGUID:', LOCATION_GUID);
    console.log('\nRequest:', JSON.stringify(body, null, 2));

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

        if (data.success && data.patientGUID) {
            console.log('\n✅ SUCCESS! Patient created with patientGUID:', data.patientGUID);
            console.log('The alternate provider GUID works!');
        } else if (data.error) {
            console.log('\n❌ FAILED:', data.error);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testCreatePatient();

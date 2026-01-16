const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

async function verifyFix() {
    const endpoint = `${BASE_URL}/ortho/createPatient`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const timestamp = Date.now();

    // Test WITHOUT explicit providerGUID - should use the new default
    const body = {
        uui: uui,
        patientFirstName: 'VerifyFix' + timestamp.toString().slice(-4),
        patientLastName: 'TestPatient',
        birthdayDateTime: '06/21/1985',
        phoneNumber: '2155552' + timestamp.toString().slice(-4),
        emailAddress: `verify-fix-${timestamp}@example.com`,
        // NOT providing providerGUID - should use new default
        locationGUID: '799d413a-5e1a-46a2-b169-e2108bf517d6'  // CDH - Allegheny 300M
    };

    console.log('=== VERIFICATION TEST ===\n');
    console.log('Testing patient creation through Node-RED API');
    console.log('WITHOUT explicit providerGUID (should use new default)');
    console.log('Expected: a79ec244-9503-44b2-87e4-5920b6e60392 (Dr. Nga Nguyen)\n');

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
        console.log('Response Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));

        if (data.success && data.patientGUID) {
            console.log('\n✅ SUCCESS! Patient created:', data.patientGUID);
            console.log('\n🎉 THE FIX IS WORKING!');
            console.log('Patient creation with default provider GUID is now successful.');
        } else if (data.message && data.message.includes('does not exist')) {
            console.log('\n❌ FAILED - Provider GUID still invalid');
            console.log('The Node-RED server may not have been updated yet.');
        } else {
            console.log('\n⚠️ Unexpected response');
        }

    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

verifyFix();

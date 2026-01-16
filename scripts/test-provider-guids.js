const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

async function testProviderGUID(providerGUID, label) {
    const endpoint = `${BASE_URL}/ortho/createPatient`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const LOCATION_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';  // CDH - Allegheny 300M

    const timestamp = Date.now();
    const body = {
        uui: uui,
        patientFirstName: 'Test' + timestamp.toString().slice(-4),
        patientLastName: 'ProviderCheck',
        birthdayDateTime: '06/21/1985',
        phoneNumber: '2155550' + timestamp.toString().slice(-4),
        emailAddress: `test-${timestamp}@example.com`,
        providerGUID: providerGUID,
        locationGUID: LOCATION_GUID
    };

    console.log(`\n=== Testing: ${label} ===`);
    console.log('providerGUID:', providerGUID);

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

        if (data.success && data.patientGUID) {
            console.log('✅ SUCCESS! Patient created with patientGUID:', data.patientGUID);
            return { providerGUID, label, success: true, patientGUID: data.patientGUID };
        } else {
            console.log('❌ FAILED:', data.message || data.error);
            return { providerGUID, label, success: false, error: data.message || data.error };
        }

    } catch (error) {
        console.log('❌ ERROR:', error.message);
        return { providerGUID, label, success: false, error: error.message };
    }
}

async function main() {
    console.log('Testing all 4 OrthodontistGUIDs found in Postman collection...');
    console.log('Location: CDH - Allegheny 300M (799d413a-5e1a-46a2-b169-e2108bf517d6)');

    const guidsToTest = [
        { guid: '71f0957a-7c38-43cd-a41e-4f690a56ad6e', label: 'GUID #1 (new)' },
        { guid: '79ec29fe-c315-4982-845a-0005baefb5a8', label: 'GUID #2 (current default)' },
        { guid: '94fdc79e-00a8-4842-9d01-85851718b2b8', label: 'GUID #3 (new)' },
        { guid: '98b9876e-04b5-46c9-bf03-00a8341d6bd5', label: 'GUID #4 (most common in responses)' }
    ];

    const results = [];
    for (const { guid, label } of guidsToTest) {
        const result = await testProviderGUID(guid, label);
        results.push(result);
        // Small delay between requests
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n\n========== SUMMARY ==========');
    for (const r of results) {
        const status = r.success ? '✅' : '❌';
        console.log(`${status} ${r.label}: ${r.providerGUID}`);
        if (r.success) {
            console.log(`   Created patient: ${r.patientGUID}`);
        } else {
            console.log(`   Error: ${r.error}`);
        }
    }

    const working = results.filter(r => r.success);
    if (working.length > 0) {
        console.log('\n\n🎉 WORKING PROVIDER GUIDs:');
        working.forEach(r => console.log(` - ${r.providerGUID} (${r.label})`));
    } else {
        console.log('\n\n❌ NO WORKING PROVIDER GUIDs FOUND');
    }
}

main();

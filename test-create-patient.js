const fetch = require('node-fetch');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    namespace: 'http://schemas.practica.ws/cloud9/partners/',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    vendorUserName: 'IntelepeerTest'
};

// Test GUIDs from documentation and slots
const TEST_PROVIDER_GUID = '79ec29fe-c315-4982-845a-0005baefb5a8';
const TEST_LOCATION_GUID = '1070d281-0952-4f01-9a6e-1a2e6926a7db';

function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[<>&'"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
    }[c]));
}

async function testCreatePatient() {
    console.log('=== Testing SetPatient ===\n');
    console.log('Provider GUID:', TEST_PROVIDER_GUID);
    console.log('Location GUID:', TEST_LOCATION_GUID);

    const testPatient = {
        patientFirstName: 'TestEmma',
        patientLastName: 'TestJohnson',
        providerGUID: TEST_PROVIDER_GUID,
        locationGUID: TEST_LOCATION_GUID,
        birthdayDateTime: '2014-03-15T00:00:00',
        phoneNumber: '2155551234',
        email: 'test@email.com',
        VendorUserName: CLOUD9.vendorUserName
    };

    const paramElements = Object.entries(testPatient)
        .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
        .join('');

    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${escapeXml(CLOUD9.password)}</Password><Procedure>SetPatient</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;

    console.log('\nXML Request:\n', xmlRequest.substring(0, 500) + '...\n');

    try {
        const response = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlRequest
        });

        const xmlText = await response.text();
        console.log('HTTP Status:', response.status);
        console.log('\nResponse:\n', xmlText.substring(0, 1000));

        // Check for success
        if (xmlText.includes('Patient Added')) {
            const guidMatch = xmlText.match(/Patient Added:\s*([A-Fa-f0-9-]+)/i);
            console.log('\n✅ SUCCESS! Patient GUID:', guidMatch ? guidMatch[1] : 'not found');
        } else if (xmlText.includes('Error')) {
            console.log('\n❌ ERROR in response');
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testCreatePatient();

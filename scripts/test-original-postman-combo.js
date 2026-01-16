const fetch = require('node-fetch');

async function test() {
    console.log('Waiting 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));

    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
    const timestamp = Date.now();

    // Using the ORIGINAL Postman combination
    const ORIGINAL_PROVIDER_GUID = '79ec29fe-c315-4982-845a-0005baefb5a8';
    const ORIGINAL_LOCATION_GUID = '1070d281-0952-4f01-9a6e-1a2e6926a7db';  // From Postman request

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>SetPatient</Procedure>
    <Parameters>
        <patientFirstName>OrigCombo${timestamp.toString().slice(-4)}</patientFirstName>
        <patientLastName>TestPatient</patientLastName>
        <providerGUID>${ORIGINAL_PROVIDER_GUID}</providerGUID>
        <locationGUID>${ORIGINAL_LOCATION_GUID}</locationGUID>
        <birthdayDateTime>1985-06-21T00:00:00</birthdayDateTime>
        <phoneNumber>2155550${timestamp.toString().slice(-4)}</phoneNumber>
        <email>orig-test-${timestamp}@example.com</email>
        <VendorUserName>Intelepeer</VendorUserName>
    </Parameters>
</GetDataRequest>`;

    console.log('\nTesting ORIGINAL Postman combination:');
    console.log('providerGUID:', ORIGINAL_PROVIDER_GUID);
    console.log('locationGUID:', ORIGINAL_LOCATION_GUID);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xml
    });

    const text = await response.text();
    console.log('\nFull Response:');
    console.log(text);

    // Parse result
    if (text.includes('Patient GUID Added')) {
        const match = text.match(/Patient GUID Added: ([a-f0-9-]{36})/i);
        console.log('\n✅ SUCCESS! Patient created:', match ? match[1] : 'unknown');
    } else if (text.includes('does not exist')) {
        console.log('\n❌ FAILED: Provider GUID does not exist');
        console.log('\nThis means the provider was deleted or never existed in Production.');
    } else if (text.includes('Too many requests')) {
        console.log('\n❌ RATE LIMITED - Try again later');
    } else if (text.includes('Error')) {
        const errMatch = text.match(/ErrorMessage>([^<]+)/);
        console.log('\n❌ ERROR:', errMatch ? errMatch[1] : 'unknown');
    }
}

test().catch(e => console.error('Error:', e.message));

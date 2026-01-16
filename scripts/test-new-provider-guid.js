const fetch = require('node-fetch');

async function testSetPatient() {
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    // New provider GUID from CDH - Warrington
    const NEW_PROVIDER_GUID = 'a79ec244-9503-44b2-87e4-5920b6e60392';  // Dr. Nga Nguyen
    const LOCATION_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';  // CDH - Allegheny 300M

    const timestamp = Date.now();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>SetPatient</Procedure>
    <Parameters>
        <patientFirstName>TestNew${timestamp.toString().slice(-4)}</patientFirstName>
        <patientLastName>ProviderGUID</patientLastName>
        <providerGUID>${NEW_PROVIDER_GUID}</providerGUID>
        <locationGUID>${LOCATION_GUID}</locationGUID>
        <birthdayDateTime>1985-06-21T00:00:00</birthdayDateTime>
        <phoneNumber>2155551${timestamp.toString().slice(-4)}</phoneNumber>
        <email>test-new-${timestamp}@example.com</email>
        <VendorUserName>Intelepeer</VendorUserName>
    </Parameters>
</GetDataRequest>`;

    console.log('Testing NEW provider GUID directly against Cloud9 Production...\n');
    console.log('OrthodontistGUID:', NEW_PROVIDER_GUID, '(Dr. Nga Nguyen)');
    console.log('LocationGUID:', LOCATION_GUID, '(CDH - Allegheny 300M)');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });

        const text = await response.text();
        console.log('\nFull Response:');
        console.log(text);

        if (text.includes('Patient GUID Added')) {
            const match = text.match(/Patient GUID Added: ([a-f0-9-]{36})/i);
            console.log('\n✅ SUCCESS! Patient created:', match ? match[1] : 'unknown');
            console.log('\n🎉 This provider GUID works!');
            console.log('Update DEFAULT_PROVIDER_GUID to:', NEW_PROVIDER_GUID);
        } else if (text.includes('does not exist')) {
            console.log('\n❌ FAILED: Provider GUID does not exist');
        } else if (text.includes('Too many requests')) {
            console.log('\n❌ RATE LIMITED - Try again later');
        } else if (text.includes('Error')) {
            const errMatch = text.match(/ErrorMessage>([^<]+)/);
            console.log('\n❌ ERROR:', errMatch ? errMatch[1] : 'unknown');
        }

    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

testSetPatient();

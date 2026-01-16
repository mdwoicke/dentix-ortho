const fetch = require('node-fetch');

async function test() {
    console.log('Waiting 5 seconds before testing...');
    await new Promise(r => setTimeout(r, 5000));

    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
    const timestamp = Date.now();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>SetPatient</Procedure>
    <Parameters>
        <patientFirstName>SingleTest${timestamp.toString().slice(-4)}</patientFirstName>
        <patientLastName>Patient</patientLastName>
        <providerGUID>79ec29fe-c315-4982-845a-0005baefb5a8</providerGUID>
        <locationGUID>799d413a-5e1a-46a2-b169-e2108bf517d6</locationGUID>
        <birthdayDateTime>1985-06-21T00:00:00</birthdayDateTime>
        <phoneNumber>2155550${timestamp.toString().slice(-4)}</phoneNumber>
        <email>single-test-${timestamp}@example.com</email>
        <VendorUserName>Intelepeer</VendorUserName>
    </Parameters>
</GetDataRequest>`;

    console.log('\nTesting DEFAULT providerGUID: 79ec29fe-c315-4982-845a-0005baefb5a8');
    console.log('With locationGUID: 799d413a-5e1a-46a2-b169-e2108bf517d6 (CDH - Allegheny 300M)');

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
    } else if (text.includes('Too many requests')) {
        console.log('\n❌ RATE LIMITED - Try again later');
    } else if (text.includes('Error')) {
        const errMatch = text.match(/ErrorMessage>([^<]+)/);
        console.log('\n❌ ERROR:', errMatch ? errMatch[1] : 'unknown');
    }
}

test().catch(e => console.error('Error:', e.message));

const fetch = require('node-fetch');

async function testCloud9GetRecords() {
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    // Use GetRecords to find patients with their orthodontist info
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetRecords</Procedure>
    <Parameters>
        <phoneNumber>2155551234</phoneNumber>
    </Parameters>
</GetDataRequest>`;

    console.log('Testing GetRecords by phone number...\n');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });

        const text = await response.text();
        console.log('Response Status:', response.status);

        // Extract OrthodontistGUIDs
        const orthoPattern = /OrthodontistGUID>([a-f0-9-]{36})/gi;
        let match;
        const orthoGuids = new Set();
        while ((match = orthoPattern.exec(text)) !== null) {
            orthoGuids.add(match[1]);
        }

        if (orthoGuids.size > 0) {
            console.log('\n✅ Found OrthodontistGUIDs:');
            orthoGuids.forEach(g => console.log(' -', g));
        } else {
            console.log('\n❌ No OrthodontistGUID found');
        }

        console.log('\n=== Raw Response ===');
        console.log(text.substring(0, 3000));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testCloud9GetRecords();

const fetch = require('node-fetch');

async function testCloud9GetPatientList() {
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    // Use GetPatientList - might return patients with orthodontist info
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetPatientList</Procedure>
    <Parameters>
        <locationGUID>799d413a-5e1a-46a2-b169-e2108bf517d6</locationGUID>
        <modifiedDate>01/01/2026</modifiedDate>
    </Parameters>
</GetDataRequest>`;

    console.log('Testing GetPatientList for CDH - Allegheny location...\n');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });

        const text = await response.text();
        console.log('Response Status:', response.status);

        // Extract unique OrthodontistGUIDs
        const orthoPattern = /OrthodontistGUID>([a-f0-9-]{36})/gi;
        let match;
        const orthoGuids = new Set();
        while ((match = orthoPattern.exec(text)) !== null) {
            orthoGuids.add(match[1]);
        }

        if (orthoGuids.size > 0) {
            console.log('\n✅ Found OrthodontistGUIDs for CDH - Allegheny:');
            orthoGuids.forEach(g => console.log(' -', g));
        } else {
            console.log('\n❌ No OrthodontistGUID found');
        }

        // Show response snippet
        console.log('\n=== First 3000 chars of response ===');
        console.log(text.substring(0, 3000));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testCloud9GetPatientList();

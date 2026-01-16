const fetch = require('node-fetch');

async function testCloud9GetPatient() {
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    // Search for a patient first using GetPortalPatientLookup
    const xmlLookup = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetPortalPatientLookup</Procedure>
    <Parameters>
        <filter>CLITest</filter>
        <lookupByPatient>1</lookupByPatient>
        <showInactive>0</showInactive>
    </Parameters>
</GetDataRequest>`;

    console.log('Testing GetPortalPatientLookup for CLITest patients...\n');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlLookup
        });

        const text = await response.text();
        console.log('Response Status:', response.status);

        // Extract PatientGUIDs
        const patGuidPattern = /PatientGUID>([a-f0-9-]{36})/gi;
        let match;
        const patGuids = [];
        while ((match = patGuidPattern.exec(text)) !== null) {
            patGuids.push(match[1]);
        }

        console.log('Found', patGuids.length, 'patient GUIDs');
        if (patGuids.length > 0) {
            console.log('\nFirst patient GUID:', patGuids[0]);

            // Now get patient info to see the Orthodontist
            const xmlGetPatient = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetPatientInformation</Procedure>
    <Parameters>
        <patguid>${patGuids[0]}</patguid>
    </Parameters>
</GetDataRequest>`;

            console.log('\nGetting patient info for:', patGuids[0]);

            const patResponse = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: xmlGetPatient
            });

            const patText = await patResponse.text();
            console.log('\n=== Patient Information ===');
            console.log(patText.substring(0, 3000));

            // Extract OrthodontistGUID
            const orthoMatch = patText.match(/OrthodontistGUID>([a-f0-9-]{36})/i);
            if (orthoMatch) {
                console.log('\n✅ Found OrthodontistGUID:', orthoMatch[1]);
            } else {
                console.log('\n❌ No OrthodontistGUID found in response');
            }
        }

        // Show raw lookup response
        console.log('\n=== Lookup Response ===');
        console.log(text.substring(0, 2000));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testCloud9GetPatient();

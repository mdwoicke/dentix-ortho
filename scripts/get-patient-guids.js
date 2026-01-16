const fetch = require('node-fetch');

async function getPatientGUIDs(patientGUID, label) {
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    // Try GetPatient procedure which returns GUIDs
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetPatient</Procedure>
    <Parameters>
        <patGUID>${patientGUID}</patGUID>
    </Parameters>
</GetDataRequest>`;

    console.log(`\n=== ${label} - GetPatient ===`);
    console.log('PatientGUID:', patientGUID);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });

        const text = await response.text();
        console.log('\nFull Response:');
        console.log(text);

        // Extract all GUIDs
        const guidPattern = /([A-Za-z]+GUID)>([a-f0-9-]{36})/gi;
        let match;
        console.log('\nGUIDs found:');
        while ((match = guidPattern.exec(text)) !== null) {
            console.log(`  ${match[1]}: ${match[2]}`);
        }

    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

async function lookupPatientsByPhone() {
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    // Try GetPortalPatientLookup with a filter
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetPortalPatientLookup</Procedure>
    <Parameters>
        <filter>Jones</filter>
        <lookupByPatient>1</lookupByPatient>
        <showInactive>0</showInactive>
    </Parameters>
</GetDataRequest>`;

    console.log('\n=== Lookup patients by name "Jones" ===');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });

        const text = await response.text();
        console.log('\nResponse (first 2000 chars):');
        console.log(text.substring(0, 2000));

        // Extract patient GUIDs
        const guidPattern = /PatientGUID>([a-f0-9-]{36})/gi;
        let match;
        const guids = [];
        while ((match = guidPattern.exec(text)) !== null) {
            guids.push(match[1]);
        }
        console.log('\nFound', guids.length, 'patient GUIDs');
        if (guids.length > 0) {
            console.log('First 5:', guids.slice(0, 5));
        }

        return guids;

    } catch (error) {
        console.log('❌ Error:', error.message);
        return [];
    }
}

async function main() {
    console.log('Querying Cloud9 Production for patient GUIDs...\n');

    // First try GetPatient for known patient
    await getPatientGUIDs('2eb9ae46-fdae-40e3-90fb-739b108ffa86', 'Abigail Jones');

    // Wait a bit
    await new Promise(r => setTimeout(r, 2000));

    // Try lookup
    await lookupPatientsByPhone();
}

main();

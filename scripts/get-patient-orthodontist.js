const fetch = require('node-fetch');

async function getPatientInfo(patientGUID, label) {
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetPatientInformation</Procedure>
    <Parameters>
        <patguid>${patientGUID}</patguid>
    </Parameters>
</GetDataRequest>`;

    console.log(`\n=== ${label} ===`);
    console.log('PatientGUID:', patientGUID);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });

        const text = await response.text();

        // Check for errors
        if (text.includes('ErrorMessage')) {
            const errMatch = text.match(/ErrorMessage>([^<]+)/);
            console.log('❌ Error:', errMatch ? errMatch[1] : 'Unknown');
            return null;
        }

        // Extract orthodontist info
        const orthoGuidMatch = text.match(/OrthodontistGUID>([a-f0-9-]{36})/i);
        const orthoNameMatch = text.match(/OrthodontistName>([^<]+)/i);
        const orthoCodeMatch = text.match(/OrthodontistCode>([^<]+)/i);
        const locationGuidMatch = text.match(/LocationGUID>([a-f0-9-]{36})/i);
        const locationNameMatch = text.match(/LocationName>([^<]+)/i);
        const patientNameMatch = text.match(/FullName>([^<]+)/i);

        if (orthoGuidMatch) {
            console.log('✅ Patient Found!');
            console.log('  Patient Name:', patientNameMatch ? patientNameMatch[1] : 'N/A');
            console.log('  Location:', locationNameMatch ? locationNameMatch[1] : 'N/A');
            console.log('  LocationGUID:', locationGuidMatch ? locationGuidMatch[1] : 'N/A');
            console.log('  OrthodontistGUID:', orthoGuidMatch[1]);
            console.log('  OrthodontistName:', orthoNameMatch ? orthoNameMatch[1] : 'N/A');
            console.log('  OrthodontistCode:', orthoCodeMatch ? orthoCodeMatch[1] : 'N/A');
            return {
                patientGUID,
                orthodontistGUID: orthoGuidMatch[1],
                orthodontistName: orthoNameMatch ? orthoNameMatch[1] : null,
                locationGUID: locationGuidMatch ? locationGuidMatch[1] : null,
                locationName: locationNameMatch ? locationNameMatch[1] : null
            };
        } else {
            console.log('Response (first 1000 chars):', text.substring(0, 1000));
            return null;
        }

    } catch (error) {
        console.log('❌ Error:', error.message);
        return null;
    }
}

async function main() {
    console.log('Querying Cloud9 Production for existing patient orthodontist info...');
    console.log('Looking for valid OrthodontistGUIDs from real patients.\n');

    // Patient GUID from Postman collection (Production)
    const patientGUIDs = [
        { guid: '2eb9ae46-fdae-40e3-90fb-739b108ffa86', label: 'From Postman (Production)' }
    ];

    const results = [];
    for (const { guid, label } of patientGUIDs) {
        const result = await getPatientInfo(guid, label);
        if (result) results.push(result);
        await new Promise(r => setTimeout(r, 1000));
    }

    if (results.length > 0) {
        console.log('\n\n========== VALID ORTHODONTIST GUIDs FOUND ==========');
        const uniqueOrthos = new Map();
        for (const r of results) {
            if (!uniqueOrthos.has(r.orthodontistGUID)) {
                uniqueOrthos.set(r.orthodontistGUID, r);
            }
        }
        for (const [guid, info] of uniqueOrthos) {
            console.log(`\n  OrthodontistGUID: ${guid}`);
            console.log(`  OrthodontistName: ${info.orthodontistName || 'N/A'}`);
            console.log(`  Location: ${info.locationName || 'N/A'} (${info.locationGUID || 'N/A'})`);
        }
    } else {
        console.log('\n\n❌ No valid orthodontist info found');
    }
}

main();

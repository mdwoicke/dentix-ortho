const fetch = require('node-fetch');

async function testSetPatientDirect(providerGUID, label) {
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    const timestamp = Date.now();
    const LOCATION_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';  // CDH - Allegheny 300M

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>SetPatient</Procedure>
    <Parameters>
        <patientFirstName>Direct${timestamp.toString().slice(-4)}</patientFirstName>
        <patientLastName>TestPatient</patientLastName>
        <providerGUID>${providerGUID}</providerGUID>
        <locationGUID>${LOCATION_GUID}</locationGUID>
        <birthdayDateTime>1985-06-21T00:00:00</birthdayDateTime>
        <phoneNumber>2155550${timestamp.toString().slice(-4)}</phoneNumber>
        <email>direct-test-${timestamp}@example.com</email>
        <VendorUserName>Intelepeer</VendorUserName>
    </Parameters>
</GetDataRequest>`;

    console.log(`\n=== Testing: ${label} ===`);
    console.log('providerGUID:', providerGUID);
    console.log('locationGUID:', LOCATION_GUID);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });

        const text = await response.text();
        console.log('Response Status:', response.status);

        if (text.includes('Success') || text.includes('Patient GUID Added')) {
            // Extract patient GUID from success response
            const guidMatch = text.match(/Patient GUID Added: ([a-f0-9-]{36})/i);
            console.log('✅ SUCCESS!');
            if (guidMatch) {
                console.log('Patient GUID:', guidMatch[1]);
            }
            console.log('Response:', text.substring(0, 500));
            return { providerGUID, label, success: true };
        } else if (text.includes('Error')) {
            const errorMatch = text.match(/ErrorMessage>([^<]+)/);
            console.log('❌ FAILED:', errorMatch ? errorMatch[1] : text.substring(0, 300));
            return { providerGUID, label, success: false, error: errorMatch ? errorMatch[1] : 'Unknown error' };
        } else {
            console.log('Response:', text.substring(0, 500));
            return { providerGUID, label, success: false, error: 'Unknown response' };
        }

    } catch (error) {
        console.log('❌ ERROR:', error.message);
        return { providerGUID, label, success: false, error: error.message };
    }
}

async function main() {
    console.log('Testing SetPatient DIRECTLY against Cloud9 Production API...');
    console.log('Location: CDH - Allegheny 300M (799d413a-5e1a-46a2-b169-e2108bf517d6)');
    console.log('This bypasses Node-RED to test Cloud9 directly.\n');

    const guidsToTest = [
        { guid: '71f0957a-7c38-43cd-a41e-4f690a56ad6e', label: 'GUID #1' },
        { guid: '79ec29fe-c315-4982-845a-0005baefb5a8', label: 'GUID #2 (current default)' },
        { guid: '94fdc79e-00a8-4842-9d01-85851718b2b8', label: 'GUID #3' },
        { guid: '98b9876e-04b5-46c9-bf03-00a8341d6bd5', label: 'GUID #4' }
    ];

    const results = [];
    for (const { guid, label } of guidsToTest) {
        const result = await testSetPatientDirect(guid, label);
        results.push(result);
        await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n\n========== DIRECT CLOUD9 SUMMARY ==========');
    for (const r of results) {
        const status = r.success ? '✅' : '❌';
        console.log(`${status} ${r.label}: ${r.providerGUID}`);
        if (!r.success && r.error) {
            console.log(`   Error: ${r.error}`);
        }
    }

    const working = results.filter(r => r.success);
    if (working.length > 0) {
        console.log('\n🎉 WORKING PROVIDER GUIDs:');
        working.forEach(r => console.log(` - ${r.providerGUID} (${r.label})`));
    } else {
        console.log('\n❌ NO WORKING PROVIDER GUIDs - Cloud9 API issue');
    }
}

main();

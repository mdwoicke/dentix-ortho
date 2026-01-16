const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

async function getLocationInfo(locationGUID) {
    const endpoint = `${BASE_URL}/ortho/getLocation`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const body = { uui, locationGUID };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (e) {
        return null;
    }
}

async function getChairSchedules() {
    // Try GetChairSchedules from Cloud9 directly - this might have provider info
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetChairSchedules</Procedure>
    <Parameters>
        <locationGUID>799d413a-5e1a-46a2-b169-e2108bf517d6</locationGUID>
    </Parameters>
</GetDataRequest>`;

    console.log('\n=== GetChairSchedules for CDH - Allegheny ===');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });

        const text = await response.text();
        console.log('Response:');
        console.log(text.substring(0, 3000));

        // Look for provider/orthodontist GUIDs
        const orthoGuids = text.matchAll(/OrthodontistGUID>([a-f0-9-]{36})/gi);
        const provGuids = text.matchAll(/ProviderGUID>([a-f0-9-]{36})/gi);

        console.log('\nOrthodontistGUIDs found:');
        for (const m of orthoGuids) console.log('  -', m[1]);

        console.log('\nProviderGUIDs found:');
        for (const m of provGuids) console.log('  -', m[1]);

    } catch (e) {
        console.log('Error:', e.message);
    }
}

async function main() {
    // First check what location d618c1b6-c021-4e8c-a442-57baa08d0944 is
    console.log('Checking LocationGUID d618c1b6-c021-4e8c-a442-57baa08d0944...');
    const loc1 = await getLocationInfo('d618c1b6-c021-4e8c-a442-57baa08d0944');
    if (loc1 && loc1.location) {
        console.log('Location:', loc1.location.LocationName);
    } else {
        console.log('Result:', JSON.stringify(loc1, null, 2));
    }

    // Check CDH - Allegheny
    console.log('\n\nChecking CDH - Allegheny (799d413a-5e1a-46a2-b169-e2108bf517d6)...');
    const loc2 = await getLocationInfo('799d413a-5e1a-46a2-b169-e2108bf517d6');
    if (loc2 && loc2.location) {
        console.log('Location:', loc2.location.LocationName);
        console.log('Full details:', JSON.stringify(loc2.location, null, 2));
    }

    await new Promise(r => setTimeout(r, 1000));

    // Try GetChairSchedules
    await getChairSchedules();
}

main();

const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const CDH_ALLEGHENY_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';

async function lookupPatientAtLocation(filter, locationGUID, locationName) {
    const endpoint = `${BASE_URL}/ortho/getPatientByFilter`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const body = {
        uui: uui,
        filter: filter,
        locationGUID: locationGUID
    };

    console.log(`\n=== Lookup "${filter}" at ${locationName} ===`);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.patients && data.patients.length > 0) {
            // Filter for patients at the target location
            const atLocation = data.patients.filter(p =>
                (p.LocationGUID === locationGUID) ||
                (p.LocationName && p.LocationName.includes('Allegheny'))
            );

            console.log(`Found ${data.patients.length} total patients, ${atLocation.length} at ${locationName}`);

            if (atLocation.length > 0) {
                for (const p of atLocation.slice(0, 5)) {
                    console.log(`  - ${p.PatientName} (${p.patientGUID})`);
                }
                return atLocation;
            }
        } else {
            console.log('No patients found');
        }

        return [];

    } catch (error) {
        console.log('❌ Error:', error.message);
        return [];
    }
}

async function getAppointments(patientGUID) {
    const endpoint = `${BASE_URL}/ortho/getPatientAppts`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const body = {
        uui: uui,
        patientGUID: patientGUID
    };

    console.log(`\n=== Getting appointments for: ${patientGUID} ===`);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        console.log('Appointments response:', JSON.stringify(data, null, 2));

        // Check for provider GUID in appointments
        if (data.appointments && data.appointments.length > 0) {
            for (const appt of data.appointments.slice(0, 3)) {
                console.log('\n  Appointment:', appt.AppointmentDate || appt.appointmentDate);
                console.log('  ProviderGUID:', appt.ProviderGUID || appt.providerGUID || 'NOT FOUND');
                console.log('  OrthodontistGUID:', appt.OrthodontistGUID || appt.orthodontistGUID || 'NOT FOUND');
                console.log('  All keys:', Object.keys(appt).join(', '));
            }
        }

        return data;

    } catch (error) {
        console.log('❌ Error:', error.message);
        return null;
    }
}

async function getLocationInfo() {
    // Try GetLocationsContactInfo to see if it has provider info
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetLocationsContactInfo</Procedure>
    <Parameters></Parameters>
</GetDataRequest>`;

    console.log('\n=== Getting GetLocationsContactInfo ===');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });

        const text = await response.text();

        // Look for CDH - Allegheny in the response
        if (text.includes('Allegheny') || text.includes('799d413a')) {
            const alleghenyMatch = text.match(/<Record>[\s\S]*?Allegheny[\s\S]*?<\/Record>/i);
            if (alleghenyMatch) {
                console.log('Found CDH - Allegheny:');
                console.log(alleghenyMatch[0]);
            }
        }

        // Extract any OrthodontistGUID or ProviderGUID
        const orthoGuids = text.matchAll(/OrthodontistGUID>([a-f0-9-]{36})/gi);
        const provGuids = text.matchAll(/ProviderGUID>([a-f0-9-]{36})/gi);

        console.log('\nOrthodontistGUIDs in response:');
        for (const m of orthoGuids) console.log('  -', m[1]);

        console.log('\nProviderGUIDs in response:');
        for (const m of provGuids) console.log('  -', m[1]);

        // Show first 2000 chars
        console.log('\nResponse (first 2000 chars):');
        console.log(text.substring(0, 2000));

    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

async function main() {
    console.log('Searching for patients at CDH - Allegheny and checking for OrthodontistGUID...\n');

    // First check GetLocationsContactInfo
    await getLocationInfo();

    await new Promise(r => setTimeout(r, 2000));

    // Search for patients with common names at CDH - Allegheny
    const patients = await lookupPatientAtLocation('A', CDH_ALLEGHENY_GUID, 'CDH - Allegheny');

    if (patients.length > 0) {
        await new Promise(r => setTimeout(r, 1000));
        // Get appointments for first patient to see if they have provider info
        await getAppointments(patients[0].patientGUID);
    }

    // Also try getting appointments for the Abigail Jones patient we found
    await new Promise(r => setTimeout(r, 1000));
    await getAppointments('2eb9ae46-fdae-40e3-90fb-739b108ffa86');
}

main();

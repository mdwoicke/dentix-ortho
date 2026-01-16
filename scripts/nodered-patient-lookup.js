const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

async function lookupPatient(filter) {
    const endpoint = `${BASE_URL}/ortho/getPatientByFilter`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const body = {
        uui: uui,
        filter: filter,
        locationGUID: '799d413a-5e1a-46a2-b169-e2108bf517d6'  // CDH - Allegheny
    };

    console.log(`\n=== Looking up patients with filter: "${filter}" ===`);

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
        console.log('Response:', JSON.stringify(data, null, 2));

        if (data.patients && data.patients.length > 0) {
            console.log(`\nFound ${data.patients.length} patients`);
            for (const patient of data.patients.slice(0, 5)) {
                console.log('\n  Patient:', patient.PatientName || patient.patientName);
                console.log('  PatientGUID:', patient.PatientGUID || patient.patientGUID);
                console.log('  OrthodontistGUID:', patient.OrthodontistGUID || patient.orthodontistGUID || 'NOT RETURNED');
                console.log('  LocationGUID:', patient.LocationGUID || patient.locationGUID || 'NOT RETURNED');
            }
            return data.patients;
        }

        return [];

    } catch (error) {
        console.log('❌ Error:', error.message);
        return [];
    }
}

async function getPatientDetails(patientGUID) {
    const endpoint = `${BASE_URL}/ortho/getPatient`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const body = {
        uui: uui,
        patientGUID: patientGUID
    };

    console.log(`\n=== Getting patient details for: ${patientGUID} ===`);

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
        console.log('Response:', JSON.stringify(data, null, 2));

        // Check for orthodontist info
        if (data.patient) {
            const p = data.patient;
            console.log('\n  OrthodontistGUID:', p.OrthodontistGUID || p.orthodontistGUID || p.PatientOrthodontistGUID || 'NOT FOUND');
            console.log('  Orthodontist:', p.Orthodontist || p.orthodontist || p.OrthodontistName || 'NOT FOUND');
        }

        return data;

    } catch (error) {
        console.log('❌ Error:', error.message);
        return null;
    }
}

async function main() {
    console.log('Using Node-RED API to lookup patients and find OrthodontistGUID...\n');

    // Try looking up patients at CDH - Allegheny
    const patients = await lookupPatient('Smith');

    await new Promise(r => setTimeout(r, 1000));

    // If we found patients, get details for the first one
    if (patients.length > 0) {
        const firstGUID = patients[0].PatientGUID || patients[0].patientGUID;
        if (firstGUID) {
            await getPatientDetails(firstGUID);
        }
    }

    // Also try getting details for the known Abigail Jones patient
    await new Promise(r => setTimeout(r, 1000));
    await getPatientDetails('2eb9ae46-fdae-40e3-90fb-739b108ffa86');
}

main();

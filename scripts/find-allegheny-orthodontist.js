const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const CDH_ALLEGHENY_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';

async function lookupPatients(filter) {
    const endpoint = `${BASE_URL}/ortho/getPatientByFilter`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const body = {
        uui: uui,
        filter: filter,
        locationGUID: CDH_ALLEGHENY_GUID
    };

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
            // Filter for CDH - Allegheny only
            const alleghenyPatients = data.patients.filter(p =>
                p.LocationGUID === CDH_ALLEGHENY_GUID ||
                (p.LocationName && p.LocationName.includes('Allegheny'))
            );
            return alleghenyPatients;
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
        return data.appointments || [];

    } catch (error) {
        return [];
    }
}

async function main() {
    console.log('Searching for OrthodontistGUID at CDH - Allegheny 300M...\n');
    console.log('LocationGUID:', CDH_ALLEGHENY_GUID);

    const orthodontists = new Map();
    const searchTerms = ['A', 'B', 'C', 'D', 'M', 'S', 'J', 'R'];

    for (const term of searchTerms) {
        console.log(`\nSearching patients starting with "${term}"...`);

        const patients = await lookupPatients(term);
        const alleghenyOnly = patients.filter(p =>
            p.LocationGUID === CDH_ALLEGHENY_GUID ||
            (p.LocationName && p.LocationName.includes('Allegheny'))
        );

        console.log(`Found ${alleghenyOnly.length} patients at CDH - Allegheny`);

        // Check appointments for each patient
        for (const patient of alleghenyOnly.slice(0, 5)) {
            const appts = await getAppointments(patient.patientGUID);

            for (const appt of appts) {
                // Only look at appointments at CDH - Allegheny
                if (appt.LocationGUID === CDH_ALLEGHENY_GUID ||
                    (appt.LocationName && appt.LocationName.includes('Allegheny'))) {

                    if (appt.OrthodontistGUID) {
                        if (!orthodontists.has(appt.OrthodontistGUID)) {
                            orthodontists.set(appt.OrthodontistGUID, {
                                guid: appt.OrthodontistGUID,
                                name: appt.OrthodontistName,
                                code: appt.OrthodontistCode,
                                location: appt.LocationName
                            });
                            console.log(`  ✅ Found: ${appt.OrthodontistName} (${appt.OrthodontistGUID})`);
                        }
                    }
                }
            }

            // Small delay between requests
            await new Promise(r => setTimeout(r, 200));
        }

        await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n\n========== ORTHODONTISTS AT CDH - ALLEGHENY ==========');
    if (orthodontists.size === 0) {
        console.log('❌ No orthodontists found at CDH - Allegheny');
        console.log('\nNOTE: This might mean:');
        console.log('1. No patients at this location have appointments');
        console.log('2. The location uses a different provider');
        console.log('3. Need to check more patients');
    } else {
        for (const [guid, info] of orthodontists) {
            console.log(`\n  OrthodontistGUID: ${guid}`);
            console.log(`  Name: ${info.name}`);
            console.log(`  Code: ${info.code}`);
            console.log(`  Location: ${info.location}`);
        }

        console.log('\n\n🎉 USE THIS GUID FOR DEFAULT_PROVIDER_GUID:');
        const first = orthodontists.values().next().value;
        console.log(`\n  ${first.guid}`);
        console.log(`  (${first.name})`);
    }
}

main();

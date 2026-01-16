const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

async function lookupPatients(filter) {
    const endpoint = `${BASE_URL}/ortho/getPatientByFilter`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';
    const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

    const body = { uui, filter };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        return data.patients || [];
    } catch (e) {
        return [];
    }
}

async function getAppointments(patientGUID) {
    const endpoint = `${BASE_URL}/ortho/getPatientAppts`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';
    const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

    const body = { uui, patientGUID };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        return data.appointments || [];
    } catch (e) {
        return [];
    }
}

async function main() {
    console.log('Searching for CDH orthodontists across all CDH locations...\n');

    const orthodontists = new Map();
    const searchTerms = ['Smith', 'Jones', 'Brown', 'Johnson', 'Williams'];

    for (const term of searchTerms) {
        console.log(`\nSearching patients: "${term}"...`);

        const patients = await lookupPatients(term);

        // Filter for any CDH location
        const cdhPatients = patients.filter(p =>
            p.LocationName && p.LocationName.includes('CDH')
        );

        console.log(`Found ${cdhPatients.length} CDH patients`);

        // Check appointments for these patients
        for (const patient of cdhPatients.slice(0, 10)) {
            const appts = await getAppointments(patient.patientGUID);

            for (const appt of appts) {
                // Look at any CDH appointment
                if (appt.LocationName && appt.LocationName.includes('CDH')) {
                    if (appt.OrthodontistGUID) {
                        const key = appt.OrthodontistGUID;
                        if (!orthodontists.has(key)) {
                            orthodontists.set(key, {
                                guid: appt.OrthodontistGUID,
                                name: appt.OrthodontistName,
                                code: appt.OrthodontistCode,
                                locations: new Set()
                            });
                        }
                        orthodontists.get(key).locations.add(appt.LocationName);
                    }
                }
            }

            await new Promise(r => setTimeout(r, 100));
        }

        await new Promise(r => setTimeout(r, 300));

        // If we found orthodontists, we can stop
        if (orthodontists.size > 0) {
            console.log('\n✅ Found CDH orthodontists!');
            break;
        }
    }

    console.log('\n\n========== CDH ORTHODONTISTS ==========');
    if (orthodontists.size === 0) {
        console.log('❌ No CDH orthodontists found');
    } else {
        for (const [guid, info] of orthodontists) {
            console.log(`\n  OrthodontistGUID: ${guid}`);
            console.log(`  Name: ${info.name}`);
            console.log(`  Code: ${info.code}`);
            console.log(`  Used at: ${Array.from(info.locations).join(', ')}`);
        }

        console.log('\n\n🎉 RECOMMENDED DEFAULT_PROVIDER_GUID:');
        const first = orthodontists.values().next().value;
        console.log(`\n  ${first.guid}  (${first.name})`);
    }
}

main();

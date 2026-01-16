const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

async function getSlots() {
    const endpoint = `${BASE_URL}/ortho/getApptSlots`;
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    const username = 'workflowapi';
    const password = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const body = {
        uui: uui,
        startDate: '01/13/2026',
        endDate: '01/27/2026'
        // Not specifying scheduleViewGUIDs to get all locations
    };

    console.log('Getting available appointment slots...\n');

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

        if (data.slots && data.slots.length > 0) {
            console.log(`Found ${data.slots.length} total slots`);

            // Look for slots at CDH - Allegheny or similar
            const locationGroups = new Map();

            for (const slot of data.slots) {
                const loc = slot.LocationName || slot.locationName || slot.location || 'Unknown';
                if (!locationGroups.has(loc)) {
                    locationGroups.set(loc, []);
                }
                locationGroups.get(loc).push(slot);
            }

            console.log('\nSlots by location:');
            for (const [loc, slots] of locationGroups) {
                console.log(`\n  ${loc}: ${slots.length} slots`);

                // Check first slot for provider info
                const first = slots[0];
                console.log('    Sample slot keys:', Object.keys(first).join(', '));

                // Look for any GUID fields
                for (const [key, value] of Object.entries(first)) {
                    if (key.toLowerCase().includes('guid')) {
                        console.log(`    ${key}: ${value}`);
                    }
                    if (key.toLowerCase().includes('orthodontist') || key.toLowerCase().includes('provider')) {
                        console.log(`    ${key}: ${value}`);
                    }
                }
            }

            // Find CDH - Allegheny slots specifically
            console.log('\n\n=== CDH - Allegheny Slots ===');
            const alleghenySlots = data.slots.filter(s =>
                (s.LocationName && s.LocationName.includes('Allegheny')) ||
                (s.locationName && s.locationName.includes('Allegheny')) ||
                s.LocationGUID === '799d413a-5e1a-46a2-b169-e2108bf517d6' ||
                s.locationGUID === '799d413a-5e1a-46a2-b169-e2108bf517d6'
            );

            if (alleghenySlots.length > 0) {
                console.log(`Found ${alleghenySlots.length} slots at CDH - Allegheny`);
                console.log('\nFirst slot details:');
                console.log(JSON.stringify(alleghenySlots[0], null, 2));
            } else {
                console.log('No slots found for CDH - Allegheny');
                console.log('\nAll unique locations in slots:');
                for (const [loc, slots] of locationGroups) {
                    console.log(`  - ${loc}`);
                }
            }

        } else {
            console.log('No slots returned');
            console.log('Response:', JSON.stringify(data, null, 2));
        }

    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

getSlots();

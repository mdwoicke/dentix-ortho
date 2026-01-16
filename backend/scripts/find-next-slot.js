const https = require('https');
const { parseStringPromise } = require('xml2js');

// Cloud9 Production API
const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

// User-provided GUIDs
const LOCATION_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';
const SCHEDULE_VIEW_GUID = 'b1946f40-3b0b-4e01-87a9-c5060b88443e';
const APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';
const SCHEDULE_COLUMN_GUID = 'dda0b40c-ace5-4427-8b76-493bf9aa26f1';

function buildXmlRequest(startDate, endDate, schedViewGuid = null) {
    const schdvwLine = schedViewGuid ? `        <schdvwGUIDs>${schedViewGuid}</schdvwGUIDs>\n` : '';
    return `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CREDENTIALS.clientId}</ClientID>
    <UserName>${CREDENTIALS.userName}</UserName>
    <Password>${CREDENTIALS.password}</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>${startDate} 7:00:00 AM</startDate>
        <endDate>${endDate} 5:00:00 PM</endDate>
${schdvwLine}        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>`;
}

async function parseXmlResponse(xmlData) {
    return await parseStringPromise(xmlData, { explicitArray: false });
}

function makeRequest(xmlBody) {
    return new Promise((resolve, reject) => {
        const url = new URL(ENDPOINT);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'GET',
            headers: {
                'Content-Type': 'application/xml',
                'Content-Length': Buffer.byteLength(xmlBody)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.write(xmlBody);
        req.end();
    });
}

const formatDate = (d) => {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
};

async function findNextSlot() {
    const today = new Date();
    let startDate = new Date(today);
    let endDate = new Date(today);
    // Maximum allowed by API: 28 weeks (196 days)
    endDate.setDate(endDate.getDate() + 196);

    console.log('========================================');
    console.log('COMPREHENSIVE SLOT AVAILABILITY CHECK');
    console.log('========================================');
    console.log(`\nTarget Location GUID: ${LOCATION_GUID}`);
    console.log(`Target Schedule View GUID: ${SCHEDULE_VIEW_GUID}`);
    console.log(`Date Range: ${formatDate(startDate)} to ${formatDate(endDate)} (28 weeks - MAX)`);
    console.log('');

    // ========================================
    // TEST 1: Query with the specific Schedule View GUID
    // ========================================
    console.log('\n--- TEST 1: Direct query with Schedule View GUID ---');
    try {
        const xmlBody1 = buildXmlRequest(formatDate(startDate), formatDate(endDate), SCHEDULE_VIEW_GUID);
        const responseData1 = await makeRequest(xmlBody1);
        const parsed1 = await parseXmlResponse(responseData1);
        const resp1 = parsed1.GetDataResponse;

        if (resp1.ResponseStatus === 'Success') {
            let records1 = resp1.Records?.Record;
            if (!records1) {
                console.log(`RESULT: NO SLOTS found for Schedule View GUID ${SCHEDULE_VIEW_GUID}`);
                console.log('This schedule view has ZERO available appointments in the next 28 weeks.');
            } else {
                if (!Array.isArray(records1)) records1 = [records1];
                console.log(`RESULT: Found ${records1.length} slots for this schedule view`);
                console.log('\nFirst slot:');
                console.log(JSON.stringify(records1[0], null, 2));
            }
        } else {
            console.log('API Error:', resp1.ErrorMessage || resp1.ResponseStatus);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    // Wait 3 seconds to avoid rate limiting
    console.log('\nWaiting 3 seconds to avoid rate limit...');
    await new Promise(r => setTimeout(r, 3000));

    // ========================================
    // TEST 2: Query ALL slots and filter by Location GUID
    // ========================================
    console.log('\n--- TEST 2: Query all slots, filter by Location GUID ---');
    try {
        const xmlBody2 = buildXmlRequest(formatDate(startDate), formatDate(endDate), null);
        const responseData2 = await makeRequest(xmlBody2);
        const parsed2 = await parseXmlResponse(responseData2);
        const resp2 = parsed2.GetDataResponse;

        if (resp2.ResponseStatus === 'Success') {
            let records2 = resp2.Records?.Record;
            if (!records2) {
                console.log('No slots returned from API at all');
            } else {
                if (!Array.isArray(records2)) records2 = [records2];
                console.log(`Total slots across all locations: ${records2.length}`);

                // Filter by location GUID
                const locationSlots = records2.filter(r => r.LocationGUID === LOCATION_GUID);
                console.log(`\nSlots matching Location GUID ${LOCATION_GUID}: ${locationSlots.length}`);

                // Also check by schedule view GUID
                const schedViewSlots = records2.filter(r => r.ScheduleViewGUID === SCHEDULE_VIEW_GUID);
                console.log(`Slots matching Schedule View GUID ${SCHEDULE_VIEW_GUID}: ${schedViewSlots.length}`);

                // Check for partial GUID matches (case sensitivity)
                const partialLocMatch = records2.filter(r =>
                    r.LocationGUID?.toLowerCase() === LOCATION_GUID.toLowerCase()
                );
                const partialSchedMatch = records2.filter(r =>
                    r.ScheduleViewGUID?.toLowerCase() === SCHEDULE_VIEW_GUID.toLowerCase()
                );
                console.log(`\nCase-insensitive Location match: ${partialLocMatch.length}`);
                console.log(`Case-insensitive Schedule View match: ${partialSchedMatch.length}`);

                // Show all unique location GUIDs
                const allLocGuids = new Set();
                const allSchedGuids = new Set();
                records2.forEach(r => {
                    allLocGuids.add(r.LocationGUID);
                    allSchedGuids.add(r.ScheduleViewGUID);
                });

                console.log(`\n--- All ${allLocGuids.size} Location GUIDs with available slots ---`);
                for (const guid of allLocGuids) {
                    const count = records2.filter(r => r.LocationGUID === guid).length;
                    const name = records2.find(r => r.LocationGUID === guid)?.ScheduleViewDescription || 'Unknown';
                    const match = guid === LOCATION_GUID ? ' <-- YOUR GUID' : '';
                    console.log(`  ${guid}: ${count} slots (${name})${match}`);
                }

                // Check if "Allegheny" appears anywhere
                console.log('\n--- Locations containing "Allegheny" ---');
                const alleghenyLocs = records2.filter(r =>
                    r.ScheduleViewDescription?.toLowerCase().includes('allegheny')
                );
                if (alleghenyLocs.length > 0) {
                    const uniqueAllegheny = new Map();
                    alleghenyLocs.forEach(r => {
                        if (!uniqueAllegheny.has(r.LocationGUID)) {
                            uniqueAllegheny.set(r.LocationGUID, {
                                name: r.ScheduleViewDescription,
                                schedViewGUID: r.ScheduleViewGUID,
                                count: 0
                            });
                        }
                        uniqueAllegheny.get(r.LocationGUID).count++;
                    });
                    for (const [locGuid, info] of uniqueAllegheny) {
                        console.log(`  ${info.name}`);
                        console.log(`    LocationGUID: ${locGuid}`);
                        console.log(`    ScheduleViewGUID: ${info.schedViewGUID}`);
                        console.log(`    Available slots: ${info.count}`);
                    }
                } else {
                    console.log('  No locations with "Allegheny" in name');
                }

                if (locationSlots.length > 0) {
                    locationSlots.sort((a, b) => new Date(a.StartTime) - new Date(b.StartTime));
                    console.log('\n=== NEXT AVAILABLE SLOT FOR YOUR LOCATION ===');
                    console.log(JSON.stringify(locationSlots[0], null, 2));
                }
            }
        } else {
            console.log('API Error:', resp2.ErrorMessage || resp2.ResponseStatus);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    console.log('\n========================================');
    console.log('VERIFICATION COMPLETE');
    console.log('========================================');
}

findNextSlot();

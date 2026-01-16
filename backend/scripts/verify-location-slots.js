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

function buildXmlRequest(startDate, endDate) {
    return `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CREDENTIALS.clientId}</ClientID>
    <UserName>${CREDENTIALS.userName}</UserName>
    <Password>${CREDENTIALS.password}</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>${startDate} 7:00:00 AM</startDate>
        <endDate>${endDate} 5:00:00 PM</endDate>
        <morning>True</morning>
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

async function verify() {
    const today = new Date();
    let startDate = new Date(today);
    let endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 196); // 28 weeks max

    console.log('========================================');
    console.log('LOCATION GUID VERIFICATION');
    console.log('========================================');
    console.log(`\nChecking for Location GUID: ${LOCATION_GUID}`);
    console.log(`Date Range: ${formatDate(startDate)} to ${formatDate(endDate)}\n`);

    try {
        const xmlBody = buildXmlRequest(formatDate(startDate), formatDate(endDate));
        const responseData = await makeRequest(xmlBody);
        const parsed = await parseXmlResponse(responseData);
        const resp = parsed.GetDataResponse;

        if (resp.ResponseStatus === 'Success') {
            let records = resp.Records?.Record;
            if (!records) {
                console.log('No slots returned from API at all');
                return;
            }

            if (!Array.isArray(records)) records = [records];
            console.log(`Total slots across ALL locations: ${records.length}`);

            // Filter by location GUID
            const locationSlots = records.filter(r => r.LocationGUID === LOCATION_GUID);
            console.log(`Slots matching YOUR Location GUID: ${locationSlots.length}`);

            // Also check by schedule view GUID
            const schedViewSlots = records.filter(r => r.ScheduleViewGUID === SCHEDULE_VIEW_GUID);
            console.log(`Slots matching YOUR Schedule View GUID: ${schedViewSlots.length}`);

            // Check case-insensitive
            const partialLocMatch = records.filter(r =>
                r.LocationGUID?.toLowerCase() === LOCATION_GUID.toLowerCase()
            );
            console.log(`Case-insensitive Location match: ${partialLocMatch.length}`);

            // Show all unique location GUIDs
            const locMap = new Map();
            records.forEach(r => {
                if (!locMap.has(r.LocationGUID)) {
                    locMap.set(r.LocationGUID, {
                        name: r.ScheduleViewDescription,
                        schedViewGUID: r.ScheduleViewGUID,
                        count: 0
                    });
                }
                locMap.get(r.LocationGUID).count++;
            });

            console.log(`\n--- All ${locMap.size} Locations with available slots ---\n`);
            for (const [guid, info] of locMap) {
                const match = guid === LOCATION_GUID ? ' *** YOUR GUID ***' : '';
                console.log(`${info.name}${match}`);
                console.log(`  LocationGUID: ${guid}`);
                console.log(`  ScheduleViewGUID: ${info.schedViewGUID}`);
                console.log(`  Slots: ${info.count}`);
                console.log('');
            }

            // Check for Allegheny
            console.log('--- Searching for "Allegheny" locations ---');
            const alleghenyLocs = [...locMap.entries()].filter(([_, info]) =>
                info.name?.toLowerCase().includes('allegheny')
            );
            if (alleghenyLocs.length > 0) {
                for (const [guid, info] of alleghenyLocs) {
                    console.log(`FOUND: ${info.name}`);
                    console.log(`  LocationGUID: ${guid}`);
                    console.log(`  ScheduleViewGUID: ${info.schedViewGUID}`);
                    console.log(`  Available slots: ${info.count}`);
                }
            } else {
                console.log('No "Allegheny" locations found');
            }

            console.log('\n========================================');
            console.log('CONCLUSION');
            console.log('========================================');
            if (locationSlots.length === 0 && schedViewSlots.length === 0) {
                console.log(`\nCONFIRMED: Location GUID ${LOCATION_GUID}`);
                console.log(`           and Schedule View GUID ${SCHEDULE_VIEW_GUID}`);
                console.log(`           have ZERO slots available in the next 28 weeks.`);
                console.log(`\nThis location/schedule view is NOT configured for online reservations.`);
            }
        } else {
            console.log('API Error:', resp.ErrorMessage || resp.ResponseStatus);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}

verify();

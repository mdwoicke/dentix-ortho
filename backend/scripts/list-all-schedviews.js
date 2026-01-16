const https = require('https');
const { parseStringPromise } = require('xml2js');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

function buildRequest(procedure, params = '') {
    return `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CREDENTIALS.clientId}</ClientID>
    <UserName>${CREDENTIALS.userName}</UserName>
    <Password>${CREDENTIALS.password}</Password>
    <Procedure>${procedure}</Procedure>
    <Parameters>
${params}    </Parameters>
</GetDataRequest>`;
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

async function listAll() {
    console.log('='.repeat(100));
    console.log('ALL LOCATIONS AND THEIR SCHEDULE VIEWS');
    console.log('='.repeat(100));

    // 1. Get all locations
    console.log('\nFetching locations...');
    const locXml = buildRequest('GetLocations', '        <showDeleted>0</showDeleted>\n');
    const locResp = await makeRequest(locXml);
    const locParsed = await parseStringPromise(locResp, { explicitArray: false });
    const locData = locParsed.GetDataResponse;

    let locations = [];
    if (locData.ResponseStatus === 'Success') {
        locations = locData.Records?.Record;
        if (!Array.isArray(locations)) locations = locations ? [locations] : [];
        console.log(`Found ${locations.length} locations\n`);
    } else {
        console.log('Error fetching locations:', locData.ErrorMessage);
        return;
    }

    await new Promise(r => setTimeout(r, 1000));

    // 2. Get all schedule views
    console.log('Fetching schedule views...');
    const svXml = buildRequest('GetChairSchedules', '');
    const svResp = await makeRequest(svXml);
    const svParsed = await parseStringPromise(svResp, { explicitArray: false });
    const svData = svParsed.GetDataResponse;

    let scheduleViews = [];
    if (svData.ResponseStatus === 'Success') {
        scheduleViews = svData.Records?.Record;
        if (!Array.isArray(scheduleViews)) scheduleViews = scheduleViews ? [scheduleViews] : [];
        console.log(`Found ${scheduleViews.length} schedule views\n`);
    } else {
        console.log('Error fetching schedule views:', svData.ErrorMessage);
        return;
    }

    // 3. Map schedule views to locations
    const locMap = new Map();
    locations.forEach(loc => {
        locMap.set(loc.LocationGUID, {
            name: loc.LocationName,
            code: loc.LocationCode,
            address: `${loc.LocationAddress}, ${loc.LocationCity}, ${loc.LocationState} ${loc.LocationPostalCode}`,
            scheduleViews: []
        });
    });

    // Add schedule views to their locations
    scheduleViews.forEach(sv => {
        if (locMap.has(sv.LocationGUID)) {
            locMap.get(sv.LocationGUID).scheduleViews.push({
                guid: sv.ScheduleViewGUID,
                description: sv.ScheduleViewDescription,
                columns: sv.ScheduleColumnCount || 'N/A'
            });
        }
    });

    // 4. Print results
    console.log('='.repeat(100));
    let locIndex = 1;
    for (const [locGuid, loc] of locMap) {
        console.log(`\n${locIndex}. ${loc.name}`);
        console.log(`   LocationGUID: ${locGuid}`);
        console.log(`   Address: ${loc.address}`);
        console.log(`   Schedule Views: ${loc.scheduleViews.length}`);

        if (loc.scheduleViews.length > 0) {
            loc.scheduleViews.forEach((sv, i) => {
                console.log(`      ${i + 1}. ${sv.description}`);
                console.log(`         ScheduleViewGUID: ${sv.guid}`);
            });
        } else {
            console.log(`      (none configured)`);
        }
        locIndex++;
    }

    // Summary
    console.log('\n' + '='.repeat(100));
    console.log('SUMMARY');
    console.log('='.repeat(100));

    const withSchedules = [...locMap.values()].filter(l => l.scheduleViews.length > 0).length;
    const withoutSchedules = [...locMap.values()].filter(l => l.scheduleViews.length === 0).length;

    console.log(`\nTotal Locations: ${locations.length}`);
    console.log(`Locations WITH schedule views: ${withSchedules}`);
    console.log(`Locations WITHOUT schedule views: ${withoutSchedules}`);
    console.log(`Total Schedule Views: ${scheduleViews.length}`);

    // List locations without schedules
    console.log('\n--- Locations WITHOUT schedule views ---');
    for (const [locGuid, loc] of locMap) {
        if (loc.scheduleViews.length === 0) {
            console.log(`  - ${loc.name} (${locGuid})`);
        }
    }
}

listAll();

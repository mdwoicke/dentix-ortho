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

async function find() {
    console.log('========================================');
    console.log('FINDING CDH/ALLEGHENY SCHEDULE VIEWS');
    console.log('========================================\n');

    // Get all schedule views
    try {
        const xml = buildRequest('GetChairSchedules', '');
        const resp = await makeRequest(xml);
        const parsed = await parseStringPromise(resp, { explicitArray: false });
        const data = parsed.GetDataResponse;

        if (data.ResponseStatus === 'Success') {
            let records = data.Records?.Record;
            if (!Array.isArray(records)) records = records ? [records] : [];

            console.log(`Total schedule views: ${records.length}\n`);

            // Filter for CDH or Allegheny
            const cdhSchedules = records.filter(r =>
                r.ScheduleViewDescription?.toLowerCase().includes('cdh') ||
                r.ScheduleViewDescription?.toLowerCase().includes('allegheny')
            );

            console.log(`Schedule views containing "CDH" or "Allegheny": ${cdhSchedules.length}\n`);

            if (cdhSchedules.length > 0) {
                cdhSchedules.forEach(r => {
                    console.log(`${r.ScheduleViewDescription}`);
                    console.log(`  ScheduleViewGUID: ${r.ScheduleViewGUID}`);
                    console.log(`  LocationGUID: ${r.LocationGUID}`);
                    console.log(`  Columns: ${r.ScheduleColumnCount || 'N/A'}`);
                    console.log('');
                });
            }

            // Also show all locations with "CDH" or "Allegheny"
            console.log('--- Checking Locations ---');
            const xml2 = buildRequest('GetLocations', '        <showDeleted>0</showDeleted>\n');
            const resp2 = await makeRequest(xml2);
            const parsed2 = await parseStringPromise(resp2, { explicitArray: false });
            const data2 = parsed2.GetDataResponse;

            if (data2.ResponseStatus === 'Success') {
                let locs = data2.Records?.Record;
                if (!Array.isArray(locs)) locs = locs ? [locs] : [];

                const cdhLocs = locs.filter(r =>
                    r.LocationName?.toLowerCase().includes('cdh') ||
                    r.LocationName?.toLowerCase().includes('allegheny')
                );

                console.log(`\nLocations containing "CDH" or "Allegheny": ${cdhLocs.length}\n`);
                cdhLocs.forEach(loc => {
                    // Find schedule views for this location
                    const schedViews = records.filter(s => s.LocationGUID === loc.LocationGUID);

                    console.log(`${loc.LocationName}`);
                    console.log(`  LocationGUID: ${loc.LocationGUID}`);
                    console.log(`  Address: ${loc.LocationAddress}, ${loc.LocationCity}, ${loc.LocationState}`);
                    console.log(`  Schedule Views: ${schedViews.length}`);
                    if (schedViews.length > 0) {
                        schedViews.forEach(sv => {
                            console.log(`    - ${sv.ScheduleViewDescription} (${sv.ScheduleViewGUID})`);
                        });
                    } else {
                        console.log(`    - NONE CONFIGURED`);
                    }
                    console.log('');
                });
            }
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    console.log('========================================');
}

find();

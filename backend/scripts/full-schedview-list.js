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

async function list() {
    console.log('Fetching schedule views...\n');

    const xml = buildRequest('GetChairSchedules', '');
    const resp = await makeRequest(xml);
    const parsed = await parseStringPromise(resp, { explicitArray: false });
    const data = parsed.GetDataResponse;

    if (data.ResponseStatus !== 'Success') {
        console.log('Error:', data.ErrorMessage);
        return;
    }

    let records = data.Records?.Record;
    if (!Array.isArray(records)) records = records ? [records] : [];

    // Group by location, then by schedule view
    const locMap = new Map();
    records.forEach(r => {
        if (!locMap.has(r.locGUID)) {
            locMap.set(r.locGUID, {
                name: r.locName,
                schedViews: new Map()
            });
        }
        const loc = locMap.get(r.locGUID);
        if (!loc.schedViews.has(r.schdvwGUID)) {
            loc.schedViews.set(r.schdvwGUID, {
                description: r.schdvwDescription,
                startTime: r.schdvwStartTime,
                endTime: r.schdvwEndTime,
                columns: []
            });
        }
        loc.schedViews.get(r.schdvwGUID).columns.push({
            guid: r.schdcolGUID,
            description: r.schdcolDescription,
            order: r.svcOrder
        });
    });

    // Print
    console.log('='.repeat(120));
    console.log('ALL LOCATIONS WITH SCHEDULE VIEWS');
    console.log('='.repeat(120));

    let i = 1;
    for (const [locGuid, loc] of locMap) {
        console.log(`\n${i}. ${loc.name}`);
        console.log(`   locGUID: ${locGuid}`);
        console.log(`   Schedule Views: ${loc.schedViews.size}`);

        for (const [svGuid, sv] of loc.schedViews) {
            console.log(`\n   └── ${sv.description}`);
            console.log(`       schdvwGUID: ${svGuid}`);
            console.log(`       Hours: ${sv.startTime?.split(' ').slice(1).join(' ')} - ${sv.endTime?.split(' ').slice(1).join(' ')}`);
            console.log(`       Chairs/Columns: ${sv.columns.length}`);
            sv.columns.forEach(col => {
                console.log(`         - ${col.description} (schdcolGUID: ${col.guid})`);
            });
        }
        i++;
    }

    console.log('\n' + '='.repeat(120));
    console.log(`TOTAL: ${locMap.size} locations, ${[...locMap.values()].reduce((sum, l) => sum + l.schedViews.size, 0)} schedule views`);
    console.log('='.repeat(120));
}

list();

const https = require('https');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

const ALLEGHENY_202_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b';

function buildXml(startStr, endStr) {
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${CLOUD9.password}</Password><Procedure>GetOnlineReservations</Procedure><Parameters><startDate>${startStr} 7:00:00 AM</startDate><endDate>${endStr} 5:00:00 PM</endDate><morning>True</morning><afternoon>True</afternoon><appttypGUIDs>f6c20c35-9abb-47c2-981a-342996016705</appttypGUIDs></Parameters></GetDataRequest>`;
}

function makeRequest(xml) {
    return new Promise((resolve, reject) => {
        const url = new URL(CLOUD9.endpoint);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(xml);
        req.end();
    });
}

function parseRecords(xmlText) {
    const records = [];
    const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
    let match;
    while ((match = recordRegex.exec(xmlText)) !== null) {
        const fields = {};
        const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
        let m;
        while ((m = fieldRegex.exec(match[1])) !== null) {
            fields[m[1]] = m[2];
        }
        records.push(fields);
    }
    return records;
}

async function testDateRange(startStr, endStr, label) {
    const xml = buildXml(startStr, endStr);
    const resp = await makeRequest(xml);
    const records = parseRecords(resp);
    const alleghenySlots = records.filter(r => r.LocationGUID === ALLEGHENY_202_GUID);

    console.log(`${label}:`);
    console.log(`  Range: ${startStr} to ${endStr}`);
    console.log(`  Total slots: ${records.length}`);
    console.log(`  Allegheny 202 slots: ${alleghenySlots.length}`);
    if (alleghenySlots.length > 0) {
        console.log(`  First Allegheny slot: ${alleghenySlots[0].StartTime}`);
    }
    console.log('');
}

async function run() {
    console.log('=== Cloud9 API Date Range Test ===\n');

    // Simulate the expansion tiers
    await testDateRange('01/14/2026', '01/28/2026', 'Tier 0 (14 days)');
    await testDateRange('01/14/2026', '02/11/2026', 'Tier 1 (28 days)');
    await testDateRange('01/14/2026', '02/25/2026', 'Tier 2 (42 days)');
    await testDateRange('01/14/2026', '03/11/2026', 'Tier 3 (56 days)');
}

run().catch(console.error);

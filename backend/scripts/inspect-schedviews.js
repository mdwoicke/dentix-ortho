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

async function inspect() {
    console.log('Inspecting Schedule View structure...\n');

    const xml = buildRequest('GetChairSchedules', '');
    const resp = await makeRequest(xml);
    const parsed = await parseStringPromise(resp, { explicitArray: false });
    const data = parsed.GetDataResponse;

    if (data.ResponseStatus === 'Success') {
        let records = data.Records?.Record;
        if (!Array.isArray(records)) records = records ? [records] : [];

        console.log(`Total schedule views: ${records.length}\n`);

        // Show first record structure
        console.log('=== Sample Schedule View Record ===');
        console.log('Fields available:', Object.keys(records[0]).join(', '));
        console.log('\nFirst 3 records:');
        records.slice(0, 3).forEach((r, i) => {
            console.log(`\n--- Record ${i + 1} ---`);
            console.log(JSON.stringify(r, null, 2));
        });

        // Find any that contain "Allegheny" or "CDH"
        console.log('\n\n=== Schedule Views containing "Allegheny" or "CDH" ===');
        const matches = records.filter(r => {
            const str = JSON.stringify(r).toLowerCase();
            return str.includes('allegheny') || str.includes('cdh');
        });

        if (matches.length > 0) {
            matches.forEach(r => {
                console.log(`\n${r.ScheduleViewDescription || r.Description || 'Unknown'}`);
                console.log(JSON.stringify(r, null, 2));
            });
        } else {
            console.log('None found');
        }

        // Show unique location GUIDs if any
        const locGuids = new Set(records.map(r => r.LocationGUID).filter(Boolean));
        console.log(`\n\n=== Unique LocationGUIDs in schedule views: ${locGuids.size} ===`);
        if (locGuids.size > 0) {
            [...locGuids].slice(0, 10).forEach(g => console.log(`  ${g}`));
        } else {
            console.log('  (none - LocationGUID field is empty or missing)');
        }
    }
}

inspect();

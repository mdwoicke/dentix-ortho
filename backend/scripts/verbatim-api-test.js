const https = require('https');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

const TARGET_SCHEDVIEW = 'b1946f40-3b0b-4e01-87a9-c5060b88443e';  // CDH - Allegheny 300M (BROKEN)
const WORKING_SCHEDVIEW = '4c9e9333-4951-4eb0-8d97-e1ad83ef422d'; // CDH Allegheny 202 (WORKING)

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
            console.log('\n>>> HTTP Status Code:', res.statusCode);
            console.log('>>> HTTP Headers:');
            console.log(JSON.stringify(res.headers, null, 2));
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(xmlBody);
        req.end();
    });
}

const formatDate = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

async function test() {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 28);

    console.log('='.repeat(100));
    console.log('VERBATIM API RESPONSE TEST');
    console.log('Comparing CDH - Allegheny 300M (broken) vs CDH Allegheny 202 (working)');
    console.log('='.repeat(100));

    // TEST 1: BROKEN LOCATION
    console.log('\n' + '='.repeat(100));
    console.log('TEST 1: GetOnlineReservations for BROKEN location');
    console.log('Location: CDH - Allegheny 300M');
    console.log('LocationGUID: 799d413a-5e1a-46a2-b169-e2108bf517d6');
    console.log('ScheduleViewGUID:', TARGET_SCHEDVIEW);
    console.log('='.repeat(100));

    const xml1 = `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CREDENTIALS.clientId}</ClientID>
    <UserName>${CREDENTIALS.userName}</UserName>
    <Password>${CREDENTIALS.password}</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>${formatDate(today)} 7:00:00 AM</startDate>
        <endDate>${formatDate(endDate)} 5:00:00 PM</endDate>
        <schdvwGUIDs>${TARGET_SCHEDVIEW}</schdvwGUIDs>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>`;

    console.log('\n>>> OUTBOUND XML REQUEST:');
    console.log(xml1);

    console.log('\n>>> INBOUND XML RESPONSE:');
    const resp1 = await makeRequest(xml1);
    console.log(resp1);

    // Wait to avoid rate limiting
    console.log('\n[Waiting 4 seconds to avoid rate limit...]');
    await new Promise(r => setTimeout(r, 4000));

    // TEST 2: WORKING LOCATION
    console.log('\n' + '='.repeat(100));
    console.log('TEST 2: GetOnlineReservations for WORKING location');
    console.log('Location: CDH Allegheny 202');
    console.log('LocationGUID: 1fef9297-7c8b-426b-b0d1-f2275136e48b');
    console.log('ScheduleViewGUID:', WORKING_SCHEDVIEW);
    console.log('='.repeat(100));

    const xml2 = `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CREDENTIALS.clientId}</ClientID>
    <UserName>${CREDENTIALS.userName}</UserName>
    <Password>${CREDENTIALS.password}</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>${formatDate(today)} 7:00:00 AM</startDate>
        <endDate>${formatDate(endDate)} 5:00:00 PM</endDate>
        <schdvwGUIDs>${WORKING_SCHEDVIEW}</schdvwGUIDs>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>`;

    console.log('\n>>> OUTBOUND XML REQUEST:');
    console.log(xml2);

    console.log('\n>>> INBOUND XML RESPONSE (first 4000 chars):');
    const resp2 = await makeRequest(xml2);
    console.log(resp2.substring(0, 4000));
    if (resp2.length > 4000) {
        console.log('\n... [TRUNCATED - Full response is', resp2.length, 'bytes with slot records]');
    }

    // Summary
    console.log('\n' + '='.repeat(100));
    console.log('SUMMARY');
    console.log('='.repeat(100));

    const hasRecords1 = resp1.includes('<Record>');
    const hasRecords2 = resp2.includes('<Record>');

    console.log('\nCDH - Allegheny 300M (799d413a-5e1a-46a2-b169-e2108bf517d6):');
    console.log('  Response contains <Record> elements:', hasRecords1 ? 'YES' : 'NO');
    console.log('  Response length:', resp1.length, 'bytes');

    console.log('\nCDH Allegheny 202 (1fef9297-7c8b-426b-b0d1-f2275136e48b):');
    console.log('  Response contains <Record> elements:', hasRecords2 ? 'YES' : 'NO');
    console.log('  Response length:', resp2.length, 'bytes');

    if (!hasRecords1 && hasRecords2) {
        console.log('\n>>> CONCLUSION: Location 799d413a-5e1a-46a2-b169-e2108bf517d6 returns NO slots');
        console.log('    because its ScheduleView is NOT enabled for online reservations.');
    }
}

test().catch(console.error);

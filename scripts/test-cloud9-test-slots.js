/**
 * Test Cloud9 TEST API - GetOnlineReservations
 * Compare response format with Production
 */

const https = require('https');

// TEST Cloud9 credentials (from Postman collection)
const TEST_CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

// Location14 TEST schedule view
const TEST_SCHEDULE_VIEW = '2544683a-8e79-4b32-a4d4-bf851996bac3';
const TEST_APPT_TYPE = '8fc9d063-ae46-4975-a5ae-734c6efe341a';

function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[<>&'"]/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'}[c]));
}

function formatDate(d) {
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${month}/${day}/${d.getFullYear()}`;
}

const startDate = formatDate(new Date(Date.now() + 86400000)); // Tomorrow
const endDate = formatDate(new Date(Date.now() + 15 * 86400000)); // 15 days from now

// Test without schedule view filter to see all available slots
const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="${TEST_CLOUD9.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>${TEST_CLOUD9.clientId}</ClientID>
    <UserName>${TEST_CLOUD9.userName}</UserName>
    <Password>${escapeXml(TEST_CLOUD9.password)}</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>${startDate} 7:00:00 AM</startDate>
        <endDate>${endDate} 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>`;

console.log('=== Testing Cloud9 TEST API: GetOnlineReservations ===');
console.log('Endpoint:', TEST_CLOUD9.endpoint);
console.log('Date Range:', startDate, '-', endDate);
console.log('Schedule View:', TEST_SCHEDULE_VIEW);
console.log('Appt Type:', TEST_APPT_TYPE);
console.log('');

const url = new URL(TEST_CLOUD9.endpoint);
const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
        'Content-Type': 'application/xml',
        'Content-Length': Buffer.byteLength(xmlRequest)
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('HTTP Status:', res.statusCode);
        console.log('');

        // Check for response status
        const statusMatch = data.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
        console.log('API ResponseStatus:', statusMatch ? statusMatch[1] : 'Not found');

        // Count records
        const recordCount = (data.match(/<Record>/g) || []).length;
        console.log('Records Count:', recordCount);
        console.log('');

        if (recordCount > 0) {
            // Extract first record to check field names
            const firstRecordMatch = data.match(/<Record>([\s\S]*?)<\/Record>/);
            if (firstRecordMatch) {
                console.log('=== First Record Fields ===');
                const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
                let fieldMatch;
                const fields = {};
                while ((fieldMatch = fieldRegex.exec(firstRecordMatch[1])) !== null) {
                    fields[fieldMatch[1]] = fieldMatch[2];
                }

                // Show all fields
                Object.entries(fields).forEach(([key, val]) => {
                    console.log(`  ${key}: ${val.substring(0, 80)}${val.length > 80 ? '...' : ''}`);
                });

                // Check critical fields
                console.log('');
                console.log('=== Critical Field Check ===');
                console.log('StartTime exists:', 'StartTime' in fields ? 'YES' : 'NO');
                console.log('ScheduleViewGUID exists:', 'ScheduleViewGUID' in fields ? 'YES' : 'NO');
                console.log('ScheduleColumnGUID exists:', 'ScheduleColumnGUID' in fields ? 'YES' : 'NO');
                console.log('AppointmentTypeGUID exists:', 'AppointmentTypeGUID' in fields ? 'YES' : 'NO');

                if (!fields.StartTime) {
                    console.log('');
                    console.log('*** BUG FOUND: StartTime is missing from Cloud9 TEST response! ***');
                    console.log('This causes .split() error in formatSlotForVoice()');
                }
            }
        } else {
            console.log('No records returned - checking for error...');
            const errorMatch = data.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
            if (errorMatch) {
                console.log('Error:', errorMatch[1]);
            }
            console.log('');
            console.log('Raw response (first 2000 chars):');
            console.log(data.substring(0, 2000));
        }
    });
});

req.on('error', e => console.log('Request error:', e.message));
req.write(xmlRequest);
req.end();

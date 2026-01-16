const https = require('https');

// Cloud9 TEST sandbox credentials
const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

function buildXmlRequest(procedure, params = {}) {
    const paramElements = Object.entries(params)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `<${k}>${v}</${k}>`)
        .join('');
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${CLOUD9.password}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
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

async function test() {
    console.log('=== Testing Cloud9 Slot Availability vs Booking ===\n');

    // Step 1: Get available slots
    console.log('1. Getting available slots...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const yyyy = tomorrow.getFullYear();

    const endTomorrow = new Date(tomorrow);
    endTomorrow.setDate(endTomorrow.getDate() + 14);
    const emm = String(endTomorrow.getMonth() + 1).padStart(2, '0');
    const edd = String(endTomorrow.getDate()).padStart(2, '0');
    const eyyyy = endTomorrow.getFullYear();

    const startDate = `${mm}/${dd}/${yyyy} 7:00:00 AM`;
    const endDate = `${emm}/${edd}/${eyyyy} 5:00:00 PM`;

    console.log(`  Date range: ${startDate} to ${endDate}`);

    const slotsXml = buildXmlRequest('GetOnlineReservations', {
        startDate: startDate,
        endDate: endDate,
        morning: 'True',
        afternoon: 'True',
        appttypGUIDs: '8fc9d063-ae46-4975-a5ae-734c6efe341a'
    });

    const slotsResp = await makeRequest(slotsXml);

    // Check response status
    const statusMatch = slotsResp.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
    console.log('\n  Response Status:', statusMatch ? statusMatch[1] : 'Unknown');

    // Count total slots
    const allSlots = slotsResp.match(/<Record>/g);
    console.log('  Total slots found:', allSlots ? allSlots.length : 0);

    // Parse first slot
    const slotMatch = slotsResp.match(/<Record>([\s\S]*?)<\/Record>/);
    if (!slotMatch) {
        console.log('\nNO SLOTS FOUND in Cloud9 response!');
        console.log('Full Response:', slotsResp.substring(0, 1000));
        return;
    }

    const slotXml = slotMatch[1];
    const fields = {};
    const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
    let m;
    while ((m = fieldRegex.exec(slotXml)) !== null) {
        fields[m[1]] = m[2];
    }

    console.log('\n2. First available slot details:');
    console.log('  StartTime:', fields.StartTime);
    console.log('  ScheduleViewGUID:', fields.ScheduleViewGUID);
    console.log('  ScheduleColumnGUID:', fields.ScheduleColumnGUID);
    console.log('  AppointmentTypeGUID:', fields.AppointmentTypeGUID || '(empty - will use default)');
    console.log('  Minutes:', fields.Minutes || '(empty)');
    console.log('  LocationGUID:', fields.LocationGUID || '(empty)');
    console.log('  ProviderGUID:', fields.ProviderGUID || '(empty)');

    // Step 2: Try to book this slot with a test patient
    console.log('\n3. Attempting to book this slot...');

    // Use a known test patient GUID from the failed trace
    const testPatientGUID = 'ED6F7590-AEAB-4247-959D-8833DBD6BFE7';

    const apptTypeGUID = fields.AppointmentTypeGUID || '8fc9d063-ae46-4975-a5ae-734c6efe341a';

    console.log('  Using PatientGUID:', testPatientGUID);
    console.log('  Using AppointmentTypeGUID:', apptTypeGUID);

    const bookXml = buildXmlRequest('SetAppointment', {
        PatientGUID: testPatientGUID,
        StartTime: fields.StartTime,
        ScheduleViewGUID: fields.ScheduleViewGUID,
        ScheduleColumnGUID: fields.ScheduleColumnGUID,
        AppointmentTypeGUID: apptTypeGUID,
        Minutes: fields.Minutes || '45',
        VendorUserName: 'IntelepeerTest'
    });

    console.log('\n  Booking request XML:');
    console.log('  ', bookXml.substring(0, 500) + '...');

    const bookResp = await makeRequest(bookXml);
    console.log('\n4. Booking response:');
    console.log(bookResp);

    // Check if booking succeeded
    if (bookResp.includes('Appointment GUID Added')) {
        console.log('\n✓ BOOKING SUCCEEDED!');
        const guidMatch = bookResp.match(/Appointment GUID Added:\s*([A-Fa-f0-9-]+)/i);
        if (guidMatch) {
            console.log('  Appointment GUID:', guidMatch[1]);
        }
    } else if (bookResp.includes('Error')) {
        console.log('\n✗ BOOKING FAILED');
        const errorMatch = bookResp.match(/<Result>([^<]+)<\/Result>/);
        if (errorMatch) {
            console.log('  Error:', errorMatch[1]);
        }
    }
}

test().catch(console.error);

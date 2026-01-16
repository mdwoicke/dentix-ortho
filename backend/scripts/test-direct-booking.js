const https = require('https');
const { parseStringPromise } = require('xml2js');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

// User's GUIDs for CDH - Allegheny 300M
const SCHEDULE_VIEW_GUID = 'b1946f40-3b0b-4e01-87a9-c5060b88443e';
const SCHEDULE_COLUMN_GUID = 'dda0b40c-ace5-4427-8b76-493bf9aa26f1'; // Chair 8
const APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';

function buildRequest(procedure, params) {
    let paramXml = '';
    for (const [key, value] of Object.entries(params)) {
        paramXml += `        <${key}>${value}</${key}>\n`;
    }
    return `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CREDENTIALS.clientId}</ClientID>
    <UserName>${CREDENTIALS.userName}</UserName>
    <Password>${CREDENTIALS.password}</Password>
    <Procedure>${procedure}</Procedure>
    <Parameters>
${paramXml}    </Parameters>
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

async function test() {
    console.log('='.repeat(80));
    console.log('TESTING ALTERNATIVE BOOKING METHODS');
    console.log('='.repeat(80));
    console.log(`\nTarget Location: CDH - Allegheny 300M`);
    console.log(`ScheduleViewGUID: ${SCHEDULE_VIEW_GUID}`);
    console.log(`ScheduleColumnGUID: ${SCHEDULE_COLUMN_GUID}`);

    // Test 1: GetAppointmentsByDate - Check existing appointments
    console.log('\n--- TEST 1: GetAppointmentsByDate ---');
    console.log('This API shows existing appointments for a schedule view\n');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = `${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${String(tomorrow.getDate()).padStart(2, '0')}/${tomorrow.getFullYear()}`;

    try {
        const xml1 = buildRequest('GetAppointmentsByDate', {
            dtAppointment: dateStr,
            schdvwGUID: SCHEDULE_VIEW_GUID
        });

        const resp1 = await makeRequest(xml1);
        const parsed1 = await parseStringPromise(resp1, { explicitArray: false });
        const data1 = parsed1.GetDataResponse;

        console.log(`Date: ${dateStr}`);
        console.log(`Response Status: ${data1.ResponseStatus}`);

        if (data1.ResponseStatus === 'Success') {
            let records = data1.Records?.Record;
            if (!records) {
                console.log('Result: NO existing appointments - schedule is OPEN');
                console.log('\nThis means you could potentially book any time slot!');
            } else {
                if (!Array.isArray(records)) records = [records];
                console.log(`Result: ${records.length} existing appointments found`);
                console.log('\nExisting appointments:');
                records.slice(0, 5).forEach(r => {
                    console.log(`  - ${r.AppointmentStartTime || r.StartTime} (${r.PatientName || 'Unknown'})`);
                });
            }
        } else {
            console.log(`Error: ${data1.ErrorMessage}`);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    await new Promise(r => setTimeout(r, 2000));

    // Test 2: GetAppointmentTypes - Verify appointment type exists
    console.log('\n--- TEST 2: Verify Appointment Type GUID ---');
    try {
        const xml2 = buildRequest('GetAppointmentTypes', { showDeleted: '0' });
        const resp2 = await makeRequest(xml2);
        const parsed2 = await parseStringPromise(resp2, { explicitArray: false });
        const data2 = parsed2.GetDataResponse;

        if (data2.ResponseStatus === 'Success') {
            let records = data2.Records?.Record;
            if (!Array.isArray(records)) records = records ? [records] : [];

            const match = records.find(r => r.AppointmentTypeGUID === APPT_TYPE_GUID);
            if (match) {
                console.log(`✓ Appointment Type FOUND:`);
                console.log(`  Description: ${match.AppointmentTypeDescription}`);
                console.log(`  GUID: ${match.AppointmentTypeGUID}`);
                console.log(`  Minutes: ${match.AppointmentMinutes || 'N/A'}`);
            } else {
                console.log(`✗ Appointment Type GUID ${APPT_TYPE_GUID} NOT FOUND`);
                console.log('\nAvailable appointment types:');
                records.slice(0, 10).forEach(r => {
                    console.log(`  - ${r.AppointmentTypeDescription} (${r.AppointmentTypeGUID})`);
                });
            }
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    console.log('\n' + '='.repeat(80));
    console.log('CONCLUSION');
    console.log('='.repeat(80));
    console.log(`
ALTERNATIVE METHODS TO BOOK WITHOUT GetOnlineReservations:

1. SetAppointment (Direct Booking)
   - Creates appointment directly in the schedule
   - Does NOT require slot from GetOnlineReservations
   - You provide: StartTime, ScheduleViewGUID, ScheduleColumnGUID, etc.
   - Risk: Could double-book if you don't check first

2. GetAppointmentsByDate + SetAppointment (Safe Booking)
   - First: Use GetAppointmentsByDate to see existing appointments
   - Then: Calculate available time slots manually
   - Finally: Use SetAppointment to book an open slot
   - This bypasses online reservation configuration entirely!

3. Required for SetAppointment:
   - PatientGUID (the patient to book)
   - StartTime: "MM/DD/YYYY HH:mm:ss AM/PM"
   - ScheduleViewGUID: ${SCHEDULE_VIEW_GUID}
   - ScheduleColumnGUID: ${SCHEDULE_COLUMN_GUID}
   - AppointmentTypeGUID: ${APPT_TYPE_GUID}
   - Minutes: (duration)
   - VendorUserName: "Intelepeer"
`);
}

test();

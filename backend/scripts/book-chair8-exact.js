const https = require('https');
const { parseStringPromise } = require('xml2js');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

// EXACT user-provided GUIDs - NO CHANGES
const SCHEDULE_VIEW_GUID = 'b1946f40-3b0b-4e01-87a9-c5060b88443e';
const SCHEDULE_COLUMN_GUID = 'dda0b40c-ace5-4427-8b76-493bf9aa26f1'; // Chair 8
const APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705'; // Exam - PPO/Self
const PATIENT_GUID = '062B04D3-642D-4FAE-A6B5-6683F609EFDB';

function buildRequest(procedure, params) {
    let paramXml = '';
    for (const [key, value] of Object.entries(params)) {
        if (value != null) {
            paramXml += `<${key}>${value}</${key}>`;
        }
    }
    return `<?xml version="1.0" encoding="utf-8" ?><GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"><ClientID>${CREDENTIALS.clientId}</ClientID><UserName>${CREDENTIALS.userName}</UserName><Password>${CREDENTIALS.password}</Password><Procedure>${procedure}</Procedure><Parameters>${paramXml}</Parameters></GetDataRequest>`;
}

function makeRequest(xmlBody) {
    return new Promise((resolve, reject) => {
        const url = new URL(ENDPOINT);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'GET',
            headers: { 'Content-Type': 'application/xml', 'Content-Length': Buffer.byteLength(xmlBody) }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(xmlBody);
        req.end();
    });
}

async function bookChair8() {
    console.log('='.repeat(70));
    console.log('BOOKING ON CHAIR 8 WITH EXACT PROVIDED GUIDS');
    console.log('='.repeat(70));
    console.log('\nGUIDs:');
    console.log('  ScheduleViewGUID:', SCHEDULE_VIEW_GUID);
    console.log('  ScheduleColumnGUID:', SCHEDULE_COLUMN_GUID, '(Chair 8)');
    console.log('  AppointmentTypeGUID:', APPT_TYPE_GUID, '(Exam - PPO/Self)');
    console.log('  PatientGUID:', PATIENT_GUID);

    // 1 month out
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(17);
    const dateStr = `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}/${d.getFullYear()}`;
    const startTime = `${dateStr} 10:00:00 AM`;

    console.log('\nBooking Details:');
    console.log('  StartTime:', startTime);
    console.log('  Minutes: 40');

    const xml = buildRequest('SetAppointment', {
        PatientGUID: PATIENT_GUID,
        StartTime: startTime,
        ScheduleViewGUID: SCHEDULE_VIEW_GUID,
        ScheduleColumnGUID: SCHEDULE_COLUMN_GUID,
        AppointmentTypeGUID: APPT_TYPE_GUID,
        Minutes: '40',
        VendorUserName: 'Intelepeer'
    });

    console.log('\nCalling SetAppointment...');
    const resp = await makeRequest(xml);
    const parsed = await parseStringPromise(resp, { explicitArray: false });
    const data = parsed.GetDataResponse;

    console.log('\nResponse Status:', data.ResponseStatus);
    const result = data.Records?.Record?.Result || data.ErrorMessage;
    console.log('Result:', result);

    if (result && result.includes('Added')) {
        console.log('\n' + '='.repeat(70));
        console.log('SUCCESS!');
        console.log('='.repeat(70));
    }
}

bookChair8();

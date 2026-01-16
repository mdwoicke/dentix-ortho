const https = require('https');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

const PATIENT_GUID = '4859e37c-1e85-49c9-be3b-db8dc648ec94';

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

async function getPatientDetails() {
    console.log('=== Patient Appointment Details ===\n');
    console.log('Patient GUID:', PATIENT_GUID);
    console.log('');

    // Get patient info
    console.log('1. Getting patient information...');
    const patXml = buildXmlRequest('GetPatientInformation', { patguid: PATIENT_GUID });
    const patResp = await makeRequest(patXml);
    const patRecords = parseRecords(patResp);

    if (patRecords.length > 0) {
        const patient = patRecords[0];
        console.log('   Name:', patient.FullName || patient.PatientName);
        console.log('   Location:', patient.LocationGUID);
        console.log('   Provider:', patient.ProviderGUID || patient.OrthodontistGUID);
    }

    // Get appointments
    console.log('\n2. Getting appointments...');
    const apptXml = buildXmlRequest('GetAppointmentListByPatient', { patGUID: PATIENT_GUID });
    const apptResp = await makeRequest(apptXml);
    const appointments = parseRecords(apptResp);

    console.log('   Total appointments:', appointments.length);

    if (appointments.length > 0) {
        console.log('\n=== APPOINTMENT DETAILS ===\n');
        appointments.forEach((appt, i) => {
            console.log(`Appointment ${i + 1}:`);
            console.log('  AppointmentGUID:', appt.AppointmentGUID);
            console.log('  StartTime:', appt.StartTime || appt.AppointmentDateTime);
            console.log('  LocationGUID:', appt.LocationGUID);
            console.log('  ScheduleViewGUID:', appt.ScheduleViewGUID);
            console.log('  ScheduleColumnGUID:', appt.ScheduleColumnGUID);
            console.log('  AppointmentTypeGUID:', appt.AppointmentTypeGUID);
            console.log('  ProviderGUID:', appt.ProviderGUID);
            console.log('  Status:', appt.AppointmentStatus || appt.Status);
            console.log('');
        });

        // Print the working GUIDs
        const appt = appointments[0];
        console.log('\n=== WORKING GUIDs (from successful booking) ===');
        console.log('='.repeat(60));
        console.log(`
const WORKING_GUIDS = {
    locationGUID: '${appt.LocationGUID}',
    scheduleViewGUID: '${appt.ScheduleViewGUID}',
    scheduleColumnGUID: '${appt.ScheduleColumnGUID}',
    appointmentTypeGUID: '${appt.AppointmentTypeGUID}',
    providerGUID: '${appt.ProviderGUID}'
};
`);
    } else {
        console.log('   No appointments found for this patient');

        // Try GetPatient to get more details
        console.log('\n3. Getting patient record details...');
        const recXml = buildXmlRequest('GetPatient', { patGUID: PATIENT_GUID });
        const recResp = await makeRequest(recXml);
        console.log('Response:', recResp.substring(0, 500));
    }
}

getPatientDetails().catch(console.error);

/**
 * Get appointments for a patient from PROD Cloud9 to extract GUIDs
 */
const fetch = require('node-fetch');

// PROD Cloud9 credentials
const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

const PATIENT_GUID = '4859e37c-1e85-49c9-be3b-db8dc648ec94';

function escapeXml(str) {
    if (!str) return '';
    return String(str).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}

function buildXmlRequest(procedure, params) {
    const paramElements = Object.entries(params)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
        .join('');
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${escapeXml(CLOUD9.password)}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
}

async function getPatientAppointments() {
    console.log('=== GETTING APPOINTMENTS FOR PATIENT ===');
    console.log('Patient GUID:', PATIENT_GUID);
    console.log('');

    const xmlRequest = buildXmlRequest('GetAppointmentListByPatient', { patGUID: PATIENT_GUID });

    const response = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlRequest
    });

    const xmlText = await response.text();

    // Parse response
    const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
    console.log('Status:', statusMatch ? statusMatch[1] : 'Unknown');

    // Extract all records
    const records = [];
    const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
    let match;
    while ((match = recordRegex.exec(xmlText)) !== null) {
        const record = {};
        const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(match[1])) !== null) {
            record[fieldMatch[1]] = fieldMatch[2];
        }
        records.push(record);
    }

    console.log('Appointments found:', records.length);

    if (records.length > 0) {
        console.log('\n=== APPOINTMENT DETAILS ===');
        records.forEach((appt, i) => {
            console.log('\nAppointment ' + (i+1) + ':');
            console.log('  AppointmentGUID:', appt.AppointmentGUID || appt.apptGUID || 'N/A');
            console.log('  StartTime:', appt.StartTime || appt.ApptStartTime || 'N/A');
            console.log('  ScheduleViewGUID:', appt.ScheduleViewGUID || 'N/A');
            console.log('  ScheduleColumnGUID:', appt.ScheduleColumnGUID || 'N/A');
            console.log('  AppointmentTypeGUID:', appt.AppointmentTypeGUID || appt.ApptTypeGUID || 'N/A');
            console.log('  LocationGUID:', appt.LocationGUID || 'N/A');
            console.log('  ProviderGUID:', appt.ProviderGUID || 'N/A');
            console.log('  Status:', appt.Status || appt.ApptStatus || 'N/A');
        });

        // Show all fields from first appointment
        console.log('\n=== ALL FIELDS FROM FIRST APPOINTMENT ===');
        Object.entries(records[0]).forEach(([k, v]) => {
            if (v) console.log('  ' + k + ': ' + v);
        });
    } else {
        console.log('\nNo appointments found. Raw response:');
        console.log(xmlText.substring(0, 1000));
    }
}

getPatientAppointments().catch(e => console.error('Error:', e.message));

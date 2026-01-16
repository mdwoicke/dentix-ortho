const https = require('https');

// Cloud9 TEST sandbox credentials
const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
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

async function trace() {
    console.log('=== Tracing Successful Booking for Patient ===');
    console.log('Patient GUID:', PATIENT_GUID);
    console.log('');

    // Step 1: Get patient info
    console.log('1. Getting patient information...');
    const patientXml = buildXmlRequest('GetPatientInformation', { patguid: PATIENT_GUID });
    const patientResp = await makeRequest(patientXml);
    const patientRecords = parseRecords(patientResp);

    if (patientRecords.length > 0) {
        const p = patientRecords[0];
        console.log('   Name:', p.PatientFullName || `${p.PatientFirstName} ${p.PatientLastName}`);
        console.log('   Location:', p.Location);
        console.log('   Orthodontist:', p.Orthodontist);
        console.log('   Phone:', p.PatientPhone);
    } else {
        console.log('   Patient not found!');
    }

    // Step 2: Get patient GUIDs
    console.log('\n2. Getting patient GUIDs...');
    const guidsXml = buildXmlRequest('GetPatient', { patGUID: PATIENT_GUID });
    const guidsResp = await makeRequest(guidsXml);
    const guidRecords = parseRecords(guidsResp);

    if (guidRecords.length > 0) {
        const g = guidRecords[0];
        console.log('   All GUIDs from GetPatient:');
        for (const [key, value] of Object.entries(g)) {
            if (value && value.length > 10) {
                console.log(`     ${key}: ${value}`);
            }
        }
    }

    // Step 3: Get ALL appointments for this patient
    console.log('\n3. Getting appointments for this patient...');
    const apptsXml = buildXmlRequest('GetAppointmentListByPatient', { patGUID: PATIENT_GUID });
    const apptsResp = await makeRequest(apptsXml);
    const apptRecords = parseRecords(apptsResp);

    console.log(`   Found ${apptRecords.length} appointments\n`);

    if (apptRecords.length > 0) {
        console.log('   APPOINTMENT DETAILS (these are the GUIDs that WORKED):');
        console.log('   ' + '='.repeat(70));

        apptRecords.forEach((appt, idx) => {
            console.log(`\n   Appointment ${idx + 1}:`);
            console.log(`     AppointmentGUID: ${appt.AppointmentGUID}`);
            console.log(`     StartTime: ${appt.AppointmentStartTime || appt.StartTime}`);
            console.log(`     Status: ${appt.AppointmentStatus}`);
            console.log(`     `);
            console.log(`     === CRITICAL BOOKING GUIDs ===`);
            console.log(`     LocationGUID: ${appt.LocationGUID}`);
            console.log(`     LocationName: ${appt.LocationName}`);
            console.log(`     ScheduleViewGUID: ${appt.ScheduleViewGUID}`);
            console.log(`     ScheduleColumnGUID: ${appt.ScheduleColumnGUID}`);
            console.log(`     AppointmentTypeGUID: ${appt.AppointmentTypeGUID}`);
            console.log(`     AppointmentTypeDescription: ${appt.AppointmentTypeDescription}`);
            console.log(`     OrthodontistGUID: ${appt.OrthodontistGUID}`);
            console.log(`     OrthodontistName: ${appt.OrthodontistName}`);
            console.log(`     Minutes: ${appt.Minutes || appt.AppointmentMinutes}`);
        });

        // Extract the working GUIDs
        const workingAppt = apptRecords[0];
        console.log('\n\n   ' + '='.repeat(70));
        console.log('   COPY THESE GUIDs FOR TESTING:');
        console.log('   ' + '='.repeat(70));
        console.log(`   const WORKING_GUIDS = {`);
        console.log(`       locationGUID: '${workingAppt.LocationGUID}',`);
        console.log(`       scheduleViewGUID: '${workingAppt.ScheduleViewGUID}',`);
        console.log(`       scheduleColumnGUID: '${workingAppt.ScheduleColumnGUID}',`);
        console.log(`       appointmentTypeGUID: '${workingAppt.AppointmentTypeGUID}',`);
        console.log(`       orthodontistGUID: '${workingAppt.OrthodontistGUID}'`);
        console.log(`   };`);

        // Step 4: Check if these scheduleViews return slots
        console.log('\n\n4. Checking if this ScheduleView returns slots via GetOnlineReservations...');

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const dd = String(tomorrow.getDate()).padStart(2, '0');
        const yyyy = tomorrow.getFullYear();

        const slotsXml = buildXmlRequest('GetOnlineReservations', {
            startDate: `${mm}/${dd}/${yyyy} 7:00:00 AM`,
            endDate: `${mm}/${parseInt(dd)+14}/${yyyy} 5:00:00 PM`,
            morning: 'True',
            afternoon: 'True',
            schdvwGUIDs: workingAppt.ScheduleViewGUID,
            appttypGUIDs: workingAppt.AppointmentTypeGUID
        });

        const slotsResp = await makeRequest(slotsXml);
        const slotCount = (slotsResp.match(/<Record>/g) || []).length;

        console.log(`   ScheduleViewGUID: ${workingAppt.ScheduleViewGUID}`);
        console.log(`   Slots returned: ${slotCount}`);

        if (slotCount === 0) {
            console.log('\n   ⚠️  This ScheduleView returns NO slots via GetOnlineReservations!');
            console.log('   This means the appointment was likely booked via SetAppointment DIRECTLY');
            console.log('   (bypassing GetOnlineReservations entirely)');
        } else {
            console.log('\n   ✓ This ScheduleView DOES have slots available');

            // Show first slot
            const firstSlot = parseRecords(slotsResp)[0];
            if (firstSlot) {
                console.log(`   First available slot: ${firstSlot.StartTime}`);
            }
        }

    } else {
        console.log('   No appointments found for this patient!');
    }
}

trace().catch(console.error);

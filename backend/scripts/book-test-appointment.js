const https = require('https');
const { parseStringPromise } = require('xml2js');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

// User's required GUIDs
const REQUIRED_APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705'; // Exam - PPO/Self
const PROVIDER_GUID = 'a79ec244-9503-44b2-87e4-5920b6e60392'; // Dr. Nga Nguyen

function buildRequest(procedure, params) {
    let paramXml = '';
    for (const [key, value] of Object.entries(params)) {
        if (value != null) {
            paramXml += `<${key}>${value}</${key}>`;
        }
    }
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"><ClientID>${CREDENTIALS.clientId}</ClientID><UserName>${CREDENTIALS.userName}</UserName><Password>${CREDENTIALS.password}</Password><Procedure>${procedure}</Procedure><Parameters>${paramXml}</Parameters></GetDataRequest>`;
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

async function main() {
    console.log('='.repeat(80));
    console.log('BOOKING TEST APPOINTMENT WITH REQUIRED GUIDS');
    console.log('='.repeat(80));
    console.log('\nRequired Appointment Type:', REQUIRED_APPT_TYPE_GUID, '(Exam - PPO/Self)');
    console.log('Looking for Chair 8...\n');

    // Step 1: Get all chair schedules to find locations with Chair 8
    console.log('--- Step 1: Finding locations with Chair 8 ---');
    const xml1 = buildRequest('GetChairSchedules', {});
    const resp1 = await makeRequest(xml1);
    const parsed1 = await parseStringPromise(resp1, { explicitArray: false });
    let chairs = parsed1.GetDataResponse.Records?.Record || [];
    if (!Array.isArray(chairs)) chairs = [chairs];

    // Find all Chair 8s
    const chair8s = chairs.filter(c => c.schdcolDescription === 'Chair 8');
    console.log('Found', chair8s.length, 'locations with Chair 8');
    chair8s.forEach(c => console.log('  -', c.locName, '| schdvwGUID:', c.schdvwGUID, '| Chair 8 GUID:', c.schdcolGUID));

    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Check which schedule views have available slots with the required appt type
    console.log('\n--- Step 2: Finding slots with Exam - PPO/Self appointment type ---');

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() + 1);
    const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const startStr = `${(startDate.getMonth()+1).toString().padStart(2,'0')}/${startDate.getDate().toString().padStart(2,'0')}/${startDate.getFullYear()}`;
    const endStr = `${(endDate.getMonth()+1).toString().padStart(2,'0')}/${endDate.getDate().toString().padStart(2,'0')}/${endDate.getFullYear()}`;

    // Get all available slots
    const xml2 = buildRequest('GetOnlineReservations', { startDate: startStr, endDate: endStr });
    const resp2 = await makeRequest(xml2);
    const parsed2 = await parseStringPromise(resp2, { explicitArray: false });
    let allSlots = parsed2.GetDataResponse.Records?.Record || [];
    if (!Array.isArray(allSlots)) allSlots = [allSlots];

    console.log('Total slots found:', allSlots.length);

    // Find slots with the required appointment type AND Chair 8
    let targetSlot = null;
    let chair8Guid = null;

    for (const chair8 of chair8s) {
        const matchingSlots = allSlots.filter(s =>
            s.ScheduleViewGUID === chair8.schdvwGUID &&
            s.ScheduleColumnDescription === 'Chair 8'
        );
        if (matchingSlots.length > 0) {
            console.log('\nFound', matchingSlots.length, 'slots on Chair 8 at', chair8.locName);
            targetSlot = matchingSlots[0];
            chair8Guid = chair8.schdcolGUID;
            break;
        }
    }

    // If no Chair 8 slots, find any slot and note it
    if (!targetSlot) {
        console.log('\nNo slots available on any Chair 8. Finding any available slot...');
        // Find slots that match required appt type
        const matchingType = allSlots.filter(s => s.AppointmentTypeGUID === REQUIRED_APPT_TYPE_GUID);
        if (matchingType.length > 0) {
            targetSlot = matchingType[0];
            console.log('Found slot with required appointment type at:', targetSlot.ScheduleViewDescription);
        } else {
            // Use any slot but override with required appt type
            targetSlot = allSlots[0];
            console.log('Using first available slot at:', targetSlot.ScheduleViewDescription);
        }
    }

    if (!targetSlot) {
        console.log('ERROR: No slots available at all');
        return;
    }

    console.log('\nTarget slot:');
    console.log('  Location:', targetSlot.ScheduleViewDescription);
    console.log('  StartTime:', targetSlot.StartTime);
    console.log('  ScheduleViewGUID:', targetSlot.ScheduleViewGUID);
    console.log('  ScheduleColumnGUID:', targetSlot.ScheduleColumnGUID);
    console.log('  Column:', targetSlot.ScheduleColumnDescription);

    await new Promise(r => setTimeout(r, 2000));

    // Step 3: Create test patient
    console.log('\n--- Step 3: Creating Test Patient ---');
    const timestamp = Date.now();
    const patientParams = {
        patientFirstName: 'MockUser',
        patientLastName: 'Test',
        providerGUID: PROVIDER_GUID,
        locationGUID: targetSlot.LocationGUID,
        VendorUserName: 'Intelepeer',
        birthdayDateTime: '01/15/1990',
        gender: 'M',
        phoneNumber: '555-555-0002',
        emailAddress: `mockuser.test.${timestamp}@testexample.com`
    };

    console.log('Patient: MockUser Test');
    console.log('Email:', patientParams.emailAddress);

    const xml3 = buildRequest('SetPatient', patientParams);
    const resp3 = await makeRequest(xml3);
    const parsed3 = await parseStringPromise(resp3, { explicitArray: false });
    const patientData = parsed3.GetDataResponse;

    let patientGUID = null;
    if (patientData.ResponseStatus === 'Success') {
        const respText = JSON.stringify(patientData);
        const guidMatch = respText.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (guidMatch) patientGUID = guidMatch[1];
        console.log('Patient created! GUID:', patientGUID);
    } else {
        console.log('Error creating patient:', patientData.ErrorMessage);
        return;
    }

    await new Promise(r => setTimeout(r, 2000));

    // Step 4: Book appointment with REQUIRED appointment type
    console.log('\n--- Step 4: Booking Appointment ---');
    const apptParams = {
        PatientGUID: patientGUID,
        StartTime: targetSlot.StartTime,
        ScheduleViewGUID: targetSlot.ScheduleViewGUID,
        ScheduleColumnGUID: chair8Guid || targetSlot.ScheduleColumnGUID,
        AppointmentTypeGUID: REQUIRED_APPT_TYPE_GUID, // ALWAYS use required type
        Minutes: '40',
        VendorUserName: 'Intelepeer'
    };

    console.log('Booking with:');
    console.log('  PatientGUID:', apptParams.PatientGUID);
    console.log('  StartTime:', apptParams.StartTime);
    console.log('  ScheduleViewGUID:', apptParams.ScheduleViewGUID);
    console.log('  ScheduleColumnGUID:', apptParams.ScheduleColumnGUID);
    console.log('  AppointmentTypeGUID:', apptParams.AppointmentTypeGUID, '(Exam - PPO/Self)');

    const xml4 = buildRequest('SetAppointment', apptParams);
    const resp4 = await makeRequest(xml4);
    const parsed4 = await parseStringPromise(resp4, { explicitArray: false });
    const apptData = parsed4.GetDataResponse;

    console.log('\nResponse:', apptData.ResponseStatus);
    const result = apptData.Records?.Record?.Result || apptData.ErrorMessage;
    console.log('Result:', result);

    if (result && result.includes('Added')) {
        const apptGuidMatch = result.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);

        console.log('\n' + '='.repeat(80));
        console.log('SUCCESS! APPOINTMENT BOOKED');
        console.log('='.repeat(80));

        await new Promise(r => setTimeout(r, 2000));

        // Step 5: Verify
        console.log('\n--- Step 5: Verifying Appointment ---');
        const xml5 = buildRequest('GetAppointmentListByPatient', { patGUID: patientGUID });
        const resp5 = await makeRequest(xml5);
        const parsed5 = await parseStringPromise(resp5, { explicitArray: false });
        const verifyData = parsed5.GetDataResponse;

        if (verifyData.ResponseStatus === 'Success' && verifyData.Records?.Record) {
            const appt = verifyData.Records.Record;
            console.log('\n' + '='.repeat(80));
            console.log('APPOINTMENT DETAILS');
            console.log('='.repeat(80));
            console.log(JSON.stringify(appt, null, 2));
        }
    }
}

main();

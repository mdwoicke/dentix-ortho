const https = require('https');
const { parseStringPromise } = require('xml2js');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

// Target GUIDs for CDH - Allegheny 300M
const LOCATION_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';
const SCHEDULE_VIEW_GUID = 'b1946f40-3b0b-4e01-87a9-c5060b88443e';
const SCHEDULE_COLUMN_GUID = 'dda0b40c-ace5-4427-8b76-493bf9aa26f1'; // Chair 8
const APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';

function buildRequest(procedure, params) {
    let paramXml = '';
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            paramXml += `        <${key}>${value}</${key}>\n`;
        }
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

async function createTestReservation() {
    console.log('='.repeat(80));
    console.log('CREATING TEST RESERVATION');
    console.log('='.repeat(80));
    console.log(`\nLocation: CDH - Allegheny 300M`);
    console.log(`LocationGUID: ${LOCATION_GUID}`);
    console.log(`ScheduleViewGUID: ${SCHEDULE_VIEW_GUID}`);
    console.log(`ScheduleColumnGUID: ${SCHEDULE_COLUMN_GUID} (Chair 8)`);
    console.log(`AppointmentTypeGUID: ${APPT_TYPE_GUID}`);

    // Step 1: Find an orthodontist provider for this location
    console.log('\n--- STEP 1: Finding Orthodontist Provider ---');
    let providerGUID = null;

    try {
        const xml1 = buildRequest('GetProviders', {});
        const resp1 = await makeRequest(xml1);
        const parsed1 = await parseStringPromise(resp1, { explicitArray: false });
        const data1 = parsed1.GetDataResponse;

        if (data1.ResponseStatus === 'Success') {
            let providers = data1.Records?.Record;
            if (!Array.isArray(providers)) providers = providers ? [providers] : [];

            // Find orthodontist for this location
            const orthoProviders = providers.filter(p =>
                p.ProviderSpecialty?.toLowerCase().includes('ortho') ||
                p.Specialty?.toLowerCase().includes('ortho')
            );

            if (orthoProviders.length > 0) {
                providerGUID = orthoProviders[0].ProviderGUID || orthoProviders[0].provGUID;
                console.log(`Found ${orthoProviders.length} orthodontist providers`);
                console.log(`Using: ${orthoProviders[0].ProviderName || orthoProviders[0].provName} (${providerGUID})`);
            } else {
                // Just use first provider
                providerGUID = providers[0]?.ProviderGUID || providers[0]?.provGUID;
                console.log(`No orthodontist found, using first provider: ${providerGUID}`);
            }
        } else {
            console.log('Error getting providers:', data1.ErrorMessage);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    if (!providerGUID) {
        console.log('ERROR: Could not find a provider. Trying GetDoctors...');

        await new Promise(r => setTimeout(r, 2000));

        try {
            const xml1b = buildRequest('GetDoctors', {});
            const resp1b = await makeRequest(xml1b);
            const parsed1b = await parseStringPromise(resp1b, { explicitArray: false });
            const data1b = parsed1b.GetDataResponse;

            if (data1b.ResponseStatus === 'Success') {
                let doctors = data1b.Records?.Record;
                if (!Array.isArray(doctors)) doctors = doctors ? [doctors] : [];

                if (doctors.length > 0) {
                    providerGUID = doctors[0].DoctorGUID || doctors[0].docGUID || doctors[0].ProviderGUID;
                    console.log(`Found ${doctors.length} doctors`);
                    console.log(`Using: ${doctors[0].DoctorName || doctors[0].docName} (${providerGUID})`);
                }
            }
        } catch (e) {
            console.log('Error:', e.message);
        }
    }

    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Create test patient
    console.log('\n--- STEP 2: Creating Test Patient ---');

    const timestamp = Date.now();
    const testPatient = {
        patientFirstName: 'MockUser',
        patientLastName: 'Test',
        providerGUID: providerGUID,
        locationGUID: LOCATION_GUID,
        VendorUserName: 'Intelepeer',
        birthdayDateTime: '01/15/1990',
        gender: 'M',
        phoneNumber: '555-TEST-001',
        emailAddress: `mockuser.test.${timestamp}@testexample.com`
    };

    console.log('Test Patient Details:');
    console.log(`  Name: ${testPatient.patientFirstName} ${testPatient.patientLastName}`);
    console.log(`  Email: ${testPatient.emailAddress}`);
    console.log(`  DOB: ${testPatient.birthdayDateTime}`);
    console.log(`  Provider: ${providerGUID}`);
    console.log(`  Location: ${LOCATION_GUID}`);

    let patientGUID = null;

    try {
        const xml2 = buildRequest('SetPatient', testPatient);
        console.log('\nCalling SetPatient...');
        const resp2 = await makeRequest(xml2);
        const parsed2 = await parseStringPromise(resp2, { explicitArray: false });
        const data2 = parsed2.GetDataResponse;

        console.log(`Response Status: ${data2.ResponseStatus}`);

        if (data2.ResponseStatus === 'Success') {
            // Extract patient GUID from response
            const responseText = JSON.stringify(data2);
            const guidMatch = responseText.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
            if (guidMatch) {
                patientGUID = guidMatch[1];
            }

            // Check Records
            if (data2.Records?.Record) {
                const record = data2.Records.Record;
                patientGUID = record.PatientGUID || record.patGUID || patientGUID;
                console.log('Patient created successfully!');
                console.log(`PatientGUID: ${patientGUID}`);
            } else {
                console.log('Response:', JSON.stringify(data2, null, 2));
            }
        } else {
            console.log(`Error: ${data2.ErrorMessage}`);
            console.log('Full response:', JSON.stringify(data2, null, 2));
        }
    } catch (e) {
        console.log('Error creating patient:', e.message);
    }

    if (!patientGUID) {
        console.log('\nERROR: Could not create patient. Cannot proceed with appointment.');
        return;
    }

    await new Promise(r => setTimeout(r, 2000));

    // Step 3: Create appointment (at least 1 month out)
    console.log('\n--- STEP 3: Creating Appointment ---');

    const apptDate = new Date();
    apptDate.setMonth(apptDate.getMonth() + 1); // 1 month from now
    apptDate.setDate(15); // Set to 15th of month
    apptDate.setHours(10, 0, 0, 0); // 10:00 AM

    const formatDateTime = (d) => {
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const year = d.getFullYear();
        return `${month}/${day}/${year} 10:00:00 AM`;
    };

    const appointmentParams = {
        PatientGUID: patientGUID,
        StartTime: formatDateTime(apptDate),
        ScheduleViewGUID: SCHEDULE_VIEW_GUID,
        ScheduleColumnGUID: SCHEDULE_COLUMN_GUID,
        AppointmentTypeGUID: APPT_TYPE_GUID,
        Minutes: '30',
        VendorUserName: 'Intelepeer'
    };

    console.log('Appointment Details:');
    console.log(`  Patient: ${patientGUID}`);
    console.log(`  DateTime: ${appointmentParams.StartTime}`);
    console.log(`  Schedule View: ${SCHEDULE_VIEW_GUID}`);
    console.log(`  Chair: ${SCHEDULE_COLUMN_GUID} (Chair 8)`);
    console.log(`  Type: ${APPT_TYPE_GUID} (Exam - PPO/Self)`);
    console.log(`  Duration: 30 minutes`);

    try {
        const xml3 = buildRequest('SetAppointment', appointmentParams);
        console.log('\nCalling SetAppointment...');
        const resp3 = await makeRequest(xml3);
        const parsed3 = await parseStringPromise(resp3, { explicitArray: false });
        const data3 = parsed3.GetDataResponse;

        console.log(`Response Status: ${data3.ResponseStatus}`);

        if (data3.ResponseStatus === 'Success') {
            console.log('\n' + '='.repeat(80));
            console.log('SUCCESS! APPOINTMENT CREATED');
            console.log('='.repeat(80));
            console.log('\nResponse:', JSON.stringify(data3, null, 2));

            // Extract appointment GUID
            const responseText = JSON.stringify(data3);
            const apptGuidMatch = responseText.match(/Appointment GUID Added:\s*([a-f0-9-]+)/i) ||
                                  responseText.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
            if (apptGuidMatch) {
                console.log(`\nAppointment GUID: ${apptGuidMatch[1]}`);
            }
        } else {
            console.log(`Error: ${data3.ErrorMessage}`);
            console.log('Full response:', JSON.stringify(data3, null, 2));
        }
    } catch (e) {
        console.log('Error creating appointment:', e.message);
    }

    // Step 4: Verify appointment was created
    await new Promise(r => setTimeout(r, 2000));

    console.log('\n--- STEP 4: Verifying Appointment ---');
    try {
        const verifyDate = `${String(apptDate.getMonth() + 1).padStart(2, '0')}/${String(apptDate.getDate()).padStart(2, '0')}/${apptDate.getFullYear()}`;
        const xml4 = buildRequest('GetAppointmentsByDate', {
            dtAppointment: verifyDate,
            schdvwGUID: SCHEDULE_VIEW_GUID
        });

        const resp4 = await makeRequest(xml4);
        const parsed4 = await parseStringPromise(resp4, { explicitArray: false });
        const data4 = parsed4.GetDataResponse;

        if (data4.ResponseStatus === 'Success') {
            let appointments = data4.Records?.Record;
            if (!appointments) {
                console.log('No appointments found for verification');
            } else {
                if (!Array.isArray(appointments)) appointments = [appointments];
                console.log(`Found ${appointments.length} appointment(s) on ${verifyDate}:`);
                appointments.forEach((apt, i) => {
                    console.log(`  ${i + 1}. ${apt.AppointmentStartTime || apt.StartTime} - ${apt.PatientName || 'Test Patient'}`);
                });
            }
        }
    } catch (e) {
        console.log('Error verifying:', e.message);
    }

    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETE');
    console.log('='.repeat(80));
}

createTestReservation();

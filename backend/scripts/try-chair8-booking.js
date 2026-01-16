const https = require('https');
const { parseStringPromise } = require('xml2js');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

// User's default GUIDs for CDH - Allegheny 300M
const SCHEDULE_VIEW_GUID = 'b1946f40-3b0b-4e01-87a9-c5060b88443e';
const SCHEDULE_COLUMN_GUID = 'dda0b40c-ace5-4427-8b76-493bf9aa26f1'; // Chair 8
const APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705'; // Exam - PPO/Self
const PATIENT_GUID = '062B04D3-642D-4FAE-A6B5-6683F609EFDB';

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

async function tryAllApproaches() {
    console.log('='.repeat(80));
    console.log('TRYING ALL APPROACHES TO BOOK ON CHAIR 8 - CDH ALLEGHENY');
    console.log('='.repeat(80));

    // Get a Monday 1+ month out
    const nextMonday = new Date();
    nextMonday.setMonth(nextMonday.getMonth() + 1);
    while (nextMonday.getDay() !== 1) {
        nextMonday.setDate(nextMonday.getDate() + 1);
    }
    const mondayStr = `${String(nextMonday.getMonth() + 1).padStart(2, '0')}/${String(nextMonday.getDate()).padStart(2, '0')}/${nextMonday.getFullYear()}`;

    // Get a Tuesday
    const nextTuesday = new Date(nextMonday);
    nextTuesday.setDate(nextTuesday.getDate() + 1);
    const tuesdayStr = `${String(nextTuesday.getMonth() + 1).padStart(2, '0')}/${String(nextTuesday.getDate()).padStart(2, '0')}/${nextTuesday.getFullYear()}`;

    // Different appointment types to try
    const apptTypes = [
        { guid: 'f6c20c35-9abb-47c2-981a-342996016705', name: 'Exam - PPO/Self', mins: 40 },
        { guid: 'db8bc1c2-dfd0-4dd6-989e-23060d82b9b0', name: 'Adjustment - 20 Min', mins: 20 },
        { guid: '33a6aefe-6932-41db-8bbe-95236c7a31b3', name: 'Adjustment - Long', mins: 30 },
        { guid: 'e76279ac-2615-4186-8b51-0a154ed79aac', name: 'Bond - Upto 1 Arch', mins: 60 },
    ];

    const times = ['7:30:00 AM', '8:00:00 AM', '9:00:00 AM', '10:00:00 AM', '2:00:00 PM'];
    const dates = [mondayStr, tuesdayStr];

    let attempt = 0;
    for (const apptType of apptTypes) {
        for (const date of dates) {
            for (const time of times) {
                attempt++;
                console.log(`\n--- Attempt ${attempt}: ${apptType.name} on ${date} at ${time} ---`);

                try {
                    const xml = buildRequest('SetAppointment', {
                        PatientGUID: PATIENT_GUID,
                        StartTime: `${date} ${time}`,
                        ScheduleViewGUID: SCHEDULE_VIEW_GUID,
                        ScheduleColumnGUID: SCHEDULE_COLUMN_GUID,
                        AppointmentTypeGUID: apptType.guid,
                        Minutes: String(apptType.mins),
                        VendorUserName: 'Intelepeer'
                    });

                    const resp = await makeRequest(xml);
                    const parsed = await parseStringPromise(resp, { explicitArray: false });
                    const data = parsed.GetDataResponse;

                    const result = data.Records?.Record?.Result || data.ErrorMessage || data.ResponseStatus;
                    console.log('Result:', result);

                    if (result && result.includes('Appointment GUID Added')) {
                        console.log('\n' + '='.repeat(80));
                        console.log('SUCCESS! APPOINTMENT BOOKED ON CHAIR 8!');
                        console.log('='.repeat(80));
                        console.log(result);
                        return;
                    }

                    // Rate limit - wait 5 seconds between attempts
                    await new Promise(r => setTimeout(r, 5000));

                } catch (e) {
                    console.log('Error:', e.message);
                    await new Promise(r => setTimeout(r, 5000));
                }

                // Stop after first few tries per type to avoid rate limiting
                if (attempt % 3 === 0) {
                    console.log('(Pausing to avoid rate limit...)');
                    await new Promise(r => setTimeout(r, 10000));
                }
            }
            break; // Only try first date per type
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('ALL ATTEMPTS FAILED - Schedule view likely has no templates configured');
    console.log('='.repeat(80));
}

tryAllApproaches();

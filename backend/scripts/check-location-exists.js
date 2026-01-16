const https = require('https');
const { parseStringPromise } = require('xml2js');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

const TARGET_LOCATION_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';
const TARGET_SCHEDULE_VIEW_GUID = 'b1946f40-3b0b-4e01-87a9-c5060b88443e';

function buildRequest(procedure, params = '') {
    return `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CREDENTIALS.clientId}</ClientID>
    <UserName>${CREDENTIALS.userName}</UserName>
    <Password>${CREDENTIALS.password}</Password>
    <Procedure>${procedure}</Procedure>
    <Parameters>
${params}    </Parameters>
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

async function check() {
    console.log('========================================');
    console.log('CHECKING IF LOCATION GUID EXISTS');
    console.log('========================================');
    console.log(`\nTarget: ${TARGET_LOCATION_GUID}\n`);

    // 1. Check GetLocations
    console.log('--- TEST 1: GetLocations ---');
    try {
        const xml1 = buildRequest('GetLocations', '        <showDeleted>0</showDeleted>\n');
        const resp1 = await makeRequest(xml1);
        const parsed1 = await parseStringPromise(resp1, { explicitArray: false });
        const data1 = parsed1.GetDataResponse;

        if (data1.ResponseStatus === 'Success') {
            let records = data1.Records?.Record;
            if (!Array.isArray(records)) records = records ? [records] : [];
            console.log(`Total locations: ${records.length}`);

            const match = records.find(r => r.LocationGUID === TARGET_LOCATION_GUID);
            if (match) {
                console.log(`\nFOUND LOCATION:`);
                console.log(JSON.stringify(match, null, 2));
            } else {
                console.log(`Location GUID ${TARGET_LOCATION_GUID} NOT FOUND in GetLocations`);

                // Show all locations
                console.log('\nAll available locations:');
                records.forEach(r => {
                    const allegheny = r.LocationName?.toLowerCase().includes('allegheny') ? ' <-- ALLEGHENY' : '';
                    console.log(`  ${r.LocationGUID}: ${r.LocationName}${allegheny}`);
                });
            }
        } else {
            console.log('API Error:', data1.ErrorMessage);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    await new Promise(r => setTimeout(r, 2000));

    // 2. Check GetChairSchedules (schedule views)
    console.log('\n--- TEST 2: GetChairSchedules (Schedule Views) ---');
    try {
        const xml2 = buildRequest('GetChairSchedules', '');
        const resp2 = await makeRequest(xml2);
        const parsed2 = await parseStringPromise(resp2, { explicitArray: false });
        const data2 = parsed2.GetDataResponse;

        if (data2.ResponseStatus === 'Success') {
            let records = data2.Records?.Record;
            if (!Array.isArray(records)) records = records ? [records] : [];
            console.log(`Total schedule views: ${records.length}`);

            // Check for target schedule view
            const schedMatch = records.find(r => r.ScheduleViewGUID === TARGET_SCHEDULE_VIEW_GUID);
            if (schedMatch) {
                console.log(`\nFOUND SCHEDULE VIEW:`);
                console.log(JSON.stringify(schedMatch, null, 2));
            } else {
                console.log(`Schedule View GUID ${TARGET_SCHEDULE_VIEW_GUID} NOT FOUND`);
            }

            // Check for schedules at target location
            const locSchedules = records.filter(r => r.LocationGUID === TARGET_LOCATION_GUID);
            if (locSchedules.length > 0) {
                console.log(`\nSchedule views at location ${TARGET_LOCATION_GUID}:`);
                locSchedules.forEach(r => {
                    console.log(`  ${r.ScheduleViewGUID}: ${r.ScheduleViewDescription}`);
                });
            } else {
                console.log(`\nNo schedule views found for location ${TARGET_LOCATION_GUID}`);
            }

            // Show Allegheny schedules
            console.log('\nSchedule views containing "Allegheny":');
            const alleghenyScheds = records.filter(r =>
                r.ScheduleViewDescription?.toLowerCase().includes('allegheny')
            );
            if (alleghenyScheds.length > 0) {
                alleghenyScheds.forEach(r => {
                    console.log(`  ${r.ScheduleViewDescription}`);
                    console.log(`    ScheduleViewGUID: ${r.ScheduleViewGUID}`);
                    console.log(`    LocationGUID: ${r.LocationGUID}`);
                });
            } else {
                console.log('  None found');
            }
        } else {
            console.log('API Error:', data2.ErrorMessage);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    await new Promise(r => setTimeout(r, 2000));

    // 3. Try GetAppointmentsByDate for this schedule view
    console.log('\n--- TEST 3: GetAppointmentsByDate for target schedule view ---');
    try {
        const today = new Date();
        const dateStr = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

        const params = `        <dtAppointment>${dateStr}</dtAppointment>
        <schdvwGUID>${TARGET_SCHEDULE_VIEW_GUID}</schdvwGUID>
`;
        const xml3 = buildRequest('GetAppointmentsByDate', params);
        const resp3 = await makeRequest(xml3);
        const parsed3 = await parseStringPromise(resp3, { explicitArray: false });
        const data3 = parsed3.GetDataResponse;

        if (data3.ResponseStatus === 'Success') {
            let records = data3.Records?.Record;
            if (!records) {
                console.log(`No appointments found for ${dateStr} at schedule view ${TARGET_SCHEDULE_VIEW_GUID}`);
            } else {
                if (!Array.isArray(records)) records = [records];
                console.log(`Found ${records.length} appointments for ${dateStr}`);
                if (records.length > 0) {
                    console.log('First appointment:');
                    console.log(JSON.stringify(records[0], null, 2));
                }
            }
        } else {
            console.log('API Error:', data3.ErrorMessage);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    console.log('\n========================================');
    console.log('CHECK COMPLETE');
    console.log('========================================');
}

check();

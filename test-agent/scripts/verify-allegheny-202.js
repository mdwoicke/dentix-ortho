const https = require('https');

// Cloud9 TEST sandbox credentials
const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

// From the successful appointment screenshot
const ALLEGHENY_202 = {
    locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b',
    appointmentTypeGUID: 'f6c20c35-9abb-47c2-981a-342996016705',
    orthodontistGUID: 'a79ec244-9503-44b2-87e4-5920b6e60392',
    patientGUID: '4859e37c-1e85-49c9-be3b-db8dc648ec94'
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

async function verify() {
    console.log('=== Verifying CDH - Allegheny 202 Configuration ===\n');

    // Step 1: Get the patient's appointment to find the scheduleView/Column GUIDs
    console.log('1. Getting existing appointment details for patient...');
    const apptXml = buildXmlRequest('GetAppointmentListByPatient', { patGUID: ALLEGHENY_202.patientGUID });
    const apptResp = await makeRequest(apptXml);
    const appts = parseRecords(apptResp);

    if (appts.length > 0) {
        console.log(`   Found ${appts.length} appointments\n`);

        // Find appointment at Allegheny 202
        const alleghenyAppt = appts.find(a => a.LocationGUID === ALLEGHENY_202.locationGUID);

        if (alleghenyAppt) {
            console.log('   WORKING APPOINTMENT AT ALLEGHENY 202:');
            console.log('   ' + '='.repeat(50));
            console.log('   AppointmentGUID:', alleghenyAppt.AppointmentGUID);
            console.log('   StartTime:', alleghenyAppt.AppointmentStartTime);
            console.log('   LocationGUID:', alleghenyAppt.LocationGUID);
            console.log('   LocationName:', alleghenyAppt.LocationName);
            console.log('   ScheduleViewGUID:', alleghenyAppt.ScheduleViewGUID);
            console.log('   ScheduleColumnGUID:', alleghenyAppt.ScheduleColumnGUID);
            console.log('   AppointmentTypeGUID:', alleghenyAppt.AppointmentTypeGUID);
            console.log('   OrthodontistGUID:', alleghenyAppt.OrthodontistGUID);

            // Step 2: Check if this scheduleView returns slots via GetOnlineReservations
            console.log('\n2. Checking if this ScheduleView has available slots...');

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
            const dd = String(tomorrow.getDate()).padStart(2, '0');
            const yyyy = tomorrow.getFullYear();

            const endDate = new Date(tomorrow);
            endDate.setDate(endDate.getDate() + 28);
            const emm = String(endDate.getMonth() + 1).padStart(2, '0');
            const edd = String(endDate.getDate()).padStart(2, '0');
            const eyyyy = endDate.getFullYear();

            const slotsXml = buildXmlRequest('GetOnlineReservations', {
                startDate: `${mm}/${dd}/${yyyy} 7:00:00 AM`,
                endDate: `${emm}/${edd}/${eyyyy} 5:00:00 PM`,
                morning: 'True',
                afternoon: 'True',
                schdvwGUIDs: alleghenyAppt.ScheduleViewGUID,
                appttypGUIDs: ALLEGHENY_202.appointmentTypeGUID
            });

            const slotsResp = await makeRequest(slotsXml);
            const slots = parseRecords(slotsResp);

            console.log(`   Slots found for ScheduleView ${alleghenyAppt.ScheduleViewGUID}: ${slots.length}`);

            if (slots.length > 0) {
                console.log('\n   ✅ SLOTS ARE AVAILABLE! First 3 slots:');
                slots.slice(0, 3).forEach((s, i) => {
                    console.log(`   ${i+1}. ${s.StartTime} - Column: ${s.ScheduleColumnGUID}`);
                });

                console.log('\n\n' + '='.repeat(60));
                console.log('COPY THESE GUIDs TO FIX THE TEST:');
                console.log('='.repeat(60));
                console.log(`
const CDH_ALLEGHENY_202 = {
    locationGUID: '${alleghenyAppt.LocationGUID}',
    locationName: '${alleghenyAppt.LocationName}',
    scheduleViewGUID: '${alleghenyAppt.ScheduleViewGUID}',
    scheduleColumnGUID: '${slots[0].ScheduleColumnGUID}',  // From first available slot
    appointmentTypeGUID: '${ALLEGHENY_202.appointmentTypeGUID}',
    orthodontistGUID: '${alleghenyAppt.OrthodontistGUID}'
};
`);
            } else {
                console.log('\n   ⚠️  No slots found for this ScheduleView!');

                // Try without filtering
                console.log('\n3. Trying GetOnlineReservations without ScheduleView filter...');
                const allSlotsXml = buildXmlRequest('GetOnlineReservations', {
                    startDate: `${mm}/${dd}/${yyyy} 7:00:00 AM`,
                    endDate: `${emm}/${edd}/${eyyyy} 5:00:00 PM`,
                    morning: 'True',
                    afternoon: 'True',
                    appttypGUIDs: ALLEGHENY_202.appointmentTypeGUID
                });
                const allSlotsResp = await makeRequest(allSlotsXml);
                const allSlots = parseRecords(allSlotsResp);

                // Find slots for Allegheny 202
                const alleghenySlots = allSlots.filter(s => s.LocationGUID === ALLEGHENY_202.locationGUID);
                console.log(`   Total slots: ${allSlots.length}, Allegheny 202 slots: ${alleghenySlots.length}`);

                if (alleghenySlots.length > 0) {
                    console.log('\n   Found Allegheny 202 slots:');
                    alleghenySlots.slice(0, 3).forEach((s, i) => {
                        console.log(`   ${i+1}. ${s.StartTime}`);
                        console.log(`      ScheduleViewGUID: ${s.ScheduleViewGUID}`);
                        console.log(`      ScheduleColumnGUID: ${s.ScheduleColumnGUID}`);
                    });
                }
            }
        } else {
            console.log('   No appointment found at Allegheny 202');
            console.log('   All appointments:');
            appts.forEach(a => console.log(`   - ${a.LocationName} (${a.LocationGUID})`));
        }
    } else {
        console.log('   No appointments found for patient');
    }
}

verify().catch(console.error);

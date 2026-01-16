const https = require('https');

// Cloud9 PRODUCTION credentials
const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

// CDH Allegheny 202 - from successful appointment screenshot
const ALLEGHENY_202 = {
    locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b',
    appointmentTypeGUID: 'f6c20c35-9abb-47c2-981a-342996016705',
    orthodontistGUID: 'a79ec244-9503-44b2-87e4-5920b6e60392'
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
    console.log('=== Verifying CDH Allegheny 202 in PRODUCTION ===\n');
    console.log('Environment: PRODUCTION');
    console.log('Endpoint:', CLOUD9.endpoint);
    console.log('');

    // Step 1: Verify location exists
    console.log('1. Checking if location exists in PRODUCTION...');
    const locXml = buildXmlRequest('GetLocations', {});
    const locResp = await makeRequest(locXml);
    const locations = parseRecords(locResp);

    const allegheny202 = locations.find(l => l.LocationGUID === ALLEGHENY_202.locationGUID);
    if (allegheny202) {
        console.log('   ✅ Location Found:', allegheny202.LocationName);
        console.log('   LocationGUID:', allegheny202.LocationGUID);
    } else {
        console.log('   ❌ Location NOT FOUND in production!');
        console.log('   Available locations:');
        locations.slice(0, 10).forEach(l => console.log(`   - ${l.LocationName} (${l.LocationGUID})`));
        return;
    }

    // Step 2: Get ScheduleViews for this location
    console.log('\n2. Getting ScheduleViews...');
    const svXml = buildXmlRequest('GetScheduleViews', {});
    const svResp = await makeRequest(svXml);
    const scheduleViews = parseRecords(svResp);

    const alleghenyViews = scheduleViews.filter(sv =>
        sv.LocationGUID === ALLEGHENY_202.locationGUID ||
        (sv.ScheduleViewDescription && sv.ScheduleViewDescription.toLowerCase().includes('allegheny'))
    );

    console.log(`   Total ScheduleViews: ${scheduleViews.length}`);
    console.log(`   Allegheny-related: ${alleghenyViews.length}`);

    if (alleghenyViews.length > 0) {
        console.log('\n   Allegheny ScheduleViews:');
        alleghenyViews.forEach(sv => {
            console.log(`   - ${sv.ScheduleViewDescription}`);
            console.log(`     ScheduleViewGUID: ${sv.ScheduleViewGUID}`);
            console.log(`     LocationGUID: ${sv.LocationGUID}`);
        });
    }

    // Step 3: Get available slots
    console.log('\n3. Getting available slots for Allegheny 202...');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const yyyy = tomorrow.getFullYear();

    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + 56); // 8 weeks
    const emm = String(endDate.getMonth() + 1).padStart(2, '0');
    const edd = String(endDate.getDate()).padStart(2, '0');
    const eyyyy = endDate.getFullYear();

    // Try with appointment type filter
    const slotsXml = buildXmlRequest('GetOnlineReservations', {
        startDate: `${mm}/${dd}/${yyyy} 7:00:00 AM`,
        endDate: `${emm}/${edd}/${eyyyy} 5:00:00 PM`,
        morning: 'True',
        afternoon: 'True',
        appttypGUIDs: ALLEGHENY_202.appointmentTypeGUID
    });

    const slotsResp = await makeRequest(slotsXml);
    const allSlots = parseRecords(slotsResp);

    console.log(`   Total slots returned: ${allSlots.length}`);

    // Filter for Allegheny 202
    const allegheny202Slots = allSlots.filter(s => s.LocationGUID === ALLEGHENY_202.locationGUID);
    console.log(`   Slots for Allegheny 202: ${allegheny202Slots.length}`);

    if (allegheny202Slots.length > 0) {
        console.log('\n' + '='.repeat(60));
        console.log('✅ ALLEGHENY 202 HAS SLOTS IN PRODUCTION!');
        console.log('='.repeat(60));

        const first = allegheny202Slots[0];
        console.log('\nFirst available slot:');
        console.log('  StartTime:', first.StartTime);
        console.log('  ScheduleViewGUID:', first.ScheduleViewGUID);
        console.log('  ScheduleColumnGUID:', first.ScheduleColumnGUID);
        console.log('  LocationGUID:', first.LocationGUID);
        console.log('  AppointmentTypeGUID:', first.AppointmentTypeGUID || '(use default)');

        console.log('\n\n=== PRODUCTION GUIDs FOR CDH ALLEGHENY 202 ===');
        console.log('='.repeat(50));
        console.log(`
const CDH_ALLEGHENY_202_PROD = {
    locationGUID: '${ALLEGHENY_202.locationGUID}',
    scheduleViewGUID: '${first.ScheduleViewGUID}',
    scheduleColumnGUID: '${first.ScheduleColumnGUID}',
    appointmentTypeGUID: '${ALLEGHENY_202.appointmentTypeGUID}',
    orthodontistGUID: '${ALLEGHENY_202.orthodontistGUID}'
};
`);

        // Show a few more slots
        console.log('\nNext 5 available slots:');
        allegheny202Slots.slice(0, 5).forEach((s, i) => {
            console.log(`  ${i+1}. ${s.StartTime} (Column: ${s.ScheduleColumnGUID.substring(0,8)}...)`);
        });
    } else {
        console.log('\n❌ NO SLOTS for Allegheny 202 in PRODUCTION GetOnlineReservations!');

        // Show what locations DO have slots
        const byLocation = {};
        allSlots.forEach(s => {
            const loc = s.LocationGUID || 'Unknown';
            if (!byLocation[loc]) {
                byLocation[loc] = { count: 0, name: s.ScheduleViewDescription };
            }
            byLocation[loc].count++;
        });

        console.log('\n   Locations with slots:');
        for (const [guid, data] of Object.entries(byLocation).slice(0, 10)) {
            console.log(`   - ${guid.substring(0,8)}... : ${data.count} slots (${data.name})`);
        }
    }
}

verify().catch(err => {
    console.error('Error:', err.message);
    if (err.message.includes('getaddrinfo')) {
        console.error('\nNetwork error - check internet connection');
    }
});

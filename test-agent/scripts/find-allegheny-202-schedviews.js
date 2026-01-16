const https = require('https');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

const ALLEGHENY_202_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b';

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

async function find() {
    console.log('=== Finding ScheduleViews for CDH Allegheny 202 ===\n');
    console.log('Location GUID:', ALLEGHENY_202_GUID);

    // Step 1: Get all schedule views
    console.log('\n1. Getting all ScheduleViews...');
    const schedXml = buildXmlRequest('GetScheduleViews', {});
    const schedResp = await makeRequest(schedXml);
    const allViews = parseRecords(schedResp);

    console.log(`   Total ScheduleViews: ${allViews.length}`);

    // Filter for Allegheny 202
    const allegheny202Views = allViews.filter(v =>
        v.LocationGUID === ALLEGHENY_202_GUID ||
        (v.ScheduleViewDescription && v.ScheduleViewDescription.toLowerCase().includes('allegheny'))
    );

    console.log(`   Allegheny-related ScheduleViews: ${allegheny202Views.length}`);

    if (allegheny202Views.length > 0) {
        console.log('\n   Found ScheduleViews:');
        allegheny202Views.forEach(v => {
            console.log(`   - ${v.ScheduleViewDescription}`);
            console.log(`     ScheduleViewGUID: ${v.ScheduleViewGUID}`);
            console.log(`     LocationGUID: ${v.LocationGUID}`);
        });
    }

    // Step 2: Get slots and find which ones are for Allegheny 202
    console.log('\n2. Getting ALL available slots to find Allegheny 202...');

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

    const slotsXml = buildXmlRequest('GetOnlineReservations', {
        startDate: `${mm}/${dd}/${yyyy} 7:00:00 AM`,
        endDate: `${emm}/${edd}/${eyyyy} 5:00:00 PM`,
        morning: 'True',
        afternoon: 'True',
        appttypGUIDs: 'f6c20c35-9abb-47c2-981a-342996016705'
    });

    const slotsResp = await makeRequest(slotsXml);
    const allSlots = parseRecords(slotsResp);

    console.log(`   Total slots returned: ${allSlots.length}`);

    // Group by location
    const byLocation = {};
    allSlots.forEach(s => {
        const loc = s.LocationGUID || 'Unknown';
        if (!byLocation[loc]) {
            byLocation[loc] = { count: 0, name: s.ScheduleViewDescription, sample: s };
        }
        byLocation[loc].count++;
    });

    console.log('\n   Slots by Location:');
    for (const [guid, data] of Object.entries(byLocation)) {
        const isAllegheny = guid === ALLEGHENY_202_GUID;
        console.log(`   ${isAllegheny ? '→' : ' '} ${guid.substring(0,8)}... : ${data.count} slots (${data.name}) ${isAllegheny ? '← ALLEGHENY 202!' : ''}`);
    }

    // Check specifically for Allegheny 202
    const allegheny202Slots = allSlots.filter(s => s.LocationGUID === ALLEGHENY_202_GUID);

    if (allegheny202Slots.length > 0) {
        console.log('\n\n' + '='.repeat(60));
        console.log('✅ FOUND SLOTS FOR ALLEGHENY 202!');
        console.log('='.repeat(60));

        const first = allegheny202Slots[0];
        console.log('\nFirst slot details:');
        console.log('  StartTime:', first.StartTime);
        console.log('  ScheduleViewGUID:', first.ScheduleViewGUID);
        console.log('  ScheduleColumnGUID:', first.ScheduleColumnGUID);
        console.log('  AppointmentTypeGUID:', first.AppointmentTypeGUID || '(empty - use default)');
        console.log('  LocationGUID:', first.LocationGUID);

        console.log('\n\nCOPY THESE GUIDs:');
        console.log('='.repeat(40));
        console.log(`
const CDH_ALLEGHENY_202 = {
    locationGUID: '${ALLEGHENY_202_GUID}',
    scheduleViewGUID: '${first.ScheduleViewGUID}',
    scheduleColumnGUID: '${first.ScheduleColumnGUID}',
    appointmentTypeGUID: 'f6c20c35-9abb-47c2-981a-342996016705',
    orthodontistGUID: 'a79ec244-9503-44b2-87e4-5920b6e60392'
};
`);
    } else {
        console.log('\n❌ NO SLOTS for Allegheny 202 in GetOnlineReservations!');
        console.log('   The location may not have online scheduling configured.');
    }
}

find().catch(console.error);

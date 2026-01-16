const https = require('https');

// Cloud9 PRODUCTION credentials
const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
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

async function debug() {
    console.log('=== Debugging PRODUCTION Slots ===\n');

    // 1. Get ALL providers
    console.log('1. Getting ALL providers in PRODUCTION...');
    const provXml = buildXmlRequest('GetProviders', {});
    const provResp = await makeRequest(provXml);
    const providers = parseRecords(provResp);
    console.log(`   Total providers: ${providers.length}`);

    // Find Nguyen
    const nguyen = providers.filter(p =>
        (p.ProviderName && p.ProviderName.toLowerCase().includes('nguyen')) ||
        (p.ProviderFullName && p.ProviderFullName.toLowerCase().includes('nguyen'))
    );
    if (nguyen.length > 0) {
        console.log('\n   Found Nguyen providers:');
        nguyen.forEach(p => {
            console.log(`   - ${p.ProviderName || p.ProviderFullName}`);
            console.log(`     GUID: ${p.ProviderGUID}`);
        });
    }

    // 2. Get ALL slots without filtering
    console.log('\n2. Getting ALL slots (no filters)...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + 56);

    const formatDate = (d) => {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm}/${dd}/${d.getFullYear()}`;
    };

    const slotsXml = buildXmlRequest('GetOnlineReservations', {
        startDate: `${formatDate(tomorrow)} 7:00:00 AM`,
        endDate: `${formatDate(endDate)} 5:00:00 PM`,
        morning: 'True',
        afternoon: 'True'
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

    // 3. Check Allegheny 202 specifically
    const alleghenySlots = allSlots.filter(s => s.LocationGUID === ALLEGHENY_202_GUID);
    if (alleghenySlots.length > 0) {
        console.log('\n\n=== CDH ALLEGHENY 202 HAS SLOTS! ===');
        const first = alleghenySlots[0];
        console.log('First slot:');
        console.log(`  StartTime: ${first.StartTime}`);
        console.log(`  ScheduleViewGUID: ${first.ScheduleViewGUID}`);
        console.log(`  ScheduleColumnGUID: ${first.ScheduleColumnGUID}`);
        console.log(`  AppointmentTypeGUID: ${first.AppointmentTypeGUID || '(not specified)'}`);
        console.log(`  LocationGUID: ${first.LocationGUID}`);
    } else {
        console.log('\n❌ NO SLOTS for Allegheny 202');

        // Check what locations DO have slots
        console.log('\n   Locations WITH slots:');
        for (const [guid, data] of Object.entries(byLocation).slice(0, 5)) {
            console.log(`   - ${data.name} (${guid}): ${data.count} slots`);
        }
    }

    // 4. Get appointment types
    console.log('\n\n3. Getting appointment types...');
    const atXml = buildXmlRequest('GetAppointmentTypes', {});
    const atResp = await makeRequest(atXml);
    const apptTypes = parseRecords(atResp);
    console.log(`   Total appointment types: ${apptTypes.length}`);

    // Find Exam types
    const examTypes = apptTypes.filter(a =>
        (a.AppointmentTypeDescription && a.AppointmentTypeDescription.toLowerCase().includes('exam'))
    );
    if (examTypes.length > 0) {
        console.log('\n   Exam-related appointment types:');
        examTypes.slice(0, 5).forEach(a => {
            console.log(`   - ${a.AppointmentTypeDescription}`);
            console.log(`     GUID: ${a.AppointmentTypeGUID}`);
        });
    }
}

debug().catch(console.error);

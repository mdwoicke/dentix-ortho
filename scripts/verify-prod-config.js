const https = require('https');

// Cloud9 PRODUCTION credentials
const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

// CDH Allegheny 202 - PRODUCTION GUIDs (verified working)
const CDH_ALLEGHENY_202 = {
    locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b',
    scheduleViewGUID: '4c9e9333-4951-4eb0-8d97-e1ad83ef422d',
    scheduleColumnGUID: '3d453268-6c39-4c98-bcb9-d9512b9c1a69',
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
    console.log('='.repeat(60));
    console.log('PRODUCTION Configuration Verification');
    console.log('='.repeat(60));
    console.log('Environment: PRODUCTION');
    console.log('Endpoint:', CLOUD9.endpoint);
    console.log('');

    let allPassed = true;

    // Test 1: Location exists
    console.log('1. Verifying CDH Allegheny 202 location...');
    const locXml = buildXmlRequest('GetLocations', {});
    const locResp = await makeRequest(locXml);
    const locations = parseRecords(locResp);
    const allegheny202 = locations.find(l => l.LocationGUID === CDH_ALLEGHENY_202.locationGUID);
    if (allegheny202) {
        console.log('   ✅ Location exists:', allegheny202.LocationName);
    } else {
        console.log('   ❌ Location NOT found!');
        allPassed = false;
    }

    // Test 2: Provider exists
    console.log('\n2. Verifying Dr. Nga Nguyen orthodontist...');
    const provXml = buildXmlRequest('GetProviders', {});
    const provResp = await makeRequest(provXml);
    const providers = parseRecords(provResp);
    const drNguyen = providers.find(p => p.ProviderGUID === CDH_ALLEGHENY_202.orthodontistGUID);
    if (drNguyen) {
        console.log('   ✅ Provider exists:', drNguyen.ProviderName || drNguyen.ProviderFullName);
    } else {
        console.log('   ❌ Provider NOT found!');
        allPassed = false;
    }

    // Test 3: Slots available
    console.log('\n3. Checking for available slots...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + 28);

    const formatDate = (d) => {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm}/${dd}/${d.getFullYear()}`;
    };

    const slotsXml = buildXmlRequest('GetOnlineReservations', {
        startDate: `${formatDate(tomorrow)} 7:00:00 AM`,
        endDate: `${formatDate(endDate)} 5:00:00 PM`,
        morning: 'True',
        afternoon: 'True',
        appttypGUIDs: CDH_ALLEGHENY_202.appointmentTypeGUID
    });

    const slotsResp = await makeRequest(slotsXml);
    const allSlots = parseRecords(slotsResp);
    const alleghenySlots = allSlots.filter(s => s.LocationGUID === CDH_ALLEGHENY_202.locationGUID);

    if (alleghenySlots.length > 0) {
        console.log(`   ✅ Found ${alleghenySlots.length} slots for CDH Allegheny 202`);
        const first = alleghenySlots[0];
        console.log(`   First slot: ${first.StartTime}`);
        console.log(`   ScheduleViewGUID: ${first.ScheduleViewGUID}`);
    } else {
        console.log('   ❌ NO slots found for CDH Allegheny 202!');
        allPassed = false;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
        console.log('✅ ALL PRODUCTION CHECKS PASSED');
        console.log('='.repeat(60));
        console.log('\nPRODUCTION GUIDs (copy for reference):');
        console.log(`
const CDH_ALLEGHENY_202_PROD = {
    locationGUID: '${CDH_ALLEGHENY_202.locationGUID}',
    scheduleViewGUID: '${CDH_ALLEGHENY_202.scheduleViewGUID}',
    scheduleColumnGUID: '${CDH_ALLEGHENY_202.scheduleColumnGUID}',
    appointmentTypeGUID: '${CDH_ALLEGHENY_202.appointmentTypeGUID}',
    orthodontistGUID: '${CDH_ALLEGHENY_202.orthodontistGUID}'
};
`);
    } else {
        console.log('❌ SOME CHECKS FAILED - Review above');
        console.log('='.repeat(60));
    }
}

verify().catch(console.error);

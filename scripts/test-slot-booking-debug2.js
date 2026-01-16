const https = require('https');

// Cloud9 TEST sandbox credentials
const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

// Location from failed trace
const CDH_ALLEGHENY_LOCATION = '799d413a-5e1a-46a2-b169-e2108bf517d6';

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

async function test() {
    console.log('=== Diagnosing Slot Booking Failure ===\n');

    // Step 1: Check what scheduleViews exist for CDH Allegheny
    console.log('1. Getting ScheduleViews for CDH Allegheny location...');
    const schedViewsXml = buildXmlRequest('GetScheduleViews', {});
    const schedViewsResp = await makeRequest(schedViewsXml);

    // Parse all schedule views
    const schedViews = [];
    const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
    let match;
    while ((match = recordRegex.exec(schedViewsResp)) !== null) {
        const fields = {};
        const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
        let m;
        while ((m = fieldRegex.exec(match[1])) !== null) {
            fields[m[1]] = m[2];
        }
        schedViews.push(fields);
    }

    console.log(`  Found ${schedViews.length} schedule views total`);

    // Filter for CDH Allegheny
    const alleghenyViews = schedViews.filter(v =>
        v.LocationGUID === CDH_ALLEGHENY_LOCATION ||
        (v.ScheduleViewDescription && v.ScheduleViewDescription.includes('Allegheny'))
    );

    console.log(`\n  CDH Allegheny schedule views (${alleghenyViews.length}):`);
    alleghenyViews.forEach(v => {
        console.log(`    - ${v.ScheduleViewDescription} (${v.ScheduleViewGUID})`);
        console.log(`      LocationGUID: ${v.LocationGUID}`);
    });

    // Step 2: Get slots specifically filtered by CDH Allegheny schedule views
    if (alleghenyViews.length > 0) {
        console.log('\n2. Getting slots for CDH Allegheny schedule views...');

        const schedViewGUIDs = alleghenyViews.map(v => v.ScheduleViewGUID).join('|');

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const dd = String(tomorrow.getDate()).padStart(2, '0');
        const yyyy = tomorrow.getFullYear();

        const endDate = new Date(tomorrow);
        endDate.setDate(endDate.getDate() + 14);
        const emm = String(endDate.getMonth() + 1).padStart(2, '0');
        const edd = String(endDate.getDate()).padStart(2, '0');
        const eyyyy = endDate.getFullYear();

        const slotsXml = buildXmlRequest('GetOnlineReservations', {
            startDate: `${mm}/${dd}/${yyyy} 7:00:00 AM`,
            endDate: `${emm}/${edd}/${eyyyy} 5:00:00 PM`,
            morning: 'True',
            afternoon: 'True',
            schdvwGUIDs: schedViewGUIDs,
            appttypGUIDs: '8fc9d063-ae46-4975-a5ae-734c6efe341a'
        });

        console.log(`  Using schdvwGUIDs: ${schedViewGUIDs.substring(0, 80)}...`);

        const slotsResp = await makeRequest(slotsXml);

        // Check status
        const statusMatch = slotsResp.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
        console.log(`  Response Status: ${statusMatch ? statusMatch[1] : 'Unknown'}`);

        // Count slots
        const slotCount = (slotsResp.match(/<Record>/g) || []).length;
        console.log(`  Slots found for CDH Allegheny: ${slotCount}`);

        if (slotCount === 0) {
            console.log('\n  ⚠️  NO SLOTS AVAILABLE for CDH Allegheny!');
            console.log('  This explains why booking keeps failing - no valid slots exist.');

            // Check raw response for errors
            if (slotsResp.includes('Error')) {
                const errorMatch = slotsResp.match(/<Result>([^<]+)<\/Result>/);
                console.log('  Error:', errorMatch ? errorMatch[1] : 'Unknown');
            }
        } else {
            // Show first slot
            const firstSlotMatch = slotsResp.match(/<Record>([\s\S]*?)<\/Record>/);
            if (firstSlotMatch) {
                const fields = {};
                const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
                let m;
                while ((m = fieldRegex.exec(firstSlotMatch[1])) !== null) {
                    fields[m[1]] = m[2];
                }
                console.log('\n  First slot:');
                console.log('    StartTime:', fields.StartTime);
                console.log('    ScheduleViewGUID:', fields.ScheduleViewGUID);
                console.log('    ScheduleColumnGUID:', fields.ScheduleColumnGUID);
            }
        }
    }

    // Step 3: Check slots without any filter
    console.log('\n3. Getting ALL slots (unfiltered) to see what locations have availability...');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const yyyy = tomorrow.getFullYear();

    const allSlotsXml = buildXmlRequest('GetOnlineReservations', {
        startDate: `${mm}/${dd}/${yyyy} 7:00:00 AM`,
        endDate: `${mm}/${parseInt(dd)+14}/${yyyy} 5:00:00 PM`,
        morning: 'True',
        afternoon: 'True',
        appttypGUIDs: '8fc9d063-ae46-4975-a5ae-734c6efe341a'
    });

    const allSlotsResp = await makeRequest(allSlotsXml);

    // Parse all slots and group by location
    const slotsByLocation = {};
    const slotRecordRegex = /<Record>([\s\S]*?)<\/Record>/g;
    while ((match = slotRecordRegex.exec(allSlotsResp)) !== null) {
        const fields = {};
        const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
        let m;
        while ((m = fieldRegex.exec(match[1])) !== null) {
            fields[m[1]] = m[2];
        }
        const locGUID = fields.LocationGUID || 'Unknown';
        if (!slotsByLocation[locGUID]) {
            slotsByLocation[locGUID] = { count: 0, sample: fields };
        }
        slotsByLocation[locGUID].count++;
    }

    console.log('  Slots by LocationGUID:');
    for (const [locGUID, data] of Object.entries(slotsByLocation)) {
        const isCDH = locGUID === CDH_ALLEGHENY_LOCATION;
        console.log(`    ${isCDH ? '→' : ' '} ${locGUID}: ${data.count} slots ${isCDH ? '(CDH Allegheny)' : ''}`);
    }

    console.log('\n=== DIAGNOSIS ===');
    if (!slotsByLocation[CDH_ALLEGHENY_LOCATION]) {
        console.log('❌ CDH Allegheny location has NO slots configured in GetOnlineReservations');
        console.log('   This is likely a Cloud9 configuration issue - online scheduling is not set up for this location');
    } else {
        console.log('✓ CDH Allegheny has slots available');
    }
}

test().catch(console.error);

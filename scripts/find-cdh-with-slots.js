const https = require('https');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
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

async function findCDHWithSlots() {
    console.log('=== Finding CDH Locations with Available Slots ===\n');
    console.log('Environment: PRODUCTION');
    console.log('Endpoint:', CLOUD9.endpoint);
    console.log('');

    // Step 1: Get all locations
    console.log('1. Getting all locations...');
    const locXml = buildXmlRequest('GetLocations', {});
    const locResp = await makeRequest(locXml);
    const locations = parseRecords(locResp);
    console.log('   Total locations:', locations.length);

    // Find CDH locations
    const cdhLocations = locations.filter(l =>
        l.LocationName && l.LocationName.toLowerCase().includes('cdh')
    );
    console.log('   CDH locations:', cdhLocations.length);
    console.log('');

    // Step 2: Get all slots
    console.log('2. Getting all available slots...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + 14);

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
    console.log('   Total slots:', allSlots.length);

    // Group slots by location
    const slotsByLocation = {};
    allSlots.forEach(s => {
        const loc = s.LocationGUID;
        if (!slotsByLocation[loc]) {
            slotsByLocation[loc] = {
                count: 0,
                scheduleViews: new Set(),
                scheduleColumns: new Set(),
                firstSlot: null
            };
        }
        slotsByLocation[loc].count++;
        if (s.ScheduleViewGUID) slotsByLocation[loc].scheduleViews.add(s.ScheduleViewGUID);
        if (s.ScheduleColumnGUID) slotsByLocation[loc].scheduleColumns.add(s.ScheduleColumnGUID);
        if (!slotsByLocation[loc].firstSlot) slotsByLocation[loc].firstSlot = s;
    });

    // Find CDH locations with slots
    console.log('\n3. CDH Locations with Available Slots:\n');
    console.log('='.repeat(80));

    let foundWithSlots = false;
    for (const loc of cdhLocations) {
        const slotData = slotsByLocation[loc.LocationGUID];
        if (slotData && slotData.count > 0) {
            foundWithSlots = true;
            console.log(`\n✅ ${loc.LocationName}`);
            console.log('-'.repeat(60));
            console.log(`   LocationGUID: ${loc.LocationGUID}`);
            console.log(`   Available slots: ${slotData.count}`);
            console.log(`   Schedule Views: ${slotData.scheduleViews.size}`);

            // Show first slot details
            const firstSlot = slotData.firstSlot;
            console.log(`\n   First Available Slot:`);
            console.log(`     Time: ${firstSlot.StartTime}`);
            console.log(`     ScheduleViewGUID: ${firstSlot.ScheduleViewGUID}`);
            console.log(`     ScheduleColumnGUID: ${firstSlot.ScheduleColumnGUID}`);

            console.log(`\n   Use these GUIDs in Node Red:`);
            console.log(`     defaultLocationGUID: '${loc.LocationGUID}'`);
            console.log(`     defaultScheduleViewGUID: '${firstSlot.ScheduleViewGUID}'`);
            console.log(`     defaultScheduleColumnGUID: '${firstSlot.ScheduleColumnGUID}'`);
        }
    }

    if (!foundWithSlots) {
        console.log('\n❌ NO CDH LOCATIONS HAVE AVAILABLE SLOTS!\n');
        console.log('Locations with slots (top 5):');
        const sortedLocs = Object.entries(slotsByLocation)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5);

        for (const [guid, data] of sortedLocs) {
            const locInfo = locations.find(l => l.LocationGUID === guid);
            const name = locInfo ? locInfo.LocationName : 'Unknown';
            console.log(`   - ${name}: ${data.count} slots`);
            console.log(`     LocationGUID: ${guid}`);
            console.log(`     ScheduleViewGUID: ${data.firstSlot.ScheduleViewGUID}`);
        }
    }

    // Step 3: Get providers
    console.log('\n\n4. Getting providers for CDH locations with slots...');
    const provXml = buildXmlRequest('GetProviders', {});
    const provResp = await makeRequest(provXml);
    const providers = parseRecords(provResp);

    // Find orthodontists at CDH locations
    const orthodontists = providers.filter(p =>
        p.ProviderSpecialty && p.ProviderSpecialty.toLowerCase().includes('ortho')
    );
    console.log('   Total orthodontists:', orthodontists.length);

    // Print summary
    console.log('\n\n' + '='.repeat(80));
    console.log('SUMMARY: CDH Location Slot Availability');
    console.log('='.repeat(80));
    for (const loc of cdhLocations) {
        const slotData = slotsByLocation[loc.LocationGUID];
        const count = slotData ? slotData.count : 0;
        const status = count > 0 ? '✅' : '❌';
        console.log(`${status} ${loc.LocationName}: ${count} slots`);
    }
}

findCDHWithSlots().catch(console.error);

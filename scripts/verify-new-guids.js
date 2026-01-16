const https = require('https');

// Use command line arg to switch between prod and sandbox
const USE_PROD = process.argv.includes('--prod');

const SANDBOX_CONFIG = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

const PROD_CONFIG = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

const CLOUD9 = USE_PROD ? PROD_CONFIG : SANDBOX_CONFIG;

const NEW_GUIDS = {
    defaultLocationGUID: '799d413a-5e1a-46a2-b169-e2108bf517d6',
    defaultApptTypeGUID: 'f6c20c35-9abb-47c2-981a-342996016705',
    defaultScheduleViewGUID: 'b1946f40-3b0b-4e01-87a9-c5060b88443e',
    defaultScheduleColumnGUID: 'dda0b40c-ace5-4427-8b76-493bf9aa26f1'
};

function escapeXml(str) {
    if (!str) return '';
    return String(str).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}

function buildRequest(procedure, params = {}) {
    const paramElements = Object.entries(params)
        .filter(([_, v]) => v)
        .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
        .join('');
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${escapeXml(CLOUD9.password)}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
}

function callApi(procedure, params = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(CLOUD9.endpoint);
        const body = buildRequest(procedure, params);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/xml', 'Content-Length': Buffer.byteLength(body) }
        };
        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function parseRecords(xml) {
    const records = [];
    const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
    let match;
    while ((match = recordRegex.exec(xml)) !== null) {
        const record = {};
        const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(match[1])) !== null) {
            record[fieldMatch[1]] = fieldMatch[2];
        }
        records.push(record);
    }
    return records;
}

async function main() {
    const results = {};

    console.log('\n=== Validating NEW GUIDs against Cloud9', USE_PROD ? 'PRODUCTION' : 'SANDBOX', '===\n');
    console.log('Endpoint:', CLOUD9.endpoint);
    console.log('');

    try {
        // Get Locations
        console.log('1. Checking Location GUID...');
        const locXml = await callApi('GetLocations', { showDeleted: 'False' });
        // Check for API errors
        const statusMatch = locXml.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
        if (statusMatch && statusMatch[1] !== 'Success') {
            const errorMatch = locXml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
            console.log('   API Status:', statusMatch[1]);
            if (errorMatch) console.log('   Error:', errorMatch[1]);
        }
        const locations = parseRecords(locXml);
        const loc = locations.find(l => l.LocationGUID && l.LocationGUID.toLowerCase() === NEW_GUIDS.defaultLocationGUID.toLowerCase());
        if (loc) {
            results.locationGUID = { valid: true, name: loc.LocationName || loc.Name, guid: NEW_GUIDS.defaultLocationGUID };
            console.log('   ✓ VALID - Location:', results.locationGUID.name);
        } else {
            results.locationGUID = { valid: false, guid: NEW_GUIDS.defaultLocationGUID };
            console.log('   ✗ NOT FOUND - Available locations:', locations.length);
            if (locations.length > 0 && locations.length <= 10) {
                locations.forEach(l => console.log('     -', l.LocationGUID, '-', l.LocationName || l.Name));
            }
        }

        // Get Appointment Types
        console.log('2. Checking Appointment Type GUID...');
        const apptTypeXml = await callApi('GetAppointmentTypes', { showDeleted: 'False' });
        const apptTypes = parseRecords(apptTypeXml);
        const apptType = apptTypes.find(a => (a.AppointmentTypeGUID || '').toLowerCase() === NEW_GUIDS.defaultApptTypeGUID.toLowerCase());
        if (apptType) {
            results.apptTypeGUID = { valid: true, name: apptType.AppointmentTypeDescription || apptType.AppointmentTypeName, guid: NEW_GUIDS.defaultApptTypeGUID };
            console.log('   ✓ VALID - Appt Type:', results.apptTypeGUID.name);
        } else {
            results.apptTypeGUID = { valid: false, guid: NEW_GUIDS.defaultApptTypeGUID };
            console.log('   ✗ NOT FOUND - Available types:', apptTypes.length);
        }

        // Get Chair Schedules
        console.log('3. Checking Schedule View GUID...');
        const schedXml = await callApi('GetChairSchedules', {});
        const schedules = parseRecords(schedXml);
        const schedView = schedules.find(s => (s.schdvwGUID || '').toLowerCase() === NEW_GUIDS.defaultScheduleViewGUID.toLowerCase());
        if (schedView) {
            results.scheduleViewGUID = { valid: true, name: schedView.schdvwDescription || schedView.locName, guid: NEW_GUIDS.defaultScheduleViewGUID };
            console.log('   ✓ VALID - Schedule View:', results.scheduleViewGUID.name);
        } else {
            results.scheduleViewGUID = { valid: false, guid: NEW_GUIDS.defaultScheduleViewGUID };
            console.log('   ✗ NOT FOUND - Available schedules:', schedules.length);
        }

        console.log('4. Checking Schedule Column GUID...');
        const schedCol = schedules.find(s => (s.schdcolGUID || '').toLowerCase() === NEW_GUIDS.defaultScheduleColumnGUID.toLowerCase());
        if (schedCol) {
            results.scheduleColumnGUID = { valid: true, name: schedCol.schdcolDescription, guid: NEW_GUIDS.defaultScheduleColumnGUID };
            console.log('   ✓ VALID - Schedule Column:', results.scheduleColumnGUID.name);
        } else {
            results.scheduleColumnGUID = { valid: false, guid: NEW_GUIDS.defaultScheduleColumnGUID };
            console.log('   ✗ NOT FOUND');
        }

        console.log('\n=== SUMMARY ===');
        const allValid = Object.values(results).every(r => r.valid);
        console.log('All GUIDs valid:', allValid ? '✓ YES' : '✗ NO');
        console.log(JSON.stringify(results, null, 2));

    } catch (error) {
        console.error('API Error:', error.message);
        console.log('\nNote: Production API is only available 12:00 AM - 11:00 AM UTC');
    }
}

main().catch(console.error);

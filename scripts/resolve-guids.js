const https = require('https');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

const DEFAULT_GUIDS = {
    defaultProviderGUID: '79ec29fe-c315-4982-845a-0005baefb5a8',
    defaultLocationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db',
    defaultApptTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a',
    defaultScheduleViewGUID: '2544683a-8e79-4b32-a4d4-bf851996bac3',
    defaultScheduleColumnGUID: 'e062b81f-1fff-40fc-b4a4-1cf9ecc2f32b'
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

    // Get Locations
    console.log('Fetching Locations...');
    const locXml = await callApi('GetLocations', { showDeleted: 'False' });
    const locations = parseRecords(locXml);
    const loc = locations.find(l => l.LocationGUID && l.LocationGUID.toLowerCase() === DEFAULT_GUIDS.defaultLocationGUID.toLowerCase());
    results.defaultLocationGUID = loc ? (loc.LocationName || loc.Name || 'Unknown') : 'Not Found';

    // Get Doctors (for Provider)
    console.log('Fetching Doctors...');
    const docXml = await callApi('GetDoctors', {});
    const doctors = parseRecords(docXml);
    let doc = doctors.find(d => (d.DoctorGUID || d.docGUID || d.ProviderGUID || d.provGUID || '').toLowerCase() === DEFAULT_GUIDS.defaultProviderGUID.toLowerCase());

    // Also try GetProviders
    console.log('Fetching Providers...');
    const provXml = await callApi('GetProviders', {});
    const providers = parseRecords(provXml);
    const prov = providers.find(p => (p.ProviderGUID || p.provGUID || p.persGUID || '').toLowerCase() === DEFAULT_GUIDS.defaultProviderGUID.toLowerCase());

    // Also try GetOrthodontists
    console.log('Fetching Orthodontists...');
    const orthoXml = await callApi('GetOrthodontists', {});
    const orthos = parseRecords(orthoXml);
    const ortho = orthos.find(o => (o.OrthodontistGUID || o.orthoGUID || o.provGUID || o.ProviderGUID || '').toLowerCase() === DEFAULT_GUIDS.defaultProviderGUID.toLowerCase());

    if (doc) {
        results.defaultProviderGUID = doc.DoctorName || doc.Name || doc.FullName || 'Found (Doctor)';
    } else if (prov) {
        results.defaultProviderGUID = prov.ProviderName || prov.Name || prov.FullName || 'Found (Provider)';
    } else if (ortho) {
        results.defaultProviderGUID = ortho.OrthodontistName || ortho.Name || ortho.FullName || 'Found (Orthodontist)';
    } else {
        results.defaultProviderGUID = 'Not Found';
    }

    console.log('  Doctors count:', doctors.length);
    console.log('  Providers count:', providers.length);
    console.log('  Orthodontists count:', orthos.length);
    if (providers.length > 0) console.log('  Provider sample keys:', Object.keys(providers[0]));
    if (orthos.length > 0) console.log('  Ortho sample keys:', Object.keys(orthos[0]));

    // Get Appointment Types
    console.log('Fetching Appointment Types...');
    const apptTypeXml = await callApi('GetAppointmentTypes', { showDeleted: 'False' });
    const apptTypes = parseRecords(apptTypeXml);
    const apptType = apptTypes.find(a => (a.AppointmentTypeGUID || '').toLowerCase() === DEFAULT_GUIDS.defaultApptTypeGUID.toLowerCase());
    results.defaultApptTypeGUID = apptType ? (apptType.AppointmentTypeDescription || apptType.AppointmentTypeName || 'Unknown') : 'Not Found';

    // Get Chair Schedules (for ScheduleView and ScheduleColumn)
    console.log('Fetching Chair Schedules...');
    const schedXml = await callApi('GetChairSchedules', {});
    const schedules = parseRecords(schedXml);
    const schedView = schedules.find(s => (s.schdvwGUID || '').toLowerCase() === DEFAULT_GUIDS.defaultScheduleViewGUID.toLowerCase());
    results.defaultScheduleViewGUID = schedView ? (schedView.schdvwDescription || schedView.locName || 'Unknown') : 'Not Found';

    const schedCol = schedules.find(s => (s.schdcolGUID || '').toLowerCase() === DEFAULT_GUIDS.defaultScheduleColumnGUID.toLowerCase());
    results.defaultScheduleColumnGUID = schedCol ? (schedCol.schdcolDescription || 'Unknown') : 'Not Found';

    console.log('\n=== RESULTS ===\n');
    console.log(JSON.stringify({
        guids: DEFAULT_GUIDS,
        names: results,
        rawCounts: {
            locations: locations.length,
            doctors: doctors.length,
            apptTypes: apptTypes.length,
            schedules: schedules.length
        }
    }, null, 2));

    // Debug: show first record of each type to understand schema
    console.log('\n=== SAMPLE RECORDS ===');
    if (locations.length > 0) console.log('\nLocation sample:', JSON.stringify(locations[0], null, 2));
    if (doctors.length > 0) console.log('\nDoctor sample:', JSON.stringify(doctors[0], null, 2));
    if (apptTypes.length > 0) console.log('\nApptType sample:', JSON.stringify(apptTypes[0], null, 2));
    if (schedules.length > 0) console.log('\nSchedule sample:', JSON.stringify(schedules[0], null, 2));
}

main().catch(console.error);

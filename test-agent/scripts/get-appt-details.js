/**
 * Get detailed appointment info from PROD Cloud9
 * Try multiple API endpoints to find scheduleViewGUID and scheduleColumnGUID
 */
const fetch = require('node-fetch');

// PROD Cloud9 credentials
const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

const APPT_GUID = 'b56a84a9-21c1-49bb-9a3e-aae093014dae';
const LOCATION_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b';

function escapeXml(str) {
    if (!str) return '';
    return String(str).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}

function buildXmlRequest(procedure, params) {
    const paramElements = Object.entries(params)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
        .join('');
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${escapeXml(CLOUD9.password)}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
}

async function callCloud9(procedure, params) {
    const xmlRequest = buildXmlRequest(procedure, params);
    const response = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlRequest
    });
    return await response.text();
}

function parseRecords(xmlText) {
    const records = [];
    const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
    let match;
    while ((match = recordRegex.exec(xmlText)) !== null) {
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
    console.log('=== SEARCHING FOR SCHEDULE VIEW GUID ===\n');

    // Try 1: GetAppointmentsByDate for the appointment date
    console.log('1. Trying GetAppointmentsByDate for 2/20/2026...');
    const apptDate = '02/20/2026';

    // First, get schedule views for this location
    console.log('\n2. Trying GetScheduleViews...');
    const svResponse = await callCloud9('GetScheduleViews', {});
    const svRecords = parseRecords(svResponse);
    console.log('   Schedule Views found:', svRecords.length);

    // Filter for our location
    const locationViews = svRecords.filter(sv => sv.LocationGUID === LOCATION_GUID);
    console.log('   Views for CDH - Allegheny 202:', locationViews.length);

    if (locationViews.length > 0) {
        console.log('\n=== SCHEDULE VIEWS FOR THIS LOCATION ===');
        locationViews.forEach((sv, i) => {
            console.log('\nSchedule View ' + (i+1) + ':');
            Object.entries(sv).forEach(([k, v]) => {
                if (v) console.log('  ' + k + ': ' + v);
            });
        });
    }

    // Try 3: GetOnlineReservations to see what schedule views have slots
    console.log('\n3. Trying GetOnlineReservations to find active schedule views...');
    const slotsResponse = await callCloud9('GetOnlineReservations', {
        startDate: '02/20/2026 7:00:00 AM',
        endDate: '02/28/2026 5:00:00 PM',
        morning: 'True',
        afternoon: 'True'
    });
    const slotRecords = parseRecords(slotsResponse);
    console.log('   Slots found:', slotRecords.length);

    if (slotRecords.length > 0) {
        // Get unique schedule view GUIDs
        const uniqueSVs = [...new Set(slotRecords.map(s => s.ScheduleViewGUID))];
        console.log('   Unique ScheduleViewGUIDs:', uniqueSVs.length);
        uniqueSVs.forEach(sv => console.log('     - ' + sv));

        // Show first slot details
        console.log('\n=== FIRST SLOT DETAILS ===');
        Object.entries(slotRecords[0]).forEach(([k, v]) => {
            if (v) console.log('  ' + k + ': ' + v);
        });
    }
}

main().catch(e => console.error('Error:', e.message));

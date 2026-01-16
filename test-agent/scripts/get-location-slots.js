/**
 * Get slots for CDH - Allegheny 202 location specifically
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

const LOCATION_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b'; // CDH - Allegheny 202
const EXPECTED_SV_GUID = '4c9e9333-4951-4eb0-8d97-e1ad83ef422d';

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
    console.log('=== SLOTS FOR CDH - ALLEGHENY 202 ===\n');
    console.log('Location GUID:', LOCATION_GUID);
    console.log('Expected Schedule View GUID:', EXPECTED_SV_GUID);

    // Get all slots
    const slotsResponse = await callCloud9('GetOnlineReservations', {
        startDate: '02/01/2026 7:00:00 AM',
        endDate: '03/15/2026 5:00:00 PM',
        morning: 'True',
        afternoon: 'True'
    });
    const allSlots = parseRecords(slotsResponse);
    console.log('\nTotal slots returned:', allSlots.length);

    // Filter for our location
    const locationSlots = allSlots.filter(s => s.LocationGUID === LOCATION_GUID);
    console.log('Slots for CDH - Allegheny 202:', locationSlots.length);

    if (locationSlots.length > 0) {
        // Get unique schedule view GUIDs for this location
        const uniqueSVs = [...new Set(locationSlots.map(s => s.ScheduleViewGUID))];
        console.log('\n=== SCHEDULE VIEWS AT THIS LOCATION ===');
        console.log('Count:', uniqueSVs.length);
        uniqueSVs.forEach(sv => {
            const sample = locationSlots.find(s => s.ScheduleViewGUID === sv);
            const count = locationSlots.filter(s => s.ScheduleViewGUID === sv).length;
            const isExpected = sv === EXPECTED_SV_GUID;
            console.log(`\n  ${sv} ${isExpected ? '*** EXPECTED ***' : ''}`);
            console.log(`    Description: ${sample.ScheduleViewDescription || 'N/A'}`);
            console.log(`    Slot count: ${count}`);
        });

        // Check if expected GUID is there
        const expectedSlots = locationSlots.filter(s => s.ScheduleViewGUID === EXPECTED_SV_GUID);
        console.log('\n=== SLOTS WITH EXPECTED SCHEDULE VIEW GUID ===');
        console.log('Count:', expectedSlots.length);

        if (expectedSlots.length > 0) {
            console.log('\nFirst slot with expected GUID:');
            Object.entries(expectedSlots[0]).forEach(([k, v]) => {
                if (v) console.log('  ' + k + ': ' + v);
            });

            // Get unique schedule column GUIDs
            const uniqueSCs = [...new Set(expectedSlots.map(s => s.ScheduleColumnGUID))];
            console.log('\n=== SCHEDULE COLUMNS IN THIS VIEW ===');
            uniqueSCs.forEach(sc => {
                const sample = expectedSlots.find(s => s.ScheduleColumnGUID === sc);
                const count = expectedSlots.filter(s => s.ScheduleColumnGUID === sc).length;
                console.log(`  ${sc}`);
                console.log(`    Description: ${sample.ScheduleColumnDescription || 'N/A'}`);
                console.log(`    Slot count: ${count}`);
            });
        } else {
            console.log('\n*** NO SLOTS FOUND WITH EXPECTED SCHEDULE VIEW GUID ***');
            console.log('Available schedule view GUIDs at this location:');
            uniqueSVs.forEach(sv => console.log('  - ' + sv));
        }
    } else {
        console.log('\n*** NO SLOTS FOUND FOR THIS LOCATION ***');
    }
}

main().catch(e => console.error('Error:', e.message));

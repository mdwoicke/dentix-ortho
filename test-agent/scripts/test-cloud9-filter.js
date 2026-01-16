/**
 * Test Cloud9 PROD API - schdvwGUIDs filter
 * Testing if the schedule view filter returns slots correctly
 */
const fetch = require('node-fetch');

// Cloud9 PROD credentials
const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

// Target GUIDs from Node Red Prod
const TARGET_SV = '4c9e9333-4951-4eb0-8d97-e1ad83ef422d';
const TARGET_LOCATION = '1fef9297-7c8b-426b-b0d1-f2275136e48b';
const TARGET_APPT_TYPE = 'f6c20c35-9abb-47c2-981a-342996016705';

function escapeXml(str) {
    if (!str) return '';
    return String(str).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}

function buildXmlRequest(procedure, params) {
    const paramElements = Object.entries(params)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
        .join('');
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${escapeXml(CLOUD9.password)}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
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

async function callCloud9(procedure, params, label) {
    console.log(`\n=== ${label} ===`);
    const xmlRequest = buildXmlRequest(procedure, params);

    try {
        const response = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlRequest
        });

        const xmlText = await response.text();
        const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
        const errorMatch = xmlText.match(/<ErrorCode>([^<]+)<\/ErrorCode>/);

        console.log('Status:', response.status);
        console.log('Response Status:', statusMatch ? statusMatch[1] : 'unknown');

        if (errorMatch) {
            const errorMsgMatch = xmlText.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
            console.log('Error Code:', errorMatch[1]);
            if (errorMsgMatch) console.log('Error Message:', errorMsgMatch[1]);
            return { records: [], error: true };
        }

        const records = parseRecords(xmlText);
        console.log('Total records:', records.length);

        return { records, error: false };
    } catch (e) {
        console.log('Request failed:', e.message);
        return { records: [], error: true };
    }
}

async function main() {
    console.log('=== CLOUD9 PROD API - SCHEDULE VIEW FILTER TEST ===');
    console.log('Endpoint:', CLOUD9.endpoint);
    console.log('Target Schedule View:', TARGET_SV);
    console.log('Target Location:', TARGET_LOCATION);
    console.log('');

    // Test 1: WITHOUT schdvwGUIDs filter
    const test1 = await callCloud9('GetOnlineReservations', {
        startDate: '01/14/2026 7:00:00 AM',
        endDate: '03/15/2026 5:00:00 PM',
        morning: 'True',
        afternoon: 'True',
        appttypGUIDs: TARGET_APPT_TYPE
    }, 'Test 1: WITHOUT schdvwGUIDs filter');

    if (test1.records.length > 0) {
        // Filter client-side for target schedule view
        const targetSlots = test1.records.filter(r => r.ScheduleViewGUID === TARGET_SV);
        const targetLocSlots = test1.records.filter(r => r.LocationGUID === TARGET_LOCATION);
        console.log('Slots for target ScheduleViewGUID:', targetSlots.length);
        console.log('Slots for target LocationGUID:', targetLocSlots.length);

        if (targetSlots.length > 0) {
            console.log('\nFirst matching slot:');
            const sample = targetSlots[0];
            console.log('  ScheduleViewGUID:', sample.ScheduleViewGUID);
            console.log('  LocationGUID:', sample.LocationGUID);
            console.log('  StartTime:', sample.StartTime);
            console.log('  ScheduleColumnGUID:', sample.ScheduleColumnGUID);
        }
    }

    // Wait 3 seconds to avoid rate limiting
    console.log('\n--- Waiting 3 seconds to avoid rate limiting ---');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 2: WITH schdvwGUIDs filter
    const test2 = await callCloud9('GetOnlineReservations', {
        startDate: '01/14/2026 7:00:00 AM',
        endDate: '03/15/2026 5:00:00 PM',
        morning: 'True',
        afternoon: 'True',
        appttypGUIDs: TARGET_APPT_TYPE,
        schdvwGUIDs: TARGET_SV
    }, 'Test 2: WITH schdvwGUIDs filter');

    if (test2.records.length > 0) {
        console.log('\nFirst slot:');
        const sample = test2.records[0];
        console.log('  ScheduleViewGUID:', sample.ScheduleViewGUID);
        console.log('  LocationGUID:', sample.LocationGUID);
        console.log('  StartTime:', sample.StartTime);
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log('Test 1 (no filter):', test1.records.length, 'slots');
    console.log('Test 2 (with schdvwGUIDs):', test2.records.length, 'slots');

    if (test1.records.length > 0 && test2.records.length === 0) {
        console.log('\n*** ISSUE DETECTED ***');
        console.log('Cloud9 returns slots without filter but 0 with schdvwGUIDs filter.');
        console.log('This suggests the schdvwGUIDs parameter may not work as expected.');
    }
}

main().catch(console.error);

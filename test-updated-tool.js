const fetch = require('node-fetch');

// Simulate $action variable
const $action = 'slots';
const $startDate = undefined;
const $endDate = undefined;
const $scheduleViewGUIDs = undefined;
const $numberOfPatients = undefined;

const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/',
    vendorUserName: 'IntelepeerTest'
};

function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[<>&'"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
    }[c]));
}

function buildXmlRequest(procedure, params = {}) {
    const paramElements = Object.entries(params)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
        .join('');

    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${escapeXml(CLOUD9.password)}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
}

function parseXmlResponse(xmlText) {
    const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
    const status = statusMatch ? statusMatch[1] : 'Unknown';

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
    return { status, records };
}

function formatDateForSlots(dateStr, isStart) {
    if (!dateStr) return null;
    if (dateStr.includes(':')) return dateStr;
    return isStart ? `${dateStr} 7:00:00 AM` : `${dateStr} 5:00:00 PM`;
}

async function testUpdatedTool() {
    console.log('=== Testing Updated Scheduling Tool ===\n');

    // TEMP: Use hardcoded Jan 2026 dates for sandbox testing
    const testStartDate = '01/01/2026';
    const testEndDate = '01/07/2026';
    const testApptTypeGUID = '8fc9d063-ae46-4975-a5ae-734c6efe341a';

    const apiParams = {
        startDate: formatDateForSlots(testStartDate, true),
        endDate: formatDateForSlots(testEndDate, false),
        morning: 'True',
        afternoon: 'True',
        appttypGUIDs: testApptTypeGUID
    };

    console.log('API Params:', apiParams);
    console.log('[chord_scheduling] Using test dates: Jan 1-7, 2026');

    const xmlRequest = buildXmlRequest('GetOnlineReservations', apiParams);
    console.log('[chord_scheduling] Calling Cloud9: GetOnlineReservations');

    const response = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlRequest
    });

    const xmlText = await response.text();
    console.log('[chord_scheduling] Response status:', response.status);

    const parsed = parseXmlResponse(xmlText);

    const result = { slots: parsed.records, count: parsed.records.length };
    console.log(`[chord_scheduling] Found ${parsed.records.length} slots`);

    if (parsed.records.length > 0) {
        console.log('\nFirst 3 slots:');
        parsed.records.slice(0, 3).forEach((slot, i) => {
            console.log(`  Slot ${i + 1}: ${slot.StartTime} - ${slot.ScheduleViewDescription}`);
        });
    }

    console.log('\n✅ Tool returns:', result.count, 'slots');
    return JSON.stringify(result);
}

testUpdatedTool().catch(console.error);

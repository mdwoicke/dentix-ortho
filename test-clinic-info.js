const fetch = require('node-fetch');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
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

async function testClinicInfo() {
    console.log('=== Testing clinic_info action ===\n');

    const xmlRequest = buildXmlRequest('GetLocations', {});
    console.log('[chord_patient] Calling Cloud9: GetLocations');

    const response = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlRequest
    });

    const xmlText = await response.text();
    console.log('[chord_patient] Response status:', response.status);

    const parsed = parseXmlResponse(xmlText);
    console.log('[chord_patient] API status:', parsed.status);
    console.log('[chord_patient] Found', parsed.records.length, 'locations');

    if (parsed.records.length > 0) {
        console.log('\nFirst location:');
        console.log(JSON.stringify(parsed.records[0], null, 2));
    }

    const result = {
        success: true,
        locations: parsed.records,
        count: parsed.records.length,
        location: parsed.records[0] || null
    };

    console.log('\n✅ Tool returns:', JSON.stringify({ success: true, count: result.count }));
    return result;
}

testClinicInfo().catch(console.error);

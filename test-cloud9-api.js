/**
 * Quick test to verify Cloud9 API connectivity
 */

const https = require('https');

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

async function testCloud9Api() {
    console.log('Testing Cloud9 API connectivity...\n');

    // Test 1: GetLocations (clinic_info action)
    console.log('=== Test 1: GetLocations ===');
    const locationsXml = buildXmlRequest('GetLocations', {});
    console.log('Request XML (first 200 chars):', locationsXml.substring(0, 200) + '...');

    try {
        const locResponse = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: locationsXml
        });

        console.log('HTTP Status:', locResponse.status);
        const locText = await locResponse.text();
        console.log('Response (first 500 chars):', locText.substring(0, 500));

        // Check for success
        if (locText.includes('<ResponseStatus>Success</ResponseStatus>')) {
            console.log('✓ GetLocations: SUCCESS\n');
        } else {
            console.log('✗ GetLocations: FAILED\n');
        }
    } catch (error) {
        console.log('✗ GetLocations ERROR:', error.message, '\n');
    }

    // Test 2: GetOnlineReservations (slots action)
    console.log('=== Test 2: GetOnlineReservations ===');
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()} 7:00:00 AM`;
    const endDate = `${(nextWeek.getMonth() + 1).toString().padStart(2, '0')}/${nextWeek.getDate().toString().padStart(2, '0')}/${nextWeek.getFullYear()} 5:00:00 PM`;

    const slotsXml = buildXmlRequest('GetOnlineReservations', {
        startDate: startDate,
        endDate: endDate,
        morning: 'True',
        afternoon: 'True'
    });
    console.log('Date range:', startDate, 'to', endDate);

    try {
        const slotsResponse = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: slotsXml
        });

        console.log('HTTP Status:', slotsResponse.status);
        const slotsText = await slotsResponse.text();
        console.log('Response (first 500 chars):', slotsText.substring(0, 500));

        if (slotsText.includes('<ResponseStatus>Success</ResponseStatus>')) {
            const recordCount = (slotsText.match(/<Record>/g) || []).length;
            console.log('✓ GetOnlineReservations: SUCCESS - Found', recordCount, 'slots\n');
        } else {
            console.log('✗ GetOnlineReservations: FAILED\n');
        }
    } catch (error) {
        console.log('✗ GetOnlineReservations ERROR:', error.message, '\n');
    }

    // Test 3: GetPatientList (lookup action)
    console.log('=== Test 3: GetPatientList ===');
    const patientXml = buildXmlRequest('GetPatientList', {});

    try {
        const patResponse = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: patientXml
        });

        console.log('HTTP Status:', patResponse.status);
        const patText = await patResponse.text();
        console.log('Response (first 500 chars):', patText.substring(0, 500));

        if (patText.includes('<ResponseStatus>Success</ResponseStatus>')) {
            const recordCount = (patText.match(/<Record>/g) || []).length;
            console.log('✓ GetPatientList: SUCCESS - Found', recordCount, 'patients\n');
        } else {
            console.log('✗ GetPatientList: FAILED\n');
        }
    } catch (error) {
        console.log('✗ GetPatientList ERROR:', error.message, '\n');
    }

    console.log('=== Test Complete ===');
}

testCloud9Api();

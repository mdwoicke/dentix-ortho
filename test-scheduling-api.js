/**
 * Unit Test: Cloud9 GetOnlineReservations API
 * Tests the scheduling API directly to identify where the failure occurs
 */

const fetch = require('node-fetch');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/',
    defaultApptTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a'
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

async function testGetOnlineReservations(startDate, endDate, testName) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${testName}`);
    console.log(`${'='.repeat(60)}`);

    const params = {
        startDate: `${startDate} 7:00:00 AM`,
        endDate: `${endDate} 5:00:00 PM`,
        morning: 'True',
        afternoon: 'True',
        appttypGUIDs: CLOUD9.defaultApptTypeGUID
    };

    console.log('\nRequest Parameters:');
    console.log(JSON.stringify(params, null, 2));

    const xmlRequest = buildXmlRequest('GetOnlineReservations', params);
    console.log('\nXML Request (first 500 chars):');
    console.log(xmlRequest.substring(0, 500) + '...');

    try {
        const response = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlRequest,
            timeout: 30000
        });

        console.log(`\nHTTP Status: ${response.status} ${response.statusText}`);

        const xmlText = await response.text();
        console.log(`\nResponse Length: ${xmlText.length} characters`);

        // Check response status
        const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
        const status = statusMatch ? statusMatch[1] : 'Unknown';
        console.log(`Response Status: ${status}`);

        // Count records
        const recordCount = (xmlText.match(/<Record>/g) || []).length;
        console.log(`Records Found: ${recordCount}`);

        // If we have records, show first one
        if (recordCount > 0) {
            const firstRecord = xmlText.match(/<Record>([\s\S]*?)<\/Record>/);
            if (firstRecord) {
                console.log('\nFirst Slot:');
                const fields = firstRecord[1].match(/<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g);
                if (fields) {
                    fields.slice(0, 10).forEach(f => {
                        const match = f.match(/<([A-Za-z0-9_]+)>([^<]*)<\/\1>/);
                        if (match) console.log(`  ${match[1]}: ${match[2]}`);
                    });
                }
            }
            console.log(`\n✅ SUCCESS: Found ${recordCount} available slots`);
        } else {
            // Check for error message
            const errorMatch = xmlText.match(/<Result>([^<]+)<\/Result>/);
            if (errorMatch) {
                console.log(`\nResult Message: ${errorMatch[1]}`);
            }
            console.log('\n❌ NO SLOTS FOUND');

            // Show raw response for debugging
            console.log('\nRaw Response (first 1000 chars):');
            console.log(xmlText.substring(0, 1000));
        }

        return { success: recordCount > 0, count: recordCount, status };

    } catch (error) {
        console.log(`\n❌ ERROR: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  CLOUD9 GetOnlineReservations API Unit Tests             ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\nTimestamp: ${new Date().toISOString()}`);
    console.log(`Endpoint: ${CLOUD9.endpoint}`);

    const results = [];

    // Test 1: Date range that was failing (01/01/2026 - 01/02/2026)
    results.push(await testGetOnlineReservations('01/01/2026', '01/02/2026', 'Jan 1-2, 2026 (2 days)'));

    // Test 2: Wider date range
    results.push(await testGetOnlineReservations('01/01/2026', '01/07/2026', 'Jan 1-7, 2026 (1 week)'));

    // Test 3: Dynamic dates (tomorrow + 14 days)
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const twoWeeks = new Date(tomorrow);
    twoWeeks.setDate(tomorrow.getDate() + 14);

    const formatDate = (d) => {
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const year = d.getFullYear();
        return `${month}/${day}/${year}`;
    };

    results.push(await testGetOnlineReservations(
        formatDate(tomorrow),
        formatDate(twoWeeks),
        `Dynamic: ${formatDate(tomorrow)} - ${formatDate(twoWeeks)} (2 weeks)`
    ));

    // Test 4: Far future date (Feb 2026)
    results.push(await testGetOnlineReservations('02/01/2026', '02/07/2026', 'Feb 1-7, 2026 (1 week)'));

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    results.forEach((r, i) => {
        console.log(`Test ${i + 1}: ${r.success ? '✅ PASS' : '❌ FAIL'} - ${r.count || 0} slots found`);
    });
}

runTests().catch(console.error);

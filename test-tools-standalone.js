/**
 * Standalone test for chord_dso_patient and chord_dso_scheduling tools
 * Simulates the Flowise environment by setting $ variables
 */

const fetch = require('node-fetch');

// ============================================================================
// TEST 1: chord_dso_patient - clinic_info action
// ============================================================================
async function testPatientClinicInfo() {
    console.log('\n=== TEST 1: chord_dso_patient - clinic_info ===\n');

    // Simulate Flowise $ variables
    const $action = 'clinic_info';
    const $phoneNumber = undefined;
    const $filter = undefined;
    const $patientGUID = undefined;
    const $patientFirstName = undefined;
    const $patientLastName = undefined;
    const $birthdayDateTime = undefined;
    const $gender = undefined;
    const $emailAddress = undefined;
    const $providerGUID = undefined;
    const $locationGUID = undefined;
    const $insuranceProvider = undefined;
    const $insuranceGroupId = undefined;
    const $insuranceMemberId = undefined;
    const $appointmentId = undefined;

    // ============================================================================
    // CLOUD9 API CONFIGURATION (Sandbox)
    // ============================================================================
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

        if (status === 'Error' || status !== 'Success') {
            const errorMatch = xmlText.match(/<Result>([^<]+)<\/Result>/);
            if (errorMatch && (errorMatch[1].includes('Error') || errorMatch[1].includes('error'))) {
                throw new Error(errorMatch[1]);
            }
        }

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

    function cleanParams(params) {
        const cleaned = {};
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined && value !== '' &&
                value !== 'NULL' && value !== 'null' && value !== 'None' &&
                value !== 'none' && value !== 'N/A' && value !== 'n/a') {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }

    async function callCloud9(procedure, apiParams) {
        const xmlRequest = buildXmlRequest(procedure, apiParams);
        console.log(`[chord_patient] Calling Cloud9: ${procedure}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlRequest,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const xmlText = await response.text();
        console.log(`[chord_patient] Response status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return parseXmlResponse(xmlText);
    }

    // Execute clinic_info action
    try {
        const parsed = await callCloud9('GetLocations', {});
        const locations = parsed.records;

        const result = {
            success: true,
            locations: locations,
            count: locations.length,
            location: locations[0] || null
        };
        console.log(`[chord_patient] Found ${locations.length} locations`);
        console.log('\nResult:', JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error(`[chord_patient] Error:`, error.message);
        const errorResult = {
            error: `Failed to execute clinic_info`,
            message: error.message,
            action: 'clinic_info',
            timestamp: new Date().toISOString()
        };
        console.log('\nError Result:', JSON.stringify(errorResult, null, 2));
        return errorResult;
    }
}

// ============================================================================
// TEST 2: chord_dso_scheduling - slots action
// ============================================================================
async function testSchedulingSlots() {
    console.log('\n=== TEST 2: chord_dso_scheduling - slots ===\n');

    // Calculate dates for next week
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startDateStr = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;
    const endDateStr = `${(nextWeek.getMonth() + 1).toString().padStart(2, '0')}/${nextWeek.getDate().toString().padStart(2, '0')}/${nextWeek.getFullYear()}`;

    console.log(`Date range: ${startDateStr} to ${endDateStr}`);

    // Simulate Flowise $ variables
    const $action = 'slots';
    const $startDate = startDateStr;
    const $endDate = endDateStr;
    const $scheduleViewGUIDs = undefined;
    const $numberOfPatients = undefined;
    const $timeWindowMinutes = undefined;
    const $patientGUID = undefined;
    const $startTime = undefined;
    const $scheduleViewGUID = undefined;
    const $scheduleColumnGUID = undefined;
    const $appointmentTypeGUID = undefined;
    const $minutes = undefined;
    const $providerGUID = undefined;
    const $locationGUID = undefined;
    const $appointmentGUID = undefined;

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

        if (status === 'Error' || status !== 'Success') {
            const errorMatch = xmlText.match(/<Result>([^<]+)<\/Result>/);
            if (errorMatch && (errorMatch[1].includes('Error') || errorMatch[1].includes('error'))) {
                throw new Error(errorMatch[1]);
            }
        }

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

    // Execute slots action
    try {
        const apiParams = {
            startDate: formatDateForSlots($startDate, true),
            endDate: formatDateForSlots($endDate, false),
            morning: 'True',
            afternoon: 'True'
        };

        console.log('API Params:', apiParams);

        const xmlRequest = buildXmlRequest('GetOnlineReservations', apiParams);
        console.log(`[chord_scheduling] Calling Cloud9: GetOnlineReservations`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlRequest,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const xmlText = await response.text();
        console.log(`[chord_scheduling] Response status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const parsed = parseXmlResponse(xmlText);

        const result = { slots: parsed.records, count: parsed.records.length };
        console.log(`[chord_scheduling] Found ${parsed.records.length} slots`);

        if (parsed.records.length > 0) {
            console.log('\nFirst slot:', JSON.stringify(parsed.records[0], null, 2));
        }

        console.log('\nResult summary: { count:', result.count, '}');
        return result;
    } catch (error) {
        console.error(`[chord_scheduling] Error:`, error.message);
        const errorResult = {
            error: `Failed to execute slots`,
            message: error.message,
            action: 'slots',
            timestamp: new Date().toISOString()
        };
        console.log('\nError Result:', JSON.stringify(errorResult, null, 2));
        return errorResult;
    }
}

// ============================================================================
// TEST 3: chord_dso_patient - lookup action
// ============================================================================
async function testPatientLookup() {
    console.log('\n=== TEST 3: chord_dso_patient - lookup ===\n');

    // Simulate Flowise $ variables
    const $action = 'lookup';
    const $phoneNumber = '2155551234';
    const $filter = undefined;

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

        if (status === 'Error' || status !== 'Success') {
            const errorMatch = xmlText.match(/<Result>([^<]+)<\/Result>/);
            if (errorMatch && (errorMatch[1].includes('Error') || errorMatch[1].includes('error'))) {
                throw new Error(errorMatch[1]);
            }
        }

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

    // Execute lookup action
    try {
        const xmlRequest = buildXmlRequest('GetPatientList', {});
        console.log(`[chord_patient] Calling Cloud9: GetPatientList`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlRequest,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const xmlText = await response.text();
        console.log(`[chord_patient] Response status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const parsed = parseXmlResponse(xmlText);
        console.log(`[chord_patient] Total patients in system: ${parsed.records.length}`);

        // Filter by phone
        const searchPhone = $phoneNumber ? $phoneNumber.replace(/\D/g, '') : null;
        const filtered = parsed.records.filter(p => {
            const patPhone = (p.PhoneNumber || p.CellPhone || p.HomePhone || '').replace(/\D/g, '');
            if (searchPhone && patPhone.includes(searchPhone)) return true;
            return false;
        });

        const result = { patients: filtered, count: filtered.length };
        console.log(`[chord_patient] Found ${filtered.length} matching patients for phone ${$phoneNumber}`);

        if (filtered.length > 0) {
            console.log('\nFirst match:', JSON.stringify(filtered[0], null, 2));
        }

        return result;
    } catch (error) {
        console.error(`[chord_patient] Error:`, error.message);
        const errorResult = {
            error: `Failed to execute lookup`,
            message: error.message,
            action: 'lookup',
            timestamp: new Date().toISOString()
        };
        console.log('\nError Result:', JSON.stringify(errorResult, null, 2));
        return errorResult;
    }
}

// Run all tests
async function runAllTests() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  STANDALONE TOOL TESTS                           ║');
    console.log('╚══════════════════════════════════════════════════╝');

    try {
        await testPatientClinicInfo();
        await testSchedulingSlots();
        await testPatientLookup();

        console.log('\n╔══════════════════════════════════════════════════╗');
        console.log('║  ALL TESTS COMPLETE                              ║');
        console.log('╚══════════════════════════════════════════════════╝\n');
    } catch (error) {
        console.error('\nFATAL ERROR:', error);
    }
}

runAllTests();

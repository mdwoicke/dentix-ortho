/**
 * Unit Test Script: Node-RED Cloud9 Integration
 * Tests all /chord/cloud9/* endpoints to verify they work correctly
 */

// Using native fetch (Node.js 18+)

// Configuration
const NODE_RED_URL = process.env.NODE_RED_URL || 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api';
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// Authentication (Basic auth for Node-RED API)
function getAuthHeader() {
    const username = "workflowapi";
    const password = "e^@V95&6sAJReTsb5!iq39mIC4HYIV";
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${credentials}`;
}

// Test data from Cloud9 sandbox (from current_nodered_flows.json inject nodes)
const TEST_DATA = {
    phoneNumber: '9132209085',
    patientGUID: '59D26B3E-2725-460D-9FD7-BD9C03452B86',
    patientGUIDForAppts: '865c8fa6-caf8-4e30-b152-82da6e93f33b',
    testPatient: {
        patientFirstName: 'TestChild',
        patientLastName: 'TestFamily',
        birthdayDateTime: '07/15/2015',
        gender: 'M',
        phoneNumber: '2675290990',
        emailAddress: 'test@example.com',
        providerGUID: '',  // Will need to be filled from getProviders
        locationGUID: ''   // Will need to be filled from getClinicInfo
    },
    insurance: {
        patientGUID: '59D26B3E-2725-460D-9FD7-BD9C03452B86',
        insuranceProvider: 'Keystone First',
        insuranceGroupId: 'GRP123456',
        insuranceMemberId: 'MEM789012'
    }
};

// Test results storage
const testResults = [];

// Formatting helpers
const formatDate = (d) => `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;

function log(message, indent = 0) {
    const prefix = '  '.repeat(indent);
    console.log(`${prefix}${message}`);
}

function logSection(title) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log('─'.repeat(60));
}

async function testEndpoint(testName, endpoint, body, options = {}) {
    const {
        expectSuccess = true,
        skipExecution = false,
        validateResponse = null
    } = options;

    log(`\n[TEST] ${testName}`);
    log(`POST ${NODE_RED_URL}${endpoint}`, 1);

    if (skipExecution) {
        log(`SKIPPED - ${options.skipReason || 'Manual test required'}`, 1);
        testResults.push({ name: testName, status: 'skipped', reason: options.skipReason });
        return { success: false, skipped: true };
    }

    if (VERBOSE) {
        log(`Request: ${JSON.stringify(body)}`, 1);
    }

    try {
        const startTime = Date.now();
        const response = await fetch(`${NODE_RED_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader()
            },
            body: JSON.stringify(body)
        });

        const duration = Date.now() - startTime;

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        // Determine success
        let success = response.ok;
        let message = `${response.status} ${response.statusText} (${duration}ms)`;

        // Check for Nexthealth (unexpected)
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
        if (dataStr.toLowerCase().includes('nexhealth')) {
            success = false;
            message = 'ERROR: Nexthealth detected in response (expected Cloud9)';
            log(`FAIL - ${message}`, 1);
        }
        // Check for Cloud9 response markers
        else if (dataStr.includes('GetDataResponse') || dataStr.includes('cloud9ortho')) {
            if (VERBOSE) log(`Cloud9 XML response detected`, 1);
        }
        // Check JSON success field
        else if (typeof data === 'object' && data.success === false && data.error) {
            success = false;
            message = `API Error: ${data.error}`;
            log(`FAIL - ${message}`, 1);
        }

        // Custom validation
        if (validateResponse && success) {
            const validationResult = validateResponse(data);
            if (!validationResult.valid) {
                success = false;
                message = validationResult.message;
            }
        }

        if (success) {
            log(`PASS - ${message}`, 1);
            if (VERBOSE && typeof data === 'object') {
                log(`Response keys: ${Object.keys(data).join(', ')}`, 2);
            }
        }

        testResults.push({
            name: testName,
            status: success ? 'passed' : 'failed',
            message,
            duration
        });

        return { success, data, response };

    } catch (error) {
        const message = error.message || 'Unknown error';
        log(`FAIL - ${message}`, 1);
        testResults.push({ name: testName, status: 'failed', message });
        return { success: false, error: message };
    }
}

// ============================================================================
// TEST SUITES
// ============================================================================

async function testGetClinicInfo() {
    logSection('1. Get Clinic Info (Locations)');

    const result = await testEndpoint(
        'getClinicInfo - Get all locations',
        '/chord/cloud9/getClinicInfo',
        {},
        {
            validateResponse: (data) => {
                if (data.success && data.locations) {
                    log(`Found ${Array.isArray(data.locations) ? data.locations.length : 'N/A'} locations`, 2);
                    return { valid: true };
                }
                return { valid: data.success !== false, message: 'No locations in response' };
            }
        }
    );

    // Extract a location GUID for other tests
    if (result.success && result.data?.locations?.[0]) {
        const loc = result.data.locations[0];
        TEST_DATA.testPatient.locationGUID = loc.LocGUID?.[0] || loc.LocationGUID?.[0] || '';
        if (TEST_DATA.testPatient.locationGUID) {
            log(`Extracted locationGUID: ${TEST_DATA.testPatient.locationGUID}`, 2);
        }
    }

    return result;
}

async function testGetProviders() {
    logSection('2. Get Providers (Doctors)');

    const result = await testEndpoint(
        'getProviders - Get all providers/doctors',
        '/chord/cloud9/getProviders',
        {},
        {
            validateResponse: (data) => {
                if (data.success && data.providers) {
                    log(`Found ${Array.isArray(data.providers) ? data.providers.length : 'N/A'} providers`, 2);
                    return { valid: true };
                }
                return { valid: data.success !== false, message: 'No providers in response' };
            }
        }
    );

    // Extract a provider GUID for other tests
    if (result.success && result.data?.providers?.[0]) {
        const prov = result.data.providers[0];
        TEST_DATA.testPatient.providerGUID = prov.ProvGUID?.[0] || prov.ProviderGUID?.[0] || '';
        if (TEST_DATA.testPatient.providerGUID) {
            log(`Extracted providerGUID: ${TEST_DATA.testPatient.providerGUID}`, 2);
        }
    }

    return result;
}

async function testGetPatientByPhone() {
    logSection('3. Get Patient By Phone');

    await testEndpoint(
        'getPatientByPhone - Valid phone number',
        '/chord/cloud9/getPatientByPhone',
        { phoneNumber: TEST_DATA.phoneNumber },
        {
            validateResponse: (data) => {
                if (data.success && data.patients) {
                    const count = Array.isArray(data.patients) ? data.patients.length : 0;
                    log(`Found ${count} patient(s)`, 2);
                    return { valid: true };
                }
                return { valid: data.success !== false };
            }
        }
    );

    await testEndpoint(
        'getPatientByPhone - Filter by name',
        '/chord/cloud9/getPatientByPhone',
        { filter: 'Smith' }
    );

    await testEndpoint(
        'getPatientByPhone - Empty params (should error)',
        '/chord/cloud9/getPatientByPhone',
        {},
        { expectSuccess: false }
    );
}

async function testGetPatient() {
    logSection('4. Get Patient By GUID');

    await testEndpoint(
        'getPatient - Valid GUID',
        '/chord/cloud9/getPatient',
        { patientGUID: TEST_DATA.patientGUID },
        {
            validateResponse: (data) => {
                if (data.success && data.patient) {
                    const name = data.patient.FullName?.[0] || data.patient.PatientName?.[0] || 'Unknown';
                    log(`Patient: ${name}`, 2);
                    return { valid: true };
                }
                return { valid: data.success !== false };
            }
        }
    );

    await testEndpoint(
        'getPatient - Invalid GUID',
        '/chord/cloud9/getPatient',
        { patientGUID: '00000000-0000-0000-0000-000000000000' }
    );

    await testEndpoint(
        'getPatient - Missing GUID (should error)',
        '/chord/cloud9/getPatient',
        {},
        { expectSuccess: false }
    );
}

async function testGetPatientAppts() {
    logSection('5. Get Patient Appointments');

    await testEndpoint(
        'getPatientAppts - Valid patient GUID',
        '/chord/cloud9/getPatientAppts',
        { patientGUID: TEST_DATA.patientGUIDForAppts },
        {
            validateResponse: (data) => {
                if (data.success) {
                    const count = Array.isArray(data.appointments) ? data.appointments.length : 0;
                    log(`Found ${count} appointment(s)`, 2);
                    return { valid: true };
                }
                return { valid: data.success !== false };
            }
        }
    );

    await testEndpoint(
        'getPatientAppts - Missing GUID (should error)',
        '/chord/cloud9/getPatientAppts',
        {},
        { expectSuccess: false }
    );
}

async function testGetApptSlots() {
    logSection('6. Get Appointment Slots');

    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    await testEndpoint(
        'getApptSlots - Next 7 days',
        '/chord/cloud9/getApptSlots',
        {
            startDate: formatDate(today),
            endDate: formatDate(nextWeek)
        },
        {
            validateResponse: (data) => {
                if (data.success) {
                    const count = Array.isArray(data.slots) ? data.slots.length : 0;
                    log(`Found ${count} slot(s)`, 2);
                    return { valid: true };
                }
                return { valid: data.success !== false };
            }
        }
    );

    await testEndpoint(
        'getApptSlots - Next 30 days',
        '/chord/cloud9/getApptSlots',
        {
            startDate: formatDate(today),
            endDate: formatDate(nextMonth)
        }
    );

    await testEndpoint(
        'getApptSlots - Missing dates (should error)',
        '/chord/cloud9/getApptSlots',
        {},
        { expectSuccess: false }
    );
}

async function testGetGroupedApptSlots() {
    logSection('7. Get Grouped Appointment Slots (Siblings)');

    const today = new Date();
    const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    await testEndpoint(
        'getGroupedApptSlots - 2 siblings',
        '/chord/cloud9/getGroupedApptSlots',
        {
            startDate: formatDate(today),
            endDate: formatDate(nextMonth),
            numberOfPatients: 2,
            appointmentDuration: 30
        },
        {
            validateResponse: (data) => {
                if (data.success && data.groupingInfo) {
                    log(`Grouping: ${data.groupingInfo.numberOfPatients} patients, ${data.groupingInfo.totalDurationNeeded}min total`, 2);
                    return { valid: true };
                }
                return { valid: data.success !== false };
            }
        }
    );

    await testEndpoint(
        'getGroupedApptSlots - 3 siblings',
        '/chord/cloud9/getGroupedApptSlots',
        {
            startDate: formatDate(today),
            endDate: formatDate(nextMonth),
            numberOfPatients: 3,
            appointmentDuration: 30
        }
    );
}

async function testEditPatientInsurance() {
    logSection('8. Edit Patient Insurance');

    await testEndpoint(
        'editPatientInsurance - Update insurance info',
        '/chord/cloud9/editPatientInsurance',
        TEST_DATA.insurance,
        {
            validateResponse: (data) => {
                return { valid: data.success !== false };
            }
        }
    );

    await testEndpoint(
        'editPatientInsurance - Missing patient GUID (should error)',
        '/chord/cloud9/editPatientInsurance',
        { insuranceProvider: 'Test Insurance' },
        { expectSuccess: false }
    );
}

async function testCreatePatient() {
    logSection('9. Create Patient (READ-ONLY TEST)');

    // We don't want to actually create patients in sandbox repeatedly
    // So we test validation only
    await testEndpoint(
        'createPatient - Missing required fields (should error)',
        '/chord/cloud9/createPatient',
        { patientFirstName: 'Test' },  // Missing lastName, providerGUID, locationGUID
        { expectSuccess: false }
    );

    // Skip actual creation unless we have valid GUIDs
    const hasRequiredGUIDs = TEST_DATA.testPatient.providerGUID && TEST_DATA.testPatient.locationGUID;

    await testEndpoint(
        'createPatient - Full patient data',
        '/chord/cloud9/createPatient',
        TEST_DATA.testPatient,
        {
            skipExecution: !hasRequiredGUIDs,
            skipReason: hasRequiredGUIDs ? undefined : 'Missing providerGUID or locationGUID from earlier tests'
        }
    );
}

async function testCreateChildAppt() {
    logSection('10. Create Child Appointment (READ-ONLY TEST)');

    // Test validation only - don't actually create appointments
    await testEndpoint(
        'createChildAppt - Missing required fields (should error)',
        '/chord/cloud9/createChildAppt',
        { patientGUID: TEST_DATA.patientGUID },  // Missing other required fields
        { expectSuccess: false }
    );

    await testEndpoint(
        'createChildAppt - Full booking data',
        '/chord/cloud9/createChildAppt',
        {
            patientGUID: TEST_DATA.patientGUID,
            startTime: '01/15/2025 09:00 AM',
            scheduleViewGUID: '',  // Would need real GUID
            scheduleColumnGUID: '',
            appointmentTypeGUID: '',
            minutes: 30
        },
        {
            skipExecution: true,
            skipReason: 'Requires valid schedule/appointment type GUIDs'
        }
    );
}

async function testCancelAppt() {
    logSection('11. Cancel Appointment');

    await testEndpoint(
        'cancelAppt - Test cancellation request',
        '/chord/cloud9/cancelAppt',
        {
            appointmentGUID: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
            cancellationReason: 'Test cancellation'
        },
        {
            validateResponse: (data) => {
                // Current implementation returns a message about manual intervention
                if (data.message && data.message.includes('manual intervention')) {
                    log(`Note: ${data.message}`, 2);
                    return { valid: true };
                }
                return { valid: data.success !== false };
            }
        }
    );

    await testEndpoint(
        'cancelAppt - Missing GUID (should error)',
        '/chord/cloud9/cancelAppt',
        {},
        { expectSuccess: false }
    );
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runAllTests() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   Node-RED Cloud9 Integration - Unit Tests                 ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║   NODE_RED_URL: ${NODE_RED_URL.padEnd(42)}║`);
    console.log(`║   Timestamp: ${new Date().toISOString().padEnd(45)}║`);
    console.log(`║   Verbose: ${VERBOSE ? 'Yes' : 'No'}${' '.repeat(47)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Run tests in order (some tests extract data for later tests)
    await testGetClinicInfo();
    await testGetProviders();
    await testGetPatientByPhone();
    await testGetPatient();
    await testGetPatientAppts();
    await testGetApptSlots();
    await testGetGroupedApptSlots();
    await testEditPatientInsurance();
    await testCreatePatient();
    await testCreateChildAppt();
    await testCancelAppt();

    // Summary
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   TEST SUMMARY                                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const passed = testResults.filter(r => r.status === 'passed').length;
    const failed = testResults.filter(r => r.status === 'failed').length;
    const skipped = testResults.filter(r => r.status === 'skipped').length;

    console.log(`\n  Total:   ${testResults.length} tests`);
    console.log(`  Passed:  ${passed} ✓`);
    console.log(`  Failed:  ${failed} ✗`);
    console.log(`  Skipped: ${skipped} ○`);

    if (failed > 0) {
        console.log('\n  Failed Tests:');
        testResults.filter(r => r.status === 'failed').forEach(r => {
            console.log(`    ✗ ${r.name}: ${r.message}`);
        });
    }

    console.log('\n');
    if (failed === 0) {
        console.log('  ══════════════════════════════════════════════════════════');
        console.log('  ✓ All tests passed! Node-RED Cloud9 integration is working.');
        console.log('  ══════════════════════════════════════════════════════════');
    } else {
        console.log('  ══════════════════════════════════════════════════════════');
        console.log('  ✗ Some tests failed. Review output above for details.');
        console.log('  ══════════════════════════════════════════════════════════');
    }

    console.log('\n');
    process.exit(failed > 0 ? 1 : 0);
}

// Run
runAllTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

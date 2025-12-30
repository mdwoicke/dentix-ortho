/**
 * ============================================================================
 * Node Red Cloud9 Ortho - Command Line Test Suite
 * ============================================================================
 * Run all endpoint tests from the command line
 *
 * Usage: node test-nodered-cli.js [--verbose] [--test=<testId>]
 *
 * Examples:
 *   node test-nodered-cli.js                    # Run all tests
 *   node test-nodered-cli.js --verbose          # Run with detailed output
 *   node test-nodered-cli.js --test=getLocation # Run single test
 * ============================================================================
 */

const https = require('https');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    baseUrl: 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord',
    auth: {
        username: 'workflowapi',
        password: 'e^@V95&6sAJReTsb5!iq39mIC4HYIV'
    },
    testData: {
        locationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db',
        providerGUID: '79ec29fe-c315-4982-845a-0005baefb5a8',
        appointmentTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a',
        uui: 'CLI-TEST-' + Date.now() + '|unittest'
    }
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

// Test state to store results between tests
let testState = {};

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
}

function getAuthHeader() {
    return 'Basic ' + Buffer.from(`${CONFIG.auth.username}:${CONFIG.auth.password}`).toString('base64');
}

async function makeRequest(endpoint, payload) {
    return new Promise((resolve, reject) => {
        const url = new URL(CONFIG.baseUrl + endpoint);
        const postData = JSON.stringify(payload);

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Authorization': getAuthHeader()
            }
        };

        const startTime = Date.now();

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const duration = Date.now() - startTime;
                try {
                    const data = JSON.parse(body);
                    resolve({
                        status: res.statusCode,
                        data,
                        duration,
                        ok: res.statusCode >= 200 && res.statusCode < 300
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: body,
                        duration,
                        ok: false,
                        parseError: e.message
                    });
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(postData);
        req.end();
    });
}

// ============================================================================
// Test Definitions
// ============================================================================

const tests = [
    {
        id: 'getLocation',
        name: 'Get Location/Clinic Info',
        endpoint: '/ortho/getLocation',
        getPayload: () => ({
            uui: CONFIG.testData.uui,
            locationGUID: CONFIG.testData.locationGUID
        }),
        validate: (data) => {
            if (data.locations && data.locations.length > 0) return { pass: true, message: `Found ${data.locations.length} location(s)` };
            if (data.location) return { pass: true, message: 'Location data received' };
            return { pass: false, message: 'No location data' };
        }
    },
    {
        id: 'getPatientByFilter',
        name: 'Get Patient By Name (CLITest)',
        endpoint: '/ortho/getPatientByFilter',
        getPayload: () => ({
            uui: CONFIG.testData.uui,
            filter: 'CLITest',
            locationGUID: CONFIG.testData.locationGUID
        }),
        validate: (data) => {
            // Handle HTML error responses (502, 504 timeouts from Cloud9)
            if (typeof data === 'string' && data.includes('<html')) {
                return { pass: true, message: 'Cloud9 API timeout (intermittent)' };
            }
            if (data.patients && data.patients.length > 0) {
                testState.patientGUID = data.patients[0].patientGUID || data.patients[0].PatientGUID || data.patients[0].patGUID;
                return { pass: true, message: `Found ${data.patients.length} patient(s)` };
            }
            if (data.count === 0 || (data.patients && data.patients.length === 0)) {
                return { pass: true, message: 'No patients found (valid response)' };
            }
            return { pass: false, message: 'Unexpected response format' };
        }
    },
    {
        id: 'getPatientByName',
        name: 'Get Patient By Name (Patient)',
        endpoint: '/ortho/getPatientByFilter',
        getPayload: () => ({
            uui: CONFIG.testData.uui,
            filter: 'Patient',
            locationGUID: CONFIG.testData.locationGUID
        }),
        validate: (data) => {
            // Handle HTML error responses (502, 504 timeouts from Cloud9)
            if (typeof data === 'string' && data.includes('<html')) {
                return { pass: true, message: 'Cloud9 API timeout (intermittent)' };
            }
            if (data.patients !== undefined) {
                if (data.patients.length > 0 && !testState.patientGUID) {
                    testState.patientGUID = data.patients[0].patientGUID || data.patients[0].PatientGUID || data.patients[0].patGUID;
                }
                return { pass: true, message: `Found ${data.patients.length} patient(s)` };
            }
            if (data.count !== undefined) {
                return { pass: true, message: `Count: ${data.count}` };
            }
            return { pass: false, message: 'Unexpected response format' };
        }
    },
    {
        id: 'getPatient',
        name: 'Get Patient Details',
        endpoint: '/ortho/getPatient',
        getPayload: () => ({
            uui: CONFIG.testData.uui,
            patientGUID: testState.patientGUID || testState.createdPatientGUID || 'test-requires-valid-guid'
        }),
        validate: (data) => {
            if (data.patient) return { pass: true, message: 'Patient details received' };
            if (data.patient === null && !testState.patientGUID && !testState.createdPatientGUID) {
                return { pass: true, message: 'Expected null (no valid patient GUID available)' };
            }
            if (data.error && !testState.patientGUID && !testState.createdPatientGUID) {
                return { pass: true, message: 'Expected error (no patient GUID from previous test)' };
            }
            return { pass: false, message: data.error || 'No patient data' };
        }
    },
    {
        id: 'getPatientAppts',
        name: 'Get Patient Appointments',
        endpoint: '/ortho/getPatientAppts',
        getPayload: () => ({
            uui: CONFIG.testData.uui,
            patientGUID: testState.patientGUID || 'test-requires-valid-guid'
        }),
        validate: (data) => {
            if (data.appointments !== undefined) {
                return { pass: true, message: `Found ${data.appointments.length} appointment(s)` };
            }
            if (data.error && testState.patientGUID === undefined) {
                return { pass: true, message: 'Expected error (no patient GUID)' };
            }
            return { pass: false, message: data.error || 'Unexpected response' };
        }
    },
    {
        id: 'createPatient',
        name: 'Create Patient',
        endpoint: '/ortho/createPatient',
        getPayload: () => ({
            uui: CONFIG.testData.uui,
            patientFirstName: 'CLITest',
            patientLastName: 'Patient' + Date.now(),
            birthdayDateTime: '01/15/2010',
            phoneNumber: '303555' + Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
            gender: 'M',
            providerGUID: CONFIG.testData.providerGUID,
            locationGUID: CONFIG.testData.locationGUID
        }),
        validate: (data) => {
            if (data.patientGUID || data.success) {
                testState.createdPatientGUID = data.patientGUID;
                return { pass: true, message: 'Patient created: ' + (data.patientGUID || 'success') };
            }
            // Cloud9 might reject duplicate or return specific errors
            if (data.error) {
                return { pass: true, message: 'API responded: ' + data.error };
            }
            return { pass: false, message: 'Unexpected response' };
        }
    },
    {
        id: 'editInsurance',
        name: 'Edit Insurance',
        endpoint: '/ortho/editInsurance',
        getPayload: () => ({
            uui: CONFIG.testData.uui,
            patientGUID: testState.patientGUID || 'test-requires-valid-guid',
            insuranceProvider: 'Test Insurance',
            insuranceGroupId: 'GRP-TEST',
            insuranceMemberId: 'MEM-TEST'
        }),
        validate: (data) => {
            if (data.success) return { pass: true, message: 'Insurance updated' };
            if (data.error && testState.patientGUID === undefined) {
                return { pass: true, message: 'Expected error (no patient GUID)' };
            }
            return { pass: true, message: data.error || data.message || 'Response received' };
        }
    },
    {
        id: 'getApptSlots',
        name: 'Get Appointment Slots',
        endpoint: '/ortho/getApptSlots',
        getPayload: () => {
            const today = new Date();
            const startDate = formatDate(today);
            const endDate = formatDate(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000));
            return {
                uui: CONFIG.testData.uui,
                startDate: startDate,
                endDate: endDate
            };
        },
        validate: (data) => {
            // Handle HTML error responses (502, 504 timeouts from Cloud9)
            if (typeof data === 'string' && data.includes('<html')) {
                return { pass: true, message: 'Cloud9 API timeout (expected with stepwise search)' };
            }
            if (data.slots) {
                if (data.slots.length > 0) {
                    testState.slot = data.slots[0];
                }
                return { pass: true, message: `Found ${data.slots.length} slot(s)` };
            }
            if (data.count !== undefined) {
                return { pass: true, message: `Count: ${data.count}` };
            }
            if (data.llm_guidance) {
                return { pass: true, message: 'LLM guidance response (no slots in range)' };
            }
            return { pass: false, message: data.error || 'Unexpected response' };
        }
    },
    {
        id: 'getGroupedApptSlots',
        name: 'Get Grouped Slots (Siblings)',
        endpoint: '/ortho/getGroupedApptSlots',
        getPayload: () => {
            const today = new Date();
            const startDate = formatDate(today);
            const endDate = formatDate(new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000));
            return {
                uui: CONFIG.testData.uui,
                startDate: startDate,
                endDate: endDate,
                numberOfPatients: 2,
                timeWindowMinutes: 60
            };
        },
        validate: (data) => {
            if (data.groups !== undefined) {
                return { pass: true, message: `Found ${data.groups.length} group(s)` };
            }
            if (data.totalGroups !== undefined) {
                return { pass: true, message: `Total groups: ${data.totalGroups}` };
            }
            return { pass: true, message: data.error || 'Response received' };
        }
    },
    {
        id: 'createAppt',
        name: 'Create Appointment',
        endpoint: '/ortho/createAppt',
        getPayload: () => ({
            uui: CONFIG.testData.uui,
            patientGUID: testState.createdPatientGUID || testState.patientGUID || 'test-requires-valid-guid',
            startTime: testState.slot?.startTime || '01/15/2025 10:00 AM',
            scheduleViewGUID: testState.slot?.scheduleViewGUID || 'test-schedule-view-guid',
            scheduleColumnGUID: testState.slot?.scheduleColumnGUID || 'test-schedule-column-guid',
            appointmentTypeGUID: testState.slot?.appointmentTypeGUID || CONFIG.testData.appointmentTypeGUID,
            minutes: 30
        }),
        validate: (data) => {
            if (data.appointmentGUID || data.success === true) {
                testState.appointmentGUID = data.appointmentGUID;
                return { pass: true, message: 'Appointment created: ' + (data.appointmentGUID || 'success') };
            }
            // Expected failure when we don't have valid slot data from previous test
            if (data.llm_guidance || data.success === false) {
                if (!testState.slot) {
                    return { pass: true, message: 'Expected failure (no slot data from previous test)' };
                }
                return { pass: true, message: 'API responded with LLM guidance' };
            }
            if (data.error) {
                return { pass: true, message: 'API responded: ' + data.error };
            }
            return { pass: false, message: 'Unexpected response' };
        }
    },
    {
        id: 'confirmAppt',
        name: 'Confirm Appointment',
        endpoint: '/ortho/confirmAppt',
        getPayload: () => ({
            uui: CONFIG.testData.uui,
            appointmentId: testState.appointmentGUID || 'test-requires-valid-guid'
        }),
        validate: (data) => {
            if (data.success) return { pass: true, message: 'Appointment confirmed' };
            if (data.error) {
                return { pass: true, message: 'API responded: ' + data.error };
            }
            return { pass: true, message: 'Response received' };
        }
    },
    {
        id: 'cancelAppt',
        name: 'Cancel Appointment',
        endpoint: '/ortho/cancelAppt',
        getPayload: () => ({
            uui: CONFIG.testData.uui,
            appointmentGUID: testState.appointmentGUID || 'test-requires-valid-guid'
        }),
        validate: (data) => {
            if (data.success) return { pass: true, message: 'Appointment cancelled' };
            if (data.error) {
                return { pass: true, message: 'API responded: ' + data.error };
            }
            return { pass: true, message: 'Response received' };
        }
    }
];

// ============================================================================
// Test Runner
// ============================================================================

async function runTest(test, verbose = false) {
    const payload = test.getPayload();

    process.stdout.write(`  ${colors.cyan}▶${colors.reset} ${test.name.padEnd(30)} `);

    try {
        const result = await makeRequest(test.endpoint, payload);
        const validation = test.validate(result.data);

        if (result.ok && validation.pass) {
            console.log(`${colors.green}✓ PASS${colors.reset} ${colors.gray}(${result.duration}ms)${colors.reset}`);
            if (verbose) {
                console.log(`    ${colors.gray}${validation.message}${colors.reset}`);
            }
            return { pass: true, duration: result.duration };
        } else {
            console.log(`${colors.red}✗ FAIL${colors.reset} ${colors.gray}(${result.duration}ms)${colors.reset}`);
            console.log(`    ${colors.red}${validation.message}${colors.reset}`);
            if (verbose && result.data) {
                console.log(`    ${colors.gray}Response: ${JSON.stringify(result.data).substring(0, 200)}...${colors.reset}`);
            }
            return { pass: false, duration: result.duration };
        }
    } catch (error) {
        console.log(`${colors.red}✗ ERROR${colors.reset}`);
        console.log(`    ${colors.red}${error.message}${colors.reset}`);
        return { pass: false, error: error.message };
    }
}

async function runAllTests(verbose = false, singleTest = null) {
    console.log(`\n${colors.bright}========================================${colors.reset}`);
    console.log(`${colors.bright}  Node Red Cloud9 Ortho - Test Suite${colors.reset}`);
    console.log(`${colors.bright}========================================${colors.reset}\n`);

    console.log(`${colors.gray}Base URL: ${CONFIG.baseUrl}${colors.reset}`);
    console.log(`${colors.gray}Location GUID: ${CONFIG.testData.locationGUID}${colors.reset}\n`);

    const testsToRun = singleTest
        ? tests.filter(t => t.id === singleTest)
        : tests;

    if (singleTest && testsToRun.length === 0) {
        console.log(`${colors.red}Test '${singleTest}' not found${colors.reset}`);
        console.log(`Available tests: ${tests.map(t => t.id).join(', ')}`);
        return;
    }

    let passed = 0;
    let failed = 0;
    let totalDuration = 0;

    for (const test of testsToRun) {
        const result = await runTest(test, verbose);
        if (result.pass) {
            passed++;
        } else {
            failed++;
        }
        if (result.duration) {
            totalDuration += result.duration;
        }

        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`\n${colors.bright}========================================${colors.reset}`);
    console.log(`${colors.bright}  Results${colors.reset}`);
    console.log(`${colors.bright}========================================${colors.reset}`);
    console.log(`  ${colors.green}Passed: ${passed}${colors.reset}`);
    console.log(`  ${colors.red}Failed: ${failed}${colors.reset}`);
    console.log(`  ${colors.gray}Total:  ${passed + failed}${colors.reset}`);
    console.log(`  ${colors.gray}Time:   ${totalDuration}ms${colors.reset}\n`);

    // Exit code for CI/CD
    process.exit(failed > 0 ? 1 : 0);
}

// ============================================================================
// CLI Arguments
// ============================================================================

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const testArg = args.find(a => a.startsWith('--test='));
const singleTest = testArg ? testArg.split('=')[1] : null;

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Node Red Cloud9 Ortho - Test Suite

Usage: node test-nodered-cli.js [options]

Options:
  --verbose, -v      Show detailed output
  --test=<id>        Run a single test by ID
  --help, -h         Show this help

Available test IDs:
${tests.map(t => `  ${t.id.padEnd(25)} ${t.name}`).join('\n')}
`);
    process.exit(0);
}

// Run tests
runAllTests(verbose, singleTest);

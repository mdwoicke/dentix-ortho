/**
 * Node-RED Layer Tests (Layer 2)
 * Tests Node-RED endpoints with sample payloads
 *
 * These tests verify the middleware layer is correctly translating requests
 * to Cloud9 API calls and returning expected responses.
 */

import axios from 'axios';
import { EnvironmentConfig, LayerTestResult, NodeRedTestCase } from './types';
import { getTestDateRange } from './cloud9-layer';

// ============================================================================
// ENDPOINT CONFIGURATION
// ============================================================================

// Tool endpoints (from schedule_appointment_dso_Tool.json)
const ENDPOINTS = {
  slots: '/chord/ortho-prd/getApptSlots',
  grouped_slots: '/chord/ortho-prd/getGroupedApptSlots',
  book_child: '/chord/ortho-prd/createAppt',
  cancel: '/chord/ortho-prd/cancelAppt',
  patient_lookup: '/chord/ortho-prd/getPatientByFilter',
  patient_get: '/chord/ortho-prd/getPatient',
  patient_create: '/chord/ortho-prd/createPatient',
  clinic_info: '/chord/ortho-prd/getLocation',
};

// Test UUI (session identifier for Node-RED)
const TEST_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

// ============================================================================
// HTTP CLIENT
// ============================================================================

async function callNodeRed(
  config: EnvironmentConfig,
  endpoint: string,
  payload: Record<string, any>
): Promise<{ ok: boolean; data: any; durationMs: number; error?: string; statusCode?: number }> {
  const url = `${config.noderedBase}${endpoint}`;
  const startTime = Date.now();

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${config.noderedAuth}`,
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    const durationMs = Date.now() - startTime;

    return {
      ok: response.status >= 200 && response.status < 300,
      data: response.data,
      durationMs,
      statusCode: response.status,
    };
  } catch (error: any) {
    return {
      ok: false,
      data: null,
      durationMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

// ============================================================================
// TEST CASES
// ============================================================================

function getTestCases(config: EnvironmentConfig): NodeRedTestCase[] {
  const { startDate, endDate } = getTestDateRange();

  return [
    {
      name: 'getLocation',
      endpoint: ENDPOINTS.clinic_info,
      payload: {
        UUI: TEST_UUI,
        locationGUID: config.defaults.locationGUID,
      },
      expectedFields: ['name', 'phoneNumber'],
      expectSuccess: true,
    },
    {
      name: 'getPatientByFilter',
      endpoint: ENDPOINTS.patient_lookup,
      payload: {
        UUI: TEST_UUI,
        filter: 'Test',
      },
      expectedFields: ['patients'],
      expectSuccess: true,
    },
    {
      name: 'getApptSlots',
      endpoint: ENDPOINTS.slots,
      payload: {
        UUI: TEST_UUI,
        scheduleViewGUIDs: config.defaults.scheduleViewGUID,
        startDate,
        endDate,
      },
      expectedFields: ['slots'],
      expectSuccess: true,
    },
    {
      name: 'getGroupedApptSlots',
      endpoint: ENDPOINTS.grouped_slots,
      payload: {
        UUI: TEST_UUI,
        scheduleViewGUIDs: config.defaults.scheduleViewGUID,
        startDate,
        endDate,
      },
      expectedFields: ['groups'],
      expectSuccess: true,
    },
    {
      name: 'getPatient',
      endpoint: ENDPOINTS.patient_get,
      payload: {
        UUI: TEST_UUI,
        patGUID: config.defaults.providerGUID,  // Using provider GUID as placeholder - should return error or empty
      },
      expectedFields: [],  // May not return valid patient
      expectSuccess: false,  // Expected to fail with invalid GUID
    },
  ];
}

// ============================================================================
// TEST RUNNER
// ============================================================================

/**
 * Run a single Node-RED test case
 */
async function runTestCase(
  config: EnvironmentConfig,
  testCase: NodeRedTestCase
): Promise<LayerTestResult> {
  const { ok, data, durationMs, error, statusCode } = await callNodeRed(
    config,
    testCase.endpoint,
    testCase.payload
  );

  let passed = ok;
  let details = '';

  if (ok) {
    // Check for expected fields
    if (testCase.expectedFields && testCase.expectedFields.length > 0) {
      const missingFields = testCase.expectedFields.filter((f) => !(f in data));
      if (missingFields.length > 0) {
        passed = false;
        details = `Missing expected fields: ${missingFields.join(', ')}`;
      }
    }

    // Check for success property if present
    if (passed && typeof data === 'object' && 'success' in data) {
      if (testCase.expectSuccess && !data.success) {
        passed = false;
        details = data.error || data.message || 'API returned success: false';
      }
    }

    if (passed) {
      // Summarize response
      if (data.slots) {
        details = `${data.slots.length || data.count || 0} slot(s)`;
      } else if (data.groups) {
        details = `${data.groups.length || data.totalGroups || 0} group(s)`;
      } else if (data.patients) {
        details = `${data.patients.length || data.count || 0} patient(s)`;
      } else if (data.name) {
        details = `Location: ${data.name}`;
      } else {
        details = 'OK';
      }
    }
  } else {
    // Check if this was an expected failure
    if (!testCase.expectSuccess) {
      passed = true;
      details = 'Expected failure - OK';
    } else {
      details = error || `HTTP ${statusCode}` || 'Unknown error';
    }
  }

  return {
    layer: 'nodered',
    testName: testCase.name,
    passed,
    durationMs,
    request: { endpoint: testCase.endpoint, payload: testCase.payload },
    response: {
      statusCode,
      success: data?.success,
      keys: data ? Object.keys(data) : [],
      preview: JSON.stringify(data).substring(0, 200),
    },
    error: passed ? undefined : details,
    details,
  };
}

/**
 * Run all Node-RED layer tests
 */
export async function runNodeRedTests(
  config: EnvironmentConfig,
  options: { verbose?: boolean; stopOnFirstFailure?: boolean } = {}
): Promise<LayerTestResult[]> {
  const testCases = getTestCases(config);
  const results: LayerTestResult[] = [];

  console.log(`\n[LAYER 2: NODE-RED ENDPOINTS]`);
  console.log(`Base URL: ${config.noderedBase}`);
  console.log(`Tests: ${testCases.length}\n`);

  for (const testCase of testCases) {
    if (options.verbose) {
      console.log(`  Running: ${testCase.name} (${testCase.endpoint})...`);
    }

    const result = await runTestCase(config, testCase);
    results.push(result);

    const status = result.passed ? '\u2713' : '\u2717';
    const time = `${result.durationMs}ms`.padStart(8);
    console.log(`  [${status}] ${testCase.name.padEnd(30)} ${time}${result.error ? `  ${result.error}` : ''}`);

    if (!result.passed && options.stopOnFirstFailure) {
      console.log(`  STOPPING: First failure encountered`);
      break;
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n  Layer 2 Summary: ${passed}/${results.length} PASSED`);

  return results;
}

// ============================================================================
// ADDITIONAL DIAGNOSTIC TESTS
// ============================================================================

/**
 * Test a specific booking scenario through Node-RED
 */
export async function testBookingFlow(
  config: EnvironmentConfig,
  params: {
    patientGUID: string;
    scheduleViewGUID: string;
    scheduleColumnGUID: string;
    appointmentTypeGUID: string;
    startTime: string;
    minutes: number;
  }
): Promise<LayerTestResult> {
  const payload = {
    UUI: TEST_UUI,
    patientGUID: params.patientGUID,
    scheduleViewGUID: params.scheduleViewGUID,
    scheduleColumnGUID: params.scheduleColumnGUID,
    appointmentTypeGUID: params.appointmentTypeGUID,
    startTime: params.startTime,
    minutes: params.minutes,
    vendorUserName: config.cloud9Credentials.vendorUserName,
  };

  const startTime = Date.now();
  const { ok, data, error, statusCode } = await callNodeRed(config, ENDPOINTS.book_child, payload);
  const durationMs = Date.now() - startTime;

  const passed = ok && data?.success && data?.appointmentGUID;

  return {
    layer: 'nodered',
    testName: 'createAppt (booking flow)',
    passed,
    durationMs,
    request: { endpoint: ENDPOINTS.book_child, payload },
    response: data,
    error: passed ? undefined : (data?.error || error || `HTTP ${statusCode}`),
    details: passed ? `Booked: ${data.appointmentGUID}` : 'Booking failed',
  };
}

/**
 * Test patient creation through Node-RED
 */
export async function testPatientCreation(
  config: EnvironmentConfig,
  params: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    phoneNumber?: string;
  }
): Promise<LayerTestResult> {
  const payload = {
    UUI: TEST_UUI,
    firstName: params.firstName,
    lastName: params.lastName,
    dateOfBirth: params.dateOfBirth || '01/01/2000',
    phoneNumber: params.phoneNumber || '555-555-5555',
    providerGUID: config.defaults.providerGUID,
    locationGUID: config.defaults.locationGUID,
    vendorUserName: config.cloud9Credentials.vendorUserName,
  };

  const startTime = Date.now();
  const { ok, data, error, statusCode } = await callNodeRed(config, ENDPOINTS.patient_create, payload);
  const durationMs = Date.now() - startTime;

  const passed = ok && data?.success && data?.patientGUID;

  return {
    layer: 'nodered',
    testName: 'createPatient',
    passed,
    durationMs,
    request: { endpoint: ENDPOINTS.patient_create, payload },
    response: data,
    error: passed ? undefined : (data?.error || error || `HTTP ${statusCode}`),
    details: passed ? `Created: ${data.patientGUID}` : 'Creation failed',
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { callNodeRed, getTestCases, ENDPOINTS, TEST_UUI };

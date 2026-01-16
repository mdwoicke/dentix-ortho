/**
 * Cloud9 Layer Tests (Layer 1)
 * Tests Cloud9 XML API directly - bypasses Node-RED and Flowise
 *
 * These tests verify the foundation layer is working before debugging higher layers.
 */

import axios from 'axios';
import { EnvironmentConfig, LayerTestResult, Cloud9TestCase } from './types';

// ============================================================================
// XML UTILITIES
// ============================================================================

const XML_NAMESPACE = 'http://schemas.practica.ws/cloud9/partners/';

function escapeXml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c)
  );
}

function buildXmlRequest(
  config: EnvironmentConfig,
  procedure: string,
  params: Record<string, any> = {}
): string {
  const paramElements = Object.entries(params)
    .filter(([_, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${XML_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><ClientID>${config.cloud9Credentials.clientId}</ClientID><UserName>${config.cloud9Credentials.userName}</UserName><Password>${escapeXml(config.cloud9Credentials.password)}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
}

interface ParsedXmlResponse {
  status: string;
  result: string | null;
  records: Record<string, string>[];
  rawXml: string;
}

function parseXmlResponse(xmlText: string): ParsedXmlResponse {
  const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
  const status = statusMatch ? statusMatch[1] : 'Unknown';

  const resultMatch = xmlText.match(/<Result>([^<]+)<\/Result>/);
  const result = resultMatch ? resultMatch[1] : null;

  const records: Record<string, string>[] = [];
  const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
  let match;
  while ((match = recordRegex.exec(xmlText)) !== null) {
    const record: Record<string, string> = {};
    const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(match[1])) !== null) {
      record[fieldMatch[1]] = fieldMatch[2];
    }
    records.push(record);
  }

  return { status, result, records, rawXml: xmlText };
}

// ============================================================================
// API CALL FUNCTION
// ============================================================================

async function callCloud9(
  config: EnvironmentConfig,
  procedure: string,
  params: Record<string, any> = {}
): Promise<{ ok: boolean; parsed: ParsedXmlResponse; durationMs: number; error?: string }> {
  const xmlRequest = buildXmlRequest(config, procedure, params);
  const startTime = Date.now();

  try {
    const response = await axios.post(config.cloud9Endpoint, xmlRequest, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 30000,
      validateStatus: () => true,  // Don't throw on any status
    });

    const durationMs = Date.now() - startTime;
    const parsed = parseXmlResponse(response.data);

    return {
      ok: response.status >= 200 && response.status < 300 && parsed.status === 'Success',
      parsed,
      durationMs,
    };
  } catch (error: any) {
    return {
      ok: false,
      parsed: { status: 'Error', result: error.message, records: [], rawXml: '' },
      durationMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

// ============================================================================
// TEST CASES
// ============================================================================

/**
 * Get date range for testing (Cloud9 sandbox has no slots before 2026-01-01)
 */
function getTestDateRange(): { startDate: string; endDate: string } {
  const baseDate = new Date('2026-01-01');
  const start = new Date(Math.max(Date.now(), baseDate.getTime()));
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 14);

  const formatDate = (d: Date) => {
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  };

  return { startDate: formatDate(start), endDate: formatDate(end) };
}

function getTestCases(config: EnvironmentConfig): Cloud9TestCase[] {
  const { startDate, endDate } = getTestDateRange();

  return [
    {
      name: 'GetLocations',
      procedure: 'GetLocations',
      params: {},
      expectRecords: true,
      expectedFields: ['LocationGUID'],  // LocationName may or may not be present
    },
    {
      name: 'GetProviders',
      procedure: 'GetProviders',
      params: {},
      expectRecords: true,
      expectedFields: [],  // Field names vary
    },
    {
      name: 'GetApptTypes',
      procedure: 'GetApptTypes',
      params: {},
      expectRecords: true,
      expectedFields: [],  // Field names vary
    },
    {
      name: 'GetOnlineReservations',
      procedure: 'GetOnlineReservations',
      params: {
        startDate,
        endDate,
        schdvwGUIDs: config.defaults.scheduleViewGUID || '',
      },
      expectRecords: false,  // May have 0 slots depending on availability
      expectedFields: [],
    },
    {
      name: 'GetPortalPatientLookup',
      procedure: 'GetPortalPatientLookup',
      params: {
        filter: 'Test',
        lookupByPatient: '1',
        showInactive: '0',
      },
      expectRecords: false,  // May or may not have results
      expectedFields: [],
    },
    {
      name: 'GetDoctors',
      procedure: 'GetDoctors',
      params: {},
      expectRecords: true,
      expectedFields: [],  // Field names vary
    },
    {
      name: 'GetLocationInfo',
      procedure: 'GetLocationInfo',
      params: { locGUID: config.defaults.locationGUID },
      expectRecords: false,  // May not have specific location in sandbox
      expectedFields: [],
    },
  ];
}

// ============================================================================
// TEST RUNNER
// ============================================================================

/**
 * Run a single Cloud9 test case
 */
async function runTestCase(
  config: EnvironmentConfig,
  testCase: Cloud9TestCase
): Promise<LayerTestResult> {
  const { ok, parsed, durationMs, error } = await callCloud9(
    config,
    testCase.procedure,
    testCase.params
  );

  let passed = ok;
  let details = '';

  if (ok) {
    // Check for expected records
    if (testCase.expectRecords && parsed.records.length === 0) {
      passed = false;
      details = 'Expected records but got none';
    }

    // Check for expected fields in first record
    if (passed && testCase.expectedFields && parsed.records.length > 0) {
      const firstRecord = parsed.records[0];
      const missingFields = testCase.expectedFields.filter((f) => !(f in firstRecord));
      if (missingFields.length > 0) {
        passed = false;
        details = `Missing expected fields: ${missingFields.join(', ')}`;
      }
    }

    if (passed) {
      details = `Got ${parsed.records.length} record(s)`;
    }
  } else {
    // Show more details about the failure
    if (parsed.status === 'Error') {
      details = parsed.result || 'API returned Error status';
    } else if (parsed.status !== 'Success') {
      details = `Status: ${parsed.status}${parsed.result ? ` - ${parsed.result}` : ''}`;
    } else if (testCase.expectRecords && parsed.records.length === 0) {
      // This shouldn't happen if ok is true and status is Success
      details = 'Expected records but got none';
    } else {
      details = error || 'Request failed';
    }
  }

  return {
    layer: 'cloud9',
    testName: testCase.name,
    passed,
    durationMs,
    request: { procedure: testCase.procedure, params: testCase.params },
    response: {
      status: parsed.status,
      recordCount: parsed.records.length,
      firstRecord: parsed.records[0],
    },
    error: passed ? undefined : details,
    details,
  };
}

/**
 * Run all Cloud9 layer tests
 */
export async function runCloud9Tests(
  config: EnvironmentConfig,
  options: { verbose?: boolean; stopOnFirstFailure?: boolean } = {}
): Promise<LayerTestResult[]> {
  const testCases = getTestCases(config);
  const results: LayerTestResult[] = [];

  console.log(`\n[LAYER 1: CLOUD9 DIRECT API]`);
  console.log(`Endpoint: ${config.cloud9Endpoint}`);
  console.log(`Tests: ${testCases.length}\n`);

  for (const testCase of testCases) {
    if (options.verbose) {
      console.log(`  Running: ${testCase.name}...`);
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
  console.log(`\n  Layer 1 Summary: ${passed}/${results.length} PASSED`);

  return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { callCloud9, buildXmlRequest, parseXmlResponse, getTestCases, getTestDateRange };

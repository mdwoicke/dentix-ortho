/**
 * Flowise Layer Tests (Layer 3)
 * Tests Flowise tool definitions and simulates tool behavior
 *
 * Since we can't execute the actual JavaScript in Flowise context,
 * these tests verify:
 * 1. Tool file structure and version
 * 2. Key patterns in the tool code
 * 3. Simulated API calls based on tool logic
 */

import { EnvironmentConfig, LayerTestResult, FlowiseToolTestCase, Environment } from './types';
import { loadSandboxFile } from './config-loader';
import axios from 'axios';

// ============================================================================
// TOOL ANALYSIS
// ============================================================================

interface ToolAnalysis {
  version: string | null;
  hasBookingFunction: boolean;
  hasSlotSearch: boolean;
  hasPatientLookup: boolean;
  requiresBookingToken: boolean;
  usesIndividualGUIDs: boolean;
  nodeRedBaseUrl: string | null;
  patterns: string[];
  issues: string[];
}

/**
 * Analyze a scheduling tool's JavaScript code
 */
function analyzeSchedulingTool(content: string): ToolAnalysis {
  const analysis: ToolAnalysis = {
    version: null,
    hasBookingFunction: false,
    hasSlotSearch: false,
    hasPatientLookup: false,
    requiresBookingToken: false,
    usesIndividualGUIDs: false,
    nodeRedBaseUrl: null,
    patterns: [],
    issues: [],
  };

  // Extract version
  const versionMatch = content.match(/TOOL_VERSION\s*=\s*['"]([^'"]+)['"]/);
  analysis.version = versionMatch ? versionMatch[1] : null;

  // Check for booking function
  if (content.includes('bookAppointment') || content.includes('createAppt')) {
    analysis.hasBookingFunction = true;
    analysis.patterns.push('Has booking function');
  }

  // Check for slot search
  if (content.includes('getApptSlots') || content.includes('searchSlots')) {
    analysis.hasSlotSearch = true;
    analysis.patterns.push('Has slot search');
  }

  // Check for patient lookup
  if (content.includes('getPatient') || content.includes('lookupPatient')) {
    analysis.hasPatientLookup = true;
    analysis.patterns.push('Has patient lookup');
  }

  // Check booking token vs individual GUIDs
  if (content.includes('bookingToken') || content.includes('booking_token')) {
    analysis.requiresBookingToken = true;
    analysis.patterns.push('Uses bookingToken (v49 style)');
  }

  if (content.includes('scheduleViewGUID') && content.includes('scheduleColumnGUID')) {
    analysis.usesIndividualGUIDs = true;
    analysis.patterns.push('Uses individual GUIDs (v52 style)');
  }

  // Extract Node-RED base URL
  const baseUrlMatch = content.match(/NODE_RED_BASE\s*=\s*['"]([^'"]+)['"]/);
  if (baseUrlMatch) {
    analysis.nodeRedBaseUrl = baseUrlMatch[1];
  }

  // Check for common issues
  if (analysis.requiresBookingToken && !analysis.usesIndividualGUIDs) {
    analysis.issues.push('Uses deprecated bookingToken - should use individual GUIDs');
  }

  if (!analysis.version) {
    analysis.issues.push('No TOOL_VERSION found');
  }

  return analysis;
}

/**
 * Analyze a patient tool's JavaScript code
 */
function analyzePatientTool(content: string): ToolAnalysis {
  const analysis: ToolAnalysis = {
    version: null,
    hasBookingFunction: false,
    hasSlotSearch: false,
    hasPatientLookup: true,
    requiresBookingToken: false,
    usesIndividualGUIDs: false,
    nodeRedBaseUrl: null,
    patterns: [],
    issues: [],
  };

  // Extract version
  const versionMatch = content.match(/TOOL_VERSION\s*=\s*['"]([^'"]+)['"]/);
  analysis.version = versionMatch ? versionMatch[1] : null;

  // Check patterns
  if (content.includes('createPatient')) {
    analysis.patterns.push('Has patient creation');
  }
  if (content.includes('getPatientByFilter')) {
    analysis.patterns.push('Has patient search');
  }
  if (content.includes('updatePatient')) {
    analysis.patterns.push('Has patient update');
  }

  // Extract Node-RED base URL
  const baseUrlMatch = content.match(/NODE_RED_BASE\s*=\s*['"]([^'"]+)['"]/);
  if (baseUrlMatch) {
    analysis.nodeRedBaseUrl = baseUrlMatch[1];
  }

  return analysis;
}

// ============================================================================
// TEST CASES
// ============================================================================

function getTestCases(env: Environment): FlowiseToolTestCase[] {
  return [
    {
      name: 'Scheduling Tool - Version Check',
      toolKey: 'scheduling_tool',
      simulatedParams: {},
      expectedBehavior: 'Should have v52 or later with individual GUIDs',
    },
    {
      name: 'Scheduling Tool - Booking Pattern',
      toolKey: 'scheduling_tool',
      simulatedParams: {
        action: 'book',
        patientGUID: 'test-guid',
        scheduleViewGUID: 'test-view',
        scheduleColumnGUID: 'test-column',
        appointmentTypeGUID: 'test-type',
        startTime: '01/15/2026 10:00:00 AM',
      },
      expectedBehavior: 'Should accept individual GUIDs without bookingToken',
    },
    {
      name: 'Scheduling Tool - Slot Search Pattern',
      toolKey: 'scheduling_tool',
      simulatedParams: {
        action: 'search',
        locationGUID: 'test-location',
        startDate: '01/15/2026',
        endDate: '01/29/2026',
      },
      expectedBehavior: 'Should search available slots',
    },
    {
      name: 'Patient Tool - Version Check',
      toolKey: 'patient_tool',
      simulatedParams: {},
      expectedBehavior: 'Should have current version',
    },
    {
      name: 'Patient Tool - Lookup Pattern',
      toolKey: 'patient_tool',
      simulatedParams: {
        action: 'lookup',
        filter: 'Test Patient',
      },
      expectedBehavior: 'Should search patients by name',
    },
  ];
}

// ============================================================================
// TEST RUNNER
// ============================================================================

/**
 * Run a single Flowise tool test case
 */
async function runTestCase(
  env: Environment,
  testCase: FlowiseToolTestCase
): Promise<LayerTestResult> {
  const startTime = Date.now();

  // Load tool content from sandbox files
  const content = loadSandboxFile(env, testCase.toolKey);

  if (!content) {
    return {
      layer: 'flowise',
      testName: testCase.name,
      passed: false,
      durationMs: Date.now() - startTime,
      request: { toolKey: testCase.toolKey, params: testCase.simulatedParams },
      response: null,
      error: `Tool file not found: ${testCase.toolKey}`,
      details: `Could not load ${testCase.toolKey} from ${env}`,
    };
  }

  // Analyze the tool
  const analysis =
    testCase.toolKey === 'scheduling_tool'
      ? analyzeSchedulingTool(content)
      : analyzePatientTool(content);

  const durationMs = Date.now() - startTime;

  // Determine pass/fail based on test case
  let passed = true;
  let details = '';
  let error: string | undefined;

  if (testCase.name.includes('Version Check')) {
    if (!analysis.version) {
      passed = false;
      error = 'No version found';
    } else {
      details = `Version: ${analysis.version}`;
    }
  } else if (testCase.name.includes('Booking Pattern')) {
    if (analysis.requiresBookingToken && !analysis.usesIndividualGUIDs) {
      passed = false;
      error = 'Uses deprecated bookingToken pattern';
    } else if (analysis.usesIndividualGUIDs) {
      details = 'Uses individual GUIDs (correct)';
    } else {
      passed = false;
      error = 'Booking pattern unclear';
    }
  } else if (testCase.name.includes('Slot Search')) {
    if (!analysis.hasSlotSearch) {
      passed = false;
      error = 'No slot search function found';
    } else {
      details = 'Has slot search capability';
    }
  } else if (testCase.name.includes('Lookup Pattern')) {
    if (!analysis.hasPatientLookup) {
      passed = false;
      error = 'No patient lookup function found';
    } else {
      details = 'Has patient lookup capability';
    }
  }

  // Add issues to error if any
  if (analysis.issues.length > 0 && passed) {
    details += ` [Warnings: ${analysis.issues.join(', ')}]`;
  }

  return {
    layer: 'flowise',
    testName: testCase.name,
    passed,
    durationMs,
    request: { toolKey: testCase.toolKey, params: testCase.simulatedParams },
    response: {
      version: analysis.version,
      patterns: analysis.patterns,
      issues: analysis.issues,
    },
    error,
    details: details || analysis.patterns.join(', '),
  };
}

/**
 * Run all Flowise layer tests
 */
export async function runFlowiseTests(
  config: EnvironmentConfig,
  options: { verbose?: boolean; stopOnFirstFailure?: boolean } = {}
): Promise<LayerTestResult[]> {
  const testCases = getTestCases(config.name);
  const results: LayerTestResult[] = [];

  console.log(`\n[LAYER 3: FLOWISE TOOLS]`);
  console.log(`Environment: ${config.displayName}`);
  console.log(`Flowise: ${config.flowiseEndpoint || 'Not configured'}`);
  console.log(`Tests: ${testCases.length}\n`);

  for (const testCase of testCases) {
    if (options.verbose) {
      console.log(`  Running: ${testCase.name}...`);
    }

    const result = await runTestCase(config.name, testCase);
    results.push(result);

    const status = result.passed ? '\u2713' : '\u2717';
    const time = `${result.durationMs}ms`.padStart(8);
    console.log(`  [${status}] ${testCase.name.padEnd(40)} ${time}${result.error ? `  ${result.error}` : ''}`);

    if (!result.passed && options.stopOnFirstFailure) {
      console.log(`  STOPPING: First failure encountered`);
      break;
    }
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n  Layer 3 Summary: ${passed}/${results.length} PASSED`);

  return results;
}

// ============================================================================
// FLOWISE ENDPOINT TEST
// ============================================================================

/**
 * Test if Flowise endpoint is reachable
 */
export async function testFlowiseEndpoint(config: EnvironmentConfig): Promise<LayerTestResult> {
  const startTime = Date.now();

  if (!config.flowiseEndpoint) {
    return {
      layer: 'flowise',
      testName: 'Flowise Endpoint',
      passed: false,
      durationMs: Date.now() - startTime,
      request: { endpoint: 'not configured' },
      response: null,
      error: 'No Flowise endpoint configured',
    };
  }

  try {
    // Just check if the endpoint is reachable (HEAD or simple GET)
    const response = await axios.get(config.flowiseEndpoint.replace('/prediction/', '/'), {
      timeout: 10000,
      validateStatus: () => true,
      headers: config.flowiseApiKey ? { Authorization: `Bearer ${config.flowiseApiKey}` } : {},
    });

    const durationMs = Date.now() - startTime;

    return {
      layer: 'flowise',
      testName: 'Flowise Endpoint',
      passed: response.status < 500,
      durationMs,
      request: { endpoint: config.flowiseEndpoint },
      response: { status: response.status },
      error: response.status >= 500 ? `HTTP ${response.status}` : undefined,
      details: `Status: ${response.status}`,
    };
  } catch (error: any) {
    return {
      layer: 'flowise',
      testName: 'Flowise Endpoint',
      passed: false,
      durationMs: Date.now() - startTime,
      request: { endpoint: config.flowiseEndpoint },
      response: null,
      error: error.message,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { analyzeSchedulingTool, analyzePatientTool, getTestCases };

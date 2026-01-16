/**
 * E2E Layer Tests (Layer 4)
 * Runs actual goal tests through the selected Flowise endpoint
 *
 * This layer tests the complete flow from user input to final response,
 * including all tool calls and LLM processing.
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { EnvironmentConfig, LayerTestResult, E2ETestCase } from './types';

// ============================================================================
// FLOWISE CLIENT
// ============================================================================

interface FlowiseMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface FlowiseResponse {
  text: string;
  sessionId: string;
  chatId?: string;
  sourceDocuments?: any[];
  usedTools?: string[];
  agentReasoning?: any[];
}

async function sendFlowiseMessage(
  config: EnvironmentConfig,
  message: string,
  sessionId: string
): Promise<{ ok: boolean; data: FlowiseResponse | null; durationMs: number; error?: string }> {
  if (!config.flowiseEndpoint) {
    return {
      ok: false,
      data: null,
      durationMs: 0,
      error: 'No Flowise endpoint configured',
    };
  }

  const startTime = Date.now();

  try {
    const response = await axios.post(
      config.flowiseEndpoint,
      {
        question: message,
        sessionId,
        overrideConfig: {
          sessionId,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(config.flowiseApiKey ? { Authorization: `Bearer ${config.flowiseApiKey}` } : {}),
        },
        timeout: 120000, // 2 minutes for LLM response
        validateStatus: () => true,
      }
    );

    const durationMs = Date.now() - startTime;

    if (response.status >= 400) {
      return {
        ok: false,
        data: null,
        durationMs,
        error: `HTTP ${response.status}: ${JSON.stringify(response.data).substring(0, 200)}`,
      };
    }

    return {
      ok: true,
      data: response.data,
      durationMs,
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
// TEST SCENARIOS
// ============================================================================

interface E2EScenario {
  name: string;
  description: string;
  messages: string[];
  expectToolCalls: string[];
  successCriteria: (responses: FlowiseResponse[]) => { passed: boolean; reason: string };
}

/**
 * Simple booking flow scenario
 */
const BOOKING_FLOW_SCENARIO: E2EScenario = {
  name: 'Simple Booking Flow',
  description: 'Tests a basic appointment booking conversation',
  messages: [
    "Hi, I'd like to schedule an appointment for a cleaning",
    "My name is John Test and my date of birth is January 15, 1990",
    "I'm available next week, anytime in the morning works for me",
    "Yes, please book that slot",
  ],
  expectToolCalls: ['schedule_appointment_ortho'],
  successCriteria: (responses) => {
    const lastResponse = responses[responses.length - 1];
    if (!lastResponse) {
      return { passed: false, reason: 'No responses received' };
    }

    // Check if any tool was used
    if (lastResponse.usedTools && lastResponse.usedTools.length > 0) {
      const hasSchedulingTool = lastResponse.usedTools.some((t) =>
        t.toLowerCase().includes('schedule') || t.toLowerCase().includes('appointment')
      );
      if (hasSchedulingTool) {
        return { passed: true, reason: 'Scheduling tool was called' };
      }
    }

    // Check for booking confirmation in text
    const text = lastResponse.text.toLowerCase();
    if (text.includes('booked') || text.includes('scheduled') || text.includes('appointment confirmed')) {
      return { passed: true, reason: 'Booking confirmation in response' };
    }

    // Check for slots being offered
    if (text.includes('available') || text.includes('slot') || text.includes('time')) {
      return { passed: false, reason: 'Slots offered but not booked' };
    }

    return { passed: false, reason: 'No booking confirmation found' };
  },
};

/**
 * Patient lookup scenario
 */
const PATIENT_LOOKUP_SCENARIO: E2EScenario = {
  name: 'Patient Lookup Flow',
  description: 'Tests patient search functionality',
  messages: [
    "I need to find my appointment. My name is John Smith",
    "My date of birth is March 20, 1985",
  ],
  expectToolCalls: ['chord_dso_patient'],
  successCriteria: (responses) => {
    const lastResponse = responses[responses.length - 1];
    if (!lastResponse) {
      return { passed: false, reason: 'No responses received' };
    }

    const text = lastResponse.text.toLowerCase();
    if (text.includes('found') || text.includes('patient') || text.includes('appointment')) {
      return { passed: true, reason: 'Patient lookup completed' };
    }

    if (text.includes('not found') || text.includes('no patient') || text.includes('create')) {
      return { passed: true, reason: 'No patient found (expected for test data)' };
    }

    return { passed: false, reason: 'Unknown response pattern' };
  },
};

/**
 * Get available E2E scenarios
 */
function getScenarios(): E2EScenario[] {
  return [BOOKING_FLOW_SCENARIO, PATIENT_LOOKUP_SCENARIO];
}

// ============================================================================
// TEST RUNNER
// ============================================================================

/**
 * Run a single E2E scenario
 */
async function runScenario(
  config: EnvironmentConfig,
  scenario: E2EScenario,
  options: { verbose?: boolean; maxTurns?: number } = {}
): Promise<LayerTestResult> {
  const sessionId = uuidv4();
  const startTime = Date.now();
  const responses: FlowiseResponse[] = [];
  const allToolsCalled: string[] = [];
  let lastError: string | undefined;

  console.log(`\n    Scenario: ${scenario.name}`);
  console.log(`    Session: ${sessionId}`);

  const maxTurns = options.maxTurns || scenario.messages.length;
  const messagesToSend = scenario.messages.slice(0, maxTurns);

  for (let i = 0; i < messagesToSend.length; i++) {
    const message = messagesToSend[i];
    if (options.verbose) {
      console.log(`    [${i + 1}] User: ${message.substring(0, 60)}...`);
    }

    const { ok, data, error } = await sendFlowiseMessage(config, message, sessionId);

    if (!ok) {
      lastError = error;
      console.log(`    [${i + 1}] ERROR: ${error}`);
      break;
    }

    if (data) {
      responses.push(data);
      if (data.usedTools) {
        allToolsCalled.push(...data.usedTools);
      }
      if (options.verbose) {
        console.log(`    [${i + 1}] Bot: ${data.text.substring(0, 60)}...`);
        if (data.usedTools && data.usedTools.length > 0) {
          console.log(`    [${i + 1}] Tools: ${data.usedTools.join(', ')}`);
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;

  // Evaluate success criteria
  const evaluation = scenario.successCriteria(responses);

  // Check if expected tools were called
  let toolsMatched = true;
  const missingTools: string[] = [];
  for (const expectedTool of scenario.expectToolCalls) {
    const found = allToolsCalled.some((t) =>
      t.toLowerCase().includes(expectedTool.toLowerCase()) ||
      expectedTool.toLowerCase().includes(t.toLowerCase())
    );
    if (!found) {
      toolsMatched = false;
      missingTools.push(expectedTool);
    }
  }

  const passed = evaluation.passed && (missingTools.length === 0 || lastError !== undefined);

  return {
    layer: 'e2e',
    testName: scenario.name,
    passed,
    durationMs,
    request: {
      scenario: scenario.name,
      messages: messagesToSend,
      sessionId,
    },
    response: {
      responseCount: responses.length,
      toolsCalled: allToolsCalled,
      lastResponse: responses[responses.length - 1]?.text?.substring(0, 200),
    },
    error: passed
      ? undefined
      : lastError || (missingTools.length > 0 ? `Missing tools: ${missingTools.join(', ')}` : evaluation.reason),
    details: evaluation.reason,
  };
}

/**
 * Run all E2E layer tests
 */
export async function runE2ETests(
  config: EnvironmentConfig,
  options: { verbose?: boolean; stopOnFirstFailure?: boolean; maxTurns?: number } = {}
): Promise<LayerTestResult[]> {
  const scenarios = getScenarios();
  const results: LayerTestResult[] = [];

  console.log(`\n[LAYER 4: END-TO-END TESTS]`);
  console.log(`Flowise: ${config.flowiseEndpoint || 'Not configured'}`);
  console.log(`Scenarios: ${scenarios.length}\n`);

  if (!config.flowiseEndpoint) {
    console.log(`  SKIPPED: No Flowise endpoint configured`);
    return [
      {
        layer: 'e2e',
        testName: 'E2E Tests',
        passed: false,
        durationMs: 0,
        request: {},
        response: null,
        error: 'No Flowise endpoint configured',
      },
    ];
  }

  for (const scenario of scenarios) {
    const result = await runScenario(config, scenario, options);
    results.push(result);

    const status = result.passed ? '\u2713' : '\u2717';
    const time = `${result.durationMs}ms`.padStart(8);
    console.log(`  [${status}] ${scenario.name.padEnd(30)} ${time}${result.error ? `  ${result.error}` : ''}`);

    if (!result.passed && options.stopOnFirstFailure) {
      console.log(`  STOPPING: First failure encountered`);
      break;
    }
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n  Layer 4 Summary: ${passed}/${results.length} PASSED`);

  return results;
}

// ============================================================================
// QUICK E2E TEST
// ============================================================================

/**
 * Run a quick single-message E2E test
 */
export async function runQuickE2ETest(
  config: EnvironmentConfig,
  message: string = "Hi, I'd like to schedule an appointment"
): Promise<LayerTestResult> {
  const sessionId = uuidv4();
  const startTime = Date.now();

  const { ok, data, error } = await sendFlowiseMessage(config, message, sessionId);
  const durationMs = Date.now() - startTime;

  return {
    layer: 'e2e',
    testName: 'Quick E2E Test',
    passed: ok && !!data?.text,
    durationMs,
    request: { message, sessionId },
    response: data,
    error: ok ? undefined : error,
    details: data?.text?.substring(0, 100) || error,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { sendFlowiseMessage, getScenarios, runScenario };

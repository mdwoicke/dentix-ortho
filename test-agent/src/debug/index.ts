/**
 * Debug Flow Framework
 *
 * A progressive layer-by-layer debugging framework for the booking flow.
 *
 * Layers:
 *   1. Cloud9 Direct API - Tests Cloud9 XML API directly
 *   2. Node-RED Endpoints - Tests middleware layer
 *   3. Flowise Tools - Tests tool definitions and patterns
 *   4. E2E Tests - Tests full conversation flow
 *
 * Usage:
 *   import { runDebugFlow } from './debug';
 *   const report = await runDebugFlow({ environment: 'sandbox_a' });
 */

// Types
export * from './types';

// Config
export {
  loadEnvironmentConfig,
  loadSandboxFile,
  listEnvironments,
  getEnvironmentPresetByName,
  getFlowiseConfigById,
  CLOUD9_SANDBOX,
  CLOUD9_PRODUCTION,
  NODERED_BASE,
  NODERED_AUTH,
  DEFAULT_GUIDS,
  FALLBACK_CONFIGS,
} from './config-loader';

// Layer 1: Cloud9
export {
  runCloud9Tests,
  callCloud9,
  buildXmlRequest,
  parseXmlResponse,
  getTestDateRange,
} from './cloud9-layer';

// Layer 2: Node-RED
export {
  runNodeRedTests,
  callNodeRed,
  testBookingFlow,
  testPatientCreation,
  ENDPOINTS as NODERED_ENDPOINTS,
  TEST_UUI,
} from './nodered-layer';

// Layer 3: Flowise
export {
  runFlowiseTests,
  testFlowiseEndpoint,
  analyzeSchedulingTool,
  analyzePatientTool,
} from './flowise-layer';

// Layer 4: E2E
export {
  runE2ETests,
  runQuickE2ETest,
  sendFlowiseMessage,
  getScenarios,
  runScenario,
} from './e2e-layer';

// Orchestration
export {
  runDebugFlow,
  runSingleLayer,
  runQuickCheck,
  LAYER_ORDER,
  LAYER_NAMES,
} from './layer-tester';

// Reports
export {
  generateReport,
  generateMarkdownReport,
  generateJsonReport,
  printReportToConsole,
  getQuickSummary,
} from './report-generator';

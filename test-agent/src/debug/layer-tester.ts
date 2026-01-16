/**
 * Layer Tester - Orchestration
 * Coordinates running tests across all layers progressively
 */

import {
  Environment,
  Layer,
  EnvironmentConfig,
  DebugFlowOptions,
  DebugReport,
  LayerTestResult,
  LayerSummary,
} from './types';
import { loadEnvironmentConfig, listEnvironments } from './config-loader';
import { runCloud9Tests } from './cloud9-layer';
import { runNodeRedTests } from './nodered-layer';
import { runFlowiseTests, testFlowiseEndpoint } from './flowise-layer';
import { runE2ETests } from './e2e-layer';
import { generateReport, printReportToConsole } from './report-generator';

// ============================================================================
// LAYER ORDER
// ============================================================================

const LAYER_ORDER: Layer[] = ['cloud9', 'nodered', 'flowise', 'e2e'];

const LAYER_NAMES: Record<Layer, string> = {
  cloud9: 'Cloud9 Direct API',
  nodered: 'Node-RED Endpoints',
  flowise: 'Flowise Tools',
  e2e: 'End-to-End Tests',
};

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Run debug flow tests across all or specified layers
 */
export async function runDebugFlow(options: DebugFlowOptions): Promise<DebugReport> {
  const startedAt = new Date().toISOString();
  const config = loadEnvironmentConfig(options.environment);

  console.log('\n' + '='.repeat(80));
  console.log('DEBUG FLOW REPORT');
  console.log('='.repeat(80));
  console.log(`Environment: ${config.displayName} (${config.name})`);
  console.log(`Flowise: ${config.flowiseEndpoint || 'Not configured'}`);
  console.log(`Node-RED: ${config.noderedBase}`);
  console.log(`Cloud9: ${config.cloud9Endpoint}`);
  console.log('='.repeat(80));

  // Determine which layers to run
  const layersToRun = options.layers || LAYER_ORDER;
  const orderedLayers = LAYER_ORDER.filter((l) => layersToRun.includes(l));

  // Initialize results
  const layerResults: Record<Layer, LayerTestResult[]> = {
    cloud9: [],
    nodered: [],
    flowise: [],
    e2e: [],
  };
  const summary: Record<Layer, { passed: number; failed: number; skipped: number }> = {
    cloud9: { passed: 0, failed: 0, skipped: 0 },
    nodered: { passed: 0, failed: 0, skipped: 0 },
    flowise: { passed: 0, failed: 0, skipped: 0 },
    e2e: { passed: 0, failed: 0, skipped: 0 },
  };

  let firstFailurePoint: DebugReport['firstFailurePoint'];
  let shouldStop = false;

  // Run each layer in order
  for (const layer of orderedLayers) {
    if (shouldStop) {
      console.log(`\n  [LAYER ${LAYER_ORDER.indexOf(layer) + 1}: ${LAYER_NAMES[layer].toUpperCase()}]`);
      console.log(`  SKIPPED: Previous layer failed`);
      continue;
    }

    let results: LayerTestResult[];

    switch (layer) {
      case 'cloud9':
        results = await runCloud9Tests(config, {
          verbose: options.verbose,
          stopOnFirstFailure: options.stopOnFirstFailure,
        });
        break;

      case 'nodered':
        results = await runNodeRedTests(config, {
          verbose: options.verbose,
          stopOnFirstFailure: options.stopOnFirstFailure,
        });
        break;

      case 'flowise':
        // First test endpoint connectivity
        const endpointTest = await testFlowiseEndpoint(config);
        if (!endpointTest.passed) {
          results = [endpointTest];
        } else {
          const toolTests = await runFlowiseTests(config, {
            verbose: options.verbose,
            stopOnFirstFailure: options.stopOnFirstFailure,
          });
          results = [endpointTest, ...toolTests];
        }
        break;

      case 'e2e':
        results = await runE2ETests(config, {
          verbose: options.verbose,
          stopOnFirstFailure: options.stopOnFirstFailure,
        });
        break;

      default:
        results = [];
    }

    // Store results
    layerResults[layer] = results;

    // Calculate summary
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    summary[layer] = { passed, failed, skipped: 0 };

    // Check for first failure
    const firstFailure = results.find((r) => !r.passed);
    if (firstFailure && !firstFailurePoint) {
      firstFailurePoint = {
        layer,
        testName: firstFailure.testName,
        error: firstFailure.error || 'Unknown error',
      };

      if (options.stopOnFirstFailure) {
        shouldStop = true;
        console.log(`\n  ** FIRST FAILURE AT LAYER ${LAYER_ORDER.indexOf(layer) + 1}: ${LAYER_NAMES[layer]} **`);
      }
    }
  }

  const completedAt = new Date().toISOString();
  const totalDurationMs =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();

  // Generate report
  const report: DebugReport = {
    environment: options.environment,
    startedAt,
    completedAt,
    totalDurationMs,
    firstFailurePoint,
    summary,
    layerResults,
    recommendation: generateRecommendation(firstFailurePoint, layerResults),
  };

  // Print final summary
  printReportToConsole(report);

  return report;
}

// ============================================================================
// RECOMMENDATION ENGINE
// ============================================================================

function generateRecommendation(
  firstFailure: DebugReport['firstFailurePoint'],
  layerResults: Record<Layer, LayerTestResult[]>
): string | undefined {
  if (!firstFailure) {
    return 'All layers passed! The booking flow should be working correctly.';
  }

  const { layer, testName, error } = firstFailure;

  switch (layer) {
    case 'cloud9':
      if (error.includes('auth') || error.includes('credential') || error.includes('password')) {
        return `Cloud9 authentication failed. Check credentials in config-loader.ts.`;
      }
      if (error.includes('timeout') || error.includes('network')) {
        return `Cloud9 API is unreachable. Check network connectivity and endpoint URL.`;
      }
      return `Cloud9 API error on ${testName}. Check API documentation for ${testName} procedure.`;

    case 'nodered':
      if (error.includes('404')) {
        return `Node-RED endpoint not found. Verify endpoint paths in nodered_Cloud9_flows.json match tool definitions.`;
      }
      if (error.includes('auth') || error.includes('401') || error.includes('403')) {
        return `Node-RED authentication failed. Check NODERED_AUTH credentials in config-loader.ts.`;
      }
      if (error.includes('providerGUID') || error.includes('locationGUID')) {
        return `Missing required GUID parameter. Check that the scheduling tool is extracting GUIDs correctly.`;
      }
      return `Node-RED middleware issue on ${testName}. Check nodered_Cloud9_flows.json for this endpoint.`;

    case 'flowise':
      if (error.includes('version') || error.includes('v49') || error.includes('bookingToken')) {
        return `Tool version mismatch. Update scheduling_tool in Flowise to v52 or later that uses individual GUIDs.`;
      }
      if (error.includes('endpoint') || error.includes('not configured')) {
        return `Flowise endpoint not configured. Set flowise_endpoint in ab_sandboxes or flowise_configs table.`;
      }
      if (error.includes('No slot search') || error.includes('No booking')) {
        return `Tool missing required function. Check scheduling_tool JavaScript for missing functions.`;
      }
      return `Flowise tool issue: ${error}. Review the tool JavaScript code in ab_sandbox_files.`;

    case 'e2e':
      if (error.includes('Missing tools')) {
        return `Agent not calling expected tools. Check system prompt for correct tool invocation instructions.`;
      }
      if (error.includes('timeout') || error.includes('network')) {
        return `Flowise not responding. Check if the Flowise service is running.`;
      }
      if (error.includes('Not booked') || error.includes('no booking')) {
        return `Agent collected info but didn't complete booking. Check system prompt and tool function call patterns.`;
      }
      return `E2E test failed: ${error}. Review full conversation transcript for details.`;

    default:
      return `Unknown layer failure. Check the error details above.`;
  }
}

// ============================================================================
// QUICK LAYER TESTS
// ============================================================================

/**
 * Run tests for a single layer only
 */
export async function runSingleLayer(
  environment: Environment,
  layer: Layer,
  options: { verbose?: boolean } = {}
): Promise<LayerTestResult[]> {
  const config = loadEnvironmentConfig(environment);

  switch (layer) {
    case 'cloud9':
      return runCloud9Tests(config, options);
    case 'nodered':
      return runNodeRedTests(config, options);
    case 'flowise':
      const endpointTest = await testFlowiseEndpoint(config);
      const toolTests = await runFlowiseTests(config, options);
      return [endpointTest, ...toolTests];
    case 'e2e':
      return runE2ETests(config, options);
    default:
      return [];
  }
}

/**
 * Quick connectivity check for all layers
 */
export async function runQuickCheck(environment: Environment): Promise<{
  cloud9: boolean;
  nodered: boolean;
  flowise: boolean;
}> {
  const config = loadEnvironmentConfig(environment);

  console.log(`\n[QUICK CHECK: ${config.displayName}]`);

  // Cloud9 check
  let cloud9Ok = false;
  try {
    const { runCloud9Tests } = await import('./cloud9-layer');
    const results = await runCloud9Tests(config, { stopOnFirstFailure: true });
    cloud9Ok = results.some((r) => r.passed);
  } catch {
    cloud9Ok = false;
  }
  console.log(`  Cloud9: ${cloud9Ok ? '\u2713' : '\u2717'}`);

  // Node-RED check
  let noderedOk = false;
  try {
    const { runNodeRedTests } = await import('./nodered-layer');
    const results = await runNodeRedTests(config, { stopOnFirstFailure: true });
    noderedOk = results.some((r) => r.passed);
  } catch {
    noderedOk = false;
  }
  console.log(`  Node-RED: ${noderedOk ? '\u2713' : '\u2717'}`);

  // Flowise check
  let flowiseOk = false;
  try {
    const result = await testFlowiseEndpoint(config);
    flowiseOk = result.passed;
  } catch {
    flowiseOk = false;
  }
  console.log(`  Flowise: ${flowiseOk ? '\u2713' : '\u2717'}`);

  return { cloud9: cloud9Ok, nodered: noderedOk, flowise: flowiseOk };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { LAYER_ORDER, LAYER_NAMES, listEnvironments, loadEnvironmentConfig };

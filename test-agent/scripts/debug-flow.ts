#!/usr/bin/env npx ts-node
/**
 * Debug Flow CLI
 *
 * Progressive debugging from Cloud9 up through Flowise to identify failure points.
 *
 * Usage:
 *   npx ts-node scripts/debug-flow.ts --env sandbox_a
 *   npx ts-node scripts/debug-flow.ts --env production --layers cloud9,nodered
 *   npx ts-node scripts/debug-flow.ts --env sandbox_b --verbose --stop-on-failure
 *
 * Options:
 *   --env, -e          Environment: production, sandbox_a, sandbox_b (required)
 *   --layers, -l       Layers to test: all, cloud9, nodered, flowise, e2e (default: all)
 *   --verbose, -v      Show detailed output
 *   --stop-on-failure  Stop at first failure instead of running all layers
 *   --quick            Quick connectivity check only
 *   --output, -o       Output format: console, markdown, json (default: console)
 *   --help, -h         Show this help message
 */

import { runDebugFlow, runQuickCheck, listEnvironments, Environment, Layer } from '../src/debug';
import { generateMarkdownReport, generateJsonReport } from '../src/debug/report-generator';
import * as fs from 'fs';

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

interface CLIOptions {
  environment?: Environment;
  layers?: Layer[];
  verbose: boolean;
  stopOnFirstFailure: boolean;
  quick: boolean;
  output: 'console' | 'markdown' | 'json';
  help: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    verbose: false,
    stopOnFirstFailure: false,
    quick: false,
    output: 'console',
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--env':
      case '-e':
        if (nextArg && ['production', 'sandbox_a', 'sandbox_b'].includes(nextArg)) {
          options.environment = nextArg as Environment;
          i++;
        } else {
          console.error(`Invalid environment: ${nextArg}`);
          console.error('Valid options: production, sandbox_a, sandbox_b');
          process.exit(1);
        }
        break;

      case '--layers':
      case '-l':
        if (nextArg) {
          if (nextArg === 'all') {
            options.layers = undefined; // All layers
          } else {
            const layerList = nextArg.split(',') as Layer[];
            const validLayers: Layer[] = ['cloud9', 'nodered', 'flowise', 'e2e'];
            const invalid = layerList.filter((l) => !validLayers.includes(l));
            if (invalid.length > 0) {
              console.error(`Invalid layers: ${invalid.join(', ')}`);
              console.error('Valid options: cloud9, nodered, flowise, e2e, all');
              process.exit(1);
            }
            options.layers = layerList;
          }
          i++;
        }
        break;

      case '--verbose':
      case '-v':
        options.verbose = true;
        break;

      case '--stop-on-failure':
        options.stopOnFirstFailure = true;
        break;

      case '--quick':
        options.quick = true;
        break;

      case '--output':
      case '-o':
        if (nextArg && ['console', 'markdown', 'json'].includes(nextArg)) {
          options.output = nextArg as 'console' | 'markdown' | 'json';
          i++;
        }
        break;

      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
Debug Flow CLI - Progressive Layer-by-Layer Debugging

USAGE:
  npx ts-node scripts/debug-flow.ts --env <environment> [options]

ENVIRONMENTS:
  production    Use production Flowise endpoint
  sandbox_a     Use Sandbox A configuration
  sandbox_b     Use Sandbox B configuration

OPTIONS:
  --env, -e <env>       Environment to test (required)
  --layers, -l <list>   Layers to test: all, cloud9, nodered, flowise, e2e
                        Can be comma-separated: cloud9,nodered
  --verbose, -v         Show detailed output for each test
  --stop-on-failure     Stop at first failure instead of running all layers
  --quick               Quick connectivity check only (no full tests)
  --output, -o <fmt>    Output format: console, markdown, json
  --help, -h            Show this help message

LAYERS:
  1. cloud9   - Cloud9 Direct API (XML procedures)
  2. nodered  - Node-RED Endpoints (middleware)
  3. flowise  - Flowise Tools (JavaScript analysis)
  4. e2e      - End-to-End Tests (full conversation)

EXAMPLES:
  # Full debug on Sandbox A
  npx ts-node scripts/debug-flow.ts --env sandbox_a

  # Test only Cloud9 and Node-RED layers
  npx ts-node scripts/debug-flow.ts --env production --layers cloud9,nodered

  # Quick connectivity check
  npx ts-node scripts/debug-flow.ts --env sandbox_a --quick

  # Verbose output with stop on failure
  npx ts-node scripts/debug-flow.ts --env sandbox_b -v --stop-on-failure

  # Output as markdown
  npx ts-node scripts/debug-flow.ts --env sandbox_a -o markdown > report.md
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (!options.environment) {
    console.error('Error: --env is required\n');
    showHelp();
    process.exit(1);
  }

  try {
    if (options.quick) {
      // Quick connectivity check
      const result = await runQuickCheck(options.environment);
      const allOk = result.cloud9 && result.nodered && result.flowise;
      process.exit(allOk ? 0 : 1);
    }

    // Full debug flow
    const report = await runDebugFlow({
      environment: options.environment,
      layers: options.layers,
      verbose: options.verbose,
      stopOnFirstFailure: options.stopOnFirstFailure,
    });

    // Output in requested format
    if (options.output === 'markdown') {
      const md = generateMarkdownReport(report);
      console.log(md);
    } else if (options.output === 'json') {
      const json = generateJsonReport(report);
      console.log(JSON.stringify(json, null, 2));
    }
    // Console output is already done by runDebugFlow

    // Exit with failure code if any tests failed
    const totalFailed = Object.values(report.summary).reduce(
      (sum, s) => sum + s.failed,
      0
    );
    process.exit(totalFailed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error(`\nFatal error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

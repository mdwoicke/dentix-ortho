const { spawn } = require('child_process');

const GOAL_TESTS = [
  'GOAL-HAPPY-001', 'GOAL-HAPPY-002', 'GOAL-HAPPY-003', 'GOAL-HAPPY-004', 'GOAL-HAPPY-005',
  'GOAL-EDGE-001', 'GOAL-EDGE-002', 'GOAL-EDGE-003', 'GOAL-EDGE-004', 'GOAL-EDGE-005',
  'GOAL-EDGE-006', 'GOAL-EDGE-007', 'GOAL-EDGE-008', 'GOAL-EDGE-009', 'GOAL-EDGE-010', 'GOAL-EDGE-011',
  'GOAL-ERR-001', 'GOAL-ERR-002', 'GOAL-ERR-003', 'GOAL-ERR-004', 'GOAL-ERR-005', 'GOAL-ERR-006', 'GOAL-ERR-007'
];

// Configuration
const CONCURRENCY = parseInt(process.env.TEST_CONCURRENCY || '5', 10);
const SCENARIOS = process.env.TEST_SCENARIOS || GOAL_TESTS.join(',');

async function main() {
  console.log('=== Running GOAL Tests in Parallel ===\n');
  console.log(`Scenarios: ${SCENARIOS.split(',').length} tests`);
  console.log(`Concurrency: ${CONCURRENCY} parallel workers`);
  console.log('');

  const startTime = Date.now();

  // Use spawn to run the test command with parallel execution
  const child = spawn('npx', [
    'ts-node',
    'src/index.ts',
    'run',
    '--scenarios', SCENARIOS,
    '-n', CONCURRENCY.toString()
  ], {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd()
  });

  child.on('close', (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nTotal duration: ${duration}s`);
    process.exit(code);
  });

  child.on('error', (err) => {
    console.error('Error running tests:', err.message);
    process.exit(1);
  });
}

main();

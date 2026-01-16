import { createGoalTestRunner } from './src/tests/goal-test-runner';
import { FlowiseClient } from './src/core/flowise-client';
import { Database } from './src/storage/database';
import { getGoalTest } from './src/tests/scenarios/goal-happy-path';
import { v4 as uuidv4 } from 'uuid';
import type { GoalOrientedTestCase } from './src/tests/types/goal-test';

async function main() {
    // Initialize dependencies
    const database = new Database();

    // Get base test case
    const baseTestCase = getGoalTest('GOAL-HAPPY-001');
    if (!baseTestCase) {
        console.error('Test case GOAL-HAPPY-001 not found');
        return;
    }

    // Override persona with "Test" names to avoid Azure content filter
    const testCase: GoalOrientedTestCase = {
        ...baseTestCase,
        persona: {
            ...baseTestCase.persona,
            name: 'Test User',
            inventory: {
                ...baseTestCase.persona.inventory,
                parentFirstName: 'Test',
                parentLastName: 'User',
                parentPhone: '2155551234',
                children: [
                    {
                        firstName: 'Test',
                        lastName: 'Child',
                        dateOfBirth: '2014-03-15',
                        isNewPatient: true,
                        hadBracesBefore: false,
                    },
                ],
            },
        },
    };

    // Set session vars with caller ID from persona (simulates telephony)
    const sessionVars: Record<string, string> = {};
    if (testCase.persona.inventory.parentPhone) {
        sessionVars.c1mg_variable_caller_id_number = testCase.persona.inventory.parentPhone;
    }

    // Use Sandbox B (config 4) with session vars
    const flowiseClient = await FlowiseClient.forActiveConfig(undefined, sessionVars, 4);

    // Use factory function which handles IntentDetector
    const runner = createGoalTestRunner(flowiseClient, database);

    console.log('Session vars:', sessionVars);

    const runId = `run-${new Date().toISOString().split('T')[0]}-${uuidv4().substring(0, 8)}`;

    console.log('Running GOAL-HAPPY-001 with Sandbox B (config 4)...');
    console.log('Run ID:', runId);
    console.log('');

    const result = await runner.runTest(testCase, runId);

    console.log('');
    console.log('=== RESULT ===');
    console.log('Passed:', result.passed);
    console.log('Turns:', result.turnCount);
    console.log('Duration:', Math.round(result.durationMs / 1000), 'seconds');

    // Show goal results
    console.log('');
    console.log('=== GOALS ===');
    for (const goalResult of result.goalResults) {
        console.log(`${goalResult.goalId}: ${goalResult.passed ? 'PASSED' : 'FAILED'} - ${goalResult.message}`);
    }

    // Show issues if any
    if (result.issues.length > 0) {
        console.log('');
        console.log('=== ISSUES ===');
        for (const issue of result.issues) {
            console.log(`Turn ${issue.turnNumber}: ${issue.type} (${issue.severity}) - ${issue.description}`);
        }
    }

    // Summary
    console.log('');
    console.log('Summary:', result.summary);
}

main().catch(e => console.error('Error:', e.message));

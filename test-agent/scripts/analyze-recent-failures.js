/**
 * Analyze Recent Booking Failures
 *
 * Queries the test database to find recent failed booking attempts
 * and extracts the actual GUIDs that were sent.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'test-results.db');

let dbInstance;

function openDatabase() {
    dbInstance = new Database(DB_PATH, { readonly: true });
    return dbInstance;
}

function query(db, sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
}

function main() {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ANALYZE RECENT BOOKING FAILURES                           ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log(`\nDatabase: ${DB_PATH}`);

    const db = openDatabase();

    try {
        // Find recent test runs
        console.log('\n' + '═'.repeat(80));
        console.log('RECENT TEST RUNS');
        console.log('═'.repeat(80));

        const runs = query(db, `
            SELECT run_id, started_at, total_tests, passed, failed
            FROM test_runs
            ORDER BY started_at DESC
            LIMIT 5
        `);

        if (runs.length === 0) {
            console.log('No test runs found');
            return;
        }

        for (const run of runs) {
            console.log(`\n[${run.run_id}] ${run.started_at}`);
            console.log(`  Total: ${run.total_tests}, Passed: ${run.passed}, Failed: ${run.failed}`);
        }

        const latestRunId = runs[0].run_id;
        console.log(`\n\nAnalyzing latest run: ${latestRunId}`);

        // Find failed goal tests
        console.log('\n' + '═'.repeat(80));
        console.log('FAILED GOAL TESTS');
        console.log('═'.repeat(80));

        const failedTests = query(db, `
            SELECT test_id, summary_text, turn_count, constraint_violations_json
            FROM goal_test_results
            WHERE run_id = ? AND passed = 0
            ORDER BY completed_at DESC
            LIMIT 5
        `, [latestRunId]);

        if (failedTests.length === 0) {
            console.log('No failed tests found in latest run');

            // Try to find any failed test
            const anyFailed = query(db, `
                SELECT test_id, run_id, summary_text, turn_count
                FROM goal_test_results
                WHERE passed = 0
                ORDER BY completed_at DESC
                LIMIT 5
            `);

            if (anyFailed.length > 0) {
                console.log('\nFound failed tests from other runs:');
                for (const test of anyFailed) {
                    console.log(`\n[${test.test_id}] Run: ${test.run_id}`);
                    console.log(`  Summary: ${test.summary_text?.substring(0, 200) || 'N/A'}...`);
                }
            }
            return;
        }

        for (const test of failedTests) {
            console.log(`\n[${test.test_id}]`);
            console.log(`  Summary: ${test.summary_text?.substring(0, 200) || 'N/A'}...`);
            console.log(`  Turns: ${test.turn_count}`);
        }

        // Get API calls for the most recent failed test
        const testId = failedTests[0].test_id;
        console.log(`\n\nAnalyzing API calls for: ${testId}`);

        // Find API calls
        console.log('\n' + '═'.repeat(80));
        console.log('API CALLS (Tool Calls)');
        console.log('═'.repeat(80));

        const apiCalls = query(db, `
            SELECT tool_name, request_payload, response_payload, status, duration_ms
            FROM api_calls
            WHERE run_id = ? AND test_id = ?
            ORDER BY timestamp ASC
        `, [latestRunId, testId]);

        if (apiCalls.length === 0) {
            console.log('No API calls found for this test');
        } else {
            for (const call of apiCalls) {
                console.log(`\n[${call.tool_name}] Status: ${call.status} (${call.duration_ms}ms)`);

                if (call.request_payload) {
                    try {
                        const req = JSON.parse(call.request_payload);
                        console.log('  REQUEST:');

                        // Look for scheduling-related params
                        if (req.action) console.log(`    action: ${req.action}`);
                        if (req.patientGUID) console.log(`    patientGUID: ${req.patientGUID}`);
                        if (req.bookingToken) console.log(`    bookingToken: ${req.bookingToken.substring(0, 50)}...`);
                        if (req.startTime) console.log(`    startTime: ${req.startTime}`);
                        if (req.scheduleViewGUID) console.log(`    scheduleViewGUID: ${req.scheduleViewGUID}`);
                        if (req.scheduleColumnGUID) console.log(`    scheduleColumnGUID: ${req.scheduleColumnGUID}`);
                    } catch (e) {
                        console.log(`  REQUEST: ${call.request_payload?.substring(0, 200)}`);
                    }
                }

                if (call.response_payload) {
                    try {
                        const res = JSON.parse(call.response_payload);

                        // Check for booking success/failure
                        if (res.success !== undefined) {
                            console.log(`  RESPONSE: success=${res.success}`);
                            if (res.message) console.log(`    message: ${res.message}`);
                            if (res.error) console.log(`    error: ${res.error}`);
                            if (res.appointmentGUID) console.log(`    appointmentGUID: ${res.appointmentGUID}`);
                        }

                        // Check for slots response
                        if (res.slots && res.slots.length > 0) {
                            console.log(`  RESPONSE: ${res.slots.length} slots returned`);
                            const firstSlot = res.slots[0];
                            console.log(`    First slot:`);
                            console.log(`      startTime: ${firstSlot.startTime || firstSlot.displayTime}`);
                            console.log(`      scheduleViewGUID: ${firstSlot.scheduleViewGUID}`);
                            console.log(`      scheduleColumnGUID: ${firstSlot.scheduleColumnGUID}`);
                            if (firstSlot.bookingToken) console.log(`      bookingToken: ${firstSlot.bookingToken.substring(0, 30)}...`);
                        }

                        // Check for llm_guidance
                        if (res.llm_guidance) {
                            console.log(`  LLM_GUIDANCE:`);
                            console.log(`    error_type: ${res.llm_guidance.error_type || 'N/A'}`);
                            console.log(`    action_required: ${res.llm_guidance.action_required || 'N/A'}`);
                        }
                    } catch (e) {
                        console.log(`  RESPONSE: ${call.response_payload?.substring(0, 200)}`);
                    }
                }
            }
        }

        // Get transcript to see the conversation
        console.log('\n' + '═'.repeat(80));
        console.log('CONVERSATION TRANSCRIPT (Last 10 turns)');
        console.log('═'.repeat(80));

        const testResult = query(db, `
            SELECT id FROM test_results
            WHERE run_id = ? AND test_id = ?
            LIMIT 1
        `, [latestRunId, testId]);

        if (testResult.length > 0) {
            const transcripts = query(db, `
                SELECT role, content, step_id
                FROM transcripts
                WHERE test_result_id = ?
                ORDER BY turn_number DESC
                LIMIT 10
            `, [testResult[0].id]);

            for (const turn of transcripts.reverse()) {
                const roleEmoji = turn.role === 'user' ? '👤' : '🤖';
                console.log(`\n${roleEmoji} [${turn.step_id}] ${turn.role.toUpperCase()}:`);
                console.log(`   ${turn.content.substring(0, 300)}${turn.content.length > 300 ? '...' : ''}`);
            }
        }

    } finally {
        if (dbInstance) dbInstance.close();
    }
}

main();

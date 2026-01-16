const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db', { readonly: true });

// Get most recent goal test results
const results = db.prepare(`
    SELECT id, test_id, passed, duration_ms, turn_count, langfuse_trace_id,
           started_at, completed_at, goal_results_json, summary_text, flowise_session_id
    FROM goal_test_results
    ORDER BY completed_at DESC
    LIMIT 3
`).all();

console.log('=== RECENT GOAL TEST RESULTS ===');
for (const r of results) {
    console.log('');
    console.log('ID:', r.id);
    console.log('Test:', r.test_id);
    console.log('Passed:', r.passed ? 'YES' : 'NO');
    console.log('Duration:', r.duration_ms, 'ms');
    console.log('Turns:', r.turn_count);
    console.log('Trace:', r.langfuse_trace_id);
    console.log('Flowise Session:', r.flowise_session_id);
    console.log('Completed:', r.completed_at);
    console.log('Summary:', r.summary_text ? r.summary_text.substring(0, 200) : 'N/A');

    // Parse goal results for tool info
    if (r.goal_results_json) {
        const goalResults = JSON.parse(r.goal_results_json);
        console.log('Goal results:', Object.keys(goalResults).length, 'goals');
        for (const [goalName, result] of Object.entries(goalResults)) {
            console.log('  -', goalName + ':', result.achieved ? 'ACHIEVED' : 'FAILED', '-', result.evidence?.substring(0, 100) || '');
        }
    }
}

db.close();

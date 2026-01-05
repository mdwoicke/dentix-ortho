const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db');

// Get the latest run
const latestRun = db.prepare('SELECT run_id FROM goal_test_results ORDER BY id DESC LIMIT 1').get();
console.log('Latest run:', latestRun.run_id);

// Get all tests from this run
const allTests = db.prepare(`
  SELECT test_id, passed, turn_count, duration_ms, goal_results_json, summary_text
  FROM goal_test_results
  WHERE run_id = ?
  ORDER BY test_id
`).all(latestRun.run_id);

const failures = allTests.filter(t => !t.passed);
const passed = allTests.filter(t => t.passed);

console.log('\n=== TEST SUMMARY ===');
console.log('Passed: ' + passed.length + '/' + allTests.length);
console.log('Failed: ' + failures.length + '/' + allTests.length);

console.log('\n=== PASSED TESTS (' + passed.length + ') ===');
passed.forEach(t => {
  console.log('  ✓ ' + t.test_id + ' (' + t.turn_count + ' turns, ' + (t.duration_ms/1000).toFixed(1) + 's)');
});

console.log('\n=== FAILED TESTS (' + failures.length + ') ===\n');
failures.forEach((f, i) => {
  console.log((i+1) + '. ' + f.test_id);
  console.log('   Turns: ' + f.turn_count);
  console.log('   Duration: ' + (f.duration_ms/1000).toFixed(1) + 's');
  console.log('   Summary: ' + (f.summary_text || 'N/A'));

  // Parse goal results
  if (f.goal_results_json) {
    try {
      const goals = JSON.parse(f.goal_results_json);
      const metGoals = goals.filter(g => g.met);
      const unmetGoals = goals.filter(g => !g.met);
      console.log('   Goals met: ' + metGoals.length + '/' + goals.length);
      if (unmetGoals.length > 0) {
        console.log('   Unmet goals:');
        unmetGoals.forEach(g => {
          console.log('     - ' + g.id + ': ' + (g.description || g.type));
        });
      }
    } catch (e) {
      console.log('   Could not parse goals');
    }
  }
  console.log('');
});

// Analyze each failure in detail
console.log('\n=== DETAILED FAILURE ANALYSIS ===\n');

failures.forEach((f) => {
  console.log('━━━ ' + f.test_id + ' ━━━');

  // Get transcript for this specific test
  const trans = db.prepare(`
    SELECT transcript_json FROM transcripts
    WHERE run_id = ? AND test_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(latestRun.run_id, f.test_id);

  if (trans && trans.transcript_json) {
    try {
      const transcript = JSON.parse(trans.transcript_json);
      const lastTurns = transcript.slice(-8);

      console.log('Last conversation turns:');
      lastTurns.forEach((t, idx) => {
        const role = (t.role || t.type || 'unknown').toUpperCase();
        let content = t.content || t.message || '';
        // Truncate long content
        if (content.length > 300) {
          content = content.substring(0, 300) + '...';
        }
        console.log('  [' + role + ']: ' + content);
      });
    } catch (e) {
      console.log('  Could not parse transcript: ' + e.message);
    }
  } else {
    console.log('  No transcript found');
  }

  // Get API calls for this test
  const apiCalls = db.prepare(`
    SELECT tool_name, request_payload, response_payload, status
    FROM api_calls
    WHERE run_id = ? AND test_id = ?
    ORDER BY id
  `).all(latestRun.run_id, f.test_id);

  if (apiCalls.length > 0) {
    const schedulingCalls = apiCalls.filter(c => c.tool_name && c.tool_name.includes('schedule'));
    if (schedulingCalls.length > 0) {
      console.log('\nScheduling API calls (' + schedulingCalls.length + '):');
      schedulingCalls.slice(-5).forEach(c => {
        try {
          const req = JSON.parse(c.request_payload || '{}');
          const resp = JSON.parse(c.response_payload || '{}');
          console.log('  ' + (req.action || 'unknown') + ': ' + c.status);
          if (resp.slots) {
            console.log('    -> Found ' + resp.slots.length + ' slots');
          } else if (resp.groups) {
            console.log('    -> Found ' + resp.groups.length + ' groups');
          } else if (resp.llm_guidance) {
            console.log('    -> LLM guidance: ' + resp.llm_guidance.error_type);
          } else if (resp.error) {
            console.log('    -> Error: ' + resp.error);
          }
        } catch (e) {
          console.log('  Could not parse API call');
        }
      });
    }
  }

  console.log('\n');
});

// Categorize failures
console.log('\n=== FAILURE CATEGORIES ===\n');

const categories = {
  max_turns: [],
  wrong_terminal_state: [],
  unmet_goals: [],
  other: []
};

failures.forEach(f => {
  if (f.turn_count >= 49) {
    categories.max_turns.push(f.test_id);
  } else if (f.summary_text && f.summary_text.includes('terminal state')) {
    categories.wrong_terminal_state.push(f.test_id);
  } else if (f.goal_results_json) {
    const goals = JSON.parse(f.goal_results_json);
    if (goals.some(g => !g.met)) {
      categories.unmet_goals.push(f.test_id);
    } else {
      categories.other.push(f.test_id);
    }
  } else {
    categories.other.push(f.test_id);
  }
});

console.log('Max turns reached (49-50 turns): ' + categories.max_turns.length);
categories.max_turns.forEach(id => console.log('  - ' + id));

console.log('\nWrong terminal state: ' + categories.wrong_terminal_state.length);
categories.wrong_terminal_state.forEach(id => console.log('  - ' + id));

console.log('\nUnmet goals: ' + categories.unmet_goals.length);
categories.unmet_goals.forEach(id => console.log('  - ' + id));

console.log('\nOther: ' + categories.other.length);
categories.other.forEach(id => console.log('  - ' + id));

db.close();

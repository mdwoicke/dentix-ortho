const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db');

const testId = process.argv[2] || 'GOAL-EDGE-009';
const showApiCalls = process.argv[3] === '--api';

// Get latest run for this test
const result = db.prepare(`
  SELECT run_id FROM goal_test_results
  WHERE test_id = ?
  ORDER BY id DESC LIMIT 1
`).get(testId);

if (!result) {
  console.log('No results found for', testId);
  process.exit(1);
}

// Get transcript
const trans = db.prepare(`
  SELECT transcript_json FROM transcripts
  WHERE run_id = ?
  ORDER BY id DESC LIMIT 1
`).get(result.run_id);

if (!trans) {
  console.log('No transcript found for run', result.run_id);
  process.exit(1);
}

const transcript = JSON.parse(trans.transcript_json);
console.log(`=== ${testId} Transcript (${transcript.length} turns) ===\n`);

transcript.forEach((turn, i) => {
  const role = turn.role || turn.type || 'unknown';
  let content = turn.content || turn.message || '';

  // Truncate long content
  if (content.length > 300) {
    content = content.substring(0, 300) + '...';
  }

  console.log(`[${i+1}] ${role.toUpperCase()}: ${content}\n`);
});

// Show API calls if requested
if (showApiCalls) {
  console.log('\n=== API CALLS ===\n');
  const calls = db.prepare(`
    SELECT tool_name, request_payload, response_payload, status
    FROM api_calls WHERE run_id = ? ORDER BY id
  `).all(result.run_id);

  calls.forEach((c, i) => {
    if (c.tool_name.includes('schedule')) {
      console.log(`[${i+1}] ${c.tool_name} (${c.status})`);
      const req = JSON.parse(c.request_payload || '{}');
      console.log('  action:', req.action);
      console.log('  startDate:', req.startDate);
      console.log('  endDate:', req.endDate);
      console.log('  scheduleViewGUIDs:', req.scheduleViewGUIDs);

      // Show response summary
      if (c.response_payload) {
        try {
          const resp = JSON.parse(c.response_payload);
          if (resp.slots) {
            console.log('  slots found:', resp.slots.length);
          } else if (resp.groups) {
            console.log('  groups found:', resp.groups.length);
          } else if (resp.error) {
            console.log('  error:', resp.error);
          } else if (resp.llm_guidance) {
            console.log('  llm_guidance:', resp.llm_guidance.error_type, resp.llm_guidance.action_required);
          } else {
            console.log('  response:', c.response_payload.substring(0, 200));
          }
        } catch(e) {
          console.log('  response (raw):', c.response_payload.substring(0, 200));
        }
      }
      console.log('');
    }
  });
}

db.close();

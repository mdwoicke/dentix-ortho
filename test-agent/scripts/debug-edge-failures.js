// Debug all failing GOAL-EDGE tests
const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db', { readonly: true });

const failingTests = ['GOAL-EDGE-002', 'GOAL-EDGE-004', 'GOAL-EDGE-006', 'GOAL-EDGE-009'];

for (const testId of failingTests) {
  const result = db.prepare(`
    SELECT gtr.*, t.transcript_json
    FROM goal_test_results gtr
    LEFT JOIN transcripts t ON gtr.run_id = t.run_id AND gtr.test_id = t.test_id
    WHERE gtr.test_id = ?
    ORDER BY gtr.completed_at DESC
    LIMIT 1
  `).get(testId);

  if (!result) {
    console.log(`\n=== ${testId}: No result found ===\n`);
    continue;
  }

  console.log(`\n=== ${testId} ===`);
  console.log('Run ID:', result.run_id);
  console.log('Passed:', result.passed ? 'YES' : 'NO');
  console.log('Turn Count:', result.turn_count);

  // Check terminal state from last assistant turn
  if (result.transcript_json) {
    const transcript = JSON.parse(result.transcript_json);
    const lastAssistant = transcript.filter(t => t.role === 'assistant').pop();
    if (lastAssistant) {
      const content = lastAssistant.content;
      if (/transfer/i.test(content)) {
        console.log('Terminal: TRANSFER');
      } else if (/confirmed|scheduled/i.test(content)) {
        console.log('Terminal: BOOKING CONFIRMED');
      } else if (/goodbye|have a.*day/i.test(content)) {
        console.log('Terminal: GOODBYE');
      }

      // Check for API errors
      if (content.includes('PAYLOAD')) {
        const payloadMatch = content.match(/PAYLOAD:\s*({[\s\S]*})/);
        if (payloadMatch) {
          try {
            const payload = JSON.parse(payloadMatch[1]);
            if (payload.callSummary) {
              console.log('Disposition:', payload.callSummary.disposition);
              console.log('Transfer Reason:', payload.callSummary.transferReason || 'N/A');
            }
          } catch (e) {}
        }
      }

      console.log('\nLast agent message (truncated):');
      const msgOnly = content.split('PAYLOAD')[0].trim();
      console.log(msgOnly.substring(0, 300));
    }
  }

  // Show failed goals
  const goals = JSON.parse(result.goal_results_json);
  const failed = goals.filter(g => !g.passed);
  if (failed.length > 0) {
    console.log('\nFailed goals:');
    failed.forEach(g => console.log(`  - ${g.goalId}: ${g.message}`));
  }
}

db.close();

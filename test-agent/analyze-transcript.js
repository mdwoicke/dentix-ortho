const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db', { readonly: true });

const runId = 'run-2025-12-31-a38284bb';
const testId = process.argv[2] || 'HAPPY-001';

const transcript = db.prepare(`
  SELECT transcript_json
  FROM transcripts
  WHERE run_id = ? AND test_id = ?
`).get(runId, testId);

if (transcript) {
  const data = JSON.parse(transcript.transcript_json);
  // Handle both array format and object-with-turns format
  const turns = Array.isArray(data) ? data : (data.turns || []);

  console.log(`=== Transcript for ${testId} (${turns.length} turns) ===\n`);

  // Look for tool calls in assistant content
  turns.forEach((t, i) => {
    // Check for explicit toolCalls field
    if (t.toolCalls && t.toolCalls.length > 0) {
      console.log(`Turn ${i + 1} - Explicit Tool Calls:`);
      t.toolCalls.forEach(tc => {
        console.log(`  Tool: ${tc.name || tc.tool}`);
        console.log(`  Args: ${JSON.stringify(tc.arguments || tc.args, null, 2)}`);
      });
      console.log();
    }

    // Check for tool call patterns in assistant content
    if (t.role === 'assistant' && t.content) {
      const content = t.content;
      // Look for tool usage patterns like book_child, get_available_slots, etc.
      if (content.includes('book_child') || content.includes('get_available_slots') ||
          content.includes('TOOL:') || content.includes('Tool:')) {
        console.log(`Turn ${i + 1} - Tool mention in response:`);
        console.log(`  ${content.substring(0, 800)}`);
        console.log();
      }
      // Look for API error patterns
      if (content.includes('api_failure') || content.includes('error') || content.includes('transfer')) {
        console.log(`Turn ${i + 1} - Error/Transfer pattern:`);
        console.log(`  Step: ${t.stepId}`);
        console.log(`  Content: ${content.substring(0, 600)}`);
        console.log();
      }
    }
  });

  // Show last 5 turns for context
  console.log('\n=== Last 5 Turns ===');
  const lastTurns = turns.slice(-5);
  lastTurns.forEach((t, i) => {
    console.log(`\n--- Turn ${turns.length - 4 + i} ---`);
    console.log(`Role: ${t.role}, Step: ${t.stepId}`);
    console.log(`Content: ${(t.content || '').substring(0, 600)}`);
  });

} else {
  console.log('No transcript found for', testId);
}

db.close();

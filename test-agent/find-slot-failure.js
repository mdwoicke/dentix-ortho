const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db', { readonly: true });

// Get the most recent transcripts that use location 799d413a
const transcripts = db.prepare(`
    SELECT id, run_id, test_id, transcript_json, created_at
    FROM transcripts
    WHERE transcript_json LIKE '%799d413a%'
    ORDER BY created_at DESC
    LIMIT 1
`).all();

if (transcripts.length > 0) {
    const t = transcripts[0];
    console.log('='.repeat(90));
    console.log('SEARCHING FOR SLOT FAILURE IN TRANSCRIPT');
    console.log('Location: CDH - Allegheny 300M (799d413a-5e1a-46a2-b169-e2108bf517d6)');
    console.log('Test:', t.test_id, '| Run:', t.run_id);
    console.log('='.repeat(90));

    const json = JSON.parse(t.transcript_json || '[]');

    // Find the tool call/response about slots
    json.forEach((m, i) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        const contentLower = content.toLowerCase();

        // Look for slot-related messages
        if (contentLower.includes('slot') ||
            contentLower.includes('available') ||
            contentLower.includes('get_grouped_slots') ||
            contentLower.includes('grouped_slots') ||
            contentLower.includes('no appointments') ||
            contentLower.includes('schedule') && contentLower.includes('view')) {

            console.log(`\n${'='.repeat(90)}`);
            console.log(`MESSAGE ${i + 1} [${m.role}]`);
            console.log('='.repeat(90));
            console.log(content.substring(0, 3000));
            if (content.length > 3000) console.log('... [truncated]');
        }
    });

    // Also look for tool calls
    console.log('\n\n' + '='.repeat(90));
    console.log('ALL TOOL-RELATED MESSAGES');
    console.log('='.repeat(90));

    json.forEach((m, i) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        if (m.role === 'tool' || content.includes('tool_call') || content.includes('function_call') ||
            content.includes('action_input') || content.includes('schedule_appointment')) {
            console.log(`\n--- Message ${i + 1} [${m.role}] ---`);
            console.log(content.substring(0, 2000));
        }
    });
} else {
    console.log('No transcripts found for this location');
}

db.close();

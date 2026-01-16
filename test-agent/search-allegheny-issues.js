const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db', { readonly: true });

console.log('='.repeat(90));
console.log('SEARCHING FOR EVIDENCE OF ALLEGHENY 300M / NO SLOTS ISSUES IN TEST DATA');
console.log('='.repeat(90));

// Search findings for slot-related issues
const findings = db.prepare(`
    SELECT id, run_id, type, severity, title, description, actual_behavior, created_at
    FROM findings
    WHERE title LIKE '%slot%' OR description LIKE '%slot%' OR actual_behavior LIKE '%slot%'
       OR title LIKE '%allegheny%' OR description LIKE '%allegheny%'
    ORDER BY created_at DESC
    LIMIT 10
`).all();

console.log(`\nFindings mentioning slots or Allegheny: ${findings.length}\n`);
findings.forEach((f, i) => {
    console.log(`--- Finding ${i + 1} ---`);
    console.log(`Title: ${f.title}`);
    console.log(`Type: ${f.type}, Severity: ${f.severity}`);
    console.log(`Description: ${f.description?.substring(0, 400)}`);
    if (f.actual_behavior) console.log(`Actual: ${f.actual_behavior?.substring(0, 400)}`);
    console.log('');
});

// Search production trace observations for Allegheny or slot issues
try {
    const obs = db.prepare(`
        SELECT id, trace_id, name, output, started_at
        FROM production_trace_observations
        WHERE output LIKE '%799d413a%'
           OR output LIKE '%allegheny%300%'
           OR output LIKE '%no slot%available%'
           OR output LIKE '%zero slot%'
        ORDER BY started_at DESC
        LIMIT 5
    `).all();

    if (obs.length > 0) {
        console.log('\n' + '='.repeat(90));
        console.log('PRODUCTION TRACE OBSERVATIONS');
        console.log('='.repeat(90));
        obs.forEach((o, i) => {
            console.log(`\n--- Observation ${i + 1} ---`);
            console.log(`Trace ID: ${o.trace_id}`);
            console.log(`Name: ${o.name}`);
            console.log(`Output (first 1000 chars): ${o.output?.substring(0, 1000)}`);
        });
    } else {
        console.log('\nNo production trace observations found matching Allegheny/slot criteria');
    }
} catch (e) {
    console.log('Error querying observations:', e.message);
}

// Check transcripts
try {
    const transcripts = db.prepare(`
        SELECT id, run_id, test_id, transcript_json, created_at
        FROM transcripts
        WHERE transcript_json LIKE '%799d413a%'
           OR transcript_json LIKE '%allegheny%300%'
           OR transcript_json LIKE '%no slot%'
        ORDER BY created_at DESC
        LIMIT 3
    `).all();

    if (transcripts.length > 0) {
        console.log('\n' + '='.repeat(90));
        console.log('TRANSCRIPTS MENTIONING ALLEGHENY/SLOT ISSUES');
        console.log('='.repeat(90));
        transcripts.forEach((t, i) => {
            console.log(`\nTranscript ${i + 1} (test: ${t.test_id}, run: ${t.run_id}):`);
            try {
                const json = JSON.parse(t.transcript_json || '[]');
                // Find relevant messages
                json.filter(m => {
                    const content = JSON.stringify(m).toLowerCase();
                    return content.includes('slot') || content.includes('allegheny');
                }).slice(0, 5).forEach(m => {
                    console.log(`  [${m.role}]: ${JSON.stringify(m.content).substring(0, 400)}`);
                });
            } catch (e) {
                console.log('  Error parsing transcript');
            }
        });
    } else {
        console.log('\nNo transcripts found matching Allegheny/slot criteria');
    }
} catch (e) {
    console.log('Error querying transcripts:', e.message);
}

db.close();

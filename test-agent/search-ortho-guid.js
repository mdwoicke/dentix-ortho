const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'test-results.db'), { readonly: true });

console.log('Searching for OrthodontistGUID in api_calls.response_payload...\n');

const rows = db.prepare(`
    SELECT tool_name, response_payload
    FROM api_calls
    WHERE response_payload LIKE '%orthodontist%' OR response_payload LIKE '%Orthodontist%'
    LIMIT 20
`).all();

console.log(`Found ${rows.length} rows with 'orthodontist' in response_payload`);

const guids = new Set();
for (const row of rows) {
    const text = row.response_payload;
    if (text) {
        // Look for GUID patterns near orthodontist
        const matches = text.matchAll(/orthodontist[^a-f0-9-]*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi);
        for (const m of matches) {
            guids.add(m[1].toLowerCase());
        }
        // Also check for "providerGUID" pattern
        const provMatches = text.matchAll(/providerGUID[^a-f0-9-]*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi);
        for (const m of provMatches) {
            guids.add(m[1].toLowerCase());
        }
    }
}

console.log('\nUnique GUIDs found:');
guids.forEach(g => console.log(' -', g));

// Also search for any GUID that looks like a provider in patient data
console.log('\n\nSearching in request_payload for providerGUID...');

const reqRows = db.prepare(`
    SELECT tool_name, request_payload
    FROM api_calls
    WHERE request_payload LIKE '%providerGUID%'
    LIMIT 10
`).all();

console.log(`Found ${reqRows.length} requests with providerGUID`);
for (const row of reqRows) {
    const match = row.request_payload.match(/providerGUID[^a-f0-9-]*([a-f0-9-]{36})/i);
    if (match) {
        console.log(` - ${row.tool_name}: ${match[1]}`);
    }
}

db.close();

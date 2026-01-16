const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'test-agent', 'data', 'test-results.db');
console.log('Opening database:', dbPath);

try {
    const db = new Database(dbPath, { readonly: true });

    // Search for API calls that might have OrthodontistGUID in the response
    console.log('\n=== Searching for OrthodontistGUID in API responses ===\n');

    const rows = db.prepare(`
        SELECT endpoint, response_body
        FROM api_calls
        WHERE response_body LIKE '%OrthodontistGUID%' OR response_body LIKE '%orthodontistGUID%'
        LIMIT 10
    `).all();

    console.log(`Found ${rows.length} API calls with OrthodontistGUID`);

    // Extract unique OrthodontistGUIDs
    const orthoGuids = new Set();
    for (const row of rows) {
        if (row.response_body) {
            const matches = row.response_body.matchAll(/orthodontistGUID[":>\s]*([a-f0-9-]{36})/gi);
            for (const match of matches) {
                orthoGuids.add(match[1].toLowerCase());
            }
        }
    }

    console.log('\nUnique OrthodontistGUIDs found:');
    for (const guid of orthoGuids) {
        console.log(' -', guid);
    }

    // Also check for patient lookup responses that might have provider info
    console.log('\n=== Checking patient lookup responses ===\n');

    const lookupRows = db.prepare(`
        SELECT endpoint, response_body
        FROM api_calls
        WHERE endpoint LIKE '%getPatient%' AND response_body IS NOT NULL
        LIMIT 5
    `).all();

    console.log(`Found ${lookupRows.length} patient lookup calls`);
    for (const row of lookupRows) {
        console.log('Endpoint:', row.endpoint);
        if (row.response_body) {
            const parsed = JSON.parse(row.response_body);
            console.log('Response keys:', Object.keys(parsed));
            if (parsed.patient) {
                console.log('Patient keys:', Object.keys(parsed.patient));
            }
            if (parsed.patients) {
                console.log('Patients count:', parsed.patients.length);
                if (parsed.patients.length > 0) {
                    console.log('First patient keys:', Object.keys(parsed.patients[0]));
                }
            }
        }
        console.log('---');
    }

    db.close();
} catch (err) {
    console.error('Error:', err.message);
}

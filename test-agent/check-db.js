const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'test-results.db'), { readonly: true });

// Get tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// Check api_calls schema if it exists
if (tables.some(t => t.name === 'api_calls')) {
    const cols = db.prepare('PRAGMA table_info(api_calls)').all();
    console.log('\napi_calls columns:', cols.map(c => c.name).join(', '));

    // Search for OrthodontistGUID in any text column
    const allCols = cols.map(c => c.name);
    console.log('\nSearching for OrthodontistGUID...');

    // Try different column names
    const tryColumns = ['response_body', 'response', 'result', 'body'];
    for (const col of tryColumns) {
        if (allCols.includes(col)) {
            try {
                const rows = db.prepare(`SELECT ${col} FROM api_calls WHERE ${col} LIKE '%OrthodontistGUID%' LIMIT 5`).all();
                console.log(`Found ${rows.length} rows with OrthodontistGUID in ${col}`);

                const guids = new Set();
                for (const row of rows) {
                    const text = row[col];
                    if (text) {
                        const matches = text.matchAll(/orthodontistGUID[^a-f0-9-]*([a-f0-9-]{36})/gi);
                        for (const m of matches) guids.add(m[1].toLowerCase());
                    }
                }
                if (guids.size > 0) {
                    console.log('Unique OrthodontistGUIDs:');
                    guids.forEach(g => console.log(' -', g));
                }
            } catch (e) {
                console.log(`Column ${col} search error:`, e.message);
            }
        }
    }
}

// Also check test_results
if (tables.some(t => t.name === 'test_results')) {
    const cols = db.prepare('PRAGMA table_info(test_results)').all();
    console.log('\ntest_results columns:', cols.map(c => c.name).join(', '));
}

db.close();

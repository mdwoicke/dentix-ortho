/**
 * Update Sandbox A with the corrected Node-RED flow (TEST GUIDs for Location14)
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/test-results.db'));

// Read the updated Node-RED flow with correct TEST GUIDs
const noderedFlow = fs.readFileSync(path.join(__dirname, '../../nodered/Node_Red_Prod_V2.json'), 'utf8');

// Get current version
const getCurrentVersion = db.prepare('SELECT version FROM ab_sandbox_files WHERE sandbox_id = ? AND file_key = ?');
const currentVersion = getCurrentVersion.get('sandbox_a', 'nodered_flow');

console.log('Current nodered_flow version:', currentVersion?.version || 0);
console.log('New content size:', noderedFlow.length, 'chars');

// Update with the corrected flow
const updateStmt = db.prepare(`
    UPDATE ab_sandbox_files
    SET content = ?,
        version = version + 1,
        change_description = ?,
        updated_at = datetime('now')
    WHERE sandbox_id = ? AND file_key = ?
`);

updateStmt.run(
    noderedFlow,
    'v2: Fixed TEST GUIDs for Location14 (provider, location, apptType, scheduleView, scheduleColumn)',
    'sandbox_a',
    'nodered_flow'
);

console.log('\nUpdated nodered_flow in sandbox_a');

// Verify
const verify = db.prepare('SELECT file_key, version, LENGTH(content) as len, change_description, updated_at FROM ab_sandbox_files WHERE sandbox_id = ? AND file_key = ?');
const updated = verify.get('sandbox_a', 'nodered_flow');

console.log('\nVerification:');
console.log('  nodered_flow: v' + updated.version + ' (' + updated.len + ' chars)');
console.log('  Change: ' + updated.change_description);
console.log('  Updated: ' + updated.updated_at);

// Also show summary of all sandbox_a files
console.log('\n=== All Sandbox A Files ===');
const allFiles = db.prepare('SELECT file_key, version, LENGTH(content) as len, change_description FROM ab_sandbox_files WHERE sandbox_id = ?').all('sandbox_a');
allFiles.forEach(f => {
    console.log('  ' + f.file_key + ': v' + f.version + ' (' + f.len + ' chars)');
});

db.close();
console.log('\nDone!');

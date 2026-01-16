const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/test-results.db'));

// Read the new SANDBOX tools
const patientTool = fs.readFileSync(path.join(__dirname, '../../docs/v1/chord_dso_patient_Tool_SANDBOX.json'), 'utf8');
const schedulingTool = fs.readFileSync(path.join(__dirname, '../../docs/v1/schedule_appointment_dso_Tool_SANDBOX.json'), 'utf8');

// Get current versions
const getCurrentVersion = db.prepare('SELECT version FROM ab_sandbox_files WHERE sandbox_id = ? AND file_key = ?');
const patientVersion = getCurrentVersion.get('sandbox_a', 'patient_tool');
const schedulingVersion = getCurrentVersion.get('sandbox_a', 'scheduling_tool');

console.log('Current versions:');
console.log('  patient_tool: v' + (patientVersion?.version || 0));
console.log('  scheduling_tool: v' + (schedulingVersion?.version || 0));

// Update with all required fields
const updateStmt = db.prepare(`
    UPDATE ab_sandbox_files
    SET content = ?,
        version = version + 1,
        change_description = ?,
        updated_at = datetime('now')
    WHERE sandbox_id = ? AND file_key = ?
`);

updateStmt.run(patientTool, 'v5-SANDBOX: Changed to /ortho/ routes for TEST Cloud9', 'sandbox_a', 'patient_tool');
console.log('\nUpdated patient_tool');

updateStmt.run(schedulingTool, 'v53-SANDBOX: Changed to /ortho/ routes for TEST Cloud9', 'sandbox_a', 'scheduling_tool');
console.log('Updated scheduling_tool');

// Verify
const verify = db.prepare('SELECT file_key, version, change_description, LENGTH(content) as len, updated_at FROM ab_sandbox_files WHERE sandbox_id = ? AND file_key IN (?, ?)');
const updated = verify.all('sandbox_a', 'patient_tool', 'scheduling_tool');
console.log('\nUpdated sandbox_a tools:');
updated.forEach(f => {
    console.log('  ' + f.file_key + ': v' + f.version + ' (' + f.len + ' chars)');
    console.log('    Change: ' + f.change_description);
    console.log('    Updated: ' + f.updated_at);
});

db.close();
console.log('\nDone!');

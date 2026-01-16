/**
 * Fix Sandbox B scheduling_tool to use DEFAULT_SCHEDULE_VIEW_GUID for both slots and grouped_slots
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/test-results.db');
const db = new Database(DB_PATH);

const current = db.prepare(`
    SELECT content, version FROM ab_sandbox_files
    WHERE sandbox_id = 'sandbox_b' AND file_key = 'scheduling_tool'
`).get();

console.log('Current version:', current.version);

// Check for bug pattern
const bugPattern = /if \(params\.scheduleViewGUIDs\) body\.scheduleViewGUIDs = params\.scheduleViewGUIDs;/g;
const bugCount = (current.content.match(bugPattern) || []).length;
console.log('Bug occurrences found:', bugCount);

if (bugCount > 0) {
    // Apply fix
    const fixed = current.content.replace(
        bugPattern,
        'body.scheduleViewGUIDs = params.scheduleViewGUIDs || DEFAULT_SCHEDULE_VIEW_GUID;'
    );

    const fixCount = (fixed.match(/params\.scheduleViewGUIDs \|\| DEFAULT_SCHEDULE_VIEW_GUID/g) || []).length;
    console.log('Fixes applied:', fixCount);

    const now = new Date().toISOString();
    const newVersion = current.version + 1;

    // Save to history
    db.prepare(`
        INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run('sandbox_b', 'scheduling_tool', current.version, current.content, 'Before grouped_slots fix', now);

    // Update current
    db.prepare(`
        UPDATE ab_sandbox_files
        SET content = ?, version = ?, change_description = ?, updated_at = ?
        WHERE sandbox_id = 'sandbox_b' AND file_key = 'scheduling_tool'
    `).run(fixed, newVersion, 'FIX: Always use DEFAULT_SCHEDULE_VIEW_GUID for both slots AND grouped_slots', now);

    console.log('Updated to version:', newVersion);
    console.log('\n=== OUTPUT FIXED CODE ===\n');
    console.log(fixed);
} else {
    console.log('No bugs found - already fixed!');
    console.log('\n=== CURRENT CODE ===\n');
    console.log(current.content);
}

db.close();

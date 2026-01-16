#!/usr/bin/env node
/**
 * Update scheduling tool in Sandbox A database with v52 content
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'test-results.db');
const db = new Database(dbPath);

// Read the v52 tool content (escaped version for Flowise)
const escapedFuncPath = path.join(__dirname, '..', '..', 'docs', 'v1', 'scheduling_tool_func_escaped.js');
const funcContent = fs.readFileSync(escapedFuncPath, 'utf-8');

console.log('=== V52 SCHEDULING TOOL UPDATE FOR SANDBOX A ===\n');
console.log('Func content length:', funcContent.length, 'chars');

// Check if version matches v52
const versionMatch = funcContent.match(/TOOL_VERSION = '([^']+)'/);
console.log('Tool version:', versionMatch ? versionMatch[1] : 'unknown');

// The sandbox_id in ab_sandbox_files is TEXT, referencing ab_sandboxes.sandbox_id
const SANDBOX_ID = 'sandbox_a';

// Verify sandbox exists
const sandbox = db.prepare("SELECT * FROM ab_sandboxes WHERE sandbox_id = ?").get(SANDBOX_ID);
console.log('\nSandbox A exists:', !!sandbox);

if (!sandbox) {
    console.log('ERROR: Sandbox A not found in database!');
    process.exit(1);
}

// Check current sandbox A file
const existing = db.prepare(`
    SELECT id, version, file_key, LENGTH(content) as content_len, change_description, updated_at
    FROM ab_sandbox_files
    WHERE sandbox_id = ? AND file_key = 'scheduling_tool'
`).get(SANDBOX_ID);

console.log('\nExisting file:', existing || 'None (will create new)');

// First, save current version to history if it exists
if (existing) {
    const currentContent = db.prepare(`
        SELECT content FROM ab_sandbox_files WHERE id = ?
    `).get(existing.id);

    if (currentContent) {
        const historyStmt = db.prepare(`
            INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
            VALUES (?, 'scheduling_tool', ?, ?, ?, datetime('now'))
        `);
        historyStmt.run(SANDBOX_ID, existing.version, currentContent.content, existing.change_description);
        console.log('Saved current version to history');
    }
}

// Insert or update the file
const upsertStmt = db.prepare(`
    INSERT INTO ab_sandbox_files (sandbox_id, file_key, file_type, display_name, content, version, change_description, created_at, updated_at)
    VALUES (?, 'scheduling_tool', 'javascript', 'Scheduling Tool', ?, 1, 'v52 - Individual GUIDs for booking, removed bookingToken requirement', datetime('now'), datetime('now'))
    ON CONFLICT(sandbox_id, file_key) DO UPDATE SET
        content = excluded.content,
        version = version + 1,
        change_description = 'v52 - Individual GUIDs for booking, removed bookingToken requirement',
        updated_at = datetime('now')
`);

const result = upsertStmt.run(SANDBOX_ID, funcContent);
console.log('\nDatabase update result:', {
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid
});

// Verify the update
const updated = db.prepare(`
    SELECT id, version, file_key, LENGTH(content) as content_len, change_description, updated_at
    FROM ab_sandbox_files
    WHERE sandbox_id = ? AND file_key = 'scheduling_tool'
`).get(SANDBOX_ID);

console.log('\nUpdated file:', updated);

// Verify the content has v52
const verifyContent = db.prepare(`
    SELECT content FROM ab_sandbox_files WHERE sandbox_id = ? AND file_key = 'scheduling_tool'
`).get(SANDBOX_ID);

if (verifyContent) {
    const verifyVersion = verifyContent.content.match(/TOOL_VERSION = '([^']+)'/);
    console.log('\nVerification - stored version:', verifyVersion ? verifyVersion[1] : 'not found');
}

db.close();

console.log('\n=== SUCCESS ===');
console.log('Scheduling tool v52 has been saved to Sandbox A in the database.');
console.log('\nNOTE: This updates the local database. To test with this version,');
console.log('you also need to update the Flowise chatflow with the same content.');

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Read the escaped JavaScript content
const funcPath = path.join(__dirname, '../../docs/v1/scheduling_tool_func_escaped.js');
const content = fs.readFileSync(funcPath, 'utf-8');

console.log('Read scheduling_tool_func_escaped.js');
console.log('Content length:', content.length, 'characters');

const db = new Database('./data/test-results.db');

// Get current version
const current = db.prepare("SELECT version FROM prompt_working_copies WHERE file_key = 'scheduling_tool'").get();
const newVersion = current.version + 1;

console.log('Current version:', current.version);
console.log('New version:', newVersion);

// Update prompt_working_copies
const updateStmt = db.prepare(`
  UPDATE prompt_working_copies
  SET content = ?, version = ?, updated_at = ?
  WHERE file_key = 'scheduling_tool'
`);

const now = new Date().toISOString();
updateStmt.run(content, newVersion, now);
console.log('Updated prompt_working_copies to version', newVersion);

// Add to version history
const insertHistory = db.prepare(`
  INSERT INTO prompt_version_history
  (file_key, version, content, change_description, created_at, ai_generated, is_experimental)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

insertHistory.run(
  'scheduling_tool',
  newVersion,
  content,
  'v20: Added default scheduleViewGUID (2544683a-8e79-4b32-a4d4-bf851996bac3) for slots and grouped_slots actions when not provided',
  now,
  0,
  0
);
console.log('Added version history entry');

// Verify
const verify = db.prepare("SELECT file_key, version, updated_at FROM prompt_working_copies WHERE file_key = 'scheduling_tool'").get();
console.log('Verified:', verify);

db.close();
console.log('Done!');

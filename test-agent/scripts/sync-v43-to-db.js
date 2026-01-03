#!/usr/bin/env node
/**
 * Sync v43 scheduling tool to database
 * Reads from the .js file directly and saves to DB
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/test-results.db');
const V1_DIR = path.join(__dirname, '../../docs/v1');
const JS_FILE = path.join(V1_DIR, 'scheduling_tool_func.js');
const ESCAPED_FILE = path.join(V1_DIR, 'scheduling_tool_func_escaped.js');

// Read the raw JS content
const rawContent = fs.readFileSync(JS_FILE, 'utf-8');
console.log(`Read ${rawContent.length} chars from scheduling_tool_func.js`);

// Check version
const versionMatch = rawContent.match(/TOOL_VERSION = '(v\d+)'/);
if (versionMatch) {
  console.log(`Tool version: ${versionMatch[1]}`);
}

// Create escaped version for Flowise
const escaped = rawContent.split('{').join('{{').split('}').join('}}');
fs.writeFileSync(ESCAPED_FILE, escaped);
console.log(`Wrote ${escaped.length} chars to scheduling_tool_func_escaped.js`);

// Save to database
const db = new Database(DB_PATH, { readonly: false });
const now = new Date().toISOString();

try {
  const current = db.prepare('SELECT version FROM prompt_working_copies WHERE file_key = ?').get('scheduling_tool');
  const newVersion = (current?.version || 0) + 1;

  db.prepare('UPDATE prompt_working_copies SET content = ?, version = ?, updated_at = ? WHERE file_key = ?')
    .run(rawContent, newVersion, now, 'scheduling_tool');

  db.prepare('INSERT INTO prompt_version_history (file_key, version, content, fix_id, change_description, created_at) VALUES (?, ?, ?, NULL, ?, ?)')
    .run('scheduling_tool', newVersion, rawContent, 'v43: Removed DEFAULT_SCHEDULE_VIEW_GUID - was returning 0 slots', now);

  console.log(`Database: v${current?.version || 0} -> v${newVersion}`);
  console.log('Synced v43 scheduling tool to database');
} finally {
  db.close();
}

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data/test-results.db');
const TOOL_PATH = path.join(__dirname, '../docs/v1/scheduling_tool_func.js');

// Read the raw (non-escaped) tool content
const rawContent = fs.readFileSync(TOOL_PATH, 'utf-8');
console.log('Raw content length:', rawContent.length);
console.log('Has escaped brackets:', rawContent.includes('{{') || rawContent.includes('}}'));

const db = new Database(DB_PATH, { readonly: false });
const now = new Date().toISOString();

try {
  // Update ab_sandbox_files for sandbox_a
  const existing = db.prepare("SELECT id, version FROM ab_sandbox_files WHERE sandbox_id = 'sandbox_a' AND file_key = 'scheduling_tool'").get();

  if (existing) {
    const newVersion = (existing.version || 0) + 1;

    // Save to history first
    db.prepare("INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, created_at) VALUES ('sandbox_a', 'scheduling_tool', ?, ?, ?)").run(newVersion, rawContent, now);

    // Update current
    db.prepare("UPDATE ab_sandbox_files SET content = ?, version = ?, updated_at = ? WHERE id = ?").run(rawContent, newVersion, now, existing.id);

    console.log('Updated sandbox_a scheduling_tool: v' + existing.version + ' -> v' + newVersion);
  } else {
    console.log('No existing entry found for sandbox_a scheduling_tool');
  }
} finally {
  db.close();
}

// Verify
const db2 = new Database(DB_PATH, { readonly: true });
const verify = db2.prepare("SELECT content, version FROM ab_sandbox_files WHERE sandbox_id = 'sandbox_a' AND file_key = 'scheduling_tool'").get();
console.log('\nVerification:');
console.log('  Version:', verify.version);
console.log('  Content length:', verify.content.length);
console.log('  Has escaped brackets:', verify.content.includes('{{') || verify.content.includes('}}'));
db2.close();

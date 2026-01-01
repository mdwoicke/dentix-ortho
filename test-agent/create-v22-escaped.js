const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..');

// Read the source code
const sourceCode = fs.readFileSync(path.join(projectRoot, 'docs/v1/scheduling_tool_func.js'), 'utf8');

// Escape for Flowise Mustache templates: { -> {{ and } -> }}
const escapedCode = sourceCode.replace(/\{/g, '{{').replace(/\}/g, '}}');

// Write to escaped file
fs.writeFileSync(path.join(projectRoot, 'docs/v1/scheduling_tool_func_escaped.js'), escapedCode);
console.log('Wrote escaped file: docs/v1/scheduling_tool_func_escaped.js');
console.log('Length:', escapedCode.length);
console.log('Double braces count:', (escapedCode.match(/\{\{/g) || []).length);

// Save to database as new version
const db = new Database(path.join(projectRoot, 'test-agent/data/test-results.db'));

// Get max version
const maxVersion = db.prepare('SELECT MAX(version) as max FROM prompt_working_copies WHERE prompt_name = ?').get('Scheduling Tool');
const newVersion = (maxVersion?.max || 0) + 1;

console.log('\nCreating v' + newVersion + ' in database...');

// Insert new version with escaped func code
db.prepare(`
  INSERT INTO prompt_working_copies (prompt_name, content, version, created_at, updated_at, notes)
  VALUES (?, ?, ?, datetime('now'), datetime('now'), ?)
`).run('Scheduling Tool', escapedCode, newVersion, 'v18 Node Red with escaped braces for Flowise');

// Also add to version history
db.prepare(`
  INSERT INTO prompt_version_history (prompt_name, version, content, created_at, change_summary)
  VALUES (?, ?, ?, datetime('now'), ?)
`).run('Scheduling Tool', newVersion, escapedCode, 'v18 Node Red code with {{ }} escaping for Flowise Mustache templates');

console.log('Created v' + newVersion + ' successfully');

// Verify
const verify = db.prepare('SELECT version, length(content) as len FROM prompt_working_copies WHERE prompt_name = ? ORDER BY version DESC LIMIT 1').get('Scheduling Tool');
console.log('\nVerification:');
console.log('Version:', verify.version);
console.log('Length:', verify.len);
console.log('Has Node Red URL:', escapedCode.includes('nodered'));
console.log('Has correctDate:', escapedCode.includes('correctDate'));
console.log('Double braces:', (escapedCode.match(/\{\{/g) || []).length, 'pairs');

db.close();
console.log('\nDone!');

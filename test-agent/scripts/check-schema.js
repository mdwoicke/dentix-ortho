const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db');

console.log('Tables:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log('  -', t.name));

console.log('\nprompt_working_copies schema:');
try {
  const cols = db.prepare('PRAGMA table_info(prompt_working_copies)').all();
  cols.forEach(c => console.log(`  ${c.name}: ${c.type}`));
} catch(e) {
  console.log('Table not found:', e.message);
}

console.log('\nprompt_version_history schema:');
try {
  const cols = db.prepare('PRAGMA table_info(prompt_version_history)').all();
  cols.forEach(c => console.log(`  ${c.name}: ${c.type}`));
} catch(e) {
  console.log('Table not found:', e.message);
}

// Check current scheduling_tool entry
console.log('\nCurrent scheduling_tool entries:');
try {
  const entry = db.prepare("SELECT id, file_key, version, updated_at, display_name FROM prompt_working_copies WHERE file_key LIKE '%scheduling%'").all();
  console.log(JSON.stringify(entry, null, 2));
} catch(e) {
  console.log('Error:', e.message);
}

// Check all entries
console.log('\nAll prompt_working_copies entries:');
try {
  const all = db.prepare("SELECT id, file_key, version, display_name FROM prompt_working_copies").all();
  console.log(JSON.stringify(all, null, 2));
} catch(e) {
  console.log('Error:', e.message);
}

db.close();

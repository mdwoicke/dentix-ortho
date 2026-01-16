const Database = require('better-sqlite3');
const db = new Database('data/test-results.db');

const file = db.prepare("SELECT content FROM ab_sandbox_files WHERE sandbox_id = 'sandbox_a' AND file_key = 'scheduling_tool'").get();
if (file) {
  console.log('Content length:', file.content.length);
  // Check for double curly brackets (escaped)
  const hasEscaped = file.content.includes('{{') || file.content.includes('}}');
  console.log('Has escaped brackets:', hasEscaped);
  // Show first 500 chars
  console.log('\nFirst 500 chars:');
  console.log(file.content.substring(0, 500));
}
db.close();

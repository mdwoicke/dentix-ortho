/**
 * Verify Sandbox B files configuration
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/test-results.db');

const db = new Database(DB_PATH);

console.log('=== SANDBOX B FILES SUMMARY ===\n');

const files = db.prepare(`
  SELECT file_key, version, LENGTH(content) as size, change_description
  FROM ab_sandbox_files WHERE sandbox_id = ?
`).all('sandbox_b');

files.forEach(f => {
  console.log(`${f.file_key} (v${f.version}, ${f.size} chars)`);
  console.log(`  ${f.change_description}`);
  console.log();
});

console.log('=== ROUTE VERIFICATION ===\n');

// Check routes in tools
['patient_tool', 'scheduling_tool', 'nodered_flow'].forEach(key => {
  const file = db.prepare(`
    SELECT content FROM ab_sandbox_files WHERE sandbox_id = ? AND file_key = ?
  `).get('sandbox_b', key);
  if (file) {
    const ortho = (file.content.match(/\/ortho\//g) || []).length;
    const orthoPrd = (file.content.match(/\/ortho-prd\//g) || []).length;
    console.log(`${key}:`);
    console.log(`  /ortho/ count: ${ortho}`);
    console.log(`  /ortho-prd/ count: ${orthoPrd}`);
  }
});

console.log('\n=== CREDENTIALS VERIFICATION (nodered_flow) ===\n');

const nodered = db.prepare(`
  SELECT content FROM ab_sandbox_files WHERE sandbox_id = ? AND file_key = ?
`).get('sandbox_b', 'nodered_flow');

if (nodered) {
  const content = nodered.content;
  console.log('PROD endpoint (us-ea1-partner):', content.includes('us-ea1-partner.cloud9ortho.com') ? 'YES' : 'NO');
  console.log('TEST endpoint (us-ea1-partnertest):', content.includes('us-ea1-partnertest.cloud9ortho.com') ? 'YES' : 'NO');
  console.log('PROD ClientID:', content.includes('b42c51be-2529-4d31-92cb-50fd1a58c084') ? 'YES' : 'NO');
  console.log('TEST ClientID:', content.includes('c15aa02a-adc1-40ae-a2b5-d2e39173ae56') ? 'YES' : 'NO');

  const hasProdUser = content.includes('Intelepeer');
  const hasTestUser = content.includes('IntelepeerTest');
  console.log('PROD Username (Intelepeer only):', hasProdUser && !hasTestUser ? 'YES' : 'NO');
}

db.close();
console.log('\nDone!');

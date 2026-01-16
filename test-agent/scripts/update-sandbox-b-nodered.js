/**
 * Update Sandbox B Node Red flow
 * Copies from Sandbox A and replaces TEST credentials with PROD credentials
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/test-results.db');

async function updateSandboxBNodeRed() {
  const db = new Database(DB_PATH);
  const now = new Date().toISOString();

  // Get Sandbox A nodered_flow
  const sandboxA = db.prepare(`
    SELECT content, version FROM ab_sandbox_files
    WHERE sandbox_id = ? AND file_key = ?
  `).get('sandbox_a', 'nodered_flow');

  if (!sandboxA) {
    console.log('ERROR: Sandbox A nodered_flow not found');
    process.exit(1);
  }

  console.log('Sandbox A nodered_flow loaded, length:', sandboxA.content.length);

  // Make replacements for PROD
  let noderedB = sandboxA.content
    // Replace TEST endpoint with PROD endpoint
    .replace(/us-ea1-partnertest\.cloud9ortho\.com/g, 'us-ea1-partner.cloud9ortho.com')
    // Replace TEST ClientID with PROD ClientID
    .replace(/c15aa02a-adc1-40ae-a2b5-d2e39173ae56/g, 'b42c51be-2529-4d31-92cb-50fd1a58c084')
    // Replace TEST UserName with PROD UserName
    .replace(/IntelepeerTest/g, 'Intelepeer')
    // Replace TEST Password with PROD Password
    .replace(/#!InteleP33rTest!#/g, '$#1Nt-p33R-AwS#$')
    // Replace /ortho/ routes with /ortho-prd/
    .replace(/\/ortho\//g, '/ortho-prd/');

  console.log('\nReplacements made. New length:', noderedB.length);

  // Verify changes
  console.log('\nVerification:');
  console.log('  PROD endpoint count:', (noderedB.match(/us-ea1-partner\.cloud9ortho\.com/g) || []).length);
  console.log('  TEST endpoint count:', (noderedB.match(/us-ea1-partnertest\.cloud9ortho\.com/g) || []).length);
  console.log('  PROD ClientID count:', (noderedB.match(/b42c51be-2529-4d31-92cb-50fd1a58c084/g) || []).length);
  console.log('  TEST ClientID count:', (noderedB.match(/c15aa02a-adc1-40ae-a2b5-d2e39173ae56/g) || []).length);
  console.log('  Intelepeer (PROD) count:', (noderedB.match(/Intelepeer(?!Test)/g) || []).length);
  console.log('  IntelepeerTest count:', (noderedB.match(/IntelepeerTest/g) || []).length);
  console.log('  /ortho-prd/ routes:', (noderedB.match(/\/ortho-prd\//g) || []).length);
  console.log('  /ortho/ routes:', (noderedB.match(/\/ortho\//g) || []).length);

  // Get current Sandbox B nodered_flow
  const existing = db.prepare(`
    SELECT id, version, content, change_description
    FROM ab_sandbox_files
    WHERE sandbox_id = ? AND file_key = ?
  `).get('sandbox_b', 'nodered_flow');

  if (existing) {
    // Save current to history
    db.prepare(`
      INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('sandbox_b', 'nodered_flow', existing.version, existing.content, existing.change_description, now);

    // Update with new content
    const newVersion = existing.version + 1;
    db.prepare(`
      UPDATE ab_sandbox_files
      SET content = ?, version = ?, change_description = ?, updated_at = ?
      WHERE sandbox_id = ? AND file_key = ?
    `).run(noderedB, newVersion, 'Copied from Sandbox A with PROD Cloud9 credentials and /ortho-prd/ routes', now, 'sandbox_b', 'nodered_flow');

    console.log('\n✅ Updated Sandbox B nodered_flow to version', newVersion);
  } else {
    // Insert new
    db.prepare(`
      INSERT INTO ab_sandbox_files (sandbox_id, file_key, file_type, display_name, content, version, change_description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sandbox_b', 'nodered_flow', 'json', 'Node-RED Flow', noderedB, 1, 'Copied from Sandbox A with PROD Cloud9 credentials and /ortho-prd/ routes', now, now);

    console.log('\n✅ Created Sandbox B nodered_flow version 1');
  }

  db.close();
  console.log('\nDone!');
}

updateSandboxBNodeRed().catch(console.error);

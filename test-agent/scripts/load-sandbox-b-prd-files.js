/**
 * Load PRD files into Sandbox B database
 * This script loads the production Sandbox B files into the ab_sandbox_files table
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/test-results.db');
const V1_DIR = path.join(__dirname, '../../docs/v1');

const SANDBOX_ID = 'sandbox_b';

const FILES_TO_LOAD = [
  {
    fileKey: 'system_prompt',
    filePath: 'Chord_Cloud9_SystemPrompt.md',
    fileType: 'markdown',
    displayName: 'System Prompt'
  },
  {
    fileKey: 'patient_tool',
    filePath: 'chord_dso_patient_func_PRD.js',
    fileType: 'javascript',
    displayName: 'Patient Tool'
  },
  {
    fileKey: 'scheduling_tool',
    filePath: 'schedule_appointment_func_PRD.js',
    fileType: 'javascript',
    displayName: 'Scheduling Tool'
  },
  {
    fileKey: 'nodered_flow',
    filePath: 'nodered_Cloud9_flows_SandboxB.json',
    fileType: 'json',
    displayName: 'Node-RED Flow'
  }
];

async function loadSandboxBFiles() {
  console.log('Loading PRD files into Sandbox B...\n');

  const db = new Database(DB_PATH);
  const now = new Date().toISOString();

  // Ensure sandbox_b exists in ab_sandboxes
  const sandboxExists = db.prepare(`
    SELECT sandbox_id FROM ab_sandboxes WHERE sandbox_id = ?
  `).get(SANDBOX_ID);

  if (!sandboxExists) {
    console.log('Creating Sandbox B entry...');
    db.prepare(`
      INSERT INTO ab_sandboxes (sandbox_id, name, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(SANDBOX_ID, 'Sandbox B (PROD)', 'Production Cloud9 environment with CDH Allegheny 202', 1, now, now);
  }

  for (const file of FILES_TO_LOAD) {
    const fullPath = path.join(V1_DIR, file.filePath);

    if (!fs.existsSync(fullPath)) {
      console.log(`❌ File not found: ${file.filePath}`);
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    console.log(`Loading ${file.fileKey} from ${file.filePath} (${content.length} chars)...`);

    // Check if file exists in sandbox
    const existing = db.prepare(`
      SELECT id, version, content, change_description
      FROM ab_sandbox_files
      WHERE sandbox_id = ? AND file_key = ?
    `).get(SANDBOX_ID, file.fileKey);

    if (existing) {
      // Save current to history
      db.prepare(`
        INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(SANDBOX_ID, file.fileKey, existing.version, existing.content, existing.change_description, now);

      // Update with new content
      const newVersion = existing.version + 1;
      db.prepare(`
        UPDATE ab_sandbox_files
        SET content = ?, version = ?, change_description = ?, updated_at = ?
        WHERE sandbox_id = ? AND file_key = ?
      `).run(content, newVersion, 'Loaded PRD files for Sandbox B (PROD Cloud9)', now, SANDBOX_ID, file.fileKey);

      console.log(`  ✅ Updated ${file.fileKey} to version ${newVersion}`);
    } else {
      // Insert new file
      db.prepare(`
        INSERT INTO ab_sandbox_files (sandbox_id, file_key, file_type, display_name, content, version, change_description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(SANDBOX_ID, file.fileKey, file.fileType, file.displayName, content, 1, 'Initial PRD version for Sandbox B (PROD Cloud9)', now, now);

      console.log(`  ✅ Created ${file.fileKey} version 1`);
    }
  }

  db.close();

  console.log('\n✅ Sandbox B files loaded successfully!');
  console.log('\nSandbox B now contains:');
  console.log('  - System Prompt (shared with Sandbox A)');
  console.log('  - Patient Tool (v5-PRD with /ortho-prd/ routes)');
  console.log('  - Scheduling Tool (v54-PRD with /ortho-prd/ routes)');
  console.log('  - Node-RED Flow (PROD Cloud9 with Chair 8 GUID)');
}

loadSandboxBFiles().catch(console.error);

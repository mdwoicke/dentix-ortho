/**
 * Sync V1 files to database
 * This script reads the updated V1 files from disk and creates new versions in the database
 */

const BetterSqlite3 = require('../test-agent/node_modules/better-sqlite3');
const fs = require('fs');
const path = require('path');

/**
 * Escape curly braces for Flowise Mustache template compatibility.
 * Converts single { to {{ and single } to }} (unless already escaped)
 */
function escapeForFlowise(content) {
  if (!content) return content;

  const replacements = [];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1] || '';
    const prevChar = content[i - 1] || '';

    if (char === '{') {
      if (nextChar !== '{' && prevChar !== '{') {
        replacements.push({ index: i, from: '{', to: '{{' });
      } else if (nextChar === '{') {
        i++;
      }
    } else if (char === '}') {
      if (nextChar !== '}' && prevChar !== '}') {
        replacements.push({ index: i, from: '}', to: '}}' });
      } else if (nextChar === '}') {
        i++;
      }
    }
  }

  let result = content;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { index, from, to } = replacements[i];
    result = result.substring(0, index) + to + result.substring(index + from.length);
  }

  return result;
}

// Paths
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../test-agent/data/test-results.db');
const V1_DIR = path.resolve(__dirname, '../docs/v1');

// File mappings
const PROMPT_FILE_MAPPINGS = {
  system_prompt: {
    path: path.join(V1_DIR, 'Chord_Cloud9_SystemPrompt.md'),
    displayName: 'System Prompt',
  },
  scheduling_tool: {
    path: path.join(V1_DIR, 'schedule_appointment_dso_Tool.json'),
    displayName: 'Scheduling Tool',
  },
  patient_tool: {
    path: path.join(V1_DIR, 'chord_dso_patient_Tool.json'),
    displayName: 'Patient Tool',
  },
};

function getNextVersion(db, fileKey) {
  const historyMax = db.prepare(`
    SELECT MAX(version) as maxVersion FROM prompt_version_history WHERE file_key = ?
  `).get(fileKey);

  const workingCopy = db.prepare(`
    SELECT version FROM prompt_working_copies WHERE file_key = ?
  `).get(fileKey);

  const maxFromHistory = historyMax?.maxVersion || 0;
  const maxFromWorkingCopy = workingCopy?.version || 0;
  return Math.max(maxFromHistory, maxFromWorkingCopy) + 1;
}

function resetFromDisk(fileKey) {
  const mapping = PROMPT_FILE_MAPPINGS[fileKey];
  if (!mapping) {
    throw new Error(`Unknown file key: ${fileKey}`);
  }

  if (!fs.existsSync(mapping.path)) {
    throw new Error(`Source file not found: ${mapping.path}`);
  }

  let content = fs.readFileSync(mapping.path, 'utf-8');

  // Apply Flowise escaping for non-tool files (system_prompt)
  const isToolFile = fileKey.includes('tool');
  if (!isToolFile) {
    content = escapeForFlowise(content);
    console.log(`  (Applied Flowise escaping for ${fileKey})`);
  }

  const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: false });

  try {
    const current = db.prepare(`
      SELECT version FROM prompt_working_copies WHERE file_key = ?
    `).get(fileKey);

    const newVersion = getNextVersion(db, fileKey);
    const now = new Date().toISOString();

    if (current) {
      // Update existing working copy
      db.prepare(`
        UPDATE prompt_working_copies
        SET content = ?, version = ?, updated_at = ?, last_fix_id = NULL
        WHERE file_key = ?
      `).run(content, newVersion, now, fileKey);
    } else {
      // Create new working copy
      db.prepare(`
        INSERT INTO prompt_working_copies (file_key, file_path, display_name, content, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(fileKey, mapping.path, mapping.displayName, content, newVersion, now);
    }

    // Create version history entry
    db.prepare(`
      INSERT INTO prompt_version_history (file_key, version, content, fix_id, change_description, created_at)
      VALUES (?, ?, ?, NULL, 'Updated tool names: chord_ortho_patient, schedule_appointment_ortho', ?)
    `).run(fileKey, newVersion, content, now);

    console.log(`✓ ${fileKey}: Reset to v${newVersion}`);
    return { version: newVersion, content };
  } finally {
    db.close();
  }
}

// Main
console.log('Syncing V1 files to database...\n');

for (const fileKey of Object.keys(PROMPT_FILE_MAPPINGS)) {
  try {
    resetFromDisk(fileKey);
  } catch (error) {
    console.error(`✗ ${fileKey}: ${error.message}`);
  }
}

console.log('\nDone! Refresh the app to see new versions.');

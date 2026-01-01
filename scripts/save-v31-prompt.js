#!/usr/bin/env node
/**
 * Script to save v31 of the System Prompt with double curly bracket escaping
 */

const BetterSqlite3 = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../test-agent/data/test-results.db');
const V1_DIR = path.resolve(__dirname, '../docs/v1');

/**
 * Escape curly braces for Flowise Mustache template compatibility.
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

function main() {
  console.log('Opening database:', TEST_AGENT_DB_PATH);
  const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: false });

  try {
    // Get current version from history
    const historyMax = db.prepare(`
      SELECT MAX(version) as maxVersion FROM prompt_version_history WHERE file_key = ?
    `).get('system_prompt');

    const workingCopy = db.prepare(`
      SELECT version FROM prompt_working_copies WHERE file_key = ?
    `).get('system_prompt');

    const currentVersion = Math.max(
      historyMax?.maxVersion || 0,
      workingCopy?.version || 0
    );

    console.log('Current version:', currentVersion);
    const newVersion = currentVersion + 1;
    console.log('Creating new version:', newVersion);

    // Read the V1 file
    const promptPath = path.join(V1_DIR, 'Chord_Cloud9_SystemPrompt.md');
    console.log('Reading:', promptPath);
    const content = fs.readFileSync(promptPath, 'utf8');
    console.log('Content length:', content.length, 'characters');

    // Escape for Flowise (double curly brackets)
    const escapedContent = escapeForFlowise(content);
    console.log('Escaped content length:', escapedContent.length, 'characters');

    const now = new Date().toISOString();
    const changeDescription = 'v' + newVersion + ': appointmentTypeGUID fix - Node Red flows inject default GUID (8fc9d063-ae46-4975-a5ae-734c6efe341a) when Cloud9 sandbox returns empty';

    // Update working copy
    db.prepare(`
      UPDATE prompt_working_copies
      SET content = ?, version = ?, updated_at = ?
      WHERE file_key = ?
    `).run(escapedContent, newVersion, now, 'system_prompt');
    console.log('Updated working copy');

    // Create version history entry
    db.prepare(`
      INSERT INTO prompt_version_history (file_key, version, content, fix_id, change_description, created_at)
      VALUES (?, ?, ?, NULL, ?, ?)
    `).run('system_prompt', newVersion, escapedContent, changeDescription, now);
    console.log('Created version history entry');

    console.log('\n=== SUCCESS ===');
    console.log('System Prompt saved as version', newVersion);
    console.log('Description:', changeDescription);

    // Verify
    const verify = db.prepare(`
      SELECT version, change_description, created_at FROM prompt_version_history
      WHERE file_key = ? ORDER BY version DESC LIMIT 3
    `).all('system_prompt');

    console.log('\nRecent versions:');
    verify.forEach(v => {
      console.log(`  v${v.version}: ${v.change_description?.substring(0, 60)}...`);
    });

  } finally {
    db.close();
  }
}

main();

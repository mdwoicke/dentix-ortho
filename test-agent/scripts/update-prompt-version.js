#!/usr/bin/env node
/**
 * Update Prompt Version Script
 *
 * Usage:
 *   node scripts/update-prompt-version.js <fileKey> "<changeDescription>"
 *
 * File Keys:
 *   nodered_flow, scheduling_tool, patient_tool, system_prompt
 *
 * For tools: extracts "func" field and saves to both DB and a .js file
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/test-results.db');
const V1_DIR = path.join(__dirname, '../../docs/v1');

const FILE_MAPPINGS = {
  nodered_flow: { path: path.join(V1_DIR, 'nodered_Cloud9_flows.json'), displayName: 'Node Red Flows', extractFunc: false },
  scheduling_tool: { path: path.join(V1_DIR, 'schedule_appointment_dso_Tool.json'), displayName: 'Scheduling Tool', extractFunc: true, funcFile: 'scheduling_tool_func.js' },
  patient_tool: { path: path.join(V1_DIR, 'chord_dso_patient_Tool.json'), displayName: 'Patient Tool', extractFunc: true, funcFile: 'patient_tool_func.js' },
  system_prompt: { path: path.join(V1_DIR, 'Chord_Cloud9_SystemPrompt.md'), displayName: 'System Prompt', extractFunc: false }
};

function updateVersion(fileKey, changeDescription) {
  const mapping = FILE_MAPPINGS[fileKey];
  if (!mapping) {
    console.error(`Unknown file key: ${fileKey}\nValid: ${Object.keys(FILE_MAPPINGS).join(', ')}`);
    process.exit(1);
  }
  if (!fs.existsSync(mapping.path)) {
    console.error(`File not found: ${mapping.path}`);
    process.exit(1);
  }

  let content = fs.readFileSync(mapping.path, 'utf-8');

  // For tools, extract only the JavaScript func field
  if (mapping.extractFunc) {
    const json = JSON.parse(content);
    const rawFunc = json.func;

    // Write raw version for reference
    const funcPath = path.join(V1_DIR, mapping.funcFile);
    fs.writeFileSync(funcPath, rawFunc);
    console.log(`Extracted func -> ${mapping.funcFile} (${rawFunc.length} chars)`);

    // ALWAYS create escaped version for Flowise (double curly brackets)
    const escaped = rawFunc.split('{').join('{{').split('}').join('}}');
    const escapedPath = funcPath.replace('.js', '_escaped.js');
    fs.writeFileSync(escapedPath, escaped);
    console.log(`Escaped for Flowise -> ${path.basename(escapedPath)} (${escaped.length} chars)`);

    // USE RAW VERSION for database (tools dont need escaping!)
    content = rawFunc;
  }

  // For system prompt, also create escaped version and use it for DB
  if (fileKey === 'system_prompt') {
    const escaped = content.split('{').join('{{').split('}').join('}}');
    const escapedPath = path.join(V1_DIR, 'system_prompt_escaped.md');
    fs.writeFileSync(escapedPath, escaped);
    console.log(`Escaped for Flowise -> system_prompt_escaped.md (${escaped.length} chars)`);

    // USE RAW VERSION for database (tools dont need escaping!)
    content = rawFunc;
  }

  const db = new Database(DB_PATH, { readonly: false });
  const now = new Date().toISOString();

  try {
    const current = db.prepare('SELECT version FROM prompt_working_copies WHERE file_key = ?').get(fileKey);
    const newVersion = (current?.version || 0) + 1;

    db.prepare('UPDATE prompt_working_copies SET content = ?, version = ?, updated_at = ? WHERE file_key = ?')
      .run(content, newVersion, now, fileKey);

    db.prepare('INSERT INTO prompt_version_history (file_key, version, content, fix_id, change_description, created_at) VALUES (?, ?, ?, NULL, ?, ?)')
      .run(fileKey, newVersion, content, changeDescription, now);

    console.log(`${mapping.displayName}: v${current?.version || 0} -> v${newVersion}`);
    console.log(`Change: ${changeDescription}`);
  } finally {
    db.close();
  }
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node scripts/update-prompt-version.js <fileKey> "<changeDescription>"');
  process.exit(1);
}
updateVersion(args[0], args[1]);

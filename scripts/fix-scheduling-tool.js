/**
 * Script to update the scheduling_tool JSON with the fixed func and create escaped version
 */
const fs = require('fs');
const path = require('path');

const V1_DIR = path.join(__dirname, '..', 'docs', 'v1');

// Read the updated func.js
const funcPath = path.join(V1_DIR, 'scheduling_tool_func.js');
const funcContent = fs.readFileSync(funcPath, 'utf8');

// Create escaped version for Flowise (double curly braces)
const escapedContent = funcContent
  .replace(/\{/g, '{{')
  .replace(/\}/g, '}}');

// Write escaped version
const escapedPath = path.join(V1_DIR, 'scheduling_tool_func_escaped.js');
fs.writeFileSync(escapedPath, escapedContent);
console.log(`Escaped version written to: ${escapedPath}`);
console.log(`Original: ${funcContent.length} chars`);
console.log(`Escaped: ${escapedContent.length} chars`);

// Also update the JSON tool file with the new func
const jsonPath = path.join(V1_DIR, 'schedule_appointment_dso_Tool.json');
const toolJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
toolJson.func = funcContent;
fs.writeFileSync(jsonPath, JSON.stringify(toolJson, null, 2));
console.log(`Updated JSON tool file: ${jsonPath}`);

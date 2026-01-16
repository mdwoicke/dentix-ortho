const path = require('path');
const db = require(path.join(__dirname, '../test-agent/node_modules/better-sqlite3'))(path.join(__dirname, '../test-agent/data/test-results.db'));

// First, get A/B Sandbox A settings
const abSandboxA = db.prepare('SELECT * FROM ab_sandboxes WHERE sandbox_id = ?').get('sandbox_a');
console.log('A/B Sandbox A endpoint:', abSandboxA.flowise_endpoint);

// Check if we have a flowise config for this endpoint
let flowiseConfig = db.prepare('SELECT * FROM flowise_configs WHERE url = ?').get(abSandboxA.flowise_endpoint);

if (!flowiseConfig) {
  // Create new flowise config
  db.prepare('INSERT INTO flowise_configs (name, url, api_key, is_default) VALUES (?, ?, ?, ?)').run(
    'A/B Sandbox A',
    abSandboxA.flowise_endpoint,
    abSandboxA.flowise_api_key || '',
    0
  );
  flowiseConfig = db.prepare('SELECT * FROM flowise_configs WHERE url = ?').get(abSandboxA.flowise_endpoint);
  console.log('Created new flowise config ID:', flowiseConfig.id);
} else {
  console.log('Found existing flowise config ID:', flowiseConfig.id);
}

// Also create langfuse config for A/B Sandbox A if it doesn't exist
let langfuseConfig = null;
if (abSandboxA.langfuse_host) {
  langfuseConfig = db.prepare('SELECT * FROM langfuse_configs WHERE host = ? AND public_key = ?').get(
    abSandboxA.langfuse_host,
    abSandboxA.langfuse_public_key
  );

  if (!langfuseConfig) {
    db.prepare('INSERT INTO langfuse_configs (name, host, public_key, secret_key, is_default) VALUES (?, ?, ?, ?, ?)').run(
      'A/B Sandbox A',
      abSandboxA.langfuse_host,
      abSandboxA.langfuse_public_key,
      abSandboxA.langfuse_secret_key,
      0
    );
    langfuseConfig = db.prepare('SELECT * FROM langfuse_configs WHERE host = ? AND public_key = ?').get(
      abSandboxA.langfuse_host,
      abSandboxA.langfuse_public_key
    );
    console.log('Created new langfuse config ID:', langfuseConfig.id);
  } else {
    console.log('Found existing langfuse config ID:', langfuseConfig.id);
  }
}

// Now update environment preset 'Sandbox A' to use these configs
const updateStmt = db.prepare('UPDATE environment_presets SET flowise_config_id = ?, langfuse_config_id = ? WHERE name = ?');
updateStmt.run(flowiseConfig.id, langfuseConfig ? langfuseConfig.id : null, 'Sandbox A');

// Verify
const preset = db.prepare('SELECT * FROM environment_presets WHERE name = ?').get('Sandbox A');
const fConfig = db.prepare('SELECT * FROM flowise_configs WHERE id = ?').get(preset.flowise_config_id);
const lConfig = preset.langfuse_config_id ? db.prepare('SELECT * FROM langfuse_configs WHERE id = ?').get(preset.langfuse_config_id) : null;

console.log('\nUpdated Sandbox A preset:');
console.log('  flowise_config_id:', preset.flowise_config_id);
console.log('  Flowise URL:', fConfig.url);
if (lConfig) {
  console.log('  langfuse_config_id:', preset.langfuse_config_id);
  console.log('  Langfuse Host:', lConfig.host);
}

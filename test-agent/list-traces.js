const fetch = require('node-fetch');
const Database = require('better-sqlite3');

const db = new Database('data/test-results.db');
const configs = db.prepare('SELECT * FROM langfuse_configs').all();
db.close();

async function listTraces(config) {
  console.log('\n=== Checking', config.name, '===');
  const auth = Buffer.from(`${config.public_key}:${config.secret_key}`).toString('base64');

  try {
    const response = await fetch(`${config.host}/api/public/traces?limit=5`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });

    if (!response.ok) {
      console.log('Error:', response.status);
      return;
    }

    const data = await response.json();
    console.log('Recent traces:', data.data.length);

    for (const trace of data.data.slice(0, 5)) {
      console.log('  -', trace.id, '|', trace.name || 'no-name', '|', trace.timestamp);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

async function main() {
  for (const config of configs) {
    await listTraces(config);
  }
}

main();

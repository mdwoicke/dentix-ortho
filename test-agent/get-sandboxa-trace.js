const fetch = require('node-fetch');
const Database = require('better-sqlite3');

const db = new Database('data/test-results.db');
const lfConfig = db.prepare('SELECT * FROM langfuse_configs WHERE id = 4').get();
const run = db.prepare('SELECT langfuse_trace_id FROM goal_test_results ORDER BY started_at DESC LIMIT 1').get();
db.close();

async function getTrace() {
  const traceId = run.langfuse_trace_id;
  console.log('Trace ID:', traceId);
  console.log('Using Langfuse config:', lfConfig.name);

  const auth = Buffer.from(`${lfConfig.public_key}:${lfConfig.secret_key}`).toString('base64');

  try {
    const response = await fetch(`${lfConfig.host}/api/public/traces/${traceId}`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });

    if (!response.ok) {
      console.log('Error:', response.status, response.statusText);
      const text = await response.text();
      console.log('Body:', text.substring(0, 500));
      return;
    }

    const data = await response.json();
    console.log('\nTrace found!');
    console.log('Session:', data.sessionId);
    console.log('Observations count:', data.observations ? data.observations.length : 0);

    // Show tool observations
    if (data.observations) {
      const toolObs = data.observations.filter(o =>
        o.name && (o.name.toLowerCase().includes('schedule') || o.name.toLowerCase().includes('slot'))
      );
      console.log('\nTool observations:', toolObs.length);

      for (const o of toolObs) {
        console.log('\n--- ' + o.name + ' (' + o.type + ') ---');
        if (o.input) {
          console.log('Input:', JSON.stringify(o.input).substring(0, 500));
        }
        if (o.output) {
          console.log('Output:', JSON.stringify(o.output).substring(0, 1500));
        }
        if (o.statusMessage) {
          console.log('Status:', o.statusMessage);
        }
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

getTrace();

/**
 * Quick check to see which routes are active on production Node-RED
 */

const https = require('https');

const BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api';
const AUTH = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

// Routes to test
const ROUTES = [
  // Current tool paths (without -prd)
  '/chord/ortho/getApptSlots',
  '/chord/ortho/getPatientByFilter',
  '/chord/ortho/createAppt',

  // Production paths (with -prd)
  '/chord/ortho-prd/getApptSlots',
  '/chord/ortho-prd/getPatientByFilter',
  '/chord/ortho-prd/createAppt',
];

function testRoute(route) {
  return new Promise((resolve) => {
    const url = new URL(BASE + route);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': AUTH },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ route, status: res.statusCode, ok: res.statusCode < 400 }));
    });
    req.on('error', (e) => resolve({ route, status: 'ERROR', ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ route, status: 'TIMEOUT', ok: false }); });
    req.write(JSON.stringify({ uui: 'test', startDate: '01/13/2026', endDate: '01/27/2026' }));
    req.end();
  });
}

async function main() {
  console.log('\n🔍 Checking which routes are active on production Node-RED...\n');

  for (const route of ROUTES) {
    const result = await testRoute(route);
    const icon = result.ok ? '✅' : '❌';
    console.log(`${icon} ${result.status.toString().padEnd(6)} ${route}`);
  }

  console.log('\n');
}

main();

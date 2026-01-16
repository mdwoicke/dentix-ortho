/**
 * Tool Endpoint Verification Script
 *
 * Tests the end-to-end flow from Flowise tools to Node-RED to Cloud9 API.
 * Identifies URL path mismatches and connectivity issues.
 *
 * Run with: node scripts/test-tool-endpoints.js
 */

const https = require('https');

// ============================================================================
// CONFIGURATION
// ============================================================================

const NODE_RED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api';

// Tool uses these paths (from schedule_appointment_dso_Tool.json) - UPDATED to /ortho-prd/
const TOOL_ENDPOINTS = {
  slots: '/chord/ortho-prd/getApptSlots',
  grouped_slots: '/chord/ortho-prd/getGroupedApptSlots',
  book_child: '/chord/ortho-prd/createAppt',
  cancel: '/chord/ortho-prd/cancelAppt',
  patient_lookup: '/chord/ortho-prd/getPatientByFilter',
  patient_get: '/chord/ortho-prd/getPatient',
  patient_create: '/chord/ortho-prd/createPatient',
  clinic_info: '/chord/ortho-prd/getLocation',
};

// Node-RED expects these paths (from nodered_Cloud9_flows.json)
const NODERED_ENDPOINTS = {
  slots: '/chord/ortho-prd/getApptSlots',
  grouped_slots: '/chord/ortho-prd/getGroupedApptSlots',
  book_child: '/chord/ortho-prd/createAppt',
  cancel: '/chord/ortho-prd/cancelAppt',
  patient_lookup: '/chord/ortho-prd/getPatientByFilter',
  patient_get: '/chord/ortho-prd/getPatient',
  patient_create: '/chord/ortho-prd/createPatient',
  clinic_info: '/chord/ortho-prd/getLocation',
};

// Auth header
const AUTH_HEADER = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

// Test UUI
const TEST_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

// ============================================================================
// HTTP HELPER
// ============================================================================

function makeRequest(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': AUTH_HEADER,
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          success: res.statusCode >= 200 && res.statusCode < 300,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

async function testEndpoint(name, toolPath, noderedPath, testBody) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${name}`);
  console.log(`${'='.repeat(70)}`);

  // Test tool path (what the tool actually calls)
  const toolUrl = `${NODE_RED_BASE}${toolPath}`;
  console.log(`\n[TOOL PATH] ${toolUrl}`);
  try {
    const toolResult = await makeRequest(toolUrl, testBody);
    console.log(`  Status: ${toolResult.statusCode}`);
    console.log(`  Success: ${toolResult.success ? '✅' : '❌'}`);
    if (!toolResult.success) {
      console.log(`  Body: ${toolResult.body.substring(0, 200)}...`);
    } else {
      try {
        const parsed = JSON.parse(toolResult.body);
        console.log(`  Response keys: ${Object.keys(parsed).join(', ')}`);
        if (parsed.slots) console.log(`  Slots found: ${parsed.slots.length || parsed.count || 0}`);
        if (parsed.groups) console.log(`  Groups found: ${parsed.groups.length || parsed.totalGroups || 0}`);
        if (parsed.patients) console.log(`  Patients found: ${parsed.patients.length || parsed.count || 0}`);
        if (parsed.success !== undefined) console.log(`  API success: ${parsed.success}`);
      } catch (e) {
        console.log(`  Body (raw): ${toolResult.body.substring(0, 200)}...`);
      }
    }
  } catch (error) {
    console.log(`  ERROR: ${error.message}`);
  }

  // Test Node-RED path (what Node-RED actually exposes)
  const noderedUrl = `${NODE_RED_BASE}${noderedPath}`;
  console.log(`\n[NODE-RED PATH] ${noderedUrl}`);
  try {
    const noderedResult = await makeRequest(noderedUrl, testBody);
    console.log(`  Status: ${noderedResult.statusCode}`);
    console.log(`  Success: ${noderedResult.success ? '✅' : '❌'}`);
    if (!noderedResult.success) {
      console.log(`  Body: ${noderedResult.body.substring(0, 200)}...`);
    } else {
      try {
        const parsed = JSON.parse(noderedResult.body);
        console.log(`  Response keys: ${Object.keys(parsed).join(', ')}`);
        if (parsed.slots) console.log(`  Slots found: ${parsed.slots.length || parsed.count || 0}`);
        if (parsed.groups) console.log(`  Groups found: ${parsed.groups.length || parsed.totalGroups || 0}`);
        if (parsed.patients) console.log(`  Patients found: ${parsed.patients.length || parsed.count || 0}`);
        if (parsed.success !== undefined) console.log(`  API success: ${parsed.success}`);
      } catch (e) {
        console.log(`  Body (raw): ${noderedResult.body.substring(0, 200)}...`);
      }
    }
  } catch (error) {
    console.log(`  ERROR: ${error.message}`);
  }

  // Compare paths
  const pathsMatch = toolPath === noderedPath;
  console.log(`\n[PATH COMPARISON] ${pathsMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  if (!pathsMatch) {
    console.log(`  Tool uses:     ${toolPath}`);
    console.log(`  Node-RED uses: ${noderedPath}`);
    console.log(`  FIX: Update tool to use "${noderedPath}"`);
  }
}

function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║              TOOL ENDPOINT VERIFICATION SCRIPT                        ║');
  console.log('║                                                                        ║');
  console.log('║  Tests connectivity from Flowise Tools → Node-RED → Cloud9 API        ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nBase URL: ${NODE_RED_BASE}`);
  console.log(`Auth: Basic workflowapi:****`);

  // Calculate dates - Cloud9 sandbox requires dates >= Jan 13, 2026
  const SANDBOX_MIN_DATE = new Date(2026, 0, 13); // January 13, 2026
  const today = new Date();
  const minStart = today > SANDBOX_MIN_DATE ? today : SANDBOX_MIN_DATE;
  const startDate = formatDate(new Date(minStart.getTime() + 24 * 60 * 60 * 1000)); // Day after min
  const endDate = formatDate(new Date(minStart.getTime() + 15 * 24 * 60 * 60 * 1000)); // 15 days out

  console.log(`\nTest date range: ${startDate} to ${endDate}`);

  // Test: Get Appointment Slots
  await testEndpoint(
    'Get Appointment Slots (slots)',
    TOOL_ENDPOINTS.slots,
    NODERED_ENDPOINTS.slots,
    { uui: TEST_UUI, startDate, endDate }
  );

  // Test: Get Grouped Slots
  await testEndpoint(
    'Get Grouped Slots (grouped_slots)',
    TOOL_ENDPOINTS.grouped_slots,
    NODERED_ENDPOINTS.grouped_slots,
    { uui: TEST_UUI, startDate, endDate, numberOfPatients: 2, timeWindowMinutes: 30 }
  );

  // Test: Patient Lookup by Filter
  await testEndpoint(
    'Patient Lookup (lookup)',
    TOOL_ENDPOINTS.patient_lookup,
    NODERED_ENDPOINTS.patient_lookup,
    { uui: TEST_UUI, filter: 'CLITest' }
  );

  // Test: Get Location
  await testEndpoint(
    'Get Location (clinic_info)',
    TOOL_ENDPOINTS.clinic_info,
    NODERED_ENDPOINTS.clinic_info,
    { uui: TEST_UUI, locationGUID: '799d413a-5e1a-46a2-b169-e2108bf517d6' }
  );

  // Summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              SUMMARY                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  let mismatchCount = 0;
  for (const key of Object.keys(TOOL_ENDPOINTS)) {
    if (TOOL_ENDPOINTS[key] !== NODERED_ENDPOINTS[key]) {
      mismatchCount++;
    }
  }

  if (mismatchCount > 0) {
    console.log(`\n❌ CRITICAL: ${mismatchCount} URL path mismatches found!`);
    console.log('\nMismatched endpoints:');
    for (const key of Object.keys(TOOL_ENDPOINTS)) {
      if (TOOL_ENDPOINTS[key] !== NODERED_ENDPOINTS[key]) {
        console.log(`  ${key}:`);
        console.log(`    Tool:     ${TOOL_ENDPOINTS[key]}`);
        console.log(`    Node-RED: ${NODERED_ENDPOINTS[key]}`);
      }
    }
    console.log('\n🔧 FIX REQUIRED:');
    console.log('   The tools use /ortho/ but Node-RED uses /ortho-prd/');
    console.log('   Update the BASE_URL in the tools from:');
    console.log('     .../api/chord/ortho/...');
    console.log('   To:');
    console.log('     .../api/chord/ortho-prd/...');
  } else {
    console.log('\n✅ All endpoint paths match!');
  }

  console.log('\n');
}

main().catch(console.error);

/**
 * Test Node Red slot API directly with future dates
 * Today: January 3, 2026
 */
const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const DEFAULT_SCHEDULE_VIEW_GUID = '2544683a-8e79-4b32-a4d4-bf851996bac3';
const UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

function getAuthHeader() {
  const username = "workflowapi";
  const password = "e^@V95&6sAJReTsb5!iq39mIC4HYIV";
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

// Get today's date for reference
const today = new Date();
console.log('='.repeat(60));
console.log('NODE RED SLOT API TEST');
console.log('='.repeat(60));
console.log('Current date:', today.toISOString());
console.log('Current date (local):', today.toLocaleDateString('en-US'));
console.log('');

async function testSlots(startDate, endDate, label) {
  console.log(`\n--- ${label} ---`);
  console.log(`Date range: ${startDate} to ${endDate}`);

  const body = {
    uui: UUI,
    startDate,
    endDate,
    scheduleViewGUIDs: DEFAULT_SCHEDULE_VIEW_GUID
  };

  console.log('Request body:', JSON.stringify(body, null, 2));

  try {
    const response = await fetch(`${BASE_URL}/ortho/getApptSlots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader()
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    console.log(`HTTP Status: ${response.status}`);
    console.log(`Slots found: ${data.slots?.length || data.count || 0}`);

    if (data.totalSlots !== undefined) {
      console.log(`Total slots: ${data.totalSlots}`);
    }

    if (data.slots && data.slots.length > 0) {
      console.log('\nFirst 3 slots:');
      data.slots.slice(0, 3).forEach((slot, i) => {
        console.log(`  ${i + 1}. ${slot.startTime || slot.date} - ${slot.providerName || 'N/A'}`);
      });
    }

    if (data.error) {
      console.log('Error:', JSON.stringify(data.error));
    }

    if (data.llm_guidance) {
      console.log('LLM Guidance action:', data.llm_guidance.action_required);
      console.log('Transfer reason:', data.llm_guidance.transfer_reason || 'N/A');
    }

    if (data._debug_error) {
      console.log('Debug error:', data._debug_error);
    }

    return data;
  } catch (e) {
    console.log('Request failed:', e.message);
    return null;
  }
}

async function testGroupedSlots(startDate, endDate, numberOfPatients, label) {
  console.log(`\n--- ${label} ---`);
  console.log(`Date range: ${startDate} to ${endDate}`);
  console.log(`Number of patients: ${numberOfPatients}`);

  const body = {
    uui: UUI,
    startDate,
    endDate,
    numberOfPatients,
    timeWindowMinutes: 30,
    scheduleViewGUIDs: DEFAULT_SCHEDULE_VIEW_GUID
  };

  try {
    const response = await fetch(`${BASE_URL}/ortho/getGroupedApptSlots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader()
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    console.log(`HTTP Status: ${response.status}`);
    console.log(`Groups found: ${data.groups?.length || data.totalGroups || 0}`);

    if (data.llm_guidance) {
      console.log('LLM Guidance action:', data.llm_guidance.action_required);
    }

    return data;
  } catch (e) {
    console.log('Request failed:', e.message);
    return null;
  }
}

async function main() {
  // All dates are in the FUTURE from January 3, 2026

  // Test 1: Next week (Jan 6-10, 2026) - definitely future
  await testSlots('01/06/2026', '01/10/2026', 'Test 1: Next week (Jan 6-10)');

  // Test 2: Two weeks out (Jan 13-20, 2026) - SANDBOX_MIN_DATE range
  await testSlots('01/13/2026', '01/20/2026', 'Test 2: Two weeks out (Jan 13-20) - SANDBOX_MIN_DATE');

  // Test 3: Three weeks out (Jan 20-27, 2026)
  await testSlots('01/20/2026', '01/27/2026', 'Test 3: Three weeks out (Jan 20-27)');

  // Test 4: One month out (Feb 1-14, 2026)
  await testSlots('02/01/2026', '02/14/2026', 'Test 4: One month out (Feb 1-14)');

  // Test 5: Two months out (Mar 1-14, 2026)
  await testSlots('03/01/2026', '03/14/2026', 'Test 5: Two months out (Mar 1-14)');

  // Test 6: Grouped slots for 2 patients
  await testGroupedSlots('01/13/2026', '01/27/2026', 2, 'Test 6: Grouped slots for 2 patients (Jan 13-27)');

  // Test 7: Without schedule view GUID (let API use default)
  console.log('\n--- Test 7: Without specific schedule view GUID ---');
  const body = {
    uui: UUI,
    startDate: '01/13/2026',
    endDate: '01/27/2026'
  };
  console.log('Request body:', JSON.stringify(body, null, 2));

  try {
    const response = await fetch(`${BASE_URL}/ortho/getApptSlots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader()
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    console.log(`HTTP Status: ${response.status}`);
    console.log(`Slots found: ${data.slots?.length || data.count || 0}`);
    if (data.llm_guidance) {
      console.log('LLM Guidance action:', data.llm_guidance.action_required);
    }
  } catch (e) {
    console.log('Request failed:', e.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);

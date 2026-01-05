/**
 * Test sandbox slot availability directly via Node Red API
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

async function testSlots(startDate, endDate, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`Date range: ${startDate} to ${endDate}`);

  const body = {
    uui: UUI,
    startDate,
    endDate,
    scheduleViewGUIDs: DEFAULT_SCHEDULE_VIEW_GUID
  };

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

    console.log(`Status: ${response.status}`);
    console.log(`Total slots: ${data.slots?.length || data.count || 0}`);

    if (data.slots && data.slots.length > 0) {
      console.log('Sample slot:', JSON.stringify(data.slots[0], null, 2));
    }

    if (data.error) {
      console.log('Error:', data.error);
    }

    if (data.llm_guidance) {
      console.log('LLM Guidance:', JSON.stringify(data.llm_guidance, null, 2));
    }

    return data;
  } catch (e) {
    console.log('Request failed:', e.message);
    return null;
  }
}

async function main() {
  console.log('Testing Sandbox Slot Availability\n');
  console.log('Base URL:', BASE_URL);
  console.log('Schedule View GUID:', DEFAULT_SCHEDULE_VIEW_GUID);

  // Test 1: Dates BEFORE sandbox minimum (should fail or be corrected)
  await testSlots('01/03/2026', '01/10/2026', 'Test 1: Before SANDBOX_MIN_DATE (Jan 3-10)');

  // Test 2: Dates AT sandbox minimum
  await testSlots('01/13/2026', '01/20/2026', 'Test 2: At SANDBOX_MIN_DATE (Jan 13-20)');

  // Test 3: Dates AFTER sandbox minimum
  await testSlots('01/20/2026', '01/27/2026', 'Test 3: After SANDBOX_MIN_DATE (Jan 20-27)');

  // Test 4: Further in the future
  await testSlots('02/01/2026', '02/15/2026', 'Test 4: February 2026');
}

main().catch(console.error);

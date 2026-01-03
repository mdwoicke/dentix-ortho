/**
 * Find which schedule view GUIDs have available slots
 */
const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

function getAuthHeader() {
  const username = "workflowapi";
  const password = "e^@V95&6sAJReTsb5!iq39mIC4HYIV";
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function getSlots(scheduleViewGUIDs) {
  const body = {
    uui: UUI,
    startDate: '01/13/2026',
    endDate: '01/27/2026',
  };

  if (scheduleViewGUIDs) {
    body.scheduleViewGUIDs = scheduleViewGUIDs;
  }

  const response = await fetch(`${BASE_URL}/ortho/getApptSlots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getAuthHeader()
    },
    body: JSON.stringify(body)
  });

  return response.json();
}

async function main() {
  console.log('Finding valid schedule view GUIDs with available slots\n');
  console.log('Date range: 01/13/2026 to 01/27/2026\n');

  // First, get all slots without a specific GUID to see what's available
  console.log('=== Getting all available slots (no GUID filter) ===');
  const allSlots = await getSlots(null);

  console.log(`Total slots available: ${allSlots.slots?.length || 0}`);

  if (allSlots.slots && allSlots.slots.length > 0) {
    // Extract unique schedule view GUIDs from the slots
    const scheduleViews = new Map();

    for (const slot of allSlots.slots) {
      const guid = slot.scheduleViewGUID || slot.schdvwGUID;
      const name = slot.scheduleViewName || slot.providerName || 'Unknown';

      if (guid) {
        if (!scheduleViews.has(guid)) {
          scheduleViews.set(guid, { name, count: 0, sample: slot });
        }
        scheduleViews.get(guid).count++;
      }
    }

    console.log(`\n=== Schedule View GUIDs with availability ===\n`);

    for (const [guid, info] of scheduleViews) {
      console.log(`GUID: ${guid}`);
      console.log(`  Name: ${info.name}`);
      console.log(`  Slots: ${info.count}`);
      console.log(`  Sample: ${info.sample.startTime || info.sample.date}`);
      console.log('');
    }

    // Show first few slots for reference
    console.log('=== Sample slots (first 5) ===\n');
    allSlots.slots.slice(0, 5).forEach((slot, i) => {
      console.log(`${i + 1}. ${JSON.stringify(slot, null, 2)}`);
      console.log('');
    });
  }

  // Test the current default GUID
  console.log('=== Testing current DEFAULT_SCHEDULE_VIEW_GUID ===');
  const currentDefault = '2544683a-8e79-4b32-a4d4-bf851996bac3';
  const currentResult = await getSlots(currentDefault);
  console.log(`GUID: ${currentDefault}`);
  console.log(`Slots: ${currentResult.slots?.length || 0}`);
}

main().catch(console.error);

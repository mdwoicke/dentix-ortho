const axios = require('axios');

// Node-RED configuration
const NODERED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api';
const NODERED_AUTH = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

// Default GUIDs from config-loader.ts
const DEFAULT_GUIDS = {
  providerGUID: '79ec29fe-c315-4982-845a-0005baefb5a8',
  locationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db',
  appointmentTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a',
  scheduleViewGUID: '2544683a-8e79-4b32-a4d4-bf851996bac3',
  scheduleColumnGUID: 'e062b81f-1fff-40fc-b4a4-1cf9ecc2f32b',
};

async function testNodeRedSlots() {
  console.log('=== Testing Node-RED getApptSlots ===');
  console.log('Using scheduleViewGUID:', DEFAULT_GUIDS.scheduleViewGUID);
  console.log('Date range: 01/14/2026 to 01/21/2026');

  const payload = {
    schdvwGUIDs: DEFAULT_GUIDS.scheduleViewGUID,
    startDate: '01/14/2026',
    endDate: '01/21/2026',
    locationGUID: DEFAULT_GUIDS.locationGUID,
    providerGUID: DEFAULT_GUIDS.providerGUID
  };

  console.log('\nPayload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `${NODERED_BASE}/chord/ortho-prd/getApptSlots`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${NODERED_AUTH}`
        },
        timeout: 30000
      }
    );

    console.log('\nResponse status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 3000));
  } catch (err) {
    if (err.response) {
      console.log('\nError status:', err.response.status);
      console.log('Error response:', JSON.stringify(err.response.data).substring(0, 1000));
    } else {
      console.log('\nError:', err.message);
    }
  }
}

testNodeRedSlots();

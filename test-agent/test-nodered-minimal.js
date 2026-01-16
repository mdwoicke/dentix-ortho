const axios = require('axios');

// Node-RED configuration
const NODERED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api';
const NODERED_AUTH = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

async function testMinimalPayload() {
  console.log('=== Testing Node-RED with MINIMAL payload (like Flowise tool) ===');

  // This is what the Flowise tool actually sends
  const payload = {
    uui: '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV',
    startDate: '01/14/2026',
    endDate: '01/28/2026'
    // NOTE: No locationGUID, providerGUID, or scheduleViewGUIDs
  };

  console.log('Payload:', JSON.stringify(payload, null, 2));

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
    console.log('Response data type:', typeof response.data);

    if (response.data.slots) {
      console.log('Slots count:', response.data.slots.length);
      if (response.data.slots.length > 0) {
        console.log('First slot:', JSON.stringify(response.data.slots[0], null, 2));
      }
    } else {
      console.log('Full response:', JSON.stringify(response.data, null, 2).substring(0, 2000));
    }
  } catch (err) {
    if (err.response) {
      console.log('\nError status:', err.response.status);
      console.log('Error response:', JSON.stringify(err.response.data).substring(0, 1000));
    } else {
      console.log('\nError:', err.message);
    }
  }
}

testMinimalPayload();

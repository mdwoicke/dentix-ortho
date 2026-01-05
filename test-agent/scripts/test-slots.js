const axios = require('axios');

const ENDPOINT = 'https://app.c1elly.ai/api/v1/prediction/5f1fa57c-e6fd-463c-ac6e-c73fd5fb578b';
const sessionId = 'slot-test-' + Date.now();

async function sendMessage(question) {
  console.log('\n>>> USER:', question);
  const resp = await axios.post(ENDPOINT, {
    question,
    overrideConfig: { sessionId }
  });

  const text = resp.data.text || resp.data;
  console.log('<<< BOT:', typeof text === 'string' ? text.substring(0, 300) : JSON.stringify(text).substring(0, 300));

  // Check for tool calls in agentReasoning
  if (resp.data.agentReasoning) {
    resp.data.agentReasoning.forEach(step => {
      if (step.usedTools) {
        step.usedTools.forEach(tool => {
          console.log('\n[TOOL]', tool.tool);
          console.log('  Input:', JSON.stringify(tool.toolInput).substring(0, 200));
          if (tool.toolOutput) {
            const output = typeof tool.toolOutput === 'string' ? tool.toolOutput : JSON.stringify(tool.toolOutput);
            console.log('  Output:', output.substring(0, 300));
          }
        });
      }
    });
  }

  return resp.data;
}

async function main() {
  console.log('=== Testing Slot Search with Default scheduleViewGUID ===');
  console.log('Session:', sessionId);

  try {
    // Quick path - just test slot search directly
    await sendMessage('Hi I need to schedule an ortho appointment');
    await sendMessage('Jane Doe, 215-555-9999, one child, first visit, no braces before');
    await sendMessage('Tommy Doe, born January 1 2015, Aetna insurance');
    await sendMessage('no special needs, jane@test.com, morning preferred');

    // Wait for slot search and continue
    console.log('\n--- Waiting for slot search response ---');
    await sendMessage('ok');
    await sendMessage('yes that works');
    await sendMessage('yes confirm');

    console.log('\n=== Check if booking completed ===');
  } catch (e) {
    console.error('Error:', e.message);
    if (e.response) {
      console.error('Response data:', JSON.stringify(e.response.data).substring(0, 500));
    }
  }
}

// Also test the Node Red endpoint directly
async function testNodeRed() {
  console.log('\n=== Testing Node Red Directly ===');
  try {
    const resp = await axios.post(
      'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho/getApptSlots',
      {
        uui: '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV',
        startDate: '01/02/2026',
        endDate: '01/07/2026',
        scheduleViewGUIDs: '2544683a-8e79-4b32-a4d4-bf851996bac3'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64')
        },
        timeout: 60000
      }
    );
    console.log('Node Red Response:', JSON.stringify(resp.data).substring(0, 500));
    if (resp.data.slots) {
      console.log('Slots found:', resp.data.slots.length);
    }
  } catch (e) {
    console.error('Node Red Error:', e.message);
    if (e.response) {
      console.error('Response:', JSON.stringify(e.response.data).substring(0, 300));
    }
  }
}

// Run both tests
testNodeRed().then(() => main());

const fetch = require('node-fetch');

async function testNodeRed() {
  const url = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho/getApptSlots';
  const auth = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

  // Test with dates BEFORE sandbox min date (should auto-correct)
  console.log('=== Test: Dates before SANDBOX_MIN_DATE (01/04/2026) ===');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + auth
    },
    body: JSON.stringify({
      uui: '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV',
      startDate: '01/04/2026',
      endDate: '01/09/2026'
    })
  });
  const data = await resp.json();
  console.log('Slots returned:', data.slots ? data.slots.length : 0);
  console.log('Tool version:', data._toolVersion);
  console.log('Has llm_guidance:', data.llm_guidance ? 'yes' : 'no');
  if (data.llm_guidance) {
    console.log('Action required:', data.llm_guidance.action_required);
    console.log('Transfer reason:', data.llm_guidance.transfer_reason);
  }

  // Test with dates AFTER sandbox min date
  console.log('\n=== Test: Dates AFTER SANDBOX_MIN_DATE (01/13/2026) ===');
  const resp2 = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + auth
    },
    body: JSON.stringify({
      uui: '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV',
      startDate: '01/13/2026',
      endDate: '01/27/2026'
    })
  });
  const data2 = await resp2.json();
  console.log('Slots returned:', data2.slots ? data2.slots.length : 0);
  if (data2.slots && data2.slots.length > 0) {
    console.log('First slot:', data2.slots[0].StartTime);
  }
}

testNodeRed().catch(console.error);

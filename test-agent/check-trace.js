const fetch = require('node-fetch');

async function getTrace() {
  const traceId = '59544399-751d-4b4f-b7d3-66b8eb587a84';
  const host = 'https://langfuse-6x3cj-u15194.vm.elestio.app';
  // Try Production config
const auth = Buffer.from('pk-lf-fc360c30-95d4-4666-89ec-12d934219fca:sk-lf-b2ebdd34-aa4c-470f-be92-82ea07c368f4').toString('base64');

  try {
    const response = await fetch(host + '/api/public/traces/' + traceId, {
      headers: { 'Authorization': 'Basic ' + auth }
    });

    if (!response.ok) {
      console.log('Error:', response.status, response.statusText);
      const text = await response.text();
      console.log('Body:', text.substring(0, 500));
      return;
    }

    const data = await response.json();
    console.log('Trace ID:', data.id);
    console.log('Session:', data.sessionId);
    console.log('Observations count:', data.observations ? data.observations.length : 0);

    if (data.observations) {
      data.observations
        .filter(o => o.name && (o.name.toLowerCase().includes('schedule') || o.name.toLowerCase().includes('tool')))
        .forEach((o, i) => {
          console.log('\n--- Observation', i+1, '---');
          console.log('Name:', o.name);
          console.log('Type:', o.type);
          console.log('Status:', o.statusMessage);
          console.log('Level:', o.level);
          const outputStr = JSON.stringify(o.output);
          console.log('Output length:', outputStr.length);
          console.log('Output preview:', outputStr.substring(0, 1000));
        });
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

getTrace();

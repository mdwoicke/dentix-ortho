const fetch = require('node-fetch');

const LANGFUSE_HOST = 'https://langfuse-6x3cj-u15194.vm.elestio.app';
const auth = Buffer.from('pk-lf-fc360c30-95d4-4666-89ec-12d934219fca:sk-lf-b2ebdd34-aa4c-470f-be92-82ea07c368f4').toString('base64');

async function getTrace(traceId) {
  const res = await fetch(LANGFUSE_HOST + '/api/public/traces/' + traceId, {
    headers: { 'Authorization': 'Basic ' + auth }
  });

  if (!res.ok) {
    console.log('Error:', res.status, res.statusText);
    return null;
  }

  return res.json();
}

async function getObservations(traceId) {
  const res = await fetch(LANGFUSE_HOST + '/api/public/observations?traceId=' + traceId + '&limit=100', {
    headers: { 'Authorization': 'Basic ' + auth }
  });

  if (!res.ok) {
    console.log('Error getting observations:', res.status);
    return [];
  }

  const data = await res.json();
  return data.data || [];
}

async function analyze() {
  const sessionId = '4ce328b0-3b75-4246-914a-95ee7b406fb5';

  // Get all traces for this session
  const tracesRes = await fetch(LANGFUSE_HOST + '/api/public/traces?sessionId=' + sessionId + '&limit=100', {
    headers: { 'Authorization': 'Basic ' + auth }
  });
  const tracesData = await tracesRes.json();

  console.log('=== SESSION OVERVIEW ===');
  console.log('Session ID:', sessionId);
  console.log('Traces found:', tracesData.data?.length || 0);

  if (!tracesData.data || tracesData.data.length === 0) {
    console.log('No traces found!');
    return;
  }

  // Sort traces by timestamp
  const traces = tracesData.data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  console.log('\n=== CONVERSATION FLOW ===');

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    console.log('\n--- Turn', i+1, '---');

    // Get user input
    if (trace.input) {
      const input = typeof trace.input === 'string' ? trace.input :
        (trace.input.question || trace.input.input || JSON.stringify(trace.input));
      console.log('USER:', input.substring(0, 500));
    }

    // Get assistant output
    if (trace.output) {
      const output = typeof trace.output === 'string' ? trace.output :
        (trace.output.text || trace.output.response || JSON.stringify(trace.output));
      console.log('ASSISTANT:', output.substring(0, 500));
    }

    // Get observations for this trace to see tool calls
    const observations = await getObservations(trace.id);
    const toolObs = observations.filter(o => o.type === 'SPAN' && o.name && o.name.includes('tool'));
    if (toolObs.length > 0) {
      console.log('TOOLS CALLED:', toolObs.map(t => t.name.replace('tool-', '')).join(', '));
    }
  }

  // Summary
  console.log('\n\n=== MISSING GOAL ANALYSIS ===');
  console.log('Failed goals:');
  console.log('1. collect-parent-info - Missing: parent_name_spelling');
  console.log('2. collect-child-count - Missing: child_count');
  console.log('3. collect-preferences - Missing: time_preference');

  console.log('\n=== CHECKING CONVERSATION FOR MISSING DATA ===');

  // Look through all traces for mentions of these fields
  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    const inputStr = JSON.stringify(trace.input || '').toLowerCase();
    const outputStr = JSON.stringify(trace.output || '').toLowerCase();

    if (inputStr.includes('spell') || outputStr.includes('spell') ||
        inputStr.includes('spelling') || outputStr.includes('spelling')) {
      console.log('\nTurn', i+1, '- Spelling mentioned:');
      console.log('  Input:', JSON.stringify(trace.input)?.substring(0, 200));
      console.log('  Output:', JSON.stringify(trace.output)?.substring(0, 200));
    }

    if (inputStr.includes('child') || outputStr.includes('child') ||
        inputStr.includes('children') || outputStr.includes('children') ||
        inputStr.includes('how many') || outputStr.includes('how many')) {
      console.log('\nTurn', i+1, '- Child count mentioned:');
      console.log('  Input:', JSON.stringify(trace.input)?.substring(0, 200));
      console.log('  Output:', JSON.stringify(trace.output)?.substring(0, 200));
    }

    if (inputStr.includes('time') || outputStr.includes('time') ||
        inputStr.includes('prefer') || outputStr.includes('prefer') ||
        inputStr.includes('morning') || outputStr.includes('morning') ||
        inputStr.includes('afternoon') || outputStr.includes('afternoon')) {
      console.log('\nTurn', i+1, '- Time preference mentioned:');
      console.log('  Input:', JSON.stringify(trace.input)?.substring(0, 200));
      console.log('  Output:', JSON.stringify(trace.output)?.substring(0, 200));
    }
  }
}

analyze().catch(console.error);

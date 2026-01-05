const https = require('https');

const LANGFUSE_CONFIG = {
    host: 'langfuse-6x3cj-u15194.vm.elestio.app',
    publicKey: 'pk-lf-d8ac7be3-a04b-4720-b95f-b96fa98874ed',
    secretKey: 'sk-lf-04345fa3-887d-4fc5-a386-3d12142202c7'
};

const authString = Buffer.from(`${LANGFUSE_CONFIG.publicKey}:${LANGFUSE_CONFIG.secretKey}`).toString('base64');

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: LANGFUSE_CONFIG.host,
            port: 443,
            path: `/api/public${path}`,
            method: 'GET',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.end();
    });
}

async function analyze() {
    // Get the most recent traces to find HAPPY-002 scheduling attempts
    console.log('Fetching recent traces...\n');
    const traces = await makeRequest('/traces?limit=20&orderBy=timestamp.desc');

    // Look for traces around 12:43-12:44 PM which was the scheduling phase
    for (const trace of traces.data.slice(0, 10)) {
        const time = new Date(trace.timestamp).toLocaleTimeString();
        const input = JSON.stringify(trace.input || '').substring(0, 50);

        // Get observations for this trace
        const obs = await makeRequest(`/observations?traceId=${trace.id}&limit=100`);

        // Look for scheduling tool
        let hasSchedulingTool = false;
        obs.data.forEach(o => {
            const name = o.name || '';
            if (name.includes('schedule') || name.includes('Schedule') ||
                name === 'schedule_appointment_ortho' || name === 'schedule_appointment_dso') {
                hasSchedulingTool = true;
                console.log(`\n${'='.repeat(60)}`);
                console.log(`TRACE: ${trace.id}`);
                console.log(`TIME: ${time}`);
                console.log(`INPUT: ${input}`);
                console.log(`\n🔧 SCHEDULING TOOL: ${name}`);
                console.log('INPUT:', JSON.stringify(o.input, null, 2));
                console.log('OUTPUT:', JSON.stringify(o.output, null, 2).substring(0, 2000));
            }
        });

        // Also check generations for tool_calls
        obs.data.forEach(o => {
            if (o.type === 'GENERATION' && o.output && o.output.tool_calls) {
                o.output.tool_calls.forEach(tc => {
                    const toolName = tc.name || (tc.function && tc.function.name) || '';
                    if (toolName.includes('schedule')) {
                        console.log(`\n${'='.repeat(60)}`);
                        console.log(`TRACE: ${trace.id} | TIME: ${time}`);
                        console.log(`\n📞 TOOL CALL in LLM output: ${toolName}`);
                        const args = tc.args || (tc.function && tc.function.arguments) || {};
                        console.log('ARGUMENTS:', typeof args === 'string' ? args : JSON.stringify(args, null, 2));
                    }
                });
            }
        });
    }

    console.log('\n\nDone.');
}

analyze().catch(console.error);

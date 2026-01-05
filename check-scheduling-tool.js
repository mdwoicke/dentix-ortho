/**
 * Check Langfuse traces for scheduling tool calls specifically
 */
const https = require('https');

const LANGFUSE_CONFIG = {
    host: 'langfuse-6x3cj-u15194.vm.elestio.app',
    publicKey: 'pk-lf-d8ac7be3-a04b-4720-b95f-b96fa98874ed',
    secretKey: 'sk-lf-04345fa3-887d-4fc5-a386-3d12142202c7'
};

const authString = Buffer.from(LANGFUSE_CONFIG.publicKey + ':' + LANGFUSE_CONFIG.secretKey).toString('base64');

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: LANGFUSE_CONFIG.host,
            port: 443,
            path: '/api/public' + path,
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + authString,
                'Content-Type': 'application/json'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve({ error: data }); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function findSchedulingToolCalls() {
    console.log('='.repeat(60));
    console.log('SEARCHING FOR SCHEDULING TOOL CALLS IN LANGFUSE');
    console.log('='.repeat(60));

    // Get recent traces
    const traces = await makeRequest('/traces?limit=50&orderBy=timestamp.desc');
    if (!traces.data || traces.data.length === 0) {
        console.log('No traces found!');
        return;
    }

    console.log('\nScanning ' + traces.data.length + ' traces for scheduling tool calls...\n');

    let foundSchedulingCall = false;

    for (const trace of traces.data) {
        // Get observations for this trace
        const obs = await makeRequest('/observations?traceId=' + trace.id + '&limit=50');
        if (!obs.data) continue;

        for (const o of obs.data) {
            const content = JSON.stringify(o.output || '') + JSON.stringify(o.input || '');

            // Look for schedule_appointment_ortho tool calls
            if (content.includes('schedule_appointment_ortho') ||
                content.includes('schedule_appointment_dso') ||
                (o.name && o.name.includes('schedule'))) {

                foundSchedulingCall = true;
                console.log('-'.repeat(60));
                console.log('TRACE: ' + trace.id);
                console.log('TIME: ' + new Date(trace.timestamp).toLocaleString());
                console.log('OBSERVATION: ' + o.name + ' (' + o.type + ')');

                // Extract tool input
                if (o.input) {
                    const inputStr = JSON.stringify(o.input, null, 2);
                    if (inputStr.includes('action') || inputStr.includes('slots')) {
                        console.log('\nTOOL INPUT:');
                        console.log(inputStr.substring(0, 500));
                    }
                }

                // Extract tool output
                if (o.output) {
                    const outputStr = JSON.stringify(o.output);
                    console.log('\nTOOL OUTPUT (' + outputStr.length + ' chars):');

                    // Check for version
                    if (outputStr.includes('_toolVersion')) {
                        const vMatch = outputStr.match(/_toolVersion[\"':]+\s*[\"']?(v[0-9]+)/);
                        console.log('  ✅ VERSION: ' + (vMatch ? vMatch[1] : 'found but parse failed'));
                    } else {
                        console.log('  ❌ NO _toolVersion found');
                    }

                    // Check for slots
                    if (outputStr.includes('slots')) {
                        const slotCount = (outputStr.match(/"startTime"/g) || []).length;
                        console.log('  📅 SLOTS: ' + slotCount + ' found');
                    }

                    // Check for null/empty
                    if (outputStr === 'null' || outputStr === '""' || outputStr === '{}' || outputStr.length < 10) {
                        console.log('  ⚠️  EMPTY/NULL RESPONSE');
                    }

                    // Check dates
                    if (outputStr.includes('01/13/2026')) {
                        console.log('  ✅ CORRECTED DATE 01/13/2026 found');
                    }
                    if (outputStr.includes('01/03/2026')) {
                        console.log('  ⚠️  TODAY DATE 01/03/2026 found (not corrected)');
                    }

                    // Show preview
                    console.log('\n  Preview: ' + outputStr.substring(0, 300) + '...');
                }

                console.log('');
            }
        }
    }

    console.log('='.repeat(60));
    if (foundSchedulingCall) {
        console.log('✅ Found scheduling tool calls - see details above');
    } else {
        console.log('❌ NO scheduling tool calls found in recent traces');
        console.log('   The agent may not be calling the scheduling tool');
    }
}

findSchedulingToolCalls().catch(console.error);

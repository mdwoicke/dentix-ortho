/**
 * Check if v36 is deployed - look for version logging in Langfuse
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

async function searchForV36() {
    console.log('='.repeat(60));
    console.log('SEARCHING FOR v36 VERSION IN LANGFUSE TRACES');
    console.log('='.repeat(60));

    // Get recent traces
    const traces = await makeRequest('/traces?limit=20&orderBy=timestamp.desc');
    if (!traces.data || traces.data.length === 0) {
        console.log('No traces found!');
        return;
    }

    console.log('\nFound ' + traces.data.length + ' recent traces\n');

    let foundVersion = false;

    for (const trace of traces.data.slice(0, 10)) {
        console.log('\n' + '-'.repeat(60));
        console.log('Trace: ' + trace.id);
        console.log('Time: ' + new Date(trace.timestamp).toLocaleString());
        console.log('Input: ' + JSON.stringify(trace.input).substring(0, 100));

        // Get observations for this trace
        const obs = await makeRequest('/observations?traceId=' + trace.id + '&limit=50');
        if (!obs.data) continue;

        console.log('Observations: ' + obs.data.length);

        // Search for v36, SCHEDULING_TOOL, or _toolVersion
        for (const o of obs.data) {
            const content = JSON.stringify(o.output || '') + JSON.stringify(o.input || '') + JSON.stringify(o.metadata || '');

            if (content.includes('v36') || content.includes('v35') || content.includes('v34') || content.includes('v33')) {
                console.log('\n  ✅ VERSION FOUND in ' + o.name + ': ');
                const match = content.match(/v3[0-9]+/g);
                console.log('     Versions found: ' + (match ? match.join(', ') : 'none'));
                foundVersion = true;
            }

            if (content.includes('SCHEDULING_TOOL')) {
                console.log('\n  ✅ [SCHEDULING_TOOL] LOG FOUND in ' + o.name);
                foundVersion = true;
            }

            if (content.includes('_toolVersion')) {
                console.log('\n  ✅ _toolVersion FOUND in ' + o.name);
                const versionMatch = content.match(/_toolVersion[\"':]+\s*[\"']?(v[0-9]+)/);
                if (versionMatch) {
                    console.log('     Version: ' + versionMatch[1]);
                }
                foundVersion = true;
            }

            if (content.includes('SANDBOX_MIN_DATE')) {
                console.log('\n  ✅ SANDBOX_MIN_DATE reference FOUND in ' + o.name);
                foundVersion = true;
            }

            if (content.includes('01/13/2026')) {
                console.log('\n  ✅ CORRECTED DATE (01/13/2026) FOUND in ' + o.name);
                foundVersion = true;
            }

            // Look for scheduling tool response with slots
            if ((o.name === 'schedule_appointment_dso' || (o.name && o.name.includes('schedule'))) && o.output) {
                console.log('\n  📦 SCHEDULING TOOL CALL: ' + o.name);
                console.log('     Type: ' + o.type);
                const outputStr = JSON.stringify(o.output);
                console.log('     Output length: ' + outputStr.length);
                console.log('     Preview: ' + outputStr.substring(0, 400));

                // Check if output is null/empty
                if (outputStr === 'null' || outputStr === '""' || outputStr === '{}') {
                    console.log('     ⚠️  EMPTY OUTPUT DETECTED!');
                }

                // Check for slots
                if (outputStr.includes('slots')) {
                    const slotCount = (outputStr.match(/"startTime"/g) || []).length;
                    console.log('     Slots in response: ' + slotCount);
                }
            }
        }
    }

    console.log('\n' + '='.repeat(60));
    if (foundVersion) {
        console.log('✅ Version information FOUND in traces');
    } else {
        console.log('❌ NO version information found - v36 may NOT be deployed');
        console.log('   Look for _toolVersion, SCHEDULING_TOOL, or v36 strings');
    }
    console.log('='.repeat(60));
}

searchForV36().catch(console.error);

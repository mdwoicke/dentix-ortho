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
            headers: { 'Authorization': 'Basic ' + authString, 'Content-Type': 'application/json' }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ error: data }); } });
        });
        req.on('error', reject);
        req.end();
    });
}

async function findV36() {
    const traces = await makeRequest('/traces?limit=30&orderBy=timestamp.desc');
    console.log('Checking ' + traces.data.length + ' traces for v36...\n');

    let foundSchedulingTool = false;

    for (const trace of traces.data) {
        const obs = await makeRequest('/observations?traceId=' + trace.id + '&limit=50');
        if (!obs.data) continue;

        for (const o of obs.data) {
            // Look specifically for schedule_appointment_ortho SPAN with output
            if (o.name === 'schedule_appointment_ortho') {
                foundSchedulingTool = true;
                console.log('='.repeat(60));
                console.log('FOUND: schedule_appointment_ortho');
                console.log('Time: ' + new Date(trace.timestamp).toLocaleString());
                console.log('Type: ' + o.type);

                if (o.input) {
                    console.log('Input: ' + JSON.stringify(o.input));
                }

                if (o.output) {
                    const outputStr = JSON.stringify(o.output);
                    console.log('Output length: ' + outputStr.length + ' chars');
                    console.log('Output preview: ' + outputStr.substring(0, 500));

                    if (outputStr.includes('_toolVersion')) {
                        const match = outputStr.match(/_toolVersion.*?(v[0-9]+)/);
                        console.log('\n✅ VERSION FOUND: ' + (match ? match[1] : 'parse failed'));
                    } else {
                        console.log('\n❌ NO _toolVersion in output');
                    }

                    if (outputStr.includes('01/13/2026')) {
                        console.log('✅ CORRECTED DATE 01/13/2026 found');
                    }
                    if (outputStr.includes('slots')) {
                        const count = (outputStr.match(/startTime/g) || []).length;
                        console.log('✅ SLOTS: ' + count);
                    }
                } else {
                    console.log('❌ NO OUTPUT (null/empty)');
                }
                console.log('');
            }
        }
    }

    if (!foundSchedulingTool) {
        console.log('❌ No schedule_appointment_ortho observations found');
    }
}

findV36().catch(console.error);

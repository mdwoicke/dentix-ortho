/**
 * Detailed check of Langfuse observations - look for scheduling tool data
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

async function main() {
    console.log('='.repeat(60));
    console.log('DETAILED LANGFUSE OBSERVATION ANALYSIS');
    console.log('='.repeat(60));

    // Get traces sorted by newest first
    const traces = await makeRequest('/traces?limit=5&orderBy=timestamp.desc');
    if (!traces.data || traces.data.length === 0) {
        console.log('No traces found!');
        return;
    }

    // Get the most recent trace
    const trace = traces.data[0];
    console.log('\nMost recent trace:');
    console.log('  ID: ' + trace.id);
    console.log('  Time: ' + new Date(trace.timestamp).toLocaleString());
    console.log('  Input: ' + JSON.stringify(trace.input));

    // Get all observations for this trace
    const obs = await makeRequest('/observations?traceId=' + trace.id + '&limit=100');
    if (!obs.data) {
        console.log('No observations found!');
        return;
    }

    console.log('\nObservations in this trace: ' + obs.data.length);
    console.log('\n' + '-'.repeat(60));

    // List all observation names and types
    console.log('\nObservation Summary:');
    obs.data.forEach((o, i) => {
        console.log('  ' + (i+1) + '. ' + o.name + ' (' + o.type + ')');
    });

    // Look for scheduling-related observations
    console.log('\n' + '-'.repeat(60));
    console.log('\nSearching for scheduling tool data...\n');

    obs.data.forEach((o, i) => {
        const outputStr = JSON.stringify(o.output || '');
        const inputStr = JSON.stringify(o.input || '');

        // Check for tool calls
        if (outputStr.includes('schedule_appointment') || inputStr.includes('schedule_appointment') ||
            outputStr.includes('slots') || outputStr.includes('book_child') ||
            o.name.includes('tool') || o.name.includes('Tool')) {

            console.log('\n📦 [' + (i+1) + '] ' + o.name + ' (' + o.type + ')');
            console.log('   Status: ' + o.status);

            if (o.input) {
                console.log('\n   INPUT:');
                console.log('   ' + JSON.stringify(o.input, null, 2).split('\n').join('\n   ').substring(0, 1000));
            }

            if (o.output) {
                console.log('\n   OUTPUT:');
                const outPreview = JSON.stringify(o.output, null, 2).substring(0, 1500);
                console.log('   ' + outPreview.split('\n').join('\n   '));
            }
        }

        // Check for slots data
        if (outputStr.includes('startTime') && outputStr.includes('scheduleViewGUID')) {
            console.log('\n✅ SLOT DATA FOUND in ' + o.name);

            // Look for version info
            if (outputStr.includes('_toolVersion')) {
                const vMatch = outputStr.match(/_toolVersion[\"':]+([^\"']+)/);
                console.log('   _toolVersion: ' + (vMatch ? vMatch[1] : 'found but parse failed'));
            }

            // Check dates
            if (outputStr.includes('01/13/2026')) {
                console.log('   ✅ Corrected date 01/13/2026 found!');
            }
            if (outputStr.includes('01/03/2026')) {
                console.log('   ⚠️  Today date 01/03/2026 found (NOT corrected)');
            }
        }

        // Look for empty/null responses
        if (o.name.includes('schedule') && (outputStr === 'null' || outputStr === '""')) {
            console.log('\n⚠️  EMPTY OUTPUT in ' + o.name);
        }
    });

    console.log('\n' + '='.repeat(60));
}

main().catch(console.error);

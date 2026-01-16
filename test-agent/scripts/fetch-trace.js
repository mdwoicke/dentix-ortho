const Database = require('better-sqlite3');
const https = require('https');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/test-results.db');
const db = new Database(DB_PATH, { readonly: true });
const config = db.prepare('SELECT * FROM langfuse_configs WHERE id = 4').get();
db.close();

const traceId = process.argv[2] || 'd2202490-868e-40cb-b6f9-2d489fed0b13';
const auth = Buffer.from(config.public_key + ':' + config.secret_key).toString('base64');

console.log('Fetching trace:', traceId);
console.log('From:', config.host);

const options = {
    hostname: 'langfuse-6x3cj-u15194.vm.elestio.app',
    path: '/api/public/traces/' + traceId,
    method: 'GET',
    headers: {
        'Authorization': 'Basic ' + auth
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (res.statusCode !== 200) {
            console.log('Error:', res.statusCode, data);
            return;
        }
        const trace = JSON.parse(data);
        console.log('\n=== TRACE FOUND ===');
        console.log('ID:', trace.id);
        console.log('Name:', trace.name);
        console.log('Session:', trace.sessionId);
        console.log('Tags:', JSON.stringify(trace.tags));

        // Now fetch observations for this trace
        fetchObservations(traceId, auth);
    });
});
req.on('error', e => console.log('Request error:', e.message));
req.end();

function fetchObservations(traceId, auth) {
    const options = {
        hostname: 'langfuse-6x3cj-u15194.vm.elestio.app',
        path: '/api/public/observations?traceId=' + traceId + '&limit=100',
        method: 'GET',
        headers: {
            'Authorization': 'Basic ' + auth
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode !== 200) {
                console.log('Observations Error:', res.statusCode, data);
                return;
            }
            const result = JSON.parse(data);
            console.log('\n=== OBSERVATIONS (' + result.data.length + ' total) ===\n');

            // Sort by startTime
            const observations = result.data.sort((a, b) =>
                new Date(a.startTime) - new Date(b.startTime)
            );

            // Find tool calls
            const toolCalls = observations.filter(o =>
                o.type === 'GENERATION' ||
                o.name?.includes('tool') ||
                o.name?.includes('chord') ||
                o.name?.includes('schedule')
            );

            console.log('=== ALL OBSERVATIONS (chronological) ===\n');
            observations.forEach((obs, i) => {
                console.log(`[${i + 1}] ${obs.type} | ${obs.name || 'unnamed'}`);
                console.log(`    Time: ${obs.startTime}`);
                if (obs.input) {
                    const inputStr = typeof obs.input === 'string' ? obs.input : JSON.stringify(obs.input);
                    console.log(`    Input: ${inputStr.substring(0, 200)}...`);
                }
                if (obs.output) {
                    const outputStr = typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output);
                    console.log(`    Output: ${outputStr.substring(0, 300)}...`);
                }
                console.log('');
            });
        });
    });
    req.on('error', e => console.log('Request error:', e.message));
    req.end();
}

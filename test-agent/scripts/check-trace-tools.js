const https = require('https');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/test-results.db'), { readonly: true });
const config = db.prepare('SELECT * FROM langfuse_configs WHERE id = 1').get();
db.close();

const traceId = process.argv[2] || 'a4761320-2658-4f2b-bce5-b6a4bcd8b312';
const auth = Buffer.from(config.public_key + ':' + config.secret_key).toString('base64');

console.log('Checking trace:', traceId);

const options = {
    hostname: 'langfuse-6x3cj-u15194.vm.elestio.app',
    path: '/api/public/observations?traceId=' + traceId + '&limit=50',
    method: 'GET',
    headers: { 'Authorization': 'Basic ' + auth }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (res.statusCode !== 200) {
            console.log('Error:', res.statusCode, data);
            return;
        }
        const result = JSON.parse(data);
        console.log('Total observations:', result.data.length);

        // Find tool calls
        const toolCalls = result.data.filter(o => o.name && (o.name.includes('chord_ortho') || o.name.includes('schedule_appointment')));
        console.log('\nTool calls found:', toolCalls.length);

        toolCalls.forEach(tc => {
            console.log('\n--- ' + tc.name + ' ---');
            if (tc.input) {
                const input = typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input);
                console.log('Input:', input.substring(0, 300));
            }
            if (tc.output) {
                const output = typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output);
                console.log('Output:', output.substring(0, 300));
            }
        });

        if (toolCalls.length === 0) {
            console.log('\nNo scheduling/patient tool calls found!');
            console.log('All observation names:');
            result.data.forEach(o => console.log('  - ' + o.name));
        }
    });
});
req.on('error', e => console.log('Error:', e.message));
req.end();

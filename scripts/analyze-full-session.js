/**
 * Fetch all traces for a session and analyze the conversation
 */
const https = require('https');
const path = require('path');
const fs = require('fs');

const SESSION_FILE = path.resolve(__dirname, '../.playwright-mcp/session-cd4d54fb-6530-4914-b56a-a9784df7cc9c.json');
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../test-agent/data/test-results.db');

function loadConfig() {
    const BetterSqlite3 = require(path.resolve(__dirname, '../backend/node_modules/better-sqlite3'));
    const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });
    const hostRow = db.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'langfuse_host'").get();
    const publicKeyRow = db.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'langfuse_public_key'").get();
    const secretKeyRow = db.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'langfuse_secret_key'").get();
    db.close();
    return {
        host: (hostRow?.setting_value || '').replace(/^https?:\/\//, ''),
        publicKey: publicKeyRow?.setting_value || '',
        secretKey: secretKeyRow?.setting_value || ''
    };
}

const config = loadConfig();
const authString = Buffer.from(config.publicKey + ':' + config.secretKey).toString('base64');

function makeRequest(apiPath) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: config.host,
            port: 443,
            path: '/api/public' + apiPath,
            method: 'GET',
            headers: { 'Authorization': 'Basic ' + authString, 'Content-Type': 'application/json' }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data: data }); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    // Read session file
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const traceIds = session.traces.map(t => t.id);

    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  SESSION CONVERSATION ANALYSIS                                               ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('Session:', session.id);
    console.log('Traces:', traceIds.length);
    console.log('Total Cost: $' + session.totalCost.toFixed(4));
    console.log('='.repeat(80));

    const conversation = [];
    const toolCalls = [];
    const errors = [];

    for (let i = 0; i < traceIds.length; i++) {
        const traceId = traceIds[i];
        process.stdout.write(`Fetching trace ${i + 1}/${traceIds.length}...\r`);

        const traceResult = await makeRequest('/traces/' + traceId);
        if (traceResult.status !== 200) {
            console.log(`\nFailed to fetch trace ${traceId}: ${traceResult.status}`);
            continue;
        }

        const trace = traceResult.data;
        const input = trace.input?.input || trace.input;
        const output = trace.output?.returnValues?.output || trace.output?.output || trace.output;

        // Extract clean answer from output
        let answer = output;
        if (typeof output === 'string' && output.includes('ANSWER:')) {
            const match = output.match(/ANSWER:\s*(.*?)(?:\s*PAYLOAD:|$)/s);
            if (match) answer = match[1].trim();
        }

        conversation.push({
            turn: i + 1,
            traceId: traceId,
            timestamp: trace.timestamp,
            input: input,
            output: answer,
            fullOutput: output
        });

        // Check for errors/transfers
        const outputStr = JSON.stringify(output || '').toLowerCase();
        if (outputStr.includes('transfer') || outputStr.includes('operator') ||
            outputStr.includes('unable') || outputStr.includes('error')) {
            errors.push({
                turn: i + 1,
                traceId: traceId,
                output: output
            });
        }

        // Get observations for tool calls
        const obsResult = await makeRequest('/observations?traceId=' + traceId + '&limit=50');
        if (obsResult.status === 200) {
            const observations = obsResult.data.data || [];
            for (const obs of observations) {
                if (obs.name?.includes('schedule') || obs.name?.includes('patient') ||
                    obs.name?.includes('chord') || obs.name?.includes('Tool')) {
                    toolCalls.push({
                        turn: i + 1,
                        traceId: traceId,
                        name: obs.name,
                        input: obs.input,
                        output: obs.output
                    });
                }
            }
        }
    }

    console.log('\n\n📝 CONVERSATION FLOW\n' + '─'.repeat(80));

    for (const turn of conversation) {
        console.log(`\n[Turn ${turn.turn}] ${new Date(turn.timestamp).toLocaleTimeString()}`);
        console.log(`👤 User: ${turn.input}`);
        console.log(`🤖 Assistant: ${turn.output?.substring(0, 300)}${turn.output?.length > 300 ? '...' : ''}`);
    }

    if (toolCalls.length > 0) {
        console.log('\n\n🔧 TOOL CALLS\n' + '─'.repeat(80));
        for (const tc of toolCalls) {
            console.log(`\n[Turn ${tc.turn}] ${tc.name}`);
            if (tc.input) console.log('  Input:', JSON.stringify(tc.input).substring(0, 200));
            if (tc.output) {
                const outStr = JSON.stringify(tc.output);
                console.log('  Output:', outStr.substring(0, 400));
                if (outStr.includes('error') || outStr.includes('failed')) {
                    console.log('  ⚠️ ERROR DETECTED');
                }
            }
        }
    }

    if (errors.length > 0) {
        console.log('\n\n🚨 ERRORS/TRANSFERS DETECTED\n' + '─'.repeat(80));
        for (const e of errors) {
            console.log(`\n[Turn ${e.turn}] Trace: ${e.traceId}`);
            console.log('Output:', e.output);
        }
    }

    // Find the failure point
    console.log('\n\n🔍 FAILURE ANALYSIS\n' + '─'.repeat(80));

    const lastTurn = conversation[conversation.length - 1];
    console.log('\nLast turn output:', lastTurn?.fullOutput);

    // Check if it mentioned transfer
    const transferTurns = conversation.filter(t =>
        JSON.stringify(t.fullOutput || '').toLowerCase().includes('transfer') ||
        JSON.stringify(t.fullOutput || '').toLowerCase().includes('operator')
    );

    if (transferTurns.length > 0) {
        console.log('\n\n📞 TRANSFER POINTS:');
        for (const t of transferTurns) {
            console.log(`\nTurn ${t.turn}:`);
            console.log('Input:', t.input);
            console.log('Output:', t.fullOutput);
        }
    }
}

main().catch(console.error);

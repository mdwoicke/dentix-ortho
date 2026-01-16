/**
 * Analyze a Langfuse session for failure analysis
 */
const https = require('https');
const path = require('path');

const SESSION_ID = process.argv[2] || 'b888c708-36dc-4c88-8631-18636a219b0a';

// Database path for app settings
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../test-agent/data/test-results.db');

// Load config from database
function loadConfig() {
    try {
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
    } catch (err) {
        console.error('Failed to load config:', err.message);
        return null;
    }
}

const config = loadConfig();
if (!config || !config.secretKey) {
    console.error('Langfuse config not available');
    process.exit(1);
}

const authString = Buffer.from(config.publicKey + ':' + config.secretKey).toString('base64');

function makeRequest(apiPath) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: config.host,
            port: 443,
            path: '/api/public' + apiPath,
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
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function analyzeSession(sessionId) {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  LANGFUSE SESSION ANALYSIS                                                   ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('Session ID:', sessionId);
    console.log('Host:', config.host);
    console.log('='.repeat(80));

    // Get traces for this session
    const tracesResult = await makeRequest('/traces?sessionId=' + sessionId + '&limit=100&orderBy=timestamp.asc');
    if (tracesResult.status !== 200) {
        console.error('Failed to get traces:', tracesResult.status, tracesResult.data);
        return;
    }

    const traces = tracesResult.data.data || [];
    console.log('\nFound', traces.length, 'traces in session\n');

    // Collect all conversation turns
    const conversation = [];
    const toolCalls = [];
    const errors = [];

    for (const trace of traces) {
        const ts = new Date(trace.timestamp).toLocaleTimeString();
        const input = trace.input;
        const output = trace.output;

        // Get observations for this trace
        const obsResult = await makeRequest('/observations?traceId=' + trace.id + '&limit=100');
        const observations = obsResult.status === 200 ? (obsResult.data.data || []) : [];

        // Extract conversation
        if (input) {
            const inputStr = typeof input === 'string' ? input :
                             input.question || input.input || input.text || JSON.stringify(input);
            conversation.push({ time: ts, role: 'User', text: inputStr.substring(0, 500) });
        }

        if (output) {
            const outputStr = typeof output === 'string' ? output :
                              output.text || output.response || output.answer || JSON.stringify(output);
            conversation.push({ time: ts, role: 'Assistant', text: outputStr.substring(0, 500) });

            // Check for transfer/error
            if (outputStr.toLowerCase().includes('transfer') ||
                outputStr.toLowerCase().includes('operator') ||
                outputStr.toLowerCase().includes('unable to')) {
                errors.push({ time: ts, traceId: trace.id, message: outputStr.substring(0, 300) });
            }
        }

        // Extract tool calls
        for (const obs of observations) {
            if (obs.name?.includes('schedule') || obs.name?.includes('patient') ||
                obs.name?.includes('chord') || obs.name?.includes('tool')) {
                toolCalls.push({
                    time: ts,
                    traceId: trace.id,
                    name: obs.name,
                    type: obs.type,
                    input: obs.input,
                    output: obs.output,
                    status: obs.status,
                    statusMessage: obs.statusMessage
                });
            }

            // Check observation output for errors
            const obsOutput = JSON.stringify(obs.output || '');
            if (obsOutput.includes('error') || obsOutput.includes('failed') ||
                obsOutput.includes('Unable') || obsOutput.includes('transfer')) {
                if (!errors.find(e => e.traceId === trace.id && e.message.includes(obs.name))) {
                    errors.push({
                        time: ts,
                        traceId: trace.id,
                        obsName: obs.name,
                        message: obsOutput.substring(0, 300)
                    });
                }
            }
        }
    }

    // Print conversation flow
    console.log('\n📝 CONVERSATION FLOW\n' + '─'.repeat(80));
    conversation.forEach(c => {
        const emoji = c.role === 'User' ? '👤' : '🤖';
        console.log(`\n${emoji} [${c.time}] ${c.role}:`);
        console.log('   ' + c.text.split('\n').join('\n   '));
    });

    // Print tool calls
    if (toolCalls.length > 0) {
        console.log('\n\n🔧 TOOL CALLS\n' + '─'.repeat(80));
        toolCalls.forEach(tc => {
            console.log(`\n[${tc.time}] ${tc.name} (${tc.type})`);
            console.log('   Status:', tc.status || 'N/A');
            if (tc.input) {
                console.log('   Input:', JSON.stringify(tc.input).substring(0, 400));
            }
            if (tc.output) {
                const out = JSON.stringify(tc.output);
                console.log('   Output:', out.substring(0, 600));
                if (out.includes('error') || out.includes('failed')) {
                    console.log('   ⚠️  ERROR IN OUTPUT');
                }
            }
        });
    }

    // Print errors/failures
    if (errors.length > 0) {
        console.log('\n\n🚨 ERRORS/FAILURES DETECTED\n' + '─'.repeat(80));
        errors.forEach(e => {
            console.log(`\n[${e.time}] Trace: ${e.traceId.substring(0, 12)}`);
            if (e.obsName) console.log('   Observation:', e.obsName);
            console.log('   Message:', e.message);
        });
    }

    // Summary
    console.log('\n\n📊 SUMMARY\n' + '─'.repeat(80));
    console.log('Total traces:', traces.length);
    console.log('Tool calls:', toolCalls.length);
    console.log('Errors detected:', errors.length);

    // Determine failure reason
    console.log('\n\n🔍 FAILURE ANALYSIS\n' + '─'.repeat(80));

    if (errors.length > 0) {
        console.log('\nPrimary failure points:');
        errors.forEach((e, i) => {
            console.log(`\n${i + 1}. ${e.obsName || 'Trace output'}`);
            console.log('   ' + e.message);
        });
    }

    // Check last assistant message for transfer indication
    const lastAssistant = conversation.filter(c => c.role === 'Assistant').pop();
    if (lastAssistant) {
        console.log('\n\nLast assistant response:', lastAssistant.text);
    }
}

analyzeSession(SESSION_ID).catch(err => {
    console.error('Analysis failed:', err);
    process.exit(1);
});

/**
 * Langfuse Debug Script
 * Connects to Langfuse to analyze chord_patient tool execution logs
 */

const https = require('https');

const LANGFUSE_CONFIG = {
    host: 'us.cloud.langfuse.com',
    publicKey: 'pk-lf-1f0a05a9-2c72-456d-a033-2e5113084e97',
    secretKey: 'sk-lf-a1134b7e-2af4-4ab6-a64e-f0ff05fa2750'
};

// Base64 encode credentials for Basic Auth
const authString = Buffer.from(`${LANGFUSE_CONFIG.publicKey}:${LANGFUSE_CONFIG.secretKey}`).toString('base64');

function makeRequest(path, method = 'GET') {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: LANGFUSE_CONFIG.host,
            port: 443,
            path: `/api/public${path}`,
            method: method,
            headers: {
                'Authorization': `Basic ${authString}`,
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

async function getRecentTraces(limit = 10) {
    console.log(`\n📡 Fetching last ${limit} traces from Langfuse...\n`);
    const result = await makeRequest(`/traces?limit=${limit}&orderBy=timestamp.desc`);

    if (result.status !== 200) {
        console.log('❌ Error fetching traces:', result.status, result.data);
        return [];
    }

    return result.data.data || [];
}

async function getTraceDetails(traceId) {
    const result = await makeRequest(`/traces/${traceId}`);
    if (result.status !== 200) {
        console.log('❌ Error fetching trace details:', result.status);
        return null;
    }
    return result.data;
}

async function getObservations(traceId) {
    const result = await makeRequest(`/observations?traceId=${traceId}&limit=100`);
    if (result.status !== 200) {
        console.log('❌ Error fetching observations:', result.status);
        return [];
    }
    return result.data.data || [];
}

function analyzeToolLogs(observations) {
    console.log('\n🔍 Analyzing tool execution logs...\n');

    const toolCalls = observations.filter(obs =>
        obs.name?.includes('chord') ||
        obs.name?.includes('tool') ||
        obs.type === 'GENERATION' ||
        obs.type === 'SPAN'
    );

    if (toolCalls.length === 0) {
        console.log('⚠️  No tool-related observations found');
        return;
    }

    toolCalls.forEach((obs, i) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📌 Observation ${i + 1}: ${obs.name || 'unnamed'}`);
        console.log(`   Type: ${obs.type}`);
        console.log(`   Status: ${obs.status || 'N/A'}`);
        console.log(`   Duration: ${obs.latency ? obs.latency + 'ms' : 'N/A'}`);

        if (obs.input) {
            console.log('\n   📥 INPUT:');
            const inputStr = typeof obs.input === 'string' ? obs.input : JSON.stringify(obs.input, null, 2);
            console.log('   ' + inputStr.substring(0, 500).split('\n').join('\n   '));
        }

        if (obs.output) {
            console.log('\n   📤 OUTPUT:');
            const outputStr = typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output, null, 2);
            console.log('   ' + outputStr.substring(0, 1000).split('\n').join('\n   '));
        }

        if (obs.metadata) {
            console.log('\n   📋 METADATA:');
            console.log('   ' + JSON.stringify(obs.metadata, null, 2).split('\n').join('\n   '));
        }

        if (obs.statusMessage) {
            console.log(`\n   ⚠️  STATUS MESSAGE: ${obs.statusMessage}`);
        }

        // Look for error indicators
        const outputStr = JSON.stringify(obs.output || '');
        if (outputStr.includes('error') || outputStr.includes('Error') || outputStr.includes('failed')) {
            console.log('\n   🚨 ERROR DETECTED IN OUTPUT!');
        }
    });
}

function searchForChordPatientLogs(observations) {
    console.log('\n🔎 Searching for [chord_patient] logs...\n');

    let found = false;
    observations.forEach(obs => {
        const content = JSON.stringify(obs.output || '') + JSON.stringify(obs.input || '') + JSON.stringify(obs.metadata || '');

        if (content.includes('chord_patient') || content.includes('GetLocations') || content.includes('clinic_info')) {
            found = true;
            console.log(`\n✅ Found chord_patient reference in: ${obs.name}`);
            console.log(`   Type: ${obs.type}`);

            if (obs.output) {
                console.log('\n   Full Output:');
                console.log(JSON.stringify(obs.output, null, 2).substring(0, 2000));
            }
        }
    });

    if (!found) {
        console.log('❌ No [chord_patient] logs found in observations');
        console.log('   This might mean:');
        console.log('   1. The tool is not being called at all');
        console.log('   2. The tool name in Flowise doesn\'t match "chord_dso_patient"');
        console.log('   3. Console.log output is not captured by Langfuse');
    }
}

function searchForAppointmentBooking(observations) {
    console.log('\n🔎 Searching for appointment booking / transfer logs...\n');

    const keywords = ['SetAppointment', 'transfer', 'live_agent', 'Unable to complete', 'telephonyTransferCall', 'appointment', 'booking', 'schedule'];

    observations.forEach(obs => {
        const content = JSON.stringify(obs.output || '') + JSON.stringify(obs.input || '');

        keywords.forEach(keyword => {
            if (content.toLowerCase().includes(keyword.toLowerCase())) {
                console.log(`\n🎯 Found "${keyword}" in: ${obs.name} (${obs.type})`);

                if (content.includes('transfer') || content.includes('Unable') || content.includes('error') || content.includes('failed')) {
                    console.log('   ⚠️  POTENTIAL FAILURE POINT!');
                }

                if (obs.output) {
                    const outputStr = typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output, null, 2);
                    console.log('\n   Output preview:');
                    console.log('   ' + outputStr.substring(0, 1500).split('\n').join('\n   '));
                }
            }
        });
    });
}

async function findBookingFailureTraces(traces) {
    console.log('\n🔍 Scanning all traces for booking failures...\n');

    for (const trace of traces) {
        const inputStr = JSON.stringify(trace.input || '').toLowerCase();
        const outputStr = JSON.stringify(trace.output || '').toLowerCase();

        // Look for traces that might be the booking step
        if (inputStr.includes('yes') && (inputStr.includes('time') || inputStr.includes('works')) ||
            outputStr.includes('transfer') || outputStr.includes('unable') ||
            outputStr.includes('setappointment') || outputStr.includes('booking')) {

            console.log(`\n${'═'.repeat(60)}`);
            console.log(`📍 POTENTIAL BOOKING TRACE: ${trace.id}`);
            console.log(`   Time: ${new Date(trace.timestamp).toLocaleString()}`);
            console.log(`   Input: ${JSON.stringify(trace.input).substring(0, 100)}`);

            // Get full observations for this trace
            const observations = await getObservations(trace.id);
            console.log(`   Observations: ${observations.length}`);

            // Look for tool calls
            const toolCalls = observations.filter(o =>
                o.name?.toLowerCase().includes('tool') ||
                o.type === 'GENERATION' ||
                JSON.stringify(o.output || '').includes('tool_calls')
            );

            if (toolCalls.length > 0) {
                console.log('\n   Tool-related observations:');
                toolCalls.forEach(tc => {
                    console.log(`   - ${tc.name} (${tc.type})`);
                    const outputPreview = JSON.stringify(tc.output || '').substring(0, 300);
                    if (outputPreview.includes('transfer') || outputPreview.includes('Unable')) {
                        console.log(`     ⚠️  ${outputPreview}`);
                    }
                });
            }

            // Check for transfer/failure in any observation
            observations.forEach(obs => {
                const content = JSON.stringify(obs.output || '');
                if (content.includes('telephonyTransferCall') || content.includes('Unable to complete')) {
                    console.log(`\n   🚨 FAILURE FOUND in ${obs.name}:`);
                    console.log('   ' + content.substring(0, 800));
                }
            });
        }
    }
}

async function analyzeSpecificTrace(traceId) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🔬 DEEP ANALYSIS OF TRACE: ${traceId}`);
    console.log('═'.repeat(70));

    const observations = await getObservations(traceId);
    console.log(`\nTotal observations: ${observations.length}\n`);

    // Look specifically for scheduling tool calls (slots, grouped_slots, book_child)
    console.log('📦 Looking for schedule_appointment_dso tool calls...\n');

    observations.forEach((obs, i) => {
        // Look for scheduling tool
        if (obs.name === 'schedule_appointment_dso' || obs.name?.includes('scheduling')) {
            console.log(`\n🎯 [${i+1}] SCHEDULING TOOL: ${obs.name} (${obs.type})`);
            console.log('   INPUT:', JSON.stringify(obs.input, null, 2));
            console.log('   OUTPUT:', JSON.stringify(obs.output, null, 2));
        }

        // Look for patient tool
        if (obs.name === 'chord_dso_patient_V3' || obs.name?.includes('patient') || obs.name?.includes('Patient')) {
            console.log(`\n👤 [${i+1}] PATIENT TOOL: ${obs.name} (${obs.type})`);
            console.log('   INPUT:', JSON.stringify(obs.input, null, 2));
            console.log('   OUTPUT:', JSON.stringify(obs.output, null, 2));
        }
    });

    // Look for error messages
    console.log('\n📛 Looking for errors or failure reasons...\n');
    observations.forEach((obs) => {
        const content = JSON.stringify(obs.output || '');
        if (content.includes('error') || content.includes('Error') ||
            content.includes('failed') || content.includes('Failed') ||
            content.includes('Unable')) {
            console.log(`   Found in ${obs.name}:`);
            console.log(`   ${content.substring(0, 500)}`);
        }
    });
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  LANGFUSE DEBUG - Appointment Booking Analysis           ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\nProject: Chord-test`);
    console.log(`Host: ${LANGFUSE_CONFIG.host}`);

    try {
        // Analyze the HAPPY-001 failure trace (slots API failure)
        await analyzeSpecificTrace('9c327356-f10e-4287-8300-bc92af11737d');

        // Get recent traces - get more to find the booking attempts
        const traces = await getRecentTraces(50);

        if (traces.length === 0) {
            console.log('\n❌ No traces found. Run a test in Flowise first!');
            return;
        }

        console.log(`\n📊 Found ${traces.length} recent traces:\n`);
        traces.forEach((trace, i) => {
            const timestamp = new Date(trace.timestamp).toLocaleString();
            console.log(`  ${i + 1}. [${timestamp}] ${trace.name || trace.id}`);
            if (trace.input) {
                const inputPreview = typeof trace.input === 'string'
                    ? trace.input.substring(0, 80)
                    : JSON.stringify(trace.input).substring(0, 80);
                console.log(`     Input: ${inputPreview}...`);
            }
        });

        // First, scan all traces to find booking failures
        await findBookingFailureTraces(traces);

        // Also analyze the most recent trace
        if (traces.length > 0) {
            const latestTrace = traces[0];
            console.log(`\n${'═'.repeat(60)}`);
            console.log(`\n🎯 Analyzing most recent trace: ${latestTrace.id}\n`);

            const observations = await getObservations(latestTrace.id);
            console.log(`   Found ${observations.length} observations in this trace`);

            if (observations.length > 0) {
                analyzeToolLogs(observations);
                searchForChordPatientLogs(observations);
                searchForAppointmentBooking(observations);
            }
        }

        console.log('\n' + '═'.repeat(60));
        console.log('✅ Analysis complete');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main();

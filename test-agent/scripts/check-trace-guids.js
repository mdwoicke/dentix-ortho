/**
 * Check Langfuse traces for GUIDs used in API calls
 */
const fetch = require('node-fetch');

// Sandbox B Langfuse credentials
const LANGFUSE_HOST = 'https://langfuse-6x3cj-u15194.vm.elestio.app';
const LANGFUSE_PUBLIC_KEY = 'pk-lf-0e7ba152-4077-4a00-9953-cf8cea058c7c';
const LANGFUSE_SECRET_KEY = 'sk-lf-d6e210bb-8104-4966-8113-76777322e68c';

const auth = Buffer.from(LANGFUSE_PUBLIC_KEY + ':' + LANGFUSE_SECRET_KEY).toString('base64');

async function getRecentTraces() {
    console.log('=== CHECKING LANGFUSE TRACES FOR GUIDs ===\n');

    const response = await fetch(`${LANGFUSE_HOST}/api/public/traces?limit=5&orderBy=timestamp&orderDir=desc`, {
        headers: { 'Authorization': 'Basic ' + auth }
    });
    const traces = await response.json();

    if (!traces.data || traces.data.length === 0) {
        console.log('No traces found');
        return;
    }

    console.log('Recent traces:');
    for (const trace of traces.data.slice(0, 3)) {
        console.log('\n--- Trace: ' + trace.id.substring(0, 12) + '... ---');
        console.log('Session: ' + (trace.sessionId || 'none'));
        console.log('Time: ' + trace.timestamp);

        // Get observations for this trace
        const obsResponse = await fetch(`${LANGFUSE_HOST}/api/public/observations?traceId=${trace.id}&limit=20`, {
            headers: { 'Authorization': 'Basic ' + auth }
        });
        const obs = await obsResponse.json();

        if (obs.data) {
            for (const o of obs.data) {
                if (o.name && (o.name.includes('schedule') || o.name.includes('slots'))) {
                    console.log('\n  Tool: ' + o.name);

                    if (o.input) {
                        const inputStr = typeof o.input === 'string' ? o.input : JSON.stringify(o.input);

                        // Extract GUIDs
                        const locMatch = inputStr.match(/locationGUID["']?\s*[:"]\s*["']?([a-f0-9-]{36})/i);
                        const svMatch = inputStr.match(/scheduleViewGUID[s]?["']?\s*[:"]\s*["']?([a-f0-9-]{36})/i);
                        const atMatch = inputStr.match(/appointmentTypeGUID["']?\s*[:"]\s*["']?([a-f0-9-]{36})/i);

                        if (locMatch) console.log('    locationGUID: ' + locMatch[1]);
                        if (svMatch) console.log('    scheduleViewGUID: ' + svMatch[1]);
                        if (atMatch) console.log('    appointmentTypeGUID: ' + atMatch[1]);
                    }

                    if (o.output) {
                        const outputStr = typeof o.output === 'string' ? o.output : JSON.stringify(o.output);
                        if (outputStr.includes('no_slots') || outputStr.includes('transfer')) {
                            console.log('    Result: NO SLOTS / TRANSFER');
                        } else if (outputStr.includes('slots')) {
                            const slotsMatch = outputStr.match(/"count"\s*:\s*(\d+)/);
                            if (slotsMatch) console.log('    Result: ' + slotsMatch[1] + ' slots');
                        }
                    }
                }
            }
        }
    }
}

getRecentTraces().catch(e => console.error('Error:', e.message));

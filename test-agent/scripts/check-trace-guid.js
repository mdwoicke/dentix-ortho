/**
 * Check Langfuse trace for scheduleViewGUID used in slots API call
 */
const fetch = require('node-fetch');

const LANGFUSE_HOST = 'https://langfuse-6x3cj-u15194.vm.elestio.app';
const LANGFUSE_PUBLIC_KEY = 'pk-lf-d8bcb227-cd86-424d-b8fc-e85f28e6c3b1';
const LANGFUSE_SECRET_KEY = 'sk-lf-d6e210bb-8104-4966-8113-76777322e68c';
const EXPECTED_SCHED_VIEW = '4c9e9333-4951-4eb0-8d97-e1ad83ef422d';

const auth = Buffer.from(LANGFUSE_PUBLIC_KEY + ':' + LANGFUSE_SECRET_KEY).toString('base64');

async function getRecentTraces() {
    const response = await fetch(`${LANGFUSE_HOST}/api/public/traces?limit=10&orderBy=timestamp&orderDir=desc`, {
        headers: { 'Authorization': 'Basic ' + auth }
    });
    return await response.json();
}

async function getObservations(traceId) {
    const response = await fetch(`${LANGFUSE_HOST}/api/public/observations?traceId=${traceId}&limit=50`, {
        headers: { 'Authorization': 'Basic ' + auth }
    });
    return await response.json();
}

async function analyzeRecentTrace() {
    console.log('=== LANGFUSE TRACE ANALYSIS ===');
    console.log('Looking for scheduleViewGUID in slots API calls...\n');

    const traces = await getRecentTraces();
    if (!traces.data || traces.data.length === 0) {
        console.log('No recent traces found');
        return;
    }

    // Find recent test session trace
    for (const trace of traces.data) {
        if (trace.sessionId && trace.sessionId.includes('full-test')) {
            console.log('Found test session:', trace.sessionId);
            console.log('Trace ID:', trace.id);
            console.log('');

            const obsResponse = await getObservations(trace.id);
            const observations = obsResponse.data || [];

            for (const obs of observations) {
                if (obs.name && (obs.name.includes('schedule_appointment') || obs.name.includes('slots'))) {
                    console.log('--- Tool Call:', obs.name, '---');
                    console.log('Type:', obs.type);

                    // Check input
                    if (obs.input) {
                        const inputStr = typeof obs.input === 'string' ? obs.input : JSON.stringify(obs.input);

                        // Look for scheduleViewGUIDs
                        const schedViewMatch = inputStr.match(/scheduleViewGUID[s]?["']?\s*[:=]\s*["']?([a-f0-9-]{36})/i);
                        if (schedViewMatch) {
                            console.log('scheduleViewGUID in REQUEST:', schedViewMatch[1]);
                            console.log('Expected:', EXPECTED_SCHED_VIEW);
                            console.log('MATCH:', schedViewMatch[1] === EXPECTED_SCHED_VIEW ? '*** YES - FIX WORKS! ***' : 'NO - WRONG GUID');
                        } else {
                            // Check if the body contains scheduleViewGUIDs
                            const bodyMatch = inputStr.match(/body[^}]*scheduleViewGUID/i);
                            if (bodyMatch) {
                                console.log('scheduleViewGUIDs field found in body');
                            } else {
                                console.log('No scheduleViewGUID found in input');
                            }
                        }
                    }

                    // Check output
                    if (obs.output) {
                        const outputStr = typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output);
                        if (outputStr.includes('no_slots') || outputStr.includes('transfer_to_agent')) {
                            console.log('Result: No slots available (transfer)');
                        }

                        const schedViewOutput = outputStr.match(/scheduleViewGUID["']?\s*[:=]\s*["']?([a-f0-9-]{36})/i);
                        if (schedViewOutput) {
                            console.log('scheduleViewGUID in RESPONSE:', schedViewOutput[1]);
                        }
                    }
                    console.log('');
                }
            }
            break;
        }
    }
}

analyzeRecentTrace().catch(e => console.error('Error:', e.message));

#!/usr/bin/env node
/**
 * TOTAL CALL TRACE - Comprehensive Langfuse session debugging tool
 *
 * Takes a Langfuse sessionId and produces an end-to-end analysis of:
 * - All tool calls (grouped_slots, patient create, book_child)
 * - Slot metadata verification against Cloud9 Production
 * - Failure pattern detection (FP-001 through FP-006)
 * - Root cause analysis with evidence
 * - Recommended solution
 *
 * Usage: node total-call-trace.js <sessionId>
 * Example: node total-call-trace.js 30dc66e1-eabd-46ca-b546-9a4237e64f19
 */

const https = require('https');
const fetch = require('node-fetch');
const { emitReport, buildTraceReport } = require('./lib/report-emitter');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Langfuse JL UAT Config (Ortho-Test-JL-UAT project)
const LANGFUSE_HOST = 'langfuse-6x3cj-u15194.vm.elestio.app';
const LANGFUSE_PUBLIC_KEY = 'pk-lf-509020b0-af91-473f-a1f9-46cc054251db';
const LANGFUSE_SECRET_KEY = 'sk-lf-af0d0e95-b53c-44a0-9647-00189b66aea3';

// Cloud9 Production Config
const CLOUD9_ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CLOUD9_CLIENT_ID = 'b42c51be-2529-4d31-92cb-50fd1a58c084';
const CLOUD9_USER = 'Intelepeer';
const CLOUD9_PASS = '$#1Nt-p33R-AwS#$';
const CLOUD9_NAMESPACE = 'http://schemas.practica.ws/cloud9/partners/';

// Key GUIDs
const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034';
const SCHEDULE_VIEW_GUID = '4c9e9333-4951-4eb0-8d97-e1ad83ef422d';
const EXAM_PPO_SELF_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';

// Reference: Successful sibling appointment trace for comparison
// See: backend/data/trace_sibling_success.json
const REFERENCE_SUCCESS_TRACE = {
    sessionId: 'd638e4a6-22c9-4685-83b6-e43b413f1e43',
    traceId: 'dd1a7852-e45f-4e89-b09e-2e633318f5d0',
    timestamp: '2026-01-19T22:11:11.816Z',
    description: 'Successful sibling booking - 2 children scheduled back-to-back',
    summary: {
        patientGUID: '2EA96985-D7C8-4DC3-9D8C-ABF1E702F966',
        guarantor: 'TestUserSibling-2308 TestSibling-2308',
        child1: {
            name: 'ChildTestSibling-3911',
            appointmentGUID: '9DF78952-F0A6-4C8E-B9B6-CAC2931B78B5',
            time: '3/18/2026 9:50:00 AM',
            type: 'Ortho New Patient Consult'
        },
        child2: {
            name: 'ChildTest2Sibling-7767',
            appointmentGUID: '375A8715-7364-42F0-ABBD-E61249F1497A',
            time: '3/18/2026 10:30:00 AM',
            type: 'Ortho New Patient Consult'
        },
        callDisposition: 'Intent Complete',
        location: 'CDH Ortho Allegheny'
    }
};

// Known Chair GUID mapping
const CHAIR_GUIDS = {
    '07687884-7e37-49aa-8028-d43b751c9034': 'Chair 8',
    '4c9e9333-4951-4eb0-8d97-e1ad83ef422d': 'Schedule View',
    'f6c20c35-9abb-47c2-981a-342996016705': 'Exam-PPO/Self'
};

// Failure pattern definitions
const FAILURE_PATTERNS = {
    'FP-001': { name: 'Missing bookingAuthToken', severity: 'CRITICAL' },
    'FP-002': { name: 'Slot freshness decay (>30s)', severity: 'HIGH' },
    'FP-003': { name: 'Double patient creation', severity: 'MEDIUM' },
    'FP-004': { name: 'Infrastructure 502 errors', severity: 'HIGH' },
    'FP-005': { name: 'Parallel booking race condition', severity: 'HIGH' },
    'FP-006': { name: 'v59 rate limiting', severity: 'CRITICAL' }
};

// ============================================================================
// LANGFUSE API HELPERS
// ============================================================================

function langfuseAPI(path) {
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64');
        const options = {
            hostname: LANGFUSE_HOST,
            port: 443,
            path: path,
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ raw: data, error: e.message });
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function getSessionTraces(sessionId) {
    const result = await langfuseAPI(`/api/public/traces?sessionId=${sessionId}&limit=100`);
    return result.data || [];
}

async function getTraceObservations(traceId) {
    const result = await langfuseAPI(`/api/public/observations?traceId=${traceId}&limit=100`);
    return result.data || [];
}

// ============================================================================
// CLOUD9 API HELPERS
// ============================================================================

function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&apos;')
        .replace(/"/g, '&quot;');
}

function buildXmlRequest(procedure, params) {
    const paramElements = Object.entries(params)
        .filter(([k, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
        .join('');
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9_NAMESPACE}"><ClientID>${CLOUD9_CLIENT_ID}</ClientID><UserName>${CLOUD9_USER}</UserName><Password>${escapeXml(CLOUD9_PASS)}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
}

function parseXmlResponse(xmlText) {
    const records = [];
    const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
    let match;
    while ((match = recordRegex.exec(xmlText)) !== null) {
        const record = {};
        const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(match[1])) !== null) {
            record[fieldMatch[1]] = fieldMatch[2];
        }
        records.push(record);
    }
    return records;
}

async function cloud9API(procedure, params) {
    const xml = buildXmlRequest(procedure, params);
    try {
        const response = await fetch(CLOUD9_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });
        const xmlText = await response.text();

        // Check for error
        if (xmlText.includes('ErrorCode')) {
            const errorMatch = xmlText.match(/<ErrorCode>(\d+)<\/ErrorCode>/);
            const msgMatch = xmlText.match(/<ErrorMessage>([^<]*)<\/ErrorMessage>/);
            return { error: true, code: errorMatch?.[1], message: msgMatch?.[1] };
        }

        return { records: parseXmlResponse(xmlText) };
    } catch (e) {
        return { error: true, message: e.message };
    }
}

async function getAppointmentsByDate(date, scheduleViewGUID) {
    return cloud9API('GetAppointmentsByDate', {
        dtAppointment: date,
        schdvwGUID: scheduleViewGUID || SCHEDULE_VIEW_GUID
    });
}

// ============================================================================
// TOOL CALL EXTRACTION
// ============================================================================

function parseToolInput(input) {
    if (typeof input === 'string') {
        try { return JSON.parse(input); } catch (e) { return { raw: input }; }
    }
    return input || {};
}

function parseToolOutput(output) {
    if (typeof output === 'string') {
        try { return JSON.parse(output); } catch (e) { return { raw: output }; }
    }
    return output || {};
}

function extractToolCalls(observations) {
    const toolCalls = {
        slotCalls: [],
        patientCreates: [],
        bookChildCalls: [],
        otherCalls: [],
        errors: []
    };

    for (const obs of observations) {
        const name = obs.name || '';
        const input = parseToolInput(obs.input);
        const output = parseToolOutput(obs.output);
        const startTime = obs.startTime;
        const endTime = obs.endTime;
        const level = obs.level;

        const inputStr = JSON.stringify(input);
        const outputStr = JSON.stringify(output);

        // ==========================================
        // EXACT NAME MATCHING (primary method)
        // ==========================================

        // schedule_appointment_ortho - booking tool
        if (name === 'schedule_appointment_ortho') {
            const action = input.action;

            if (action === 'book_child' || inputStr.includes('book_child')) {
                const success = output.success === true || !!output.appointmentGUID;
                const appointmentGUID = output.appointmentGUID;
                const error = output.message || output._debug_error || output.llm_guidance?.error_type;

                toolCalls.bookChildCalls.push({
                    time: startTime,
                    endTime,
                    name,
                    success,
                    appointmentGUID,
                    error,
                    startTimeParam: input.startTime,
                    childName: input.childName,
                    patientGUID: input.patientGUID,
                    hasToken: !!input.bookingAuthToken,
                    scheduleColumnGUID: input.scheduleColumnGUID,
                    scheduleViewGUID: input.scheduleViewGUID,
                    appointmentTypeGUID: input.appointmentTypeGUID,
                    minutes: input.minutes,
                    input,
                    output
                });

                // Also track as error if failed
                if (!success) {
                    toolCalls.errors.push({
                        time: startTime,
                        name,
                        error: error || 'Booking failed',
                        input,
                        output
                    });
                }
            } else if (action === 'grouped_slots' || action === 'slots' || outputStr.includes('"groups"') || outputStr.includes('"slots"')) {
                // Slot retrieval
                const groups = output.groups || [];
                const slots = output.slots || [];
                const slotsCount = groups.length || slots.length;

                toolCalls.slotCalls.push({
                    time: startTime,
                    endTime,
                    name,
                    action: action || 'grouped_slots',
                    slotsCount,
                    groups: groups.slice(0, 5),
                    slots: slots.slice(0, 10),
                    input,
                    output
                });
            }
            continue;
        }

        // chord_ortho_patient - patient tool
        if (name === 'chord_ortho_patient') {
            const action = input.action;

            if (action === 'create' || outputStr.includes('patientGUID')) {
                const patientGUID = output.patientGUID;
                const hasToken = !!output.bookingAuthToken;

                if (patientGUID) {
                    toolCalls.patientCreates.push({
                        time: startTime,
                        endTime,
                        name,
                        patientGUID,
                        hasToken,
                        bookingAuthToken: output.bookingAuthToken,
                        children: input.children || [],
                        input,
                        output
                    });
                }
            }
            continue;
        }

        // current_date_time - datetime tool
        if (name === 'current_date_time') {
            toolCalls.otherCalls.push({
                time: startTime,
                name,
                type: 'datetime',
                input,
                output
            });
            continue;
        }

        // chord_handleEscalation - escalation
        if (name === 'chord_handleEscalation') {
            toolCalls.otherCalls.push({
                time: startTime,
                name,
                type: 'escalation',
                reason: input.escalationIntent,
                input,
                output
            });
            continue;
        }

        // ==========================================
        // FALLBACK: Only for ERROR level observations
        // Skip content-based detection for non-tool observations
        // (ChatPromptTemplate, RunnableAgent, etc. contain tool call text but aren't actual tool calls)
        // ==========================================

        // Only track explicit ERROR level observations (not false positives from LLM context)
        if (level === 'ERROR') {
            toolCalls.errors.push({
                time: startTime,
                name,
                error: output.error || output._debug_error || output.message || 'Unknown error',
                input,
                output
            });
        }
    }

    // Sort all arrays by time
    toolCalls.slotCalls.sort((a, b) => new Date(a.time) - new Date(b.time));
    toolCalls.patientCreates.sort((a, b) => new Date(a.time) - new Date(b.time));
    toolCalls.bookChildCalls.sort((a, b) => new Date(a.time) - new Date(b.time));
    toolCalls.errors.sort((a, b) => new Date(a.time) - new Date(b.time));

    return toolCalls;
}

// ============================================================================
// FAILURE PATTERN DETECTION
// ============================================================================

function detectFailurePatterns(data) {
    const patterns = [];

    // FP-001: Missing bookingAuthToken
    const bookingsWithoutToken = data.bookChildCalls.filter(b => !b.hasToken && !b.success);
    if (bookingsWithoutToken.length > 0) {
        patterns.push({
            id: 'FP-001',
            ...FAILURE_PATTERNS['FP-001'],
            confidence: 'HIGH',
            evidence: `${bookingsWithoutToken.length} booking(s) attempted without token and failed`
        });
    }

    // FP-002: Slot freshness decay (>30s between slot fetch and booking)
    if (data.slotCalls.length > 0 && data.bookChildCalls.length > 0) {
        const lastSlotTime = new Date(data.slotCalls[data.slotCalls.length - 1].time).getTime();
        const firstBookTime = new Date(data.bookChildCalls[0].time).getTime();
        const gapSeconds = (firstBookTime - lastSlotTime) / 1000;

        if (gapSeconds > 30) {
            patterns.push({
                id: 'FP-002',
                ...FAILURE_PATTERNS['FP-002'],
                confidence: gapSeconds > 120 ? 'HIGH' : 'MEDIUM',
                evidence: `${Math.round(gapSeconds)}s gap between slot fetch and booking attempt`
            });
        }
    }

    // FP-003: Double patient creation
    if (data.patientCreates.length > 1) {
        patterns.push({
            id: 'FP-003',
            ...FAILURE_PATTERNS['FP-003'],
            confidence: 'HIGH',
            evidence: `${data.patientCreates.length} patients created in same session`
        });
    }

    // FP-004: Infrastructure 502 errors
    const infra502 = data.errors.filter(e =>
        String(e.error).includes('502') || String(e.error).includes('Bad Gateway')
    );
    if (infra502.length > 0) {
        patterns.push({
            id: 'FP-004',
            ...FAILURE_PATTERNS['FP-004'],
            confidence: 'HIGH',
            evidence: `${infra502.length} infrastructure 502 error(s) detected`
        });
    }

    // FP-005: Parallel booking race condition
    if (data.bookChildCalls.length >= 2) {
        const bookTimes = data.bookChildCalls.map(b => new Date(b.time).getTime());
        const minTimeDiff = Math.min(...bookTimes.slice(1).map((t, i) => Math.abs(t - bookTimes[i])));

        if (minTimeDiff < 500) { // Less than 500ms apart
            patterns.push({
                id: 'FP-005',
                ...FAILURE_PATTERNS['FP-005'],
                confidence: 'HIGH',
                evidence: `Multiple book_child calls within ${minTimeDiff}ms of each other`
            });
        }
    }

    // FP-006: v59 rate limiting (slots available initially but booking failed)
    // This is detected when:
    // 1. Initial slot call returned valid slots
    // 2. Booking failed with "slot_not_available" type error
    // 3. Slots were available (verified by subsequent booking or Cloud9 check)
    const failedWithSlotError = data.bookChildCalls.filter(b =>
        !b.success && (
            String(b.error).toLowerCase().includes('slot') ||
            String(b.error).toLowerCase().includes('available') ||
            String(b.error).toLowerCase().includes('not found')
        )
    );

    const hadValidSlots = data.slotCalls.some(s => s.slotsCount > 0);

    if (failedWithSlotError.length > 0 && hadValidSlots) {
        patterns.push({
            id: 'FP-006',
            ...FAILURE_PATTERNS['FP-006'],
            confidence: 'MEDIUM', // Will be upgraded to HIGH if Cloud9 confirms slots were available
            evidence: `Initial slots returned ${data.slotCalls[0]?.slotsCount || 0} slots, but ${failedWithSlotError.length} booking(s) failed with slot-related error`,
            needsCloud9Verification: true
        });
    }

    return patterns;
}

// ============================================================================
// CLOUD9 SLOT INVESTIGATION
// ============================================================================

async function investigateSlots(bookChildCalls) {
    const investigations = [];

    for (const booking of bookChildCalls) {
        if (!booking.startTimeParam) continue;

        // Parse the startTime to get date
        // Format: "3/18/2026 8:30:00 AM" or similar
        const dateMatch = booking.startTimeParam.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
        const timeMatch = booking.startTimeParam.match(/(\d{1,2}:\d{2})/);

        if (!dateMatch) continue;

        const date = dateMatch[1];
        const time = timeMatch ? timeMatch[1] : '';

        console.log(`  → Checking Cloud9 for ${date} ${time}...`);

        const result = await getAppointmentsByDate(date, SCHEDULE_VIEW_GUID);

        if (result.error) {
            investigations.push({
                requestedSlot: booking.startTimeParam,
                date,
                time,
                error: result.message,
                booking
            });
            continue;
        }

        // Find appointment matching the requested time
        const matchingAppt = result.records.find(appt => {
            const apptTime = appt.AppointmentDateTime || '';
            return apptTime.includes(time);
        });

        investigations.push({
            requestedSlot: booking.startTimeParam,
            date,
            time,
            currentStatus: matchingAppt ? 'BOOKED' : 'AVAILABLE',
            bookedBy: matchingAppt ? (matchingAppt.PatientFullName || matchingAppt.persLastFirst) : null,
            bookedPatientId: matchingAppt?.PatientID,
            appointmentGUID: matchingAppt?.AppointmentGUID,
            chair: matchingAppt?.Chair,
            apptType: matchingAppt?.AppointmentTypeDescription,
            requestedChair: booking.scheduleColumnGUID ? CHAIR_GUIDS[booking.scheduleColumnGUID] || booking.scheduleColumnGUID : 'Unknown',
            booking,
            matchingAppt
        });
    }

    return investigations;
}

// ============================================================================
// SOLUTION GENERATOR
// ============================================================================

function generateSolution(patterns, investigations) {
    // Prioritize patterns by severity
    const criticalPatterns = patterns.filter(p => p.severity === 'CRITICAL');
    const highPatterns = patterns.filter(p => p.severity === 'HIGH');

    let rootCause = 'Unknown';
    let solution = 'Further investigation needed.';
    let verification = '';

    // FP-006 v59 rate limiting
    if (patterns.some(p => p.id === 'FP-006')) {
        // Check if Cloud9 confirms slots were available (now booked by someone else)
        const bookedByOther = investigations.filter(i =>
            i.currentStatus === 'BOOKED' &&
            !i.bookedBy?.includes('Pipeline') // Not our test booking
        );

        rootCause = 'v59 Bulletproof Slot Validation triggered Cloud9 API rate limiting';
        solution = `The v59 code called getApptSlots AGAIN before each book_child to verify the
slot was still available. When multiple book_child calls came in parallel, this
triggered rapid API calls that Cloud9's rate limiter rejected with 0 slots.

RECOMMENDED FIX:
  • v60 has been deployed which DISABLES v59 slot verification
  • Node-RED handles validation server-side as fallback
  • Re-run test with v60 code - should succeed`;
        verification = 'cd test-agent && node scripts/test-sibling-booking.js';
    }

    // FP-001 Missing token
    else if (patterns.some(p => p.id === 'FP-001')) {
        rootCause = 'Missing bookingAuthToken in book_child requests';
        solution = `The bookingAuthToken was not passed to book_child calls.

RECOMMENDED FIX:
  • Ensure patient creation returns bookingAuthToken
  • Pass token to all subsequent book_child calls
  • Check if LLM is correctly extracting token from create_patient response`;
        verification = 'Check createPatient tool output and LLM extraction logic';
    }

    // FP-002 Slot decay
    else if (patterns.some(p => p.id === 'FP-002')) {
        const decay = patterns.find(p => p.id === 'FP-002');
        rootCause = `Slot freshness decay: ${decay.evidence}`;
        solution = `The slot data became stale before booking was attempted.

RECOMMENDED FIX:
  • Reduce time between slot fetch and booking
  • Consider refreshing slots if >30s have passed
  • Optimize LLM processing time`;
        verification = 'Monitor trace timing in Langfuse';
    }

    // FP-005 Race condition
    else if (patterns.some(p => p.id === 'FP-005')) {
        rootCause = 'Parallel booking race condition';
        solution = `Multiple book_child calls were made simultaneously, causing conflicts.

RECOMMENDED FIX:
  • Serialize book_child calls (one at a time)
  • Add queue mechanism for multi-child bookings
  • Use session-level booking lock`;
        verification = 'cd test-agent && node scripts/test-booking-isolation.js';
    }

    // Build actionable steps based on detected patterns
    const actionableSteps = [];
    let stepNum = 1;

    if (patterns.some(p => p.id === 'FP-001')) {
        actionableSteps.push(
            { step: stepNum++, action: 'Check patient create output', detail: 'Verify chord_ortho_patient create action returns bookingAuthToken in its response', command: null },
            { step: stepNum++, action: 'Verify system prompt token instructions', detail: 'Ensure system prompt instructs LLM to extract and pass bookingAuthToken to book_child', command: 'cat docs/v1/Chord_Cloud9_SystemPrompt.md | grep -i bookingAuth' },
            { step: stepNum++, action: 'Re-run trace to confirm fix', detail: 'Run total-call-trace against the same session after applying changes', command: `cd test-agent && node scripts/total-call-trace.js ${patterns[0]?._sessionId || '<sessionId>'}` }
        );
    }
    if (patterns.some(p => p.id === 'FP-002')) {
        actionableSteps.push(
            { step: stepNum++, action: 'Measure slot-to-booking gap', detail: 'Check Langfuse trace timing between grouped_slots response and first book_child call' },
            { step: stepNum++, action: 'Add slot refresh logic', detail: 'If gap >30s, re-fetch slots before booking to ensure freshness' }
        );
    }
    if (patterns.some(p => p.id === 'FP-005')) {
        actionableSteps.push(
            { step: stepNum++, action: 'Serialize booking calls', detail: 'Ensure book_child calls execute sequentially, not in parallel' },
            { step: stepNum++, action: 'Test with booking isolation', detail: 'Run isolation test to verify sequential execution', command: 'cd test-agent && node scripts/test-booking-isolation.js' }
        );
    }
    if (patterns.some(p => p.id === 'FP-006')) {
        actionableSteps.push(
            { step: stepNum++, action: 'Verify v60+ is deployed', detail: 'v59 bulletproof validation caused rate limiting — confirm v60 (no pre-booking slot re-check) is active', command: 'cd test-agent && node scripts/check-flowise-tool-version.js' },
            { step: stepNum++, action: 'Re-run sibling booking test', detail: 'Validate the fix resolves the rate limiting issue', command: 'cd test-agent && node scripts/test-sibling-booking.js' }
        );
    }
    if (patterns.some(p => p.id === 'FP-004')) {
        actionableSteps.push(
            { step: stepNum++, action: 'Check Node-RED health', detail: 'Verify Node-RED and upstream services are responding without 502 errors', command: 'curl -s http://localhost:1880/flows | head -c 100' }
        );
    }
    if (actionableSteps.length === 0) {
        actionableSteps.push(
            { step: 1, action: 'Review trace in Langfuse', detail: 'No known failure patterns detected — manually inspect the full trace for anomalies', command: `open https://${LANGFUSE_HOST}/project/*/sessions/${patterns.length > 0 ? 'check' : 'review'}` }
        );
    }

    return { rootCause, solution, verification, actionableSteps };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function formatTime(isoTime) {
    if (!isoTime) return 'N/A';
    const d = new Date(isoTime);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(startIso, endIso) {
    if (!startIso || !endIso) return 'N/A';
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    const ms = end - start;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
}

function printReport(sessionId, traces, toolCalls, patterns, investigations, solution) {
    const W = 80;
    const line = '='.repeat(W);
    const halfLine = '-'.repeat(W);

    // Calculate session duration
    let sessionStart = null;
    let sessionEnd = null;
    for (const trace of traces) {
        const t = new Date(trace.timestamp);
        if (!sessionStart || t < sessionStart) sessionStart = t;
        if (!sessionEnd || t > sessionEnd) sessionEnd = t;
    }
    const duration = sessionStart && sessionEnd ? formatDuration(sessionStart.toISOString(), sessionEnd.toISOString()) : 'N/A';

    // Header
    console.log('');
    console.log(line);
    console.log('                         TOTAL CALL TRACE REPORT');
    console.log(line);
    console.log(`Session ID: ${sessionId}`);
    console.log(`Timestamp:  ${sessionStart?.toLocaleString() || 'N/A'} - ${sessionEnd?.toLocaleTimeString() || 'N/A'} (${duration})`);
    console.log(`Traces:     ${traces.length}`);
    console.log(`Tool Calls: ${toolCalls.slotCalls.length + toolCalls.patientCreates.length + toolCalls.bookChildCalls.length}`);
    console.log('');

    // Timeline
    console.log(line);
    console.log('                              TIMELINE');
    console.log(line);

    // Combine all calls and sort by time
    const allCalls = [
        ...toolCalls.slotCalls.map(c => ({ ...c, type: 'slots' })),
        ...toolCalls.patientCreates.map(c => ({ ...c, type: 'patient_create' })),
        ...toolCalls.bookChildCalls.map(c => ({ ...c, type: 'book_child' }))
    ].sort((a, b) => new Date(a.time) - new Date(b.time));

    for (const call of allCalls) {
        const time = formatTime(call.time);

        if (call.type === 'slots') {
            console.log(`[${time}] grouped_slots      → ${call.slotsCount} slot groups returned`);
        } else if (call.type === 'patient_create') {
            console.log(`[${time}] chord_ortho_patient action=create → SUCCESS`);
            console.log(`           patientGUID: ${call.patientGUID}`);
            console.log(`           bookingAuthToken: ${call.hasToken ? '✓ Present' : '✗ MISSING'}`);
        } else if (call.type === 'book_child') {
            const slotTime = call.startTimeParam ? call.startTimeParam.match(/(\d{1,2}:\d{2}[^,]*)/)?.[1] || call.startTimeParam : 'Unknown';
            const chair = call.scheduleColumnGUID ? CHAIR_GUIDS[call.scheduleColumnGUID] || 'Unknown Chair' : 'Chair ?';
            const status = call.success ? '→ SUCCESS' : '→ FAILED';
            console.log(`[${time}] book_child (${slotTime}, ${chair}) ${status}`);
            if (call.appointmentGUID) {
                console.log(`           appointmentGUID: ${call.appointmentGUID}`);
            }
            if (call.error) {
                console.log(`           Error: ${call.error}`);
            }
        }
    }
    console.log('');

    // Slot Investigation
    if (investigations.length > 0) {
        console.log(line);
        console.log('                         SLOT INVESTIGATION');
        console.log(line);
        console.log(`Checking Cloud9 Production for requested slots...`);
        console.log('');

        for (const inv of investigations) {
            console.log(`SLOT: ${inv.time} on ${inv.date}`);
            console.log(`├── Requested by session: ${inv.requestedChair}, ${inv.booking?.input?.appointmentTypeGUID ? 'Exam-PPO/Self' : 'Unknown Type'}`);

            if (inv.error) {
                console.log(`├── ERROR: ${inv.error}`);
            } else if (inv.currentStatus === 'BOOKED') {
                console.log(`├── Current Status: BOOKED`);
                console.log(`├── Booked By: ${inv.bookedBy} (PatientID: ${inv.bookedPatientId})`);
                console.log(`├── AppointmentGUID: ${inv.appointmentGUID}`);
                console.log(`├── Chair: ${inv.chair || 'N/A'} ${inv.chair === inv.requestedChair ? '✓' : ''}`);
                console.log(`├── AppointmentType: ${inv.apptType || 'N/A'}`);

                // Determine if booked by this session or another
                const isOurBooking = inv.bookedBy?.includes('Pipeline') || inv.bookedBy?.includes('Test');
                console.log(`└── CONCLUSION: Slot was ${isOurBooking ? 'booked by THIS session (success)' : 'booked by DIFFERENT session after this one failed'}`);
            } else {
                console.log(`├── Current Status: AVAILABLE`);
                console.log(`└── CONCLUSION: Slot is currently available - booking may have used wrong parameters`);
            }
            console.log('');
        }
    }

    // Root Cause Analysis
    console.log(line);
    console.log('                       ROOT CAUSE ANALYSIS');
    console.log(line);

    if (patterns.length === 0) {
        console.log('No failure patterns detected.');
    } else {
        for (const pattern of patterns) {
            console.log(`DETECTED PATTERN: ${pattern.id} - ${pattern.name}`);
            console.log('');
            console.log('Evidence:');
            console.log(`  • ${pattern.evidence}`);
            console.log('');
            console.log(`Confidence: ${pattern.confidence} (${pattern.severity})`);
            console.log('');
        }
    }

    // Solution
    console.log(line);
    console.log('                           SOLUTION');
    console.log(line);
    console.log(`ROOT CAUSE: ${solution.rootCause}`);
    console.log('');
    console.log(solution.solution);
    console.log('');
    if (solution.verification) {
        console.log('VERIFICATION:');
        console.log(`  ${solution.verification}`);
    }
    console.log(line);
}

// ============================================================================
// DIAGNOSTICS BUILDER
// ============================================================================

function truncateJson(obj, maxBytes = 2048) {
    const str = JSON.stringify(obj);
    if (str.length <= maxBytes) return obj;
    try {
        return JSON.parse(str.slice(0, maxBytes - 1) + '}');
    } catch {
        return { _truncated: true, _preview: str.slice(0, maxBytes) };
    }
}

function buildDiagnostics(toolCalls, patterns, allObservations) {
    const diagnostics = {};

    // --- toolCalls: filter to calls relevant to detected failures ---
    const relevantCalls = [];

    // Failed bookings are always relevant
    for (const b of toolCalls.bookChildCalls) {
        if (!b.success) {
            relevantCalls.push({
                name: b.name || 'book_child',
                timestamp: b.time,
                status: 'error',
                input: truncateJson(b.input),
                output: truncateJson(b.output),
                issue: b.error || 'Booking failed'
            });
        }
    }

    // Patient creates missing token
    for (const p of toolCalls.patientCreates) {
        if (!p.hasToken) {
            relevantCalls.push({
                name: p.name || 'create_patient',
                timestamp: p.time,
                status: 'error',
                input: truncateJson(p.input),
                output: truncateJson(p.output),
                issue: 'bookingAuthToken missing from response'
            });
        }
    }

    // Successful calls that provide context (patient creates, slot calls)
    for (const p of toolCalls.patientCreates) {
        if (p.hasToken) {
            relevantCalls.push({
                name: p.name || 'create_patient',
                timestamp: p.time,
                status: 'ok',
                input: truncateJson(p.input),
                output: truncateJson(p.output)
            });
        }
    }

    // ERROR-level observations
    for (const e of toolCalls.errors) {
        // Avoid duplicates with failed bookings
        const isDup = relevantCalls.some(r => r.timestamp === e.time && r.name === e.name);
        if (!isDup) {
            relevantCalls.push({
                name: e.name || 'unknown',
                timestamp: e.time,
                status: 'error',
                input: truncateJson(e.input),
                output: truncateJson(e.output),
                issue: e.error || 'Error'
            });
        }
    }

    relevantCalls.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (relevantCalls.length > 0) {
        diagnostics.toolCalls = relevantCalls;
    }

    // --- dataIssues: extract specific field problems from patterns ---
    const dataIssues = [];

    for (const pattern of patterns) {
        if (pattern.id === 'FP-001') {
            // Find the specific book_child calls missing the token
            const missing = toolCalls.bookChildCalls.filter(b => !b.hasToken && !b.success);
            for (const b of missing) {
                dataIssues.push({
                    field: 'bookingAuthToken',
                    expected: 'non-empty string',
                    actual: String(b.input?.bookingAuthToken ?? 'undefined'),
                    source: `book_child for ${b.childName || 'unknown child'} at ${formatTime(b.time)}`
                });
            }
        }
        if (pattern.id === 'FP-002') {
            const lastSlot = toolCalls.slotCalls[toolCalls.slotCalls.length - 1];
            const firstBook = toolCalls.bookChildCalls[0];
            if (lastSlot && firstBook) {
                const gap = Math.round((new Date(firstBook.time) - new Date(lastSlot.time)) / 1000);
                dataIssues.push({
                    field: 'slot_freshness',
                    expected: '< 30s between fetch and booking',
                    actual: `${gap}s gap`,
                    source: `grouped_slots at ${formatTime(lastSlot.time)} → book_child at ${formatTime(firstBook.time)}`
                });
            }
        }
        if (pattern.id === 'FP-003') {
            dataIssues.push({
                field: 'patient_create_count',
                expected: '1',
                actual: String(toolCalls.patientCreates.length),
                source: toolCalls.patientCreates.map(p => `create at ${formatTime(p.time)}: ${p.patientGUID}`).join('; ')
            });
        }
        if (pattern.id === 'FP-005') {
            const bookTimes = toolCalls.bookChildCalls.map(b => new Date(b.time).getTime());
            const minGap = Math.min(...bookTimes.slice(1).map((t, i) => Math.abs(t - bookTimes[i])));
            dataIssues.push({
                field: 'booking_concurrency',
                expected: 'sequential (>500ms apart)',
                actual: `${minGap}ms between calls`,
                source: `${toolCalls.bookChildCalls.length} book_child calls`
            });
        }
    }

    if (dataIssues.length > 0) {
        diagnostics.dataIssues = dataIssues;
    }

    // --- conversationExcerpts: pull LLM generation snippets showing reasoning gaps ---
    const excerpts = [];
    for (const obs of allObservations) {
        if (obs.type !== 'GENERATION') continue;
        const outputText = typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output || '');
        if (outputText.length < 10) continue;

        // Look for generations that mention booking/token/error keywords
        const lower = outputText.toLowerCase();
        let issue = null;
        if (lower.includes('bookingauthtoken') && (lower.includes('missing') || lower.includes('undefined') || lower.includes('null'))) {
            issue = 'LLM acknowledges missing bookingAuthToken';
        } else if (lower.includes('book_child') && (lower.includes('fail') || lower.includes('error'))) {
            issue = 'LLM discusses booking failure';
        } else if (lower.includes('slot') && lower.includes('not available')) {
            issue = 'LLM notes slot unavailability';
        }

        if (issue) {
            // Truncate content to a useful snippet
            const content = outputText.length > 500 ? outputText.slice(0, 500) + '...' : outputText;
            excerpts.push({
                role: 'assistant',
                content,
                issue
            });
            if (excerpts.length >= 2) break; // Max 2 excerpts
        }
    }

    if (excerpts.length > 0) {
        diagnostics.conversationExcerpts = excerpts;
    }

    return Object.keys(diagnostics).length > 0 ? diagnostics : undefined;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    const args = process.argv.slice(2);

    // Handle --show-reference flag
    if (args.includes('--show-reference') || args.includes('-r')) {
        console.log('');
        console.log('================================================================================');
        console.log('           REFERENCE: SUCCESSFUL SIBLING BOOKING TRACE');
        console.log('================================================================================');
        console.log('');
        console.log('Session ID:', REFERENCE_SUCCESS_TRACE.sessionId);
        console.log('Trace ID:', REFERENCE_SUCCESS_TRACE.traceId);
        console.log('Timestamp:', REFERENCE_SUCCESS_TRACE.timestamp);
        console.log('Description:', REFERENCE_SUCCESS_TRACE.description);
        console.log('');
        console.log('SUMMARY:');
        console.log('  Patient GUID:', REFERENCE_SUCCESS_TRACE.summary.patientGUID);
        console.log('  Guarantor:', REFERENCE_SUCCESS_TRACE.summary.guarantor);
        console.log('  Location:', REFERENCE_SUCCESS_TRACE.summary.location);
        console.log('');
        console.log('  Child 1:', REFERENCE_SUCCESS_TRACE.summary.child1.name);
        console.log('    Appointment:', REFERENCE_SUCCESS_TRACE.summary.child1.time);
        console.log('    Type:', REFERENCE_SUCCESS_TRACE.summary.child1.type);
        console.log('    GUID:', REFERENCE_SUCCESS_TRACE.summary.child1.appointmentGUID);
        console.log('');
        console.log('  Child 2:', REFERENCE_SUCCESS_TRACE.summary.child2.name);
        console.log('    Appointment:', REFERENCE_SUCCESS_TRACE.summary.child2.time);
        console.log('    Type:', REFERENCE_SUCCESS_TRACE.summary.child2.type);
        console.log('    GUID:', REFERENCE_SUCCESS_TRACE.summary.child2.appointmentGUID);
        console.log('');
        console.log('  Call Disposition:', REFERENCE_SUCCESS_TRACE.summary.callDisposition);
        console.log('');
        console.log('Full trace data: backend/data/trace_sibling_success.json');
        console.log('================================================================================');
        process.exit(0);
    }

    const sessionId = args[0];

    if (!sessionId) {
        console.error('Usage: node total-call-trace.js <sessionId>');
        console.error('       node total-call-trace.js --show-reference');
        console.error('');
        console.error('Options:');
        console.error('  --show-reference, -r   Show reference successful sibling trace for comparison');
        console.error('');
        console.error('Example:');
        console.error('  node total-call-trace.js 30dc66e1-eabd-46ca-b546-9a4237e64f19');
        process.exit(1);
    }

    const W = 80;
    const thinLine = '-'.repeat(W);
    const step = (n, msg) => console.log(`\n  [Step ${n}] ${msg}`);
    const note = (msg) => console.log(`           ${msg}`);
    const finding = (msg) => console.log(`     ✓ ${msg}`);
    const warn = (msg) => console.log(`     ⚠ ${msg}`);
    const fail = (msg) => console.log(`     ✗ ${msg}`);

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║              TOTAL CALL TRACE — Agent Investigation             ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log(`  Session: ${sessionId}`);
    console.log(`  Started: ${new Date().toLocaleString()}`);
    console.log(thinLine);

    // ── PHASE 1: Retrieve session data from Langfuse ──
    console.log('\n▸ PHASE 1: Retrieving session data from Langfuse');
    step(1, 'Querying Langfuse API for all traces in this session...');
    const traces = await getSessionTraces(sessionId);

    if (traces.length === 0) {
        fail('No traces found for this session ID.');
        note('Verify the session exists in the Langfuse Ortho-Test-JL-UAT project.');
        process.exit(1);
    }

    finding(`Found ${traces.length} trace(s) for this session`);
    for (const trace of traces) {
        note(`Trace ${trace.id.slice(0, 8)}... — ${new Date(trace.timestamp).toLocaleString()}`);
    }

    // ── PHASE 2: Walk through every observation ──
    console.log(`\n${thinLine}`);
    console.log('▸ PHASE 2: Examining all observations (step-by-step)');
    step(2, 'Pulling observations from each trace...');

    const allObservations = [];
    for (const trace of traces) {
        const obs = await getTraceObservations(trace.id);
        finding(`Trace ${trace.id.slice(0, 8)}: ${obs.length} observation(s)`);
        allObservations.push(...obs);
    }

    // Sort chronologically for walkthrough
    allObservations.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    step(3, `Walking through ${allObservations.length} observations chronologically...`);
    console.log('');

    let obsIndex = 0;
    for (const obs of allObservations) {
        obsIndex++;
        const time = formatTime(obs.startTime);
        const name = obs.name || obs.type || 'unknown';
        const level = obs.level || '';
        const input = parseToolInput(obs.input);
        const output = parseToolOutput(obs.output);

        // Identify what this observation is
        if (name === 'schedule_appointment_ortho') {
            const action = input.action || 'unknown';
            if (action === 'book_child' || JSON.stringify(input).includes('book_child')) {
                const success = output.success === true || !!output.appointmentGUID;
                const child = input.childName || 'unknown';
                if (success) {
                    finding(`[${time}] Obs ${obsIndex}/${allObservations.length}: TOOL schedule_appointment_ortho → book_child`);
                    note(`Child: ${child} — Appointment GUID: ${output.appointmentGUID}`);
                    note('Booking succeeded.');
                } else {
                    fail(`[${time}] Obs ${obsIndex}/${allObservations.length}: TOOL schedule_appointment_ortho → book_child`);
                    note(`Child: ${child} — FAILED`);
                    note(`Error: ${output.message || output._debug_error || output.llm_guidance?.error_type || 'Unknown failure'}`);
                    if (!input.bookingAuthToken) {
                        warn('bookingAuthToken is MISSING from the request — likely cause of failure');
                    }
                }
            } else if (action === 'grouped_slots' || action === 'slots' || JSON.stringify(output).includes('"groups"')) {
                const groups = output.groups || [];
                const slots = output.slots || [];
                const count = groups.length || slots.length;
                finding(`[${time}] Obs ${obsIndex}/${allObservations.length}: TOOL schedule_appointment_ortho → ${action}`);
                note(`Returned ${count} slot group(s)`);
                if (groups.length > 0) {
                    const firstSlot = groups[0];
                    note(`First group: ${firstSlot.date || firstSlot.label || JSON.stringify(firstSlot).slice(0, 80)}`);
                }
            } else {
                finding(`[${time}] Obs ${obsIndex}/${allObservations.length}: TOOL schedule_appointment_ortho → ${action}`);
            }
        } else if (name === 'chord_ortho_patient') {
            const action = input.action || 'unknown';
            if (action === 'create' || JSON.stringify(output).includes('patientGUID')) {
                const guid = output.patientGUID;
                const hasToken = !!output.bookingAuthToken;
                finding(`[${time}] Obs ${obsIndex}/${allObservations.length}: TOOL chord_ortho_patient → create`);
                if (guid) {
                    note(`Patient GUID: ${guid}`);
                    if (hasToken) {
                        note('bookingAuthToken: present ✓');
                    } else {
                        warn('bookingAuthToken: MISSING — downstream book_child will fail');
                    }
                } else {
                    fail(`Patient creation returned no GUID`);
                }
            } else {
                finding(`[${time}] Obs ${obsIndex}/${allObservations.length}: TOOL chord_ortho_patient → ${action}`);
            }
        } else if (name === 'current_date_time') {
            finding(`[${time}] Obs ${obsIndex}/${allObservations.length}: TOOL current_date_time`);
            note(`Result: ${JSON.stringify(output).slice(0, 80)}`);
        } else if (name === 'chord_handleEscalation') {
            warn(`[${time}] Obs ${obsIndex}/${allObservations.length}: ESCALATION`);
            note(`Reason: ${input.escalationIntent || 'unknown'}`);
        } else if (obs.type === 'GENERATION' || name.includes('ChatPrompt') || name.includes('Runnable')) {
            // LLM generation / orchestration step — show brief summary
            const tokenCount = obs.usage?.totalTokens || obs.usage?.total || '';
            const inputText = typeof obs.input === 'string' ? obs.input : JSON.stringify(obs.input || '').slice(0, 120);
            finding(`[${time}] Obs ${obsIndex}/${allObservations.length}: LLM ${name}`);
            if (tokenCount) note(`Tokens: ${tokenCount}`);
        } else if (level === 'ERROR') {
            fail(`[${time}] Obs ${obsIndex}/${allObservations.length}: ERROR in ${name}`);
            note(`${output.error || output._debug_error || output.message || 'Unknown error'}`);
        } else {
            // Other observation — mention briefly
            finding(`[${time}] Obs ${obsIndex}/${allObservations.length}: ${obs.type || 'SPAN'} ${name}`);
        }
    }

    // ── PHASE 3: Extract structured tool calls and detect patterns ──
    console.log(`\n${thinLine}`);
    console.log('▸ PHASE 3: Analyzing extracted tool calls');

    const toolCalls = extractToolCalls(allObservations);
    step(4, 'Categorizing tool calls...');
    finding(`Slot queries: ${toolCalls.slotCalls.length}`);
    finding(`Patient creations: ${toolCalls.patientCreates.length}`);
    finding(`Booking attempts: ${toolCalls.bookChildCalls.length}`);
    finding(`Other tool calls: ${toolCalls.otherCalls.length}`);
    if (toolCalls.errors.length > 0) {
        fail(`Errors detected: ${toolCalls.errors.length}`);
    } else {
        finding(`No explicit errors in observations`);
    }

    // ── PHASE 4: Pattern detection ──
    console.log(`\n${thinLine}`);
    console.log('▸ PHASE 4: Running failure pattern detection (FP-001 through FP-006)');

    step(5, 'Checking FP-001: Missing bookingAuthToken...');
    const bookingsWithoutToken = toolCalls.bookChildCalls.filter(b => !b.hasToken && !b.success);
    if (bookingsWithoutToken.length > 0) {
        fail(`DETECTED — ${bookingsWithoutToken.length} booking(s) attempted without token`);
    } else {
        finding('Not detected');
    }

    step(6, 'Checking FP-002: Slot freshness decay (>30s gap)...');
    if (toolCalls.slotCalls.length > 0 && toolCalls.bookChildCalls.length > 0) {
        const lastSlotTime = new Date(toolCalls.slotCalls[toolCalls.slotCalls.length - 1].time).getTime();
        const firstBookTime = new Date(toolCalls.bookChildCalls[0].time).getTime();
        const gapSeconds = Math.round((firstBookTime - lastSlotTime) / 1000);
        if (gapSeconds > 30) {
            fail(`DETECTED — ${gapSeconds}s gap between slot fetch and booking`);
        } else {
            finding(`Gap is ${gapSeconds}s — within acceptable range`);
        }
    } else {
        finding('Not enough data to check (need both slot and booking calls)');
    }

    step(7, 'Checking FP-003: Double patient creation...');
    if (toolCalls.patientCreates.length > 1) {
        fail(`DETECTED — ${toolCalls.patientCreates.length} patients created in same session`);
    } else {
        finding(`${toolCalls.patientCreates.length} patient creation(s) — no duplication`);
    }

    step(8, 'Checking FP-004: Infrastructure 502 errors...');
    const infra502 = toolCalls.errors.filter(e =>
        String(e.error).includes('502') || String(e.error).includes('Bad Gateway')
    );
    if (infra502.length > 0) {
        fail(`DETECTED — ${infra502.length} infrastructure error(s)`);
    } else {
        finding('No 502 errors');
    }

    step(9, 'Checking FP-005: Parallel booking race condition...');
    if (toolCalls.bookChildCalls.length >= 2) {
        const bookTimes = toolCalls.bookChildCalls.map(b => new Date(b.time).getTime());
        const minTimeDiff = Math.min(...bookTimes.slice(1).map((t, i) => Math.abs(t - bookTimes[i])));
        if (minTimeDiff < 500) {
            fail(`DETECTED — book_child calls only ${minTimeDiff}ms apart`);
        } else {
            finding(`Calls spaced ${minTimeDiff}ms apart — no race condition`);
        }
    } else {
        finding('Single or no booking calls — not applicable');
    }

    step(10, 'Checking FP-006: Slot availability mismatch...');
    const failedWithSlotError = toolCalls.bookChildCalls.filter(b =>
        !b.success && (
            String(b.error).toLowerCase().includes('slot') ||
            String(b.error).toLowerCase().includes('available') ||
            String(b.error).toLowerCase().includes('not found')
        )
    );
    const hadValidSlots = toolCalls.slotCalls.some(s => s.slotsCount > 0);
    if (failedWithSlotError.length > 0 && hadValidSlots) {
        fail(`DETECTED — slots were returned but booking failed with slot-related error`);
    } else {
        finding('No slot availability mismatch');
    }

    const patterns = detectFailurePatterns(toolCalls);
    console.log('');
    if (patterns.length === 0) {
        finding('No known failure patterns detected');
    } else {
        warn(`${patterns.length} failure pattern(s) identified:`);
        for (const p of patterns) {
            console.log(`           ${p.id} [${p.severity}] ${p.name}`);
            console.log(`           Evidence: ${p.evidence}`);
        }
    }

    // ── PHASE 5: Cloud9 cross-reference ──
    console.log(`\n${thinLine}`);
    console.log('▸ PHASE 5: Cross-referencing with Cloud9 Production API');

    const failedBookings = toolCalls.bookChildCalls.filter(b => !b.success);
    let investigations = [];
    if (failedBookings.length > 0) {
        step(11, `Verifying ${failedBookings.length} failed booking(s) against Cloud9...`);
        investigations = await investigateSlots(failedBookings);

        for (const inv of investigations) {
            if (inv.error) {
                fail(`Slot ${inv.requestedSlot}: Cloud9 returned error — ${inv.error}`);
            } else if (inv.currentStatus === 'BOOKED') {
                warn(`Slot ${inv.requestedSlot}: Now BOOKED by ${inv.bookedBy || 'unknown'}`);
                note('Slot was likely taken between fetch and booking attempt');
            } else {
                finding(`Slot ${inv.requestedSlot}: Still AVAILABLE — booking should have succeeded`);
                note('Failure was NOT caused by slot unavailability');
            }
        }

        // Update FP-006 confidence if Cloud9 confirms slots were available
        const bookedByOther = investigations.filter(i => i.currentStatus === 'BOOKED');
        if (bookedByOther.length > 0) {
            const fp006 = patterns.find(p => p.id === 'FP-006');
            if (fp006) {
                fp006.confidence = 'HIGH (95%)';
                fp006.evidence += `. Cloud9 confirms: ${bookedByOther.length} slot(s) now booked (were available but booking failed)`;
            }
        }
    } else {
        step(11, 'No failed bookings — skipping Cloud9 cross-reference');
        finding('All bookings succeeded or no bookings attempted');
    }

    // ── PHASE 6: Deduce root cause and solution ──
    console.log(`\n${thinLine}`);
    console.log('▸ PHASE 6: Deducing root cause and generating solution');

    step(12, 'Ranking failure patterns by severity...');
    const criticalCount = patterns.filter(p => p.severity === 'CRITICAL').length;
    const highCount = patterns.filter(p => p.severity === 'HIGH').length;
    if (criticalCount > 0) fail(`${criticalCount} CRITICAL pattern(s) found — primary cause`);
    else if (highCount > 0) warn(`${highCount} HIGH severity pattern(s) found`);
    else finding('No high-severity patterns');

    const solution = generateSolution(patterns, investigations);

    step(13, 'Root cause identified:');
    console.log(`           → ${solution.rootCause}`);
    console.log('');
    step(14, 'Recommended fix:');
    for (const line of solution.solution.split('\n').filter(l => l.trim())) {
        console.log(`           ${line.trim()}`);
    }
    if (solution.verification) {
        console.log('');
        step(15, `Verification: ${solution.verification}`);
    }

    console.log(`\n${thinLine}`);

    // Print final report
    console.log('');
    printReport(sessionId, traces, toolCalls, patterns, investigations, solution);

    // Emit structured report for App UI
    const allCalls = [
        ...toolCalls.slotCalls.map(c => ({ ...c, _type: 'slots' })),
        ...toolCalls.patientCreates.map(c => ({ ...c, _type: 'patient_create' })),
        ...toolCalls.bookChildCalls.map(c => ({ ...c, _type: 'book_child' }))
    ].sort((a, b) => new Date(a.time) - new Date(b.time));

    let sessionStart = null, sessionEnd = null;
    for (const trace of traces) {
        const t = new Date(trace.timestamp);
        if (!sessionStart || t < sessionStart) sessionStart = t;
        if (!sessionEnd || t > sessionEnd) sessionEnd = t;
    }
    const durationStr = sessionStart && sessionEnd ? formatDuration(sessionStart.toISOString(), sessionEnd.toISOString()) : 'N/A';

    const reportFailedBookings = toolCalls.bookChildCalls.filter(b => !b.success);
    const succeededBookings = toolCalls.bookChildCalls.filter(b => b.success);

    const reportStatus = patterns.some(p => p.severity === 'CRITICAL') ? 'failure'
        : patterns.some(p => p.severity === 'HIGH') ? 'warning'
        : reportFailedBookings.length > 0 ? 'warning'
        : 'success';

    // Build diagnostics from real trace data
    const diagnostics = buildDiagnostics(toolCalls, patterns, allObservations);

    const report = buildTraceReport({
        agent: 'total-call-trace',
        sessionId,
        status: reportStatus,
        diagnostics,
        summary: {
            toolCalls: allCalls.length,
            errors: toolCalls.errors.length,
            duration: durationStr,
            traces: traces.length,
            slotCalls: toolCalls.slotCalls.length,
            patientCreates: toolCalls.patientCreates.length,
            bookings: toolCalls.bookChildCalls.length,
            bookingsSucceeded: succeededBookings.length,
            bookingsFailed: reportFailedBookings.length
        },
        failurePatterns: patterns.map(p => ({
            code: p.id,
            name: p.name,
            severity: p.severity,
            evidence: p.evidence,
            confidence: p.confidence
        })),
        timeline: allCalls.map(c => {
            if (c._type === 'slots') {
                return { time: formatTime(c.time), action: `grouped_slots (${c.slotsCount} groups)`, status: 'ok' };
            } else if (c._type === 'patient_create') {
                return { time: formatTime(c.time), action: 'create_patient', status: c.hasToken ? 'ok' : 'warning', detail: c.hasToken ? `GUID: ${c.patientGUID}` : 'Missing bookingAuthToken' };
            } else {
                return { time: formatTime(c.time), action: `book_child (${c.childName || 'unknown'})`, status: c.success ? 'ok' : 'error', detail: c.success ? `GUID: ${c.appointmentGUID}` : (c.error || 'Failed') };
            }
        }),
        rootCause: solution.rootCause,
        recommendations: solution.solution ? solution.solution.split('\n').filter(l => l.trim().startsWith('•')).map(l => l.trim().replace(/^•\s*/, '')) : [],
        actionableSteps: solution.actionableSteps
    });

    // Build markdown narrative
    const mdLines = [
        `## Total Call Trace: ${sessionId}`,
        '',
        `**Status:** ${reportStatus.toUpperCase()} | **Duration:** ${durationStr} | **Tool Calls:** ${allCalls.length}`,
        '',
        '### Root Cause',
        solution.rootCause || 'No failure patterns detected.',
        '',
    ];
    if (solution.solution) {
        mdLines.push('### Solution', solution.solution, '');
    }
    if (solution.verification) {
        mdLines.push('### Verification', '```', solution.verification, '```', '');
    }

    emitReport(report, mdLines.join('\n'));
}

main().catch(e => {
    console.error('');
    console.error('FATAL ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
});

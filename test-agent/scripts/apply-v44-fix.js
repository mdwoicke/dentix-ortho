#!/usr/bin/env node
/**
 * Apply v44 fix to scheduling tool
 * - Removes DEFAULT_SCHEDULE_VIEW_GUID (points to empty schedule)
 * - Fixes fetch body consumption bug
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/test-results.db');

const V44_FUNC = `/**
 * ============================================================================
 * CHORD SCHEDULING DSO - Appointment Scheduling Tool (Node Red Version)
 * Version: v44 | Updated: 2026-01-04
 * ============================================================================
 * Actions: slots, grouped_slots, book_child, cancel
 *
 * v44 FIX: Fixed fetch body consumption bug AND removed DEFAULT_SCHEDULE_VIEW_GUID
 *          - Body stream can only be read once, now reads text first then parses JSON
 *          - Removed DEFAULT_SCHEDULE_VIEW_GUID which pointed to schedule with no slots
 * v42 FIX: Default numberOfPatients=2 for grouped_slots (LLM often omits it)
 * v41 FIX: Added _debug_error and _debug_dates for API failure diagnosis
 * CRITICAL FIX: SANDBOX_MIN_DATE ensures slot searches start from Jan 13, 2026
 * ============================================================================
 */

const fetch = require('node-fetch');

const TOOL_VERSION = 'v44';
const MAX_SLOTS_RETURNED = 10;
const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

// SANDBOX MINIMUM DATE: Cloud9 sandbox has no slots before this date
const SANDBOX_MIN_DATE = new Date(2026, 0, 13); // January 13, 2026

const ACTIONS = {
    slots: {
        endpoint: \`\${BASE_URL}/ortho/getApptSlots\`,
        method: 'POST',
        buildBody: (params, uui) => {
            const body = {
                uui: uui,
                startDate: params.startDate,
                endDate: params.endDate
            };
            // v44: Only include scheduleViewGUIDs if explicitly provided (removed default)
            if (params.scheduleViewGUIDs) {
                body.scheduleViewGUIDs = params.scheduleViewGUIDs;
            }
            return body;
        },
        validate: () => {},
        successLog: (data) => \`Found \${data.count || (data.slots ? data.slots.length : 0) || 0} available slots\`
    },
    grouped_slots: {
        endpoint: \`\${BASE_URL}/ortho/getGroupedApptSlots\`,
        method: 'POST',
        buildBody: (params, uui) => {
            const body = {
                uui: uui,
                startDate: params.startDate,
                endDate: params.endDate,
                numberOfPatients: params.numberOfPatients || 2,
                timeWindowMinutes: params.timeWindowMinutes || 30
            };
            // v44: Only include scheduleViewGUIDs if explicitly provided (removed default)
            if (params.scheduleViewGUIDs) {
                body.scheduleViewGUIDs = params.scheduleViewGUIDs;
            }
            return body;
        },
        validate: () => {},
        successLog: (data) => \`Found \${data.totalGroups || (data.groups ? data.groups.length : 0) || 0} grouped slot options\`
    },
    book_child: {
        endpoint: \`\${BASE_URL}/ortho/createAppt\`,
        method: 'POST',
        buildBody: (params, uui) => ({
            uui: uui,
            patientGUID: params.patientGUID,
            startTime: params.startTime,
            scheduleViewGUID: params.scheduleViewGUID,
            scheduleColumnGUID: params.scheduleColumnGUID,
            appointmentTypeGUID: params.appointmentTypeGUID || '8fc9d063-ae46-4975-a5ae-734c6efe341a',
            minutes: params.minutes || 45,
            childName: params.childName
        }),
        validate: (params) => {
            const missing = [];
            if (!params.patientGUID) missing.push('patientGUID');
            if (!params.startTime) missing.push('startTime');
            if (!params.scheduleViewGUID) missing.push('scheduleViewGUID');
            if (!params.scheduleColumnGUID) missing.push('scheduleColumnGUID');
            if (missing.length > 0) {
                throw new Error('BOOKING FAILED - Missing required fields: ' + missing.join(', '));
            }
        },
        successLog: () => 'Appointment booked successfully'
    },
    cancel: {
        endpoint: \`\${BASE_URL}/ortho/cancelAppt\`,
        method: 'POST',
        buildBody: (params, uui) => ({
            uui: uui,
            appointmentGUID: params.appointmentGUID
        }),
        validate: (params) => {
            if (!params.appointmentGUID) {
                throw new Error("appointmentGUID is required for 'cancel' action");
            }
        },
        successLog: () => 'Appointment cancelled successfully'
    }
};

function getAuthHeader() {
    try {
        const username = "workflowapi";
        const password = "e^@V95&6sAJReTsb5!iq39mIC4HYIV";
        const credentials = Buffer.from(\`\${username}:\${password}\`).toString('base64');
        return \`Basic \${credentials}\`;
    } catch (e) {
        return null;
    }
}

function checkForError(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.success === false && !data.llm_guidance) return data.error || 'Operation failed';
    if (data.code === false) return Array.isArray(data.error) ? data.error.join(', ') : data.error;
    if (data.error && !data.slots && !data.groups && !data.appointmentGUID && !data.llm_guidance) {
        return Array.isArray(data.error) ? data.error.join(', ') : data.error;
    }
    return null;
}

function formatDate(date) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return \`\${mm}/\${dd}/\${yyyy}\`;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
}

function correctDate(dateStr) {
    if (!dateStr) return dateStr;
    const inputDate = parseDate(dateStr);
    if (!inputDate) return dateStr;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let targetDate = inputDate;
    if (inputDate < today) {
        targetDate = tomorrow;
    }
    if (targetDate < SANDBOX_MIN_DATE) {
        targetDate = new Date(SANDBOX_MIN_DATE);
    }
    if (targetDate.getTime() !== inputDate.getTime()) {
        return formatDate(targetDate);
    }
    return dateStr;
}

function correctDateRange(startDate, endDate) {
    let correctedStart = correctDate(startDate);
    let correctedEnd = correctDate(endDate);

    if (!correctedStart) {
        correctedStart = formatDate(new Date(SANDBOX_MIN_DATE));
    }

    const start = parseDate(correctedStart);
    const end = parseDate(correctedEnd);

    if (!end || end <= start) {
        const newEnd = new Date(start);
        newEnd.setDate(newEnd.getDate() + 14);
        correctedEnd = formatDate(newEnd);
    } else {
        const daysDiff = Math.floor((end - start) / (1000 * 60 * 60 * 24));
        if (daysDiff < 7) {
            const newEnd = new Date(start);
            newEnd.setDate(newEnd.getDate() + 14);
            correctedEnd = formatDate(newEnd);
        }
    }
    return { startDate: correctedStart, endDate: correctedEnd };
}

function cleanParams(params) {
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '' &&
            value !== 'NULL' && value !== 'null' && value !== 'None' &&
            value !== 'none' && value !== 'N/A' && value !== 'n/a') {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

async function executeRequest() {
    const toolName = 'schedule_appointment_ortho';
    const action = $action;

    console.log('[' + toolName + '] ' + TOOL_VERSION + ' - 2026-01-04 - Removed DEFAULT_SCHEDULE_VIEW_GUID + fetch fix');
    console.log('[' + toolName + '] Action: ' + action);

    if (!action || !ACTIONS[action]) {
        throw new Error('Invalid action. Valid: ' + Object.keys(ACTIONS).join(', '));
    }

    const config = ACTIONS[action];

    let uui;
    if (!$vars || !$vars.c1mg_uui || $vars.c1mg_uui === 'c1mg_uui' || (typeof $vars.c1mg_uui === 'string' && $vars.c1mg_uui.trim() === '')) {
        uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';
    } else {
        uui = $vars.c1mg_uui;
    }

    const rawParams = {
        startDate: typeof $startDate !== 'undefined' ? $startDate : null,
        endDate: typeof $endDate !== 'undefined' ? $endDate : null,
        scheduleViewGUIDs: typeof $scheduleViewGUIDs !== 'undefined' ? $scheduleViewGUIDs : null,
        numberOfPatients: typeof $numberOfPatients !== 'undefined' ? $numberOfPatients : null,
        timeWindowMinutes: typeof $timeWindowMinutes !== 'undefined' ? $timeWindowMinutes : null,
        patientGUID: typeof $patientGUID !== 'undefined' ? $patientGUID : null,
        startTime: typeof $startTime !== 'undefined' ? $startTime : null,
        scheduleViewGUID: typeof $scheduleViewGUID !== 'undefined' ? $scheduleViewGUID : null,
        scheduleColumnGUID: typeof $scheduleColumnGUID !== 'undefined' ? $scheduleColumnGUID : null,
        appointmentTypeGUID: typeof $appointmentTypeGUID !== 'undefined' ? $appointmentTypeGUID : null,
        minutes: typeof $minutes !== 'undefined' ? $minutes : null,
        providerGUID: typeof $providerGUID !== 'undefined' ? $providerGUID : null,
        locationGUID: typeof $locationGUID !== 'undefined' ? $locationGUID : null,
        appointmentGUID: typeof $appointmentGUID !== 'undefined' ? $appointmentGUID : null,
        childName: typeof $childName !== 'undefined' ? $childName : null
    };
    const params = cleanParams(rawParams);

    const originalDates = { startDate: params.startDate, endDate: params.endDate };

    if (action === 'slots' || action === 'grouped_slots') {
        const corrected = correctDateRange(params.startDate, params.endDate);
        if (corrected.startDate) params.startDate = corrected.startDate;
        if (corrected.endDate) params.endDate = corrected.endDate;
    }

    const correctedDates = { startDate: params.startDate, endDate: params.endDate };

    try {
        config.validate(params);
        const body = config.buildBody(params, uui);
        console.log('[' + toolName + '] Request:', JSON.stringify(body));

        const headers = { 'Content-Type': 'application/json' };
        const authHeader = getAuthHeader();
        if (authHeader) headers['Authorization'] = authHeader;

        const response = await fetch(config.endpoint, {
            method: config.method,
            headers: headers,
            body: JSON.stringify(body)
        });

        // v44 FIX: Read body as text first, then parse JSON safely
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            data = responseText;
        }

        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }

        const errorMessage = checkForError(data);
        if (errorMessage) throw new Error(errorMessage);

        console.log('[' + toolName + '] ' + config.successLog(data));

        if (data && data.slots && data.slots.length > MAX_SLOTS_RETURNED) {
            data.slots = data.slots.slice(0, MAX_SLOTS_RETURNED);
            data.count = MAX_SLOTS_RETURNED;
            data._truncated = true;
        }
        if (data && data.groups && data.groups.length > MAX_SLOTS_RETURNED) {
            data.groups = data.groups.slice(0, MAX_SLOTS_RETURNED);
            data.totalGroups = MAX_SLOTS_RETURNED;
            data._truncated = true;
        }

        if (typeof data === 'object') {
            data._toolVersion = TOOL_VERSION;
        }

        var result = JSON.stringify(data);
        console.log('[' + toolName + '] Response size: ' + result.length + ' bytes');
        return result;

    } catch (error) {
        console.error('[' + toolName + '] Error:', error.message);

        const isMissingSlotFields = error.message.includes('BOOKING FAILED');
        if (isMissingSlotFields) {
            return JSON.stringify({
                success: false,
                _toolVersion: TOOL_VERSION,
                llm_guidance: {
                    error_type: 'missing_slot_data',
                    voice_response: 'Let me verify that time for you.',
                    action_required: 'refetch_slots_and_retry',
                    CRITICAL: 'Do NOT transfer. Re-fetch slots then retry booking.'
                }
            });
        }

        return JSON.stringify({
            success: false,
            _toolVersion: TOOL_VERSION,
            _debug_error: error.message,
            _debug_dates: {
                original: originalDates,
                corrected: correctedDates,
                action: action
            },
            llm_guidance: {
                error_type: 'api_error',
                voice_response: 'I want to connect you with a specialist. One moment while I transfer your call.',
                action_required: 'transfer_to_agent',
                CRITICAL: 'Do NOT mention error to caller. Transfer gracefully.'
            }
        });
    }
}

return executeRequest();
`;

// Update database
const db = new Database(DB_PATH);

// Get current version
const current = db.prepare("SELECT version FROM prompt_working_copies WHERE file_key = 'scheduling_tool'").get();
const newVersion = (current?.version || 0) + 1;

// Update the working copy
db.prepare(`
  UPDATE prompt_working_copies
  SET content = ?, version = ?, updated_at = datetime('now')
  WHERE file_key = 'scheduling_tool'
`).run(V44_FUNC, newVersion);

// Add to version history
db.prepare(`
  INSERT INTO prompt_version_history (file_key, version, content, change_description, created_at)
  VALUES (?, ?, ?, ?, datetime('now'))
`).run('scheduling_tool', newVersion, V44_FUNC, 'v44: Fixed fetch body bug + removed DEFAULT_SCHEDULE_VIEW_GUID');

console.log(`✓ Updated scheduling_tool: v${current?.version || 0} -> v${newVersion}`);
console.log('✓ Changes:');
console.log('  - Removed DEFAULT_SCHEDULE_VIEW_GUID (pointed to empty schedule)');
console.log('  - Fixed fetch body consumption bug');

db.close();

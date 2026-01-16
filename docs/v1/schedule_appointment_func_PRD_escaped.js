/**
 * ============================================================================
 * CHORD SCHEDULING DSO - Appointment Scheduling Tool (Sandbox B - PROD)
 * Version: v58-PRD | Updated: 2026-01-14
 * ============================================================================
 * Actions: slots, grouped_slots, book_child, cancel
 *
 * This version calls Node Red /ortho-prd/ endpoints (PROD Cloud9).
 *
 * v58-PRD FIX: CLOUD9 API DATE QUIRK - Start search from 30+ days out
 *          - Cloud9 API only returns Exams slots when searching dates 30+ days out
 *          - Dates too close to today only return Adjustments (for existing patients)
 *          - New minimum search start: 30 days from today
 *          - Larger expansion tiers: 30, 60, 90 days
 *          - Chair 8 Exams filtering for new patient appointments
 * v55-PRD: Chair 8 defaults with GUID extraction guidance
 * v54-PRD: Sandbox B PROD version using /ortho-prd/ routes
 * ============================================================================
 */

const fetch = require('node-fetch');

const TOOL_VERSION = 'v58-PRD';
const MAX_SLOTS_RETURNED = 1;
const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const SANDBOX_MIN_DATE = new Date(2026, 0, 13);

// v58: Chair 8 configuration for new patient Exams appointments
const CHAIR_8_CONFIG = {{
    scheduleColumnGUID: '07687884-7e37-49aa-8028-d43b751c9034',
    scheduleViewGUID: '4c9e9333-4951-4eb0-8d97-e1ad83ef422d',
    appointmentTypeGUID: 'f6c20c35-9abb-47c2-981a-342996016705',
    locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b',
    appointmentClass: 'Exams',
    defaultMinutes: 40
}};

// v58: Cloud9 API quirk - Exams slots only available 30+ days out
const EXAMS_MIN_DAYS_OUT = 30;

// v58: Larger date expansion tiers to find Exams slots
const DATE_EXPANSION_TIERS = [30, 60, 90]; // 1 month, 2 months, 3 months
const MIN_DATE_RANGE_DAYS = 30; // Minimum range for Exams slot searches
const MAX_FUTURE_DAYS = 120; // ~4 months - extended for Exams slot searches

function encodeBookingToken(slot) {{
    const data = {{
        st: slot.startTime,
        sv: slot.scheduleViewGUID,
        sc: slot.scheduleColumnGUID,
        at: slot.appointmentTypeGUID,
        mn: slot.minutes
    }};
    return Buffer.from(JSON.stringify(data)).toString('base64');
}}

function decodeBookingToken(token) {{
    try {{
        const data = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
        return {{
            startTime: data.st,
            scheduleViewGUID: data.sv,
            scheduleColumnGUID: data.sc,
            appointmentTypeGUID: data.at,
            minutes: data.mn
        }};
    }} catch (e) {{
        console.error('[decodeBookingToken] Failed to decode:', e.message);
        return null;
    }}
}}

function formatSlotsResponse(data) {{
    if (data && data.slots && Array.isArray(data.slots)) {{
        data.slots = data.slots.map(slot => ({{
            displayTime: slot.startTime || slot.StartTime,
            startTime: slot.startTime || slot.StartTime,
            scheduleViewGUID: slot.scheduleViewGUID,
            scheduleColumnGUID: slot.scheduleColumnGUID,
            appointmentTypeGUID: slot.appointmentTypeGUID,
            minutes: slot.minutes
        }}));
    }}
    if (data && data.groups && Array.isArray(data.groups)) {{
        data.groups = data.groups.map(group => ({{
            groupTime: group.slots && group.slots[0] ? (group.slots[0].startTime || group.slots[0].StartTime) : null,
            slots: group.slots ? group.slots.map(slot => ({{
                displayTime: slot.startTime || slot.StartTime,
                startTime: slot.startTime || slot.StartTime,
                scheduleViewGUID: slot.scheduleViewGUID,
                scheduleColumnGUID: slot.scheduleColumnGUID,
                appointmentTypeGUID: slot.appointmentTypeGUID,
                minutes: slot.minutes
            }})) : []
        }}));
    }}
    delete data.voiceSlots;
    return data;
}}

// v58: Filter for Chair 8 Exams slots only (new patient appointments)
function filterForChair8Exams(slots) {{
    if (!slots || !Array.isArray(slots)) return [];
    const filtered = slots.filter(slot => {{
        const isChair8 = slot.ScheduleColumnGUID === CHAIR_8_CONFIG.scheduleColumnGUID ||
                         slot.scheduleColumnGUID === CHAIR_8_CONFIG.scheduleColumnGUID;
        const isExams = slot.AppointmentClassDescription === CHAIR_8_CONFIG.appointmentClass;
        return isChair8 && isExams;
    }});
    console.log('[v58-PRD] Chair 8 Exams filter: ' + slots.length + ' total -> ' + filtered.length + ' Chair 8 Exams');
    return filtered;
}}

const ACTIONS = {{
    slots: {{
        endpoint: `${{BASE_URL}}/ortho-prd/getApptSlots`,
        method: 'POST',
        buildBody: (params, uui) => {{
            const body = {{ uui: uui, startDate: params.startDate, endDate: params.endDate }};
            if (params.scheduleViewGUIDs) body.scheduleViewGUIDs = params.scheduleViewGUIDs;
            return body;
        }},
        validate: () => {{}},
        successLog: (data) => `Found ${{data.count || (data.slots ? data.slots.length : 0) || 0}} Chair 8 Exams slots`
    }},
    grouped_slots: {{
        endpoint: `${{BASE_URL}}/ortho-prd/getGroupedApptSlots`,
        method: 'POST',
        buildBody: (params, uui) => {{
            const body = {{
                uui: uui,
                startDate: params.startDate,
                endDate: params.endDate,
                numberOfPatients: params.numberOfPatients || 2,
                timeWindowMinutes: params.timeWindowMinutes || 30
            }};
            if (params.scheduleViewGUIDs) body.scheduleViewGUIDs = params.scheduleViewGUIDs;
            return body;
        }},
        validate: () => {{}},
        successLog: (data) => `Found ${{data.totalGroups || (data.groups ? data.groups.length : 0) || 0}} grouped slot options`
    }},
    book_child: {{
        endpoint: `${{BASE_URL}}/ortho-prd/createAppt`,
        method: 'POST',
        buildBody: (params, uui) => {{
            // v58: Use Chair 8 defaults for new patient Exams (40 min)
            console.log('[book_child v58-PRD] Using individual params:', JSON.stringify(params));
            return {{
                uui: uui,
                patientGUID: params.patientGUID,
                startTime: params.startTime,
                scheduleViewGUID: params.scheduleViewGUID || CHAIR_8_CONFIG.scheduleViewGUID,
                scheduleColumnGUID: params.scheduleColumnGUID || CHAIR_8_CONFIG.scheduleColumnGUID,
                appointmentTypeGUID: params.appointmentTypeGUID || CHAIR_8_CONFIG.appointmentTypeGUID,
                minutes: params.minutes || CHAIR_8_CONFIG.defaultMinutes,
                childName: params.childName
            }};
        }},
        validate: (params) => {{
            if (!params.patientGUID) throw new Error('BOOKING FAILED - Missing patientGUID');
            if (!params.startTime) throw new Error('BOOKING FAILED - Missing startTime');
        }},
        successLog: () => 'Appointment booked successfully on Chair 8'
    }},
    cancel: {{
        endpoint: `${{BASE_URL}}/ortho-prd/cancelAppt`,
        method: 'POST',
        buildBody: (params, uui) => ({{ uui: uui, appointmentGUID: params.appointmentGUID }}),
        validate: (params) => {{ if (!params.appointmentGUID) throw new Error("appointmentGUID required"); }},
        successLog: () => 'Appointment cancelled successfully'
    }}
}};

function getAuthHeader() {{
    try {{
        const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
        return `Basic ${{credentials}}`;
    }} catch (e) {{ return null; }}
}}

function checkForError(data) {{
    if (!data || typeof data !== 'object') return null;
    if (data.success === false && !data.llm_guidance) return data.error || data.message || 'Operation failed';
    if (data.code === false) return Array.isArray(data.error) ? data.error.join(', ') : data.error;
    if (data.error && !data.slots && !data.groups && !data.appointmentGUID && !data.llm_guidance) {{
        return Array.isArray(data.error) ? data.error.join(', ') : data.error;
    }}
    if (data.message && data.message.toLowerCase().includes('error') && !data.appointmentGUID) return data.message;
    return null;
}}

function formatDate(date) {{
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${{mm}}/${{dd}}/${{date.getFullYear()}}`;
}}

function parseDate(dateStr) {{
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
}}

// v58: Enhanced date range correction - start 30+ days out for Exams slots
function correctDateRange(startDate, endDate, expansionDays = DATE_EXPANSION_TIERS[0]) {{
    let correctedStart = startDate ? parseDate(startDate) : null;
    let correctedEnd = endDate ? parseDate(endDate) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let datesCorrected = false;
    let originalStart = startDate;
    let originalEnd = endDate;

    const maxFutureDate = new Date(today);
    maxFutureDate.setDate(maxFutureDate.getDate() + MAX_FUTURE_DAYS);

    if (correctedStart && correctedStart > maxFutureDate) {{
        console.log('[v58-PRD] WARNING: startDate ' + startDate + ' too far in future - AUTO-CORRECTING');
        correctedStart = null;
        datesCorrected = true;
    }}
    if (correctedEnd && correctedEnd > maxFutureDate) {{
        console.log('[v58-PRD] WARNING: endDate ' + endDate + ' too far in future - will be recalculated');
        correctedEnd = null;
        datesCorrected = true;
    }}

    // v58: Cloud9 API quirk - Exams slots only returned when searching 30+ days out
    const minExamsStart = new Date(today);
    minExamsStart.setDate(minExamsStart.getDate() + EXAMS_MIN_DAYS_OUT);

    // Fix dates in the past or too close to today for Exams searches
    if (!correctedStart || correctedStart < minExamsStart) {{
        correctedStart = new Date(Math.max(minExamsStart.getTime(), SANDBOX_MIN_DATE.getTime()));
        if (originalStart) {{
            console.log('[v58-PRD] Start date ' + originalStart + ' too close - Cloud9 API needs 30+ days out for Exams. Adjusted to ' + formatDate(correctedStart));
            datesCorrected = true;
        }}
    }}
    if (correctedStart < SANDBOX_MIN_DATE) correctedStart = new Date(SANDBOX_MIN_DATE);

    let daysDiff = 0;
    if (correctedEnd && correctedEnd > correctedStart) {{
        daysDiff = Math.ceil((correctedEnd - correctedStart) / (1000 * 60 * 60 * 24));
    }}

    if (!correctedEnd || correctedEnd <= correctedStart || daysDiff < MIN_DATE_RANGE_DAYS) {{
        correctedEnd = new Date(correctedStart);
        correctedEnd.setDate(correctedEnd.getDate() + expansionDays);
    }}

    if (datesCorrected) {{
        console.log('[v58-PRD] Date auto-correction: original=' + originalStart + ' to ' + originalEnd + ' -> corrected=' + formatDate(correctedStart) + ' to ' + formatDate(correctedEnd));
    }}

    return {{ startDate: formatDate(correctedStart), endDate: formatDate(correctedEnd), expansionDays: expansionDays, datesCorrected: datesCorrected }};
}}

function cleanParams(params) {{
    const cleaned = {{}};
    for (const [key, value] of Object.entries(params)) {{
        if (value !== null && value !== undefined && value !== '' && value !== 'NULL' && value !== 'null' && value !== 'None') {{
            cleaned[key] = value;
        }}
    }}
    return cleaned;
}}

// v58: Dynamic slot search with progressive expansion and Chair 8 filter
async function searchSlotsWithExpansion(action, params, uui, headers) {{
    const config = ACTIONS[action];
    let lastError = null;
    let searchExpanded = false;
    let finalExpansionDays = DATE_EXPANSION_TIERS[0];

    for (let tierIndex = 0; tierIndex < DATE_EXPANSION_TIERS.length; tierIndex++) {{
        const expansionDays = DATE_EXPANSION_TIERS[tierIndex];
        const corrected = correctDateRange(params.startDate, params.endDate, expansionDays);

        const searchParams = {{ ...params, startDate: corrected.startDate, endDate: corrected.endDate }};
        const body = config.buildBody(searchParams, uui);

        console.log('[v58-PRD] Tier ' + tierIndex + ' search: ' + corrected.startDate + ' to ' + corrected.endDate + ' (' + expansionDays + ' days)');

        try {{
            const response = await fetch(config.endpoint, {{ method: config.method, headers: headers, body: JSON.stringify(body) }});
            const responseText = await response.text();
            let data;
            try {{ data = JSON.parse(responseText); }} catch (e) {{ data = responseText; }}

            if (!response.ok) {{
                lastError = 'HTTP ' + response.status + ': ' + response.statusText;
                continue;
            }}

            const errorMessage = checkForError(data);
            if (errorMessage) {{
                lastError = errorMessage;
                continue;
            }}

            // v58: Filter for Chair 8 Exams slots (new patient appointments)
            if (action === 'slots' && data.slots && data.slots.length > 0) {{
                const originalCount = data.slots.length;
                data.slots = filterForChair8Exams(data.slots);
                data._chair8FilterApplied = true;
                data._originalSlotCount = originalCount;
            }}

            const hasResults = (action === 'slots' && data.slots && data.slots.length > 0) ||
                               (action === 'grouped_slots' && data.groups && data.groups.length > 0);

            if (hasResults) {{
                data._searchExpanded = tierIndex > 0;
                data._expansionTier = tierIndex;
                data._dateRange = {{ start: corrected.startDate, end: corrected.endDate, days: expansionDays }};
                if (tierIndex > 0) {{
                    console.log('[v58-PRD] Found Chair 8 Exams slots after expanding to tier ' + tierIndex + ' (' + expansionDays + ' days)');
                }}
                return {{ success: true, data: data }};
            }}

            searchExpanded = true;
            finalExpansionDays = expansionDays;
            console.log('[v58-PRD] No Chair 8 Exams slots at tier ' + tierIndex + ', expanding...');

        }} catch (e) {{
            lastError = e.message;
            console.log('[v58-PRD] Search error at tier ' + tierIndex + ': ' + e.message);
        }}
    }}

    console.log('[v58-PRD] All expansion tiers exhausted, no Chair 8 Exams slots found');
    return {{
        success: false,
        data: {{
            slots: [],
            groups: [],
            count: 0,
            totalGroups: 0,
            _toolVersion: TOOL_VERSION,
            _searchExpanded: searchExpanded,
            _expansionTier: DATE_EXPANSION_TIERS.length - 1,
            _dateRange: {{ days: finalExpansionDays }},
            _debug_error: lastError || 'No Chair 8 Exams slots available after searching ' + finalExpansionDays + ' days',
            llm_guidance: {{
                error_type: 'no_slots_after_expansion',
                voice_response: 'I apologize, but I was not able to find any available appointments within the next ' + Math.round(finalExpansionDays / 7) + ' weeks. Let me connect you with someone who can help schedule your appointment.',
                action_required: 'transfer_to_agent',
                transfer_reason: 'no_availability_after_search',
                CRITICAL: 'All date expansion tiers exhausted. Transfer to agent for manual scheduling assistance.'
            }}
        }}
    }};
}}

async function executeRequest() {{
    const toolName = 'schedule_appointment_ortho_prd';
    const action = $action;
    console.log('[' + toolName + '] ' + TOOL_VERSION + ' - CHAIR 8 EXAMS SEARCH (30+ days out)');
    console.log('[' + toolName + '] Action: ' + action);

    if (!action || !ACTIONS[action]) throw new Error('Invalid action. Valid: ' + Object.keys(ACTIONS).join(', '));
    const config = ACTIONS[action];

    let uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';
    if ($vars && $vars.c1mg_uui && $vars.c1mg_uui !== 'c1mg_uui' && $vars.c1mg_uui.trim() !== '') uui = $vars.c1mg_uui;

    const rawParams = {{
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
        appointmentGUID: typeof $appointmentGUID !== 'undefined' ? $appointmentGUID : null,
        childName: typeof $childName !== 'undefined' ? $childName : null
    }};
    const params = cleanParams(rawParams);

    try {{
        if (action === 'slots' || action === 'grouped_slots') {{
            const headers = {{ 'Content-Type': 'application/json' }};
            const authHeader = getAuthHeader();
            if (authHeader) headers['Authorization'] = authHeader;

            const searchResult = await searchSlotsWithExpansion(action, params, uui, headers);

            if (!searchResult.success) {{
                return JSON.stringify(searchResult.data);
            }}

            let data = searchResult.data;
            console.log('[' + toolName + '] ' + config.successLog(data));

            data = formatSlotsResponse(data);

            if (data && data.slots && data.slots.length > MAX_SLOTS_RETURNED) {{
                data.slots = data.slots.slice(0, MAX_SLOTS_RETURNED);
                data.count = MAX_SLOTS_RETURNED;
                data._truncated = true;
            }}
            if (data && data.groups && data.groups.length > MAX_SLOTS_RETURNED) {{
                data.groups = data.groups.slice(0, MAX_SLOTS_RETURNED);
                data.totalGroups = MAX_SLOTS_RETURNED;
                data._truncated = true;
            }}

            if (typeof data === 'object') {{
                data._toolVersion = TOOL_VERSION;
                data.llm_guidance = {{
                    timestamp: new Date().toISOString(),
                    confirmation_triggers: ['yes', 'yeah', 'yep', 'yup', 'sure', 'okay', 'ok', 'alright', 'that works', 'works for me', 'perfect', 'sounds good'],
                    goodbye_triggers: ["that's all", 'thats all', "that's it", 'thats it', 'no thank you', 'no thanks'],
                    BOOKING_SEQUENCE_MANDATORY: [
                        'STEP 1: Offer the slot time to the caller and wait for confirmation',
                        'STEP 2: When caller confirms, FIRST call chord_ortho_patient action=create to create the patient',
                        'STEP 3: Get the patientGUID from the chord_ortho_patient response',
                        'STEP 4: THEN call schedule_appointment_ortho_prd action=book_child with patientGUID from step 3 AND slot GUIDs from this response',
                        'CRITICAL: NEVER call book_child before chord_ortho_patient create. The patientGUID is REQUIRED.'
                    ],
                    next_action: 'offer_time_to_caller_and_wait_for_confirmation',
                    on_caller_confirms: 'call_chord_ortho_patient_action_create_FIRST_then_book_child',
                    slot_fields_for_booking: 'startTime, scheduleViewGUID, scheduleColumnGUID, appointmentTypeGUID, minutes'
                }};
            }}
            return JSON.stringify(data);
        }}

        config.validate(params);
        const body = config.buildBody(params, uui);
        console.log('[' + toolName + '] Request:', JSON.stringify(body));

        const headers = {{ 'Content-Type': 'application/json' }};
        const authHeader = getAuthHeader();
        if (authHeader) headers['Authorization'] = authHeader;

        const response = await fetch(config.endpoint, {{ method: config.method, headers: headers, body: JSON.stringify(body) }});
        const responseText = await response.text();
        let data;
        try {{ data = JSON.parse(responseText); }} catch (e) {{ data = responseText; }}

        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        const errorMessage = checkForError(data);
        if (errorMessage) throw new Error(errorMessage);

        console.log('[' + toolName + '] ' + config.successLog(data));
        if (typeof data === 'object') data._toolVersion = TOOL_VERSION;
        return JSON.stringify(data);

    }} catch (error) {{
        console.error('[' + toolName + '] Error:', error.message);

        if (error.message.includes('BOOKING FAILED') || error.message.includes('Missing')) {{
            return JSON.stringify({{
                success: false, _toolVersion: TOOL_VERSION, _debug_error: error.message,
                llm_guidance: {{
                    error_type: 'missing_params',
                    voice_response: 'Let me check those details again.',
                    action_required: 'provide_required_params',
                    CRITICAL: 'book_child requires: patientGUID, startTime. Call slots first to get slot details.'
                }}
            }});
        }}

        if (error.message.includes('cannot be scheduled') || error.message.includes('time slot') || error.message.includes('not available')) {{
            return JSON.stringify({{
                success: false, _toolVersion: TOOL_VERSION, _debug_error: error.message,
                llm_guidance: {{
                    error_type: 'slot_no_longer_available',
                    voice_response: 'That time is no longer available. Let me find another option.',
                    action_required: 'call_slots_offer_new_time',
                    CRITICAL: 'The slot is taken. Call slots again to get a new time and offer it to caller.'
                }}
            }});
        }}

        return JSON.stringify({{
            success: false, _toolVersion: TOOL_VERSION, _debug_error: error.message,
            llm_guidance: {{ error_type: 'api_error', voice_response: 'Let me connect you with a specialist.', action_required: 'transfer_to_agent' }}
        }});
    }}
}}

return executeRequest();

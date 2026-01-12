/**
 * ============================================================================
 * CHORD SCHEDULING DSO - Appointment Scheduling Tool (Node Red Version)
 * Version: v50 | Updated: 2026-01-12
 * ============================================================================
 * Actions: slots, grouped_slots, book_child, cancel
 *
 * v50 FIX: DYNAMIC SLOT SEARCH - Progressive date expansion when no slots found
 *          - Auto-expands search: 2 weeks -> 4 weeks -> 8 weeks
 *          - Minimum 14-day range enforced (prevents single-day searches)
 *          - Auto-retries with expanded range before returning empty
 *          - Transfer only after all expansion tiers exhausted
 * v49 FIX: STRIP GUIDs FROM SLOTS RESPONSE
 * v48 FIX: ENFORCE BOOKINGTOKEN
 * ============================================================================
 */

const fetch = require('node-fetch');

const TOOL_VERSION = 'v50';
const MAX_SLOTS_RETURNED = 1;
const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const DEFAULT_SCHEDULE_COLUMN_GUID = 'dda0b40c-ace5-4427-8b76-493bf9aa26f1';
const SANDBOX_MIN_DATE = new Date(2026, 0, 13);

// v50: Progressive date expansion tiers (in days)
const DATE_EXPANSION_TIERS = [14, 28, 56]; // 2 weeks, 4 weeks, 8 weeks
const MIN_DATE_RANGE_DAYS = 14; // Minimum range to prevent single-day searches

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

function addBookingTokensToSlots(data) {{
    if (data && data.slots && Array.isArray(data.slots)) {{
        data.slots = data.slots.map(slot => ({{
            displayTime: slot.startTime || slot.StartTime,
            bookingToken: encodeBookingToken(slot)
        }}));
    }}
    if (data && data.groups && Array.isArray(data.groups)) {{
        data.groups = data.groups.map(group => ({{
            groupTime: group.slots && group.slots[0] ? (group.slots[0].startTime || group.slots[0].StartTime) : null,
            slots: group.slots ? group.slots.map(slot => ({{
                displayTime: slot.startTime || slot.StartTime,
                bookingToken: encodeBookingToken(slot)
            }})) : []
        }}));
    }}
    delete data.voiceSlots;
    return data;
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
        successLog: (data) => `Found ${{data.count || (data.slots ? data.slots.length : 0) || 0}} available slots`
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
            if (!params.bookingToken) {{
                throw new Error('BOOKING FAILED - bookingToken is required. Call slots first to get a bookingToken.');
            }}
            const slotData = decodeBookingToken(params.bookingToken);
            if (!slotData) {{
                throw new Error('BOOKING FAILED - Invalid bookingToken. Call slots again to get a fresh token.');
            }}
            console.log('[book_child] Decoded bookingToken:', JSON.stringify(slotData));
            return {{
                uui: uui,
                patientGUID: params.patientGUID,
                startTime: slotData.startTime,
                scheduleViewGUID: slotData.scheduleViewGUID,
                scheduleColumnGUID: slotData.scheduleColumnGUID || DEFAULT_SCHEDULE_COLUMN_GUID,
                appointmentTypeGUID: slotData.appointmentTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705',
                minutes: slotData.minutes || 45,
                childName: params.childName
            }};
        }},
        validate: (params) => {{
            if (!params.patientGUID) throw new Error('BOOKING FAILED - Missing patientGUID');
            if (!params.bookingToken) throw new Error('BOOKING FAILED - Missing bookingToken. You must call slots first and use the bookingToken from the response.');
        }},
        successLog: () => 'Appointment booked successfully'
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

// v50: Enhanced date range correction with minimum range enforcement
function correctDateRange(startDate, endDate, expansionDays = DATE_EXPANSION_TIERS[0]) {{
    let correctedStart = startDate ? parseDate(startDate) : null;
    let correctedEnd = endDate ? parseDate(endDate) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    
    if (!correctedStart || correctedStart < today) {{
        correctedStart = new Date(Math.max(today.getTime(), SANDBOX_MIN_DATE.getTime()));
    }}
    if (correctedStart < SANDBOX_MIN_DATE) correctedStart = new Date(SANDBOX_MIN_DATE);
    
    // v50: Calculate days between dates
    let daysDiff = 0;
    if (correctedEnd && correctedEnd > correctedStart) {{
        daysDiff = Math.ceil((correctedEnd - correctedStart) / (1000 * 60 * 60 * 24));
    }}
    
    // v50: Enforce minimum range AND use expansion tier
    if (!correctedEnd || correctedEnd <= correctedStart || daysDiff < MIN_DATE_RANGE_DAYS) {{
        correctedEnd = new Date(correctedStart);
        correctedEnd.setDate(correctedEnd.getDate() + expansionDays);
    }}
    
    return {{ startDate: formatDate(correctedStart), endDate: formatDate(correctedEnd), expansionDays: expansionDays }};
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

// v50: Dynamic slot search with progressive expansion
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
        
        console.log('[v50] Tier ' + tierIndex + ' search: ' + corrected.startDate + ' to ' + corrected.endDate + ' (' + expansionDays + ' days)');
        
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
            
            // Check if we got slots/groups
            const hasResults = (action === 'slots' && data.slots && data.slots.length > 0) ||
                               (action === 'grouped_slots' && data.groups && data.groups.length > 0);
            
            if (hasResults) {{
                // v50: Add metadata about the search
                data._searchExpanded = tierIndex > 0;
                data._expansionTier = tierIndex;
                data._dateRange = {{ start: corrected.startDate, end: corrected.endDate, days: expansionDays }};
                if (tierIndex > 0) {{
                    console.log('[v50] Found slots after expanding to tier ' + tierIndex + ' (' + expansionDays + ' days)');
                }}
                return {{ success: true, data: data }};
            }}
            
            // No results, try next tier
            searchExpanded = true;
            finalExpansionDays = expansionDays;
            console.log('[v50] No slots found at tier ' + tierIndex + ', expanding...');
            
        }} catch (e) {{
            lastError = e.message;
            console.log('[v50] Search error at tier ' + tierIndex + ': ' + e.message);
        }}
    }}
    
    // v50: All tiers exhausted, no slots found
    console.log('[v50] All expansion tiers exhausted, no slots found');
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
            _debug_error: lastError || 'No slots available after searching ' + finalExpansionDays + ' days',
            llm_guidance: {{
                error_type: 'no_slots_after_expansion',
                voice_response: 'I apologize, but I was not able to find any available appointments within the next ' + Math.round(finalExpansionDays / 7) + ' weeks. Let me connect you with someone who can help schedule your appointment.',
                action_required: 'transfer_to_agent',
                transfer_reason: 'no_availability_after_8_week_search',
                CRITICAL: 'All date expansion tiers exhausted. Transfer to agent for manual scheduling assistance.'
            }}
        }}
    }};
}}

async function executeRequest() {{
    const toolName = 'schedule_appointment_ortho';
    const action = $action;
    console.log('[' + toolName + '] ' + TOOL_VERSION + ' - DYNAMIC SLOT SEARCH');
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
        bookingToken: typeof $bookingToken !== 'undefined' ? $bookingToken : null,
        appointmentGUID: typeof $appointmentGUID !== 'undefined' ? $appointmentGUID : null,
        childName: typeof $childName !== 'undefined' ? $childName : null
    }};
    const params = cleanParams(rawParams);

    try {{
        // v50: Use dynamic search for slots/grouped_slots
        if (action === 'slots' || action === 'grouped_slots') {{
            const headers = {{ 'Content-Type': 'application/json' }};
            const authHeader = getAuthHeader();
            if (authHeader) headers['Authorization'] = authHeader;
            
            const searchResult = await searchSlotsWithExpansion(action, params, uui, headers);
            
            if (!searchResult.success) {{
                // Return the no-slots response with guidance
                return JSON.stringify(searchResult.data);
            }}
            
            let data = searchResult.data;
            console.log('[' + toolName + '] ' + config.successLog(data));
            
            // Add bookingTokens
            data = addBookingTokensToSlots(data);
            
            // Truncate to MAX_SLOTS_RETURNED
            if (data && data.slots && data.slots.length > MAX_SLOTS_RETURNED) {{
                data.slots = data.slots.slice(0, MAX_SLOTS_RETURNED);
                data.count = MAX_SLOTS_RETURNED;
                data._truncated = true;
                data._note = 'Use the bookingToken from this slot when calling book_child';
            }}
            if (data && data.groups && data.groups.length > MAX_SLOTS_RETURNED) {{
                data.groups = data.groups.slice(0, MAX_SLOTS_RETURNED);
                data.totalGroups = MAX_SLOTS_RETURNED;
                data._truncated = true;
            }}
            
            if (typeof data === 'object') data._toolVersion = TOOL_VERSION;
            return JSON.stringify(data);
        }}
        
        // Non-slot actions (book_child, cancel) - use original flow
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

        if (error.message.includes('BOOKING FAILED') || error.message.includes('bookingToken')) {{
            return JSON.stringify({{
                success: false, _toolVersion: TOOL_VERSION, _debug_error: error.message,
                llm_guidance: {{ 
                    error_type: 'missing_booking_token', 
                    voice_response: 'Let me check those times again.', 
                    action_required: 'call_slots_then_use_bookingToken',
                    CRITICAL: 'You MUST call slots action first, then use the bookingToken from the response when calling book_child. The bookingToken contains all the slot details.'
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
                    CRITICAL: 'The slot is taken. Call slots again to get a new bookingToken and offer the new time to caller.'
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

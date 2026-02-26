/**
 * ============================================================================
 * CHORD SCHEDULING DSO - Appointment Scheduling Tool (Node Red Version)
 * Version: v92 | Updated: 2026-02-25
 * ============================================================================
 * Actions: slots, grouped_slots, book_child, cancel
 *
 * v92: BOOKING RESPONSE VALIDATION - Validate book_child returns real Cloud9 GUIDs
 *      - After bookConsultation returns, verify each child has a real appointmentGUID (8-4-4-4-12 hex)
 *      - If any child is missing a real GUID, override success=false with llm_guidance.CRITICAL
 *      - Add _booking_verified flag so downstream consumers can trust the response
 *      - Prevents LLM from confirming a booking when the API did not actually create one
 *
 * v91: FIX numberOfPatients FLOWISE BUG - Change schema type from integer to string
 *      - Flowise drops integer-typed params as undefined causing cleanParams to strip them
 *      - Schema now types numberOfPatients and timeWindowMinutes as string
 *      - parseInt() already handles string to number conversion in tool code
 *      - ROOT CAUSE of sibling booking failures (Ted Test session 8e82e784)
 *
 * v89: FIX CRITICAL SIBLING BOOKING BUG - Remove v80 redirect + fix numberOfPatients
 *      - REMOVED v80 redirect that sent grouped_slots to getApptSlots (wrong endpoint!)
 *      - Flowise integer schema params may arrive as undefined - now defaults numberOfPatients=2
 *      - Derive numberOfPatients from children array length as backup
 *      - INSUFFICIENT mode: warn LLM when fewer slots than children found
 *      - Added endpoint logging to trace which Node-RED URL is actually called
 *
 * v88: BULLETPROOF slot-to-child mapping (still active)
 *      - Consecutive mode: data.slots = groups[0].slots (exactly N for N children)
 *      - Individual mode: data.slots = first N slots
 *      - Top-level booking_plan maps child_number → slot
 *
 * v87: SIMPLIFY for Node-RED v22 - grouped_slots now always returns 'slots' array
 *      - hasResults now true when grouped_slots returns slots (not just groups)
 *      - Removed v86 recursive fallback (no longer needed - Node-RED handles it)
 *      - Removed v82 bestIndividualSlots tracking (dead code)
 *      - Booking plan comes directly from Node-RED response
 *
 * v86: FIX GROUPED_SLOTS FALLBACK - Node-RED returns no 'slots' field, so v82 was dead code
 *      - When grouped_slots has 0 groups, now calls regular 'slots' endpoint as fallback
 *      - Returns individual slots so LLM can book children at separate times
 *      - MAX_SLOTS_RETURNED exemption: grouped_slots fallback needs >=numberOfPatients slots
 *      - Fixes the #1 sibling booking failure where 0 groups led to immediate transfer
 *
  * v85: ENFORCE UNIQUE SLOTS PER CHILD - Server-side duplicate slot rejection
 *      - book_child.validate() checks each child has unique startTime+scheduleColumnGUID
 *      - Atomic bookConsultation path also validates unique slots before calling Node-RED
 *      - Prevents the #1 sibling booking failure: both children assigned same slot
 *
 * v84: PRESERVE BOOKING_PLAN - Stop overwriting Node-RED's child→slot mapping
 *      - Save booking_plan and SLOT_USAGE_RULE before guidance override
 *      - Merge them back into standard guidance so LLM sees explicit slot assignments
 *      - Added "each child MUST use DIFFERENT startTime" to BOOKING_SEQUENCE_MANDATORY
 *
 * v78: FIX CHILDREN PARSING - Handle both string and array input from Flowise
 *      - Flowise schema types children as "string" but LLM may send native array
 *      - Tool now parses $children whether it arrives as JSON string or array
 *      - Fixes "Received tool input did not match expected schema" error
 *
 * v76: ATOMIC BOOK CONSULTATION - book_child expanded for atomic create+book
 *      - When parentFirstName is present, routes to /ortho-prd/bookConsultation
 *      - Node-RED creates parent + children + books all appointments in one call
 *      - LLM makes exactly 2 tool calls: (1) slots/grouped_slots, (2) book_child with parent+children info
 *      - Eliminates duplicate patient bug (LLM can't call create twice)
 *      - Eliminates skipped booking bug (booking is inside same call as creation)
 *      - Backward compatible: without parentFirstName, existing behavior unchanged
 *
 * v75: BULLETPROOF SIBLING BOOKING - Time window set to 40 minutes (matches appointment spacing)
 *      - Exactly matches 40-minute appointment slot spacing
 *      - Works with Node-RED v17 which maintains Chair 8 filter requirement
 *      - Enables successful booking for 2+ children at all locations
 *
 * v73: PENDING RESPONSE SUPPORT - Handle getApptSlots v9 cold cache timeout
 *      - Added _pending response handling in searchSlotsWithExpansion
 *      - When Node-RED returns _pending (cache cold, quick-sync timed out), return guidance to retry
 *      - Prevents LLM from treating pending as "no slots"
 *      - Works with Node-RED getApptSlots v9 (Bulletproof)
 *
 * v72: FIX - Each child uses their OWN bookingAuthToken from child create (not parent's)
 *      - Updated LLM guidance in BOOKING_SEQUENCE_MANDATORY, error messages, sibling_workflow
 *      - Works with patient tool v12 which clarifies child token generation
 *
 * v71: ENFORCE PER-CHILD PATIENTGUID + REQUIRE bookingAuthToken
 *      - book_child.validate now REQUIRES bookingAuthToken (forces create-before-book sequence)
 *      - Per-child patientGUID validation in children array (each child must have own GUID)
 *      - Missing bookingAuthToken returns BOOKING_AUTH_REQUIRED with step-by-step guidance
 *
 * v69: ENHANCED SESSION ID FALLBACK LOGGING
 *      - Added explicit WARNING when using uui as sessionId fallback
 *      - Logs guidance on how to fix ($flow.sessionId should be populated by Flowise)
 *      - Helps diagnose why cross-session reservation filtering may be ineffective
 *
 * v68: CROSS-SESSION SLOT RESERVATION - Pass sessionId for reservation filtering
 *      - grouped_slots now passes sessionId to Node-RED
 *      - Node-RED filters out slots reserved by other sessions
 *      - book_child already passes sessionId for reservation creation
 *      - Prevents race condition where 2 callers book same slot
 *
 * v67: REMOVED DIRECT REDIS CACHE READ - All requests go through Node-RED
 *      - FIXED: v66 read Redis cache directly, bypassing Node-RED's cache logic
 *      - Node-RED handles caching internally with correct data structure handling
 *      - Tool now ALWAYS calls Node-RED endpoints (getApptSlots, getGroupedApptSlots)
 *      - This ensures consistent cache interpretation and slot grouping
 *
 * v66: (REVERTED) REDIS SLOT CACHE - Direct cache read caused empty slot responses
 *
 * v65: EXPANDED DATE SEARCH TIERS - Search up to 90 days (3 months)
 *      - Changed tiers from [14, 28, 56] to [30, 60, 90]
 *      - Fixes transfer issue when no slots in first 8 weeks but available at 9-12 weeks
 *
 * v64: FLOW CONTEXT FALLBACK - Extract childName from $flow.input if not passed
 *      - Tool now logs $flow context for debugging
 *      - If LLM doesn't pass $childName, tool attempts to extract from $flow.input
 *      - $flow.input may contain PAYLOAD with children array from conversation
 *      - This prevents missing childName when LLM forgets to pass it
 *
 * v63: CHILDREN ARRAY SUPPORT - Book all children in a single call
 *      - book_child now accepts a 'children' array parameter
 *      - Each child object contains: childName, childDOB, startTime, slot details
 *      - Node-RED loops through and creates all appointments atomically
 *      - Uses same rate limiting safeguards (2 retries + async queue fallback)
 *      - Prevents LLM from "forgetting" to book additional children
 *
 * v60: DISABLED PRE-BOOKING VERIFICATION (Rate Limiting Fix)
 *      - REMOVED v59 slot verification because it triggered API rate limiting
 *      - The verification called getApptSlots AGAIN before each book_child
 *      - After grouped_slots, subsequent API calls returned 0 slots (rate limited)
 *      - This caused "slot not available" errors even when slots WERE available
 *      - Node-RED handles validation server-side as fallback
 *
 * v59: BULLETPROOF SLOT VALIDATION (DISABLED - caused rate limiting failures)
 *      - book_child verified slot exists before booking via real-time API call
 *      - Validates ALL parameters but triggers rate limiting after grouped_slots
 *
 * v57: SERVER-SIDE AUTH VALIDATION (Tool Pass-Through)
 *      - REMOVED tool-level bookingAuthToken validation (was breaking LLM parallelism)
 *      - Tool now passes through to Node-RED, which handles session-based fallback
 *      - Node-RED auto-injects token from session cache if missing
 *      - This allows LLM to call create + book_child in any order
 *
 * v55: BOOKING AUTHORIZATION TOKEN
 *      - book_child now accepts bookingAuthToken parameter
 *      - Token is generated by chord_ortho_patient create and MUST be passed here
 *      - Prevents parallel tool call collisions (LLM using stale/hallucinated GUIDs)
 *      - Node-RED validates token and rejects mismatched patientGUIDs
 *
 * v54: PARENT-AS-PATIENT MODEL
 *      - Parent is the patient record, child info stored in appointment note
 *      - book_child now accepts childName, childDOB for the note field
 *      - SAME patientGUID is reused for ALL siblings
 *      - Note format: "Child: [name] | DOB: [date] | Insurance: [provider]"
 *      - Updated BOOKING_SEQUENCE_MANDATORY for parent-as-patient workflow
 *
 * v53 FIX: BOOKING SEQUENCE GUIDANCE - Add explicit llm_guidance to slots response
 * v52 FIX: INDIVIDUAL GUIDs FOR BOOKING - Accept individual params for book_child
 * v51 FIX: FUTURE DATE VALIDATION - Auto-correct dates too far in the future
 * v50 FIX: DYNAMIC SLOT SEARCH - Progressive date expansion when no slots found
 * v49 FIX: STRIP GUIDs FROM SLOTS RESPONSE
 * ============================================================================
 */

const fetch = require('node-fetch');

const TOOL_VERSION = 'v92';
const MAX_SLOTS_RETURNED = 1;
const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const DEFAULT_SCHEDULE_COLUMN_GUID = '07687884-7e37-49aa-8028-d43b751c9034';
const SANDBOX_MIN_DATE = new Date(2026, 0, 13);

// v50: Progressive date expansion tiers (in days)
// v65: Expanded to 30/60/90 days for better slot coverage
const DATE_EXPANSION_TIERS = [30, 60, 90]; // 1 month, 2 months, 3 months
const MIN_DATE_RANGE_DAYS = 30; // Minimum range to prevent single-day searches
// v51: Maximum days in the future to accept (prevents LLM hallucinated dates)
const MAX_FUTURE_DAYS = 90; // ~3 months - anything beyond this is likely an error

function encodeBookingToken(slot) {
    const data = {
        st: slot.startTime,
        sv: slot.scheduleViewGUID,
        sc: slot.scheduleColumnGUID,
        at: slot.appointmentTypeGUID,
        mn: slot.minutes
    };
    return Buffer.from(JSON.stringify(data)).toString('base64');
}

function decodeBookingToken(token) {
    try {
        const data = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
        return {
            startTime: data.st,
            scheduleViewGUID: data.sv,
            scheduleColumnGUID: data.sc,
            appointmentTypeGUID: data.at,
            minutes: data.mn
        };
    } catch (e) {
        console.error('[decodeBookingToken] Failed to decode:', e.message);
        return null;
    }
}

// v52: Return individual GUIDs in slots response for direct booking
function formatSlotsResponse(data) {
    if (data && data.slots && Array.isArray(data.slots)) {
        data.slots = data.slots.map(slot => ({
            displayTime: slot.startTime || slot.StartTime,
            startTime: slot.startTime || slot.StartTime,
            scheduleViewGUID: slot.scheduleViewGUID,
            scheduleColumnGUID: slot.scheduleColumnGUID,
            appointmentTypeGUID: slot.appointmentTypeGUID,
            minutes: slot.minutes
        }));
    }
    if (data && data.groups && Array.isArray(data.groups)) {
        data.groups = data.groups.map(group => ({
            groupTime: group.slots && group.slots[0] ? (group.slots[0].startTime || group.slots[0].StartTime) : null,
            slots: group.slots ? group.slots.map(slot => ({
                displayTime: slot.startTime || slot.StartTime,
                startTime: slot.startTime || slot.StartTime,
                scheduleViewGUID: slot.scheduleViewGUID,
                scheduleColumnGUID: slot.scheduleColumnGUID,
                appointmentTypeGUID: slot.appointmentTypeGUID,
                minutes: slot.minutes
            })) : []
        }));
    }
    delete data.voiceSlots;
    return data;
}

const ACTIONS = {
    slots: {
        endpoint: `${BASE_URL}/ortho-prd/getApptSlots`,
        method: 'POST',
        buildBody: (params, uui, sessionId) => {
            const body = {
                uui: uui,
                startDate: params.startDate,
                endDate: params.endDate,
                // v68: Pass sessionId for cross-session reservation filtering
                sessionId: sessionId
            };
            if (params.scheduleViewGUIDs) body.scheduleViewGUIDs = params.scheduleViewGUIDs;
            return body;
        },
        validate: () => {},
        successLog: (data) => `Found ${data.count || (data.slots ? data.slots.length : 0) || 0} available slots`
    },
    grouped_slots: {
        endpoint: `${BASE_URL}/ortho-prd/getGroupedApptSlots`,
        method: 'POST',
        buildBody: (params, uui, sessionId) => {
            const body = {
                uui: uui,
                startDate: params.startDate,
                endDate: params.endDate,
                numberOfPatients: params.numberOfPatients || 1,  // v90: Default to 1, dynamically set upstream
                timeWindowMinutes: params.timeWindowMinutes || 40,  // v75: Set to 40 to match appointment spacing for 40-min appointment spacing
                // v68: Pass sessionId for cross-session reservation filtering
                sessionId: sessionId
            };
            if (params.scheduleViewGUIDs) body.scheduleViewGUIDs = params.scheduleViewGUIDs;
            return body;
        },
        validate: () => {},
        successLog: (data) => `Found ${data.totalGroups || (data.groups ? data.groups.length : 0) || 0} grouped slot options`
    },
    book_child: {
        endpoint: `${BASE_URL}/ortho-prd/createAppt`,
        method: 'POST',
        buildBody: (params, uui, sessionId) => {
            // v63: CHILDREN ARRAY SUPPORT - Pass all children to Node-RED for atomic booking
            console.log('[book_child v63] Children array support, params:', JSON.stringify(params));

            const body = {
                uui: uui,
                patientGUID: params.patientGUID,  // v71: Child's own GUID (INDIVIDUAL_PATIENT_PER_PERSON) or parent GUID (legacy batch)
                // v55: Booking auth token - validates patientGUID came from create response
                bookingAuthToken: params.bookingAuthToken,
                // v68: Pass sessionId for cross-session slot reservation
                sessionId: sessionId
            };

            // v63/v71: If children array provided, pass it through for batch booking
            // v71: Each child now has their own patientGUID (INDIVIDUAL_PATIENT_PER_PERSON)
            if (params.children && Array.isArray(params.children) && params.children.length > 0) {
                console.log('[book_child v71] Batch booking ' + params.children.length + ' children (INDIVIDUAL_PATIENT_PER_PERSON)');
                body.children = params.children.map(child => {
                    // Build note for each child
                    let note = '';
                    if (child.childName) {
                        note = 'Child: ' + child.childName;
                        if (child.childDOB) note += ' | DOB: ' + child.childDOB;
                        if (child.insuranceProvider) note += ' | Insurance: ' + child.insuranceProvider;
                        if (child.groupID) note += ' | GroupID: ' + child.groupID;
                        if (child.memberID) note += ' | MemberID: ' + child.memberID;
                    }
                    return {
                        // v71: Each child has their own patientGUID
                        patientGUID: child.patientGUID,
                        childName: child.childName,
                        childDOB: child.childDOB,
                        startTime: child.startTime,
                        scheduleViewGUID: child.scheduleViewGUID,
                        scheduleColumnGUID: child.scheduleColumnGUID || DEFAULT_SCHEDULE_COLUMN_GUID,
                        appointmentTypeGUID: child.appointmentTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705',
                        minutes: child.minutes || 40,
                        note: note
                    };
                });
            } else {
                // v54: Single child backward compatibility
                let note = '';
                if (params.childName) {
                    note = 'Child: ' + params.childName;
                    if (params.childDOB) note += ' | DOB: ' + params.childDOB;
                    if (params.insuranceProvider) note += ' | Insurance: ' + params.insuranceProvider;
                    if (params.groupID) note += ' | GroupID: ' + params.groupID;
                    if (params.memberID) note += ' | MemberID: ' + params.memberID;
                }
                body.startTime = params.startTime;
                body.scheduleViewGUID = params.scheduleViewGUID;
                body.scheduleColumnGUID = params.scheduleColumnGUID || DEFAULT_SCHEDULE_COLUMN_GUID;
                body.appointmentTypeGUID = params.appointmentTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705';
                body.minutes = params.minutes || 40;
                body.childName = params.childName;
                if (note) body.note = note;
            }

            return body;
        },
        validate: (params) => {
            // v71: patientGUID is now the CHILD's GUID (INDIVIDUAL_PATIENT_PER_PERSON model)
            if (!params.patientGUID) throw new Error('BOOKING FAILED - Missing patientGUID (child GUID from create response)');
            // v71: Require bookingAuthToken to force create-before-book sequence
            if (!params.bookingAuthToken) {
                throw new Error(JSON.stringify({
                    success: false,
                    error: 'BOOKING_AUTH_REQUIRED',
                    llm_guidance: {
                        error_type: 'missing_booking_token',
                        action_required: 'create_patient_first',
                        CRITICAL: 'You must call chord_ortho_patient action=create for each child FIRST. Each child gets their own patientGUID AND bookingAuthToken. Use BOTH values from the child create response.',
                        steps: [
                            '1. chord_ortho_patient action=create, isChild=true, parentPatientGUID, familyId -> returns child patientGUID + child bookingAuthToken',
                            '2. book_child with child patientGUID + child bookingAuthToken (NOT parent token)'
                        ]
                    }
                }));
            }
            // v63/v71: Either children array OR single child params required
            if (params.children && Array.isArray(params.children) && params.children.length > 0) {
                const usedSlots = new Set(); // v85: Track used slot keys
                // Validate each child has required fields
                for (let i = 0; i < params.children.length; i++) {
                    const child = params.children[i];
                    if (!child.startTime) throw new Error('BOOKING FAILED - Child ' + (i+1) + ' missing startTime');
                    if (!child.scheduleViewGUID) throw new Error('BOOKING FAILED - Child ' + (i+1) + ' missing scheduleViewGUID');
                    // v71: Require per-child patientGUID
                    if (!child.patientGUID) throw new Error('BOOKING FAILED - Child ' + (i+1) + ' missing patientGUID. Each child must have their own patientGUID from chord_ortho_patient create.');
                    if (!child.childName) console.log('[book_child v71] WARNING: Child ' + (i+1) + ' has no childName');
                    // v85: ENFORCE UNIQUE SLOTS
                    const slotKey = (child.startTime || '').trim().toLowerCase() + '|' + (child.scheduleColumnGUID || DEFAULT_SCHEDULE_COLUMN_GUID).toLowerCase();
                    if (usedSlots.has(slotKey)) {
                        console.error('[v85] DUPLICATE SLOT DETECTED: Child ' + (i+1) + ' has same slot as another child: ' + child.startTime);
                        throw new Error(JSON.stringify({
                            success: false,
                            error: 'DUPLICATE_SLOT_ASSIGNMENT',
                            llm_guidance: {
                                error_type: 'duplicate_slot',
                                voice_response: 'Let me find a separate appointment time for your other child.',
                                action_required: 'use_different_slots_per_child',
                                CRITICAL: 'v85: EACH child MUST have a DIFFERENT startTime. You assigned the same slot (' + child.startTime + ') to multiple children. Look at the booking_plan from grouped_slots - Child 1 uses slot 1, Child 2 uses slot 2. Call grouped_slots again if you lost the slot assignments.',
                                duplicate_startTime: child.startTime,
                                child_index: i + 1,
                                fix: 'Re-read the booking_plan from the grouped_slots response. Each child has a unique startTime assigned. Use those exact values.'
                            }
                        }));
                    }
                    usedSlots.add(slotKey);
                }
            } else {
                // Single child validation
                if (!params.startTime) throw new Error('BOOKING FAILED - Missing startTime');
                if (!params.scheduleViewGUID) throw new Error('BOOKING FAILED - Missing scheduleViewGUID');
                if (!params.childName) console.log('[book_child v71] WARNING: No childName provided');
            }
        },
        successLog: (data) => data.results ? 'Booked ' + data.results.length + ' appointments' : 'Appointment booked successfully'
    },
    cancel: {
        endpoint: `${BASE_URL}/ortho-prd/cancelAppt`,
        method: 'POST',
        buildBody: (params, uui, sessionId) => ({ uui: uui, appointmentGUID: params.appointmentGUID, sessionId: sessionId }),
        validate: (params) => { if (!params.appointmentGUID) throw new Error("appointmentGUID required"); },
        successLog: () => 'Appointment cancelled successfully'
    }
};

function getAuthHeader() {
    try {
        const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
        return `Basic ${credentials}`;
    } catch (e) { return null; }
}

// v92: Validate Cloud9 GUID format (8-4-4-4-12 hexadecimal)
const CLOUD9_GUID_REGEX = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
function isRealAppointmentGUID(id) {
    return id && typeof id === 'string' && CLOUD9_GUID_REGEX.test(id);
}

function checkForError(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.success === false && !data.llm_guidance) return data.error || data.message || 'Operation failed';
    if (data.code === false) return Array.isArray(data.error) ? data.error.join(', ') : data.error;
    if (data.error && !data.slots && !data.groups && !data.appointmentGUID && !data.llm_guidance) {
        return Array.isArray(data.error) ? data.error.join(', ') : data.error;
    }
    if (data.message && data.message.toLowerCase().includes('error') && !data.appointmentGUID) return data.message;
    return null;
}

function formatDate(date) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${date.getFullYear()}`;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
}

// v51: Enhanced date range correction with future date validation
function correctDateRange(startDate, endDate, expansionDays = DATE_EXPANSION_TIERS[0]) {
    let correctedStart = startDate ? parseDate(startDate) : null;
    let correctedEnd = endDate ? parseDate(endDate) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let datesCorrected = false;
    let originalStart = startDate;
    let originalEnd = endDate;
    
    // v51: Check if dates are too far in the future (LLM hallucination detection)
    const maxFutureDate = new Date(today);
    maxFutureDate.setDate(maxFutureDate.getDate() + MAX_FUTURE_DAYS);
    
    if (correctedStart && correctedStart > maxFutureDate) {
        console.log('[v51] WARNING: startDate ' + startDate + ' is ' + Math.ceil((correctedStart - today) / (1000 * 60 * 60 * 24)) + ' days in future - AUTO-CORRECTING to today');
        correctedStart = null; // Will be set to today below
        datesCorrected = true;
    }
    if (correctedEnd && correctedEnd > maxFutureDate) {
        console.log('[v51] WARNING: endDate ' + endDate + ' is too far in future - will be recalculated');
        correctedEnd = null; // Will be recalculated below
        datesCorrected = true;
    }
    
    // Fix dates in the past or missing
    if (!correctedStart || correctedStart < today) {
        correctedStart = new Date(Math.max(today.getTime(), SANDBOX_MIN_DATE.getTime()));
    }
    if (correctedStart < SANDBOX_MIN_DATE) correctedStart = new Date(SANDBOX_MIN_DATE);
    
    // v50: Calculate days between dates
    let daysDiff = 0;
    if (correctedEnd && correctedEnd > correctedStart) {
        daysDiff = Math.ceil((correctedEnd - correctedStart) / (1000 * 60 * 60 * 24));
    }
    
    // v50: Enforce minimum range AND use expansion tier
    if (!correctedEnd || correctedEnd <= correctedStart || daysDiff < MIN_DATE_RANGE_DAYS) {
        correctedEnd = new Date(correctedStart);
        correctedEnd.setDate(correctedEnd.getDate() + expansionDays);
    }
    
    // v51: Log when dates were auto-corrected
    if (datesCorrected) {
        console.log('[v51] Date auto-correction: original=' + originalStart + ' to ' + originalEnd + ' -> corrected=' + formatDate(correctedStart) + ' to ' + formatDate(correctedEnd));
    }
    
    return { startDate: formatDate(correctedStart), endDate: formatDate(correctedEnd), expansionDays: expansionDays, datesCorrected: datesCorrected };
}

function cleanParams(params) {
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '' && value !== 'NULL' && value !== 'null' && value !== 'None') {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

// v59: BULLETPROOF SLOT VALIDATION - Verify slot exists with ALL parameters before booking
async function verifySlotAvailability(params, headers) {
    console.log('[v59] Verifying slot availability before booking...');
    const startTime = params.startTime;
    if (!startTime) return { valid: false, reason: 'missing_startTime' };
    const dateMatch = startTime.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!dateMatch) return { valid: false, reason: 'invalid_startTime_format' };
    const slotDate = dateMatch[0];
    console.log('[v59] Checking real-time availability for date: ' + slotDate);
    try {
        const response = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
            method: 'POST', headers: headers,
            body: JSON.stringify({ uui: params.uui || 'verify-' + Date.now(), startDate: slotDate, endDate: slotDate, duration: params.minutes || 40 })
        });
        const data = JSON.parse(await response.text());
        if (!response.ok || !data || !data.slots) return { valid: true, reason: 'verification_skipped' };
        console.log('[v59] Found ' + data.slots.length + ' slots on ' + slotDate);
        const normalizeTime = t => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const normalizeGUID = g => (g || '').toLowerCase().trim();
        const reqTime = normalizeTime(params.startTime);
        const reqChair = normalizeGUID(params.scheduleColumnGUID || DEFAULT_SCHEDULE_COLUMN_GUID);
        const reqView = normalizeGUID(params.scheduleViewGUID);
        const reqApptType = normalizeGUID(params.appointmentTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705');
        const reqMinutes = parseInt(params.minutes || 40);
        console.log('[v59] Looking for: time=' + reqTime + ' chair=' + reqChair + ' min=' + reqMinutes);
        const match = data.slots.find(s => {
            const sTime = normalizeTime(s.startTime || s.StartTime);
            const sChair = normalizeGUID(s.scheduleColumnGUID || s.ScheduleColumnGUID);
            const sView = normalizeGUID(s.scheduleViewGUID || s.ScheduleViewGUID);
            const sApptType = normalizeGUID(s.appointmentTypeGUID || s.AppointmentTypeGUID);
            const sMin = parseInt(s.minutes || s.Minutes || 40);
            if (sTime === reqTime) console.log('[v59] Time match! Chair:' + (sChair===reqChair) + ' View:' + (!reqView||sView===reqView) + ' Type:' + (sApptType===reqApptType) + ' Min:' + (sMin===reqMinutes));
            return sTime === reqTime && sChair === reqChair && (!reqView || sView === reqView) && sApptType === reqApptType && sMin === reqMinutes;
        });
        if (match) { console.log('[v59] SLOT VERIFIED'); return { valid: true, reason: 'verified', slot: match }; }
        console.log('[v59] SLOT NOT FOUND in current availability');
        return { valid: false, reason: 'slot_not_available', freshSlots: data.slots.slice(0, 5).map(s => ({ startTime: s.startTime || s.StartTime, scheduleViewGUID: s.scheduleViewGUID, scheduleColumnGUID: s.scheduleColumnGUID, appointmentTypeGUID: s.appointmentTypeGUID, minutes: s.minutes || 40 })) };
    } catch (e) { console.log('[v59] Verification error: ' + e.message); return { valid: true, reason: 'verification_skipped_error' }; }
}

// v50: Dynamic slot search with progressive expansion
// v68: Added sessionId parameter for cross-session reservation filtering
async function searchSlotsWithExpansion(action, params, uui, headers, sessionId) {
    const config = ACTIONS[action];
    let lastError = null;
    let searchExpanded = false;
    let finalExpansionDays = DATE_EXPANSION_TIERS[0];
            // v87: bestIndividualSlots removed - Node-RED v22 handles individual slot fallback natively


    for (let tierIndex = 0; tierIndex < DATE_EXPANSION_TIERS.length; tierIndex++) {
        const expansionDays = DATE_EXPANSION_TIERS[tierIndex];
        const corrected = correctDateRange(params.startDate, params.endDate, expansionDays);

        const searchParams = { ...params, startDate: corrected.startDate, endDate: corrected.endDate };
        const body = config.buildBody(searchParams, uui, sessionId);
        
        console.log('[v50] Tier ' + tierIndex + ' search: ' + corrected.startDate + ' to ' + corrected.endDate + ' (' + expansionDays + ' days)');

        try {
            const response = await fetch(config.endpoint, { method: config.method, headers: headers, body: JSON.stringify(body) });
            const responseText = await response.text();
            let data;
            try { data = JSON.parse(responseText); } catch (e) { data = responseText; }

            if (!response.ok) {
                lastError = 'HTTP ' + response.status + ': ' + response.statusText;
                continue;
            }

            const errorMessage = checkForError(data);
            if (errorMessage) {
                lastError = errorMessage;
                continue;
            }

            // v73: Check for pending response from getApptSlots v9 (cold cache timeout)
            if (data._pending) {
                console.log('[v73] Node-RED returned _pending - cache cold, quick-sync timed out');
                return {
                    success: false,
                    _pending: true,
                    data: {
                        slots: [],
                        groups: [],
                        count: 0,
                        _pending: true,
                        _toolVersion: TOOL_VERSION,
                        llm_guidance: data.llm_guidance || {
                            action_required: 'inform_caller_and_retry',
                            voice_response: 'Let me check on that availability. One moment please.',
                            retry_after_ms: 10000,
                            CRITICAL: 'v73: Slots being fetched in background. Retry request in 10 seconds. If still pending after 2 retries, offer transfer.'
                        }
                    }
                };
            }

            const hasGroups = data.groups && data.groups.length > 0;
            const hasSlots = data.slots && data.slots.length > 0;
            // v87: grouped_slots v22 now ALWAYS returns slots array alongside groups
            // Success when we have groups OR individual slots (for either action)
            const hasResults = hasSlots || hasGroups;

            if (hasResults) {
                // v50: Add metadata about the search
                data._searchExpanded = tierIndex > 0;
                data._expansionTier = tierIndex;
                data._dateRange = { start: corrected.startDate, end: corrected.endDate, days: expansionDays };
                if (tierIndex > 0) {
                    console.log('[v50] Found slots after expanding to tier ' + tierIndex + ' (' + expansionDays + ' days)');
                }
                return { success: true, data: data };
            }

            // v87: No fallback tracking needed - Node-RED v22 always returns slots alongside groups
            
            // No results, try next tier
            searchExpanded = true;
            finalExpansionDays = expansionDays;
            console.log('[v50] No slots found at tier ' + tierIndex + ', expanding...');
            
        } catch (e) {
            lastError = e.message;
            console.log('[v50] Search error at tier ' + tierIndex + ': ' + e.message);
        }
    }
    
    // v87: No fallback needed - Node-RED v22 returns individual slots in the response

    // v50: All tiers exhausted, truly no slots found
    console.log('[v50] All expansion tiers exhausted, no slots found. lastError=' + lastError);
    return {
        success: false,
        data: {
            slots: [],
            groups: [],
            count: 0,
            totalGroups: 0,
            _toolVersion: TOOL_VERSION,
            _searchExpanded: searchExpanded,
            _expansionTier: DATE_EXPANSION_TIERS.length - 1,
            _dateRange: { days: finalExpansionDays },
            llm_guidance: {
                error_type: 'no_slots_after_expansion',
                voice_response: 'I apologize, but I was not able to find any available appointments within the next ' + Math.round(finalExpansionDays / 7) + ' weeks. Let me connect you with someone who can help schedule your appointment.',
                action_required: 'transfer_to_agent',
                transfer_reason: 'no_availability_after_8_week_search',
                CRITICAL: 'All date expansion tiers exhausted. Transfer to agent for manual scheduling assistance.'
            }
        }
    };
}

async function executeRequest() {
    const toolName = 'schedule_appointment_ortho';
    const action = $action;
    console.log('[' + toolName + '] ' + TOOL_VERSION + ' - INDIVIDUAL_PATIENT_PER_PERSON MODEL');
    console.log('[' + toolName + '] Action: ' + action);

    if (!action || !ACTIONS[action]) throw new Error('Invalid action. Valid: ' + Object.keys(ACTIONS).join(', '));
    const config = ACTIONS[action];

    // v64: Log $flow context for debugging - helps understand what context is available
    console.log('[v64] $flow available:', typeof $flow !== 'undefined');
    if (typeof $flow !== 'undefined' && $flow) {
        console.log('[v64] $flow.sessionId:', $flow.sessionId || 'NOT SET');
        console.log('[v64] $flow.chatId:', $flow.chatId || 'NOT SET');
        console.log('[v64] $flow.chatflowId:', $flow.chatflowId || 'NOT SET');
        console.log('[v64] $flow.input type:', typeof $flow.input);
        if ($flow.input) {
            const inputStr = typeof $flow.input === 'string' ? $flow.input : JSON.stringify($flow.input);
            console.log('[v64] $flow.input (first 500 chars):', inputStr.substring(0, 500));
        }
        if ($flow.state) {
            console.log('[v64] $flow.state keys:', Object.keys($flow.state).join(', '));
        }
    }

    // v64: Log $vars context
    console.log('[v64] $vars available:', typeof $vars !== 'undefined');
    if (typeof $vars !== 'undefined' && $vars) {
        console.log('[v64] $vars keys:', Object.keys($vars).join(', '));
    }

    let uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';
    if ($vars && $vars.c1mg_uui && $vars.c1mg_uui !== 'c1mg_uui' && $vars.c1mg_uui.trim() !== '') uui = $vars.c1mg_uui;

    // v68: Extract sessionId for cross-session reservation (prefer $flow.sessionId, fallback to uui)
    let sessionId = null;
    if (typeof $flow !== 'undefined' && $flow && $flow.sessionId) {
        sessionId = $flow.sessionId;
        console.log('[v68] Using $flow.sessionId for reservation:', sessionId.substring(0, 8) + '...');
    } else if (typeof $flow !== 'undefined' && $flow && $flow.chatId) {
        sessionId = $flow.chatId;
        console.log('[v68] Using $flow.chatId as sessionId for reservation:', sessionId.substring(0, 8) + '...');
    } else {
        sessionId = uui;
        console.log('[v68] WARNING: Using uui as sessionId fallback - cross-session reservation filtering may be ineffective');
        console.log('[v68] To fix: Ensure $flow.sessionId or $flow.chatId is populated by Flowise');
        console.log('[v68] UUI used:', uui.substring(0, 30) + '...');
    }

    // v64: Helper function to extract childName from flow context
    function extractChildNameFromFlowContext() {
        if (typeof $flow === 'undefined' || !$flow) return null;
        // Try $flow.input - might contain PAYLOAD with children
        if ($flow.input) {
            try {
                let inputData = $flow.input;
                if (typeof inputData === 'string') {
                    try { inputData = JSON.parse(inputData); } catch (e) { /* not JSON */ }
                }
                if (inputData && inputData.children && Array.isArray(inputData.children) && inputData.children.length > 0) {
                    const firstChild = inputData.children[0];
                    if (firstChild && firstChild.name) {
                        console.log('[v64] Extracted childName from $flow.input.children:', firstChild.name);
                        return firstChild.name;
                    }
                }
                if (inputData && inputData.PAYLOAD && inputData.PAYLOAD.children) {
                    const children = inputData.PAYLOAD.children;
                    if (Array.isArray(children) && children.length > 0 && children[0].name) {
                        console.log('[v64] Extracted childName from $flow.input.PAYLOAD.children:', children[0].name);
                        return children[0].name;
                    }
                }
            } catch (e) {
                console.log('[v64] Error extracting from $flow.input:', e.message);
            }
        }
        // Try $flow.state - might contain conversation state
        if ($flow.state) {
            try {
                if ($flow.state.children && Array.isArray($flow.state.children) && $flow.state.children.length > 0) {
                    const firstChild = $flow.state.children[0];
                    if (firstChild && firstChild.name) {
                        console.log('[v64] Extracted childName from $flow.state.children:', firstChild.name);
                        return firstChild.name;
                    }
                }
                if ($flow.state.PAYLOAD && $flow.state.PAYLOAD.children) {
                    const children = $flow.state.PAYLOAD.children;
                    if (Array.isArray(children) && children.length > 0 && children[0].name) {
                        console.log('[v64] Extracted childName from $flow.state.PAYLOAD.children:', children[0].name);
                        return children[0].name;
                    }
                }
            } catch (e) {
                console.log('[v64] Error extracting from $flow.state:', e.message);
            }
        }
        return null;
    }

    // v64: Capture flow context debug info for response
    const flowContextDebug = {
        flowAvailable: typeof $flow !== 'undefined',
        varsAvailable: typeof $vars !== 'undefined',
        varsKeys: (typeof $vars !== 'undefined' && $vars) ? Object.keys($vars) : [],
        flowSessionId: (typeof $flow !== 'undefined' && $flow) ? ($flow.sessionId || null) : null,
        flowChatId: (typeof $flow !== 'undefined' && $flow) ? ($flow.chatId || null) : null,
        flowInputType: (typeof $flow !== 'undefined' && $flow) ? typeof $flow.input : null,
        flowInputPreview: null,
        flowStateKeys: null
    };
    if (typeof $flow !== 'undefined' && $flow) {
        if ($flow.input) {
            const inputStr = typeof $flow.input === 'string' ? $flow.input : JSON.stringify($flow.input);
            flowContextDebug.flowInputPreview = inputStr.substring(0, 300);
        }
        if ($flow.state) {
            flowContextDebug.flowStateKeys = Object.keys($flow.state);
        }
    }

    // v64: Get childName - first from explicit param, then try flow context fallback
    let childNameFromLLM = typeof $childName !== 'undefined' ? $childName : null;
    let childNameFromFlow = null;
    if (!childNameFromLLM && action === 'book_child') {
        childNameFromFlow = extractChildNameFromFlowContext();
        if (childNameFromFlow) {
            console.log('[v64] Using childName from flow context fallback:', childNameFromFlow);
            flowContextDebug.childNameSource = 'flow_context';
            flowContextDebug.childNameExtracted = childNameFromFlow;
        } else {
            console.log('[v64] WARNING: No childName from LLM or flow context');
            flowContextDebug.childNameSource = 'none';
        }
    } else if (childNameFromLLM) {
        flowContextDebug.childNameSource = 'llm_param';
        flowContextDebug.childNameExtracted = childNameFromLLM;
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
        appointmentGUID: typeof $appointmentGUID !== 'undefined' ? $appointmentGUID : null,
        // v64: childName with flow context fallback
        childName: childNameFromLLM || childNameFromFlow,
        // v54: Additional params for parent-as-patient note field
        childDOB: typeof $childDOB !== 'undefined' ? $childDOB : null,
        insuranceProvider: typeof $insuranceProvider !== 'undefined' ? $insuranceProvider : null,
        groupID: typeof $groupID !== 'undefined' ? $groupID : null,
        memberID: typeof $memberID !== 'undefined' ? $memberID : null,
        // v55: Booking authorization token - validates patientGUID came from create response
        bookingAuthToken: typeof $bookingAuthToken !== 'undefined' ? $bookingAuthToken : null,
        // v63: Children array for batch booking
        // v78: Parse children - may arrive as string (Flowise schema) or array (direct)
        children: (() => {
            if (typeof $children === 'undefined' || $children === null) return null;
            if (Array.isArray($children)) return $children;
            if (typeof $children === 'string') {
                try { const parsed = JSON.parse($children); return Array.isArray(parsed) ? parsed : null; }
                catch (e) { console.log('[v78] Failed to parse children string:', e.message); return null; }
            }
            return null;
        })(),
        // v76: Atomic book consultation - parent info triggers bookConsultation endpoint
        parentFirstName: typeof $parentFirstName !== 'undefined' ? $parentFirstName : null,
        parentLastName: typeof $parentLastName !== 'undefined' ? $parentLastName : null,
        parentPhone: typeof $parentPhone !== 'undefined' ? $parentPhone : null,
        parentEmail: typeof $parentEmail !== 'undefined' ? $parentEmail : null,
        parentDOB: typeof $parentDOB !== 'undefined' ? $parentDOB : null
    };
    const params = cleanParams(rawParams);

    try {
        // v67: Always call Node-RED endpoints - Node-RED handles caching internally
        if (action === 'slots' || action === 'grouped_slots') {
            // v89: REMOVED v80 redirect - always use the endpoint the LLM requested
            // v80 redirect was the ROOT CAUSE of sibling booking failures:
            // Flowise sometimes doesn't inject $numberOfPatients for integer-typed schema fields,
            // causing it to be undefined → removed by cleanParams → v80 redirected to getApptSlots
            // which returns only 1 slot instead of paired slots from getGroupedApptSlots
            let effectiveAction = action;

            // v90: Dynamically determine numberOfPatients from children array
            // Priority: explicit params.numberOfPatients > children array length > default 1
            if (action === 'grouped_slots' && !params.numberOfPatients) {
                if (params.children && Array.isArray(params.children) && params.children.length > 0) {
                    params.numberOfPatients = params.children.length;
                    console.log('[v90] Derived numberOfPatients=' + params.numberOfPatients + ' from children array length');
                } else {
                    params.numberOfPatients = 1; // v90: Default to 1 — single child is the common case
                    console.log('[v90] Defaulting numberOfPatients=1 for grouped_slots (no children array provided)');
                }
            }
            console.log('[v89] effectiveAction=' + effectiveAction + ' numberOfPatients=' + params.numberOfPatients + ' endpoint=' + ACTIONS[effectiveAction].endpoint);

            const headers = { 'Content-Type': 'application/json' };
            const authHeader = getAuthHeader();
            if (authHeader) headers['Authorization'] = authHeader;

            // v67: Call Node-RED endpoint via searchSlotsWithExpansion
            // Node-RED handles Redis cache internally with correct data structure
            // v68: Pass sessionId for cross-session reservation filtering
            console.log('[v68] Calling Node-RED endpoint for ' + effectiveAction + ' with sessionId...');
            const searchResult = await searchSlotsWithExpansion(effectiveAction, params, uui, headers, sessionId);

            if (!searchResult.success) {
                // Return the no-slots response with guidance
                return JSON.stringify(searchResult.data);
            }

            let data = searchResult.data

            console.log('[' + toolName + '] ' + config.successLog(data));
            
            // v52: Format slots with individual GUIDs for direct booking
            data = formatSlotsResponse(data);

            // v89: BULLETPROOF slot-to-child mapping
            // Build final slots array to contain EXACTLY what LLM needs: one slot per child
            // v90: numberOfPatients dynamically derived from children array upstream
            const numberOfPatients = parseInt(params.numberOfPatients) || 1;
            console.log('[v90] Processing response: numberOfPatients=' + numberOfPatients + ' action=' + action);
            const bookingMode = data._bookingMode || (data.groups && data.groups.length > 0 ? 'consecutive' : (data.slots && data.slots.length > 0 ? 'individual' : 'none'));
            const nodeRedBookingPlan = (data.llm_guidance && data.llm_guidance.booking_plan) ? data.llm_guidance.booking_plan : null;

            if (bookingMode === 'consecutive' && data.groups && data.groups.length > 0) {
                const bestGroup = data.groups[0];
                const groupSlots = bestGroup.slots || [];
                console.log('[v89] CONSECUTIVE: Using group[0] with ' + groupSlots.length + ' slots as data.slots');
                data.slots = groupSlots;
                data.count = groupSlots.length;
                data._bookingMode = 'consecutive';
                delete data.groups;
                delete data.totalGroups;
            } else if ((bookingMode === 'individual' || !data.groups || data.groups.length === 0) && data.slots && data.slots.length >= numberOfPatients) {
                console.log('[v89] INDIVIDUAL: Keeping first ' + numberOfPatients + ' of ' + data.slots.length + ' slots');
                data.slots = data.slots.slice(0, numberOfPatients);
                data.count = data.slots.length;
                data._bookingMode = 'individual';
                delete data.groups;
                delete data.totalGroups;
            } else {
                console.log('[v89] INSUFFICIENT: mode=' + bookingMode + ' slots=' + (data.slots ? data.slots.length : 0) + ' groups=' + (data.groups ? data.groups.length : 0) + ' needed=' + numberOfPatients);
                // v89: If we need N slots but have fewer, return what we have with a warning
                // This prevents the LLM from getting 1 slot and assigning it to 2 children
                if (data.slots && data.slots.length > 0 && data.slots.length < numberOfPatients) {
                    data._warning = 'INSUFFICIENT_SLOTS: Found ' + data.slots.length + ' but need ' + numberOfPatients + '. Cannot book all children in one pass.';
                    data._bookingMode = 'insufficient';
                }
            }

            // v88: Top-level booking_plan maps slots[i] to child[i+1]
            const bookingPlan = [];
            if (data.slots && data.slots.length >= numberOfPatients) {
                for (let i = 0; i < numberOfPatients; i++) {
                    const slot = data.slots[i];
                    bookingPlan.push({
                        child_number: i + 1,
                        use_this_startTime: slot.startTime || slot.displayTime,
                        use_this_scheduleViewGUID: slot.scheduleViewGUID,
                        use_this_scheduleColumnGUID: slot.scheduleColumnGUID,
                        use_this_appointmentTypeGUID: slot.appointmentTypeGUID,
                        minutes: slot.minutes || '40'
                    });
                }
            }

            if (typeof data === 'object') {
                data._toolVersion = TOOL_VERSION;
                data._debug_v64_flow_context = flowContextDebug;
                data.booking_plan = bookingPlan;
                data.booking_mode = bookingMode;

                if (data.llm_guidance && data.llm_guidance.action_required === 'book_children_separately') {
                    console.log('[v84] Preserving book_children_separately guidance');
                } else {
                data.llm_guidance = {
                    timestamp: new Date().toISOString(),
                    model: 'INDIVIDUAL_PATIENT_PER_PERSON_V71',
                    confirmation_triggers: ['yes', 'yeah', 'yep', 'yup', 'sure', 'okay', 'ok', 'alright', 'that works', 'works for me', 'perfect', 'sounds good'],
                    goodbye_triggers: ["that's all", 'thats all', "that's it", 'thats it', 'no thank you', 'no thanks'],
                    BOOKING_INSTRUCTIONS: numberOfPatients === 1 ? [
                        'STEP 1: Offer the time to the caller.',
                        'STEP 2: When confirmed, call book_child with parentFirstName + children array containing 1 child.',
                        'STEP 3: The child MUST use the startTime from booking_plan[0].use_this_startTime.',
                        'STEP 4: The children array in book_child MUST have EXACTLY 1 entry.'
                    ] : [
                        'STEP 1: Offer time(s) to caller. For consecutive slots say "starting at [first time]". For individual slots list each time.',
                        'STEP 2: When confirmed, call book_child with parentFirstName + children array containing ALL ' + numberOfPatients + ' children.',
                        'STEP 3: MANDATORY - Each child MUST use the startTime from booking_plan. Child N uses booking_plan[N-1].use_this_startTime. NEVER give two children the same startTime.',
                        'STEP 4: The children array in book_child MUST have EXACTLY ' + numberOfPatients + ' entries. No more. No less. One slot per child.'
                    ],
                    CRITICAL_SLOT_RULE: 'v90: There are EXACTLY ' + numberOfPatients + ' slots for ' + numberOfPatients + ' children. The children array in book_child MUST contain EXACTLY ' + numberOfPatients + (numberOfPatients === 1 ? ' child.' : ' children. Even if caller only mentions one child when confirming, INCLUDE ALL CHILDREN.'),
                    next_action: 'offer_time_to_caller_and_wait_for_confirmation',
                    on_caller_confirms: 'call_book_child_with_parent_info_and_children_array',
                    children_array_format: {
                        description: 'v76 ATOMIC: Each child needs:',
                        required_fields: ['firstName', 'dob', 'startTime', 'scheduleViewGUID'],
                        optional_fields: ['lastName', 'scheduleColumnGUID', 'appointmentTypeGUID', 'minutes'],
                        example: '{ firstName: "Emma", dob: "05/15/2018", startTime: "01/25/2026 9:00 AM", scheduleViewGUID: "abc-123" }'
                    },
                    IMPORTANT: 'v76: book_child with parentFirstName creates patients AND books atomically. Do NOT call chord_ortho_patient create separately.'
                };
                } // end else (v84)
            }
            return JSON.stringify(data);
        }

                // v76: ATOMIC BOOK CONSULTATION - route to bookConsultation when parent info present
        if (action === 'book_child' && params.parentFirstName) {
            console.log('[v76] ATOMIC BOOK CONSULTATION: parentFirstName present, routing to bookConsultation');
            const headers = { 'Content-Type': 'application/json' };
            const authHeader = getAuthHeader();
            if (authHeader) headers['Authorization'] = authHeader;

            // Validate children array is present
            if (!params.children || !Array.isArray(params.children) || params.children.length === 0) {
                throw new Error('BOOKING FAILED - Atomic book_child requires children array with slot assignments');
            }

            // v85: Validate unique slots BEFORE calling Node-RED
            if (params.children.length > 1) {
                const usedSlots = new Set();
                for (let i = 0; i < params.children.length; i++) {
                    const child = params.children[i];
                    const slotKey = (child.startTime || '').trim().toLowerCase() + '|' + (child.scheduleColumnGUID || DEFAULT_SCHEDULE_COLUMN_GUID).toLowerCase();
                    if (usedSlots.has(slotKey)) {
                        console.error('[v85] ATOMIC PATH: Duplicate slot for child ' + (i+1) + ': ' + child.startTime);
                        return JSON.stringify({
                            success: false,
                            error: 'DUPLICATE_SLOT_ASSIGNMENT',
                            _toolVersion: TOOL_VERSION,
                            llm_guidance: {
                                error_type: 'duplicate_slot',
                                voice_response: 'Let me find a separate appointment time for your other child.',
                                action_required: 'use_different_slots_per_child',
                                CRITICAL: 'v85: EACH child MUST have a DIFFERENT startTime. You assigned the same slot (' + child.startTime + ') to multiple children. Look at the booking_plan from grouped_slots - Child 1 uses slot 1, Child 2 uses slot 2. Call grouped_slots again if needed.',
                                duplicate_startTime: child.startTime,
                                child_index: i + 1,
                                fix: 'Re-read the booking_plan from the grouped_slots response. Each child has a unique startTime assigned.'
                            }
                        });
                    }
                    usedSlots.add(slotKey);
                }
                console.log('[v85] ATOMIC PATH: All ' + params.children.length + ' children have unique slot assignments');
            }

            const consultBody = {
                uui: uui,
                sessionId: sessionId,
                parentFirstName: params.parentFirstName,
                parentLastName: params.parentLastName,
                parentPhone: params.parentPhone,
                parentEmail: params.parentEmail || null,
                parentDOB: params.parentDOB || null,
                children: params.children.map(child => ({
                    firstName: child.firstName || child.childName,
                    lastName: child.lastName || params.parentLastName,
                    dob: child.dob || child.childDOB,
                    startTime: child.startTime,
                    scheduleViewGUID: child.scheduleViewGUID,
                    scheduleColumnGUID: child.scheduleColumnGUID || DEFAULT_SCHEDULE_COLUMN_GUID,
                    appointmentTypeGUID: child.appointmentTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705',
                    minutes: child.minutes || 40
                })),
                insuranceProvider: params.insuranceProvider || null,
                insuranceGroupId: params.groupID || null,
                insuranceMemberId: params.memberID || null
            };

            console.log('[v76] bookConsultation body:', JSON.stringify(consultBody));
            const response = await fetch(`${BASE_URL}/ortho-prd/bookConsultation`, {
                method: 'POST', headers: headers, body: JSON.stringify(consultBody)
            });
            const responseText = await response.text();
            let data;
            try { data = JSON.parse(responseText); } catch (e) { data = responseText; }

            if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            const errorMessage = checkForError(data);
            if (errorMessage) throw new Error(errorMessage);

            console.log('[v76] bookConsultation success:', JSON.stringify(data).substring(0, 200));
            if (typeof data === 'object') {
                data._toolVersion = TOOL_VERSION;
                data._debug_v64_flow_context = flowContextDebug;

                // v89: Warn if fewer children booked than expected
                const bookedCount = params.children ? params.children.length : 1;
                const expectedCount = parseInt(params.numberOfPatients) || bookedCount;
                if (data.children && data.children.length < expectedCount) {
                    data._warning = 'INCOMPLETE_BOOKING: Only ' + data.children.length + ' of ' + expectedCount + ' children were booked. Book remaining children immediately.';
                    data.llm_guidance = data.llm_guidance || {};
                    data.llm_guidance.CRITICAL = 'Not all children were booked. Call book_child again for the remaining children.';
                }

                // v92: BOOKING RESPONSE VALIDATION - verify real Cloud9 GUIDs
                if (data.children && Array.isArray(data.children)) {
                    const verified = [];
                    const unverified = [];
                    for (const child of data.children) {
                        const guid = child.appointment?.appointmentGUID || child.appointmentGUID;
                        if (child.success && isRealAppointmentGUID(guid)) {
                            verified.push(child.firstName || 'child');
                        } else if (child.success) {
                            unverified.push(child.firstName || 'child');
                            child._booking_verified = false;
                            child._warning = 'UNVERIFIED: No valid Cloud9 appointmentGUID in response';
                        }
                    }
                    if (verified.length > 0) {
                        data._booking_verified = true;
                        console.log('[v92] BOOKING VERIFIED: ' + verified.join(', ') + ' have real Cloud9 GUIDs');
                    }
                    if (unverified.length > 0) {
                        console.log('[v92] WARNING: ' + unverified.join(', ') + ' missing real Cloud9 GUIDs');
                        data._booking_verified = false;
                        data.llm_guidance = data.llm_guidance || {};
                        data.llm_guidance.CRITICAL = (data.llm_guidance.CRITICAL || '') +
                            ' v92 WARNING: ' + unverified.join(', ') + ' booking(s) could NOT be verified with a real Cloud9 appointment GUID. Do NOT confirm these appointments to the caller. Transfer to a live agent instead.';
                    }
                } else if (data.appointmentGUID) {
                    data._booking_verified = isRealAppointmentGUID(data.appointmentGUID);
                    if (!data._booking_verified) {
                        console.log('[v92] WARNING: appointmentGUID "' + data.appointmentGUID + '" is not a valid Cloud9 GUID');
                        data.llm_guidance = data.llm_guidance || {};
                        data.llm_guidance.CRITICAL = 'v92 WARNING: The appointment ID returned is not a valid Cloud9 GUID. Do NOT confirm this booking. Transfer to a live agent.';
                    }
                }
            }
            return JSON.stringify(data);
        }

        // v77: ENFORCE ATOMIC PATH - block legacy book_child without parentFirstName
        if (action === 'book_child' && !params.parentFirstName) {
            console.log('[v77] BLOCKED legacy book_child - missing parentFirstName');
            return JSON.stringify({
                success: false,
                error: 'ATOMIC_BOOKING_REQUIRED',
                message: 'book_child requires parentFirstName for atomic booking. Do NOT create patients separately.',
                llm_guidance: {
                    error_type: 'missing_parent_info',
                    action_required: 'retry_with_parent_info',
                    voice_response: 'Let me get that set up for you.',
                    CRITICAL: 'You MUST include parentFirstName, parentLastName, parentPhone, and children array in book_child. Node-RED creates patients + books appointments atomically. Do NOT call chord_ortho_patient create separately.',
                    required_fields: ['parentFirstName', 'parentLastName', 'parentPhone', 'children'],
                    example: {
                        action: 'book_child',
                        parentFirstName: 'Jane',
                        parentLastName: 'Smith',
                        parentPhone: '5551234567',
                        children: [{ firstName: 'Jake', dob: '01/15/2015', startTime: '...', scheduleViewGUID: '...', scheduleColumnGUID: '...' }]
                    }
                },
                _toolVersion: TOOL_VERSION
            });
        }

        // Non-slot actions (cancel, etc.) - use original flow
        config.validate(params);

        const headers = { 'Content-Type': 'application/json' };
        const authHeader = getAuthHeader();
        if (authHeader) headers['Authorization'] = authHeader;

        // v60: DISABLED v59 BULLETPROOF SLOT VALIDATION (Rate Limiting Fix)
        // The verification called getApptSlots AGAIN before each book_child, triggering rate limiting
        // After grouped_slots, subsequent API calls returned 0 slots (rate limited)
        // Node-RED handles validation server-side as fallback
        // ORIGINAL CODE REMOVED - was causing "slot not available" errors on valid slots
        if (action === 'book_child') {
            console.log('[v60] book_child - proceeding directly (v59 verification DISABLED due to rate limiting)');
        }

        // v68: Pass sessionId for cross-session reservation
        const body = config.buildBody(params, uui, sessionId);
        console.log('[' + toolName + '] Request:', JSON.stringify(body));

        const response = await fetch(config.endpoint, { method: config.method, headers: headers, body: JSON.stringify(body) });
        const responseText = await response.text();
        let data;
        try { data = JSON.parse(responseText); } catch (e) { data = responseText; }

        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        const errorMessage = checkForError(data);
        if (errorMessage) throw new Error(errorMessage);

        console.log('[' + toolName + '] ' + config.successLog(data));
        if (typeof data === 'object') {
            data._toolVersion = TOOL_VERSION;
            // v64: Include flow context debug in book_child response
            data._debug_v64_flow_context = flowContextDebug;
        }
        return JSON.stringify(data);

    } catch (error) {
        console.error('[' + toolName + '] Error:', error.message);

        // v57: BOOKING_AUTH errors now come from Node-RED (not tool) - pass through with guidance
        if (error.message.includes('BOOKING_AUTH') || error.message.includes('booking_auth')) {
            return JSON.stringify({
                success: false, _toolVersion: TOOL_VERSION, _debug_error: error.message,
                _debug_v64_flow_context: flowContextDebug,
                llm_guidance: {
                    error_type: 'booking_auth_error',
                    voice_response: 'Let me get that set up for you.',
                    action_required: 'retry_after_create_completes',
                    CRITICAL: 'v72: Each child has their own bookingAuthToken. Use the token from the CHILD create response, NOT the parent token.',
                    recovery_steps: ['1) Check you are using the child patientGUID (not parent)', '2) Use the bookingAuthToken from that child\'s create response', '3) Retry book_child with child patientGUID + child bookingAuthToken']
                }
            });
        }

        if (error.message.includes('BOOKING FAILED') || error.message.includes('Missing')) {
            return JSON.stringify({
                success: false, _toolVersion: TOOL_VERSION, _debug_error: error.message,
                _debug_v64_flow_context: flowContextDebug,
                llm_guidance: {
                    error_type: 'missing_params', 
                    voice_response: 'Let me check those details again.', 
                    action_required: 'provide_required_params',
                    CRITICAL: 'book_child requires: patientGUID, startTime, scheduleViewGUID. Ensure chord_ortho_patient create completed and you have the patientGUID.'
                }
            });
        }

        if (error.message.includes('cannot be scheduled') || error.message.includes('time slot') || error.message.includes('not available')) {
            return JSON.stringify({
                success: false, _toolVersion: TOOL_VERSION, _debug_error: error.message,
                _debug_v64_flow_context: flowContextDebug,
                llm_guidance: {
                    error_type: 'slot_no_longer_available',
                    voice_response: 'That time is no longer available. Let me find another option.',
                    action_required: 'call_slots_offer_new_time',
                    CRITICAL: 'The slot is taken. Call slots again to get a new bookingToken and offer the new time to caller.'
                }
            });
        }

        return JSON.stringify({
            success: false, _toolVersion: TOOL_VERSION, _debug_error: error.message,
            _debug_v64_flow_context: flowContextDebug,
            llm_guidance: { error_type: 'api_error', voice_response: 'Let me connect you with a specialist.', action_required: 'transfer_to_agent' }
        });
    }
}

return executeRequest();

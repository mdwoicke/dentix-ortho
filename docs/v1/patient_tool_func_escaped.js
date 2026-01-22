/**
 * ============================================================================
 * CHORD DSO PATIENT - Unified Patient & Clinic Tool (Node Red Version)
 * Version: v9 | Updated: 2026-01-18
 * ============================================================================
 * Consolidates: lookup, get, create, appointments, clinic_info, edit_insurance, confirm_appointment
 *
 * This version calls Node Red endpoints instead of Cloud9 directly.
 * All Cloud9 XML/SOAP logic is handled by Node Red.
 *
 * v9: BOOKING AUTHORIZATION TOKEN
 *     - Returns bookingAuthToken on successful patient creation
 *     - Token MUST be passed to book_child to prevent parallel tool call collisions
 *     - Token validates that the patientGUID matches what was just created
 *     - Prevents LLM from using stale/hallucinated GUIDs in sibling booking
 *
 * v8: PARENT-AS-PATIENT MODEL
 *     - Parent/guardian is the patient record (NOT each child)
 *     - Use PARENT's firstName, lastName, phone, email
 *     - birthdayDateTime is now OPTIONAL (parent's DOB if available)
 *     - ONE patientGUID per family - REUSE for all children's appointments
 *     - Child info (name, DOB) goes in the NOTE field of each appointment
 *     - Removed children array rejection (deprecated sibling-per-child approach)
 *
 * v7: SIBLING BOOKING FIX (DEPRECATED - see v8)
 * v6: Updated field descriptions in schema to clarify CHILD's info, not parent
 * v5: API CALL TRACING - Add _debug_calls array to track all HTTP calls
 * v4: General improvements
 * v3: Fixed clinic_info to use DEFAULT_LOCATION_GUID
 * v2: Added default locationGUID and providerGUID with GUID validation
 * ============================================================================
 */

const fetch = require('node-fetch');

const TOOL_VERSION = 'v9';

// v5: API Call Tracking for debugging - enables Call Flow Navigator visualization
const _debug_calls = [];

/**
 * Tracked fetch wrapper that records all HTTP calls for debugging
 * Captures: endpoint, method, request body, response, timing, status
 */
async function trackedFetch(url, options = {{}}) {{
    const startTime = Date.now();
    const callId = _debug_calls.length + 1;
    const callInfo = {{
        id: callId,
        layer: url.includes('cloud9') || url.includes('GetData.ashx') ? 'L1_Cloud9' : 'L2_NodeRED',
        endpoint: url,
        method: options.method || 'GET',
        requestBody: options.body ? (() => {{ try {{ return JSON.parse(options.body); }} catch(e) {{ return options.body; }} }})() : null,
        startTime: new Date().toISOString(),
        durationMs: null,
        status: null,
        response: null,
        error: null
    }};

    try {{
        const response = await fetch(url, options);
        const responseText = await response.text();
        let responseData;
        try {{ responseData = JSON.parse(responseText); }} catch (e) {{ responseData = responseText; }}

        callInfo.durationMs = Date.now() - startTime;
        callInfo.status = response.status;
        // v8 FIX: Store deep copy to prevent circular JSON reference
        // (responseData._debug_calls would point back to responseData otherwise)
        callInfo.response = JSON.parse(JSON.stringify(responseData));
        callInfo.success = response.ok;

        _debug_calls.push(callInfo);
        console.log('[v7 TRACE] Call #' + callId + ' to ' + callInfo.layer + ': ' + url + ' -> ' + response.status + ' (' + callInfo.durationMs + 'ms)');

        // Return a mock response object that mimics fetch response
        return {{
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            text: async () => responseText,
            json: async () => responseData
        }};
    }} catch (error) {{
        callInfo.durationMs = Date.now() - startTime;
        callInfo.error = error.message;
        callInfo.success = false;
        _debug_calls.push(callInfo);
        console.log('[v7 TRACE] Call #' + callId + ' FAILED: ' + error.message);
        throw error;
    }}
}}

// ============================================================================
// 🔧 DEFAULT GUIDS - Production values for CDH Allegheny
// ============================================================================

const DEFAULT_LOCATION_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b';  // CDH - Allegheny 202 (PROD)
const DEFAULT_PROVIDER_GUID = 'a79ec244-9503-44b2-87e4-5920b6e60392';  // Default Orthodontist

function isValidGUID(value) {{
    if (!value || typeof value !== 'string') return false;
    return /^[a-f0-9]{{8}}-[a-f0-9]{{4}}-[a-f0-9]{{4}}-[a-f0-9]{{4}}-[a-f0-9]{{12}}$/i.test(value);
}}

// ============================================================================
// 📝 ACTION CONFIGURATIONS - Node Red Endpoints
// ============================================================================

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

const ACTIONS = {{
    lookup: {{
        endpoint: `${{BASE_URL}}/ortho-prd/getPatientByFilter`,
        method: 'POST',
        buildBody: (params, uui) => ({{
            uui: uui,
            phoneNumber: params.phoneNumber,
            filter: params.filter,
            locationGUID: params.locationGUID
        }}),
        validate: (params) => {{
            if (!params.phoneNumber && !params.filter) {{
                throw new Error("phoneNumber or filter is required for 'lookup' action");
            }}
        }},
        successLog: 'Patient lookup completed'
    }},
    get: {{
        endpoint: `${{BASE_URL}}/ortho-prd/getPatient`,
        method: 'POST',
        buildBody: (params, uui) => ({{
            uui: uui,
            patientGUID: params.patientGUID
        }}),
        validate: (params) => {{
            if (!params.patientGUID) {{
                throw new Error("patientGUID is required for 'get' action");
            }}
        }},
        successLog: 'Patient retrieved successfully'
    }},
    create: {{
        endpoint: `${{BASE_URL}}/ortho-prd/createPatient`,
        method: 'POST',
        buildBody: (params, uui) => ({{
            uui: uui,
            patientFirstName: params.patientFirstName,
            patientLastName: params.patientLastName,
            birthdayDateTime: params.birthdayDateTime,
            phoneNumber: params.phoneNumber,
            emailAddress: params.emailAddress,
            gender: params.gender,
            providerGUID: isValidGUID(params.providerGUID) ? params.providerGUID : DEFAULT_PROVIDER_GUID,
            locationGUID: isValidGUID(params.locationGUID) ? params.locationGUID : DEFAULT_LOCATION_GUID
        }}),
        validate: (params) => {{
            // v8: PARENT-AS-PATIENT MODEL - parent is the patient, child info in appointment note
            // birthdayDateTime is now OPTIONAL (parent's DOB if available)
            if (!params.patientFirstName) throw new Error("patientFirstName (PARENT's first name) is required for 'create' action");
            if (!params.patientLastName) throw new Error("patientLastName (PARENT's last name) is required for 'create' action");
            // Note: birthdayDateTime is now OPTIONAL - child DOB goes in appointment note
        }},
        successLog: 'Patient created successfully'
    }},
    appointments: {{
        endpoint: `${{BASE_URL}}/ortho-prd/getPatientAppts`,
        method: 'POST',
        buildBody: (params, uui) => ({{
            uui: uui,
            patientGUID: params.patientGUID
        }}),
        validate: (params) => {{
            if (!params.patientGUID) {{
                throw new Error("patientGUID is required for 'appointments' action");
            }}
        }},
        successLog: 'Patient appointments retrieved'
    }},
    clinic_info: {{
        endpoint: `${{BASE_URL}}/ortho-prd/getLocation`,
        method: 'POST',
        buildBody: (params, uui) => ({{
            uui: uui,
            // v3: Use default if no valid locationGUID provided - prevents returning all locations
            locationGUID: isValidGUID(params.locationGUID) ? params.locationGUID : DEFAULT_LOCATION_GUID
        }}),
        validate: () => {{}},
        successLog: 'Clinic info retrieved'
    }},
    edit_insurance: {{
        endpoint: `${{BASE_URL}}/ortho-prd/editInsurance`,
        method: 'POST',
        buildBody: (params, uui) => ({{
            uui: uui,
            patientGUID: params.patientGUID,
            insuranceProvider: params.insuranceProvider,
            insuranceGroupId: params.insuranceGroupId,
            insuranceMemberId: params.insuranceMemberId
        }}),
        validate: (params) => {{
            if (!params.patientGUID) {{
                throw new Error("patientGUID is required for 'edit_insurance' action");
            }}
        }},
        successLog: 'Patient insurance updated successfully'
    }},
    confirm_appointment: {{
        endpoint: `${{BASE_URL}}/ortho-prd/confirmAppt`,
        method: 'POST',
        buildBody: (params, uui) => ({{
            uui: uui,
            appointmentId: params.appointmentId
        }}),
        validate: (params) => {{
            if (!params.appointmentId) {{
                throw new Error("appointmentId is required for 'confirm_appointment' action");
            }}
        }},
        successLog: 'Appointment confirmed successfully'
    }}
}};

// ============================================================================
// 🔐 AUTHENTICATION
// ============================================================================

function getAuthHeader() {{
    try {{
        const username = "workflowapi";
        const password = "e^@V95&6sAJReTsb5!iq39mIC4HYIV";
        if (username && password) {{
            const credentials = Buffer.from(`${{username}}:${{password}}`).toString('base64');
            return `Basic ${{credentials}}`;
        }}
    }} catch (e) {{
        return null;
    }}
    return null;
}}

// ============================================================================
// 🔍 ERROR DETECTION HELPER
// ============================================================================

function checkForError(data) {{
    if (!data || typeof data !== 'object') return null;

    // Pattern 1: {{ success: false, error: "..." }}
    if (data.success === false) {{
        return data.error || data.message || 'Operation failed';
    }}

    // Pattern 2: {{ code: false, error: [...] }}
    if (data.code === false) {{
        if (Array.isArray(data.error)) {{
            return data.error.join(', ');
        }}
        return data.error || data.message || 'API returned error';
    }}

    // Pattern 3: {{ error: "..." }} without success/code field
    if (data.error && !data.data && !data.patient && !data.patients && !data.appointments && !data.location && !data.locations) {{
        if (Array.isArray(data.error)) {{
            return data.error.join(', ');
        }}
        return data.error;
    }}

    return null;
}}

// ============================================================================
// 🔧 PARAMETER CLEANER
// ============================================================================

function cleanParams(params) {{
    const cleaned = {{}};
    for (const [key, value] of Object.entries(params)) {{
        if (value !== null && value !== undefined && value !== '' &&
            value !== 'NULL' && value !== 'null' && value !== 'None' &&
            value !== 'none' && value !== 'N/A' && value !== 'n/a') {{
            cleaned[key] = value;
        }}
    }}
    return cleaned;
}}

// ============================================================================
// 🚀 HTTP REQUEST ENGINE
// ============================================================================

async function executeRequest() {{
    const toolName = 'chord_ortho_patient';
    const action = $action;
    const timeout = 60000; // 60 seconds for phone lookups which may check many patients

    console.log(`[${{toolName}}] Action: ${{action}}`);

    // Validate action
    if (!action || !ACTIONS[action]) {{
        const validActions = Object.keys(ACTIONS).join(', ');
        throw new Error(`Invalid action '${{action}}'. Valid actions: ${{validActions}}`);
    }}

    const config = ACTIONS[action];

    // Get UUI with fallback
    let uui;
    if (!$vars || !$vars.c1mg_uui || $vars.c1mg_uui === 'c1mg_uui' || (typeof $vars.c1mg_uui === 'string' && $vars.c1mg_uui.trim() === '')) {{
        uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';
    }} else {{
        uui = $vars.c1mg_uui;
    }}

    // Build params object from Flowise variables
    // v7: Added children capture to detect invalid sibling booking pattern
    const rawParams = {{
        phoneNumber: typeof $phoneNumber !== 'undefined' ? $phoneNumber : null,
        filter: typeof $filter !== 'undefined' ? $filter : null,
        patientGUID: typeof $patientGUID !== 'undefined' ? $patientGUID : null,
        patientFirstName: typeof $patientFirstName !== 'undefined' ? $patientFirstName : null,
        patientLastName: typeof $patientLastName !== 'undefined' ? $patientLastName : null,
        birthdayDateTime: typeof $birthdayDateTime !== 'undefined' ? $birthdayDateTime : null,
        gender: typeof $gender !== 'undefined' ? $gender : null,
        emailAddress: typeof $emailAddress !== 'undefined' ? $emailAddress : null,
        providerGUID: typeof $providerGUID !== 'undefined' ? $providerGUID : null,
        locationGUID: typeof $locationGUID !== 'undefined' ? $locationGUID : null,
        insuranceProvider: typeof $insuranceProvider !== 'undefined' ? $insuranceProvider : null,
        insuranceGroupId: typeof $insuranceGroupId !== 'undefined' ? $insuranceGroupId : null,
        insuranceMemberId: typeof $insuranceMemberId !== 'undefined' ? $insuranceMemberId : null,
        appointmentId: typeof $appointmentId !== 'undefined' ? $appointmentId : null,
        children: typeof $children !== 'undefined' ? $children : null
    }};
    const params = cleanParams(rawParams);

    try {{
        // Validate required params for this action
        config.validate(params);

        const body = config.buildBody(params, uui);
        console.log(`[${{toolName}}] Endpoint: ${{config.method}} ${{config.endpoint}}`);
        console.log(`[${{toolName}}] Request Body:`, JSON.stringify(body, null, 2));

        const headers = {{
            'Content-Type': 'application/json'
        }};

        const authHeader = getAuthHeader();
        if (authHeader) {{
            headers['Authorization'] = authHeader;
        }}

        const options = {{
            method: config.method,
            headers: headers,
            body: JSON.stringify(body)
        }};

        // Add timeout
        let timeoutId;
        if (typeof AbortController !== 'undefined') {{
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), timeout);
            options.signal = controller.signal;
        }}

        console.log(`[${{toolName}}] Making request to Node Red...`);
        const response = await trackedFetch(config.endpoint, options);

        if (timeoutId) clearTimeout(timeoutId);

        console.log(`[${{toolName}}] Response Status: ${{response.status}} ${{response.statusText}}`);

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {{
            data = await response.json();
        }} else {{
            data = await response.text();
        }}

        // Check HTTP status
        if (!response.ok) {{
            console.error(`[${{toolName}}] HTTP Error ${{response.status}}:`, data);
            let errorMsg = `HTTP ${{response.status}}: ${{response.statusText}}`;
            if (data) {{
                const bodyError = checkForError(typeof data === 'string' ? (() => {{ try {{ return JSON.parse(data); }} catch(e) {{ return data; }} }})() : data);
                if (bodyError) errorMsg = bodyError;
            }}
            throw new Error(errorMsg);
        }}

        // Parse response if string
        let responseData = data;
        if (typeof data === 'string') {{
            try {{ responseData = JSON.parse(data); }} catch (e) {{ responseData = data; }}
        }}

        // Check for error patterns in successful HTTP response
        const errorMessage = checkForError(responseData);
        if (errorMessage) {{
            console.error(`[${{toolName}}] API Error:`, responseData);
            throw new Error(errorMessage);
        }}

        // v9: PARENT-AS-PATIENT MODEL + BOOKING AUTHORIZATION TOKEN
        if (action === 'create' && responseData.success && responseData.patientGUID) {{
            responseData.llm_guidance = {{
                model: "PARENT_AS_PATIENT",
                current_state: "PATIENT_CREATED",
                next_action: "call_book_child_for_each_child",
                critical_instruction: "Patient (parent) created successfully. Now call schedule_appointment_ortho action=book_child for EACH child using BOTH patientGUID AND bookingAuthToken from this response. Include childName and childDOB in each book_child call.",
                patientGUID_for_booking: responseData.patientGUID,
                bookingAuthToken_for_booking: responseData.bookingAuthToken,
                MUST_INCLUDE_IN_BOOK_CHILD: {{
                    patientGUID: responseData.patientGUID,
                    bookingAuthToken: responseData.bookingAuthToken
                }},
                sibling_note: "For SIBLINGS: REUSE this same patientGUID AND bookingAuthToken for all children. Do NOT create separate patients. Child info goes in the appointment note via childName and childDOB parameters.",
                note_format: "Child: [name] | DOB: [date] | Insurance: [provider] | GroupID: [id] | MemberID: [id]",
                booking_sequence: "create PARENT once -> book child1 (with patientGUID+bookingAuthToken+childName/DOB) -> book child2 (with same patientGUID+bookingAuthToken+childName/DOB) -> confirm to caller",
                CRITICAL: "You MUST pass bookingAuthToken to book_child. Without it, the booking will be REJECTED if the patientGUID does not match the one from this create response."
            }};
        }}

        // v5: Add debug info to response for Call Flow Navigator
        responseData._toolVersion = TOOL_VERSION;
        responseData._debug_calls = _debug_calls;

        console.log(`[${{toolName}}] ${{config.successLog}}`);
        return JSON.stringify(responseData);

    }} catch (error) {{
        console.error(`[${{toolName}}] Error:`, error.message);

        if (error.name === 'AbortError') {{
            error.message = `Request timeout after ${{timeout}}ms`;
        }}

        const errorResponse = {{
            success: false,
            error: `Failed to execute ${{action}}`,
            message: error.message,
            action: action,
            timestamp: new Date().toISOString(),
            _toolVersion: TOOL_VERSION,
            _debug_error: error.message,
            _debug_calls: _debug_calls
        }};

        throw new Error(JSON.stringify(errorResponse, null, 2));
    }}
}}

return executeRequest();

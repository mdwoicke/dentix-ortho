/**
 * ============================================================================
 * CHORD DSO PATIENT - Unified Patient & Clinic Tool (Node Red Version)
 * Version: v14 | Updated: 2026-02-25
 * ============================================================================
 * Consolidates: lookup, get, create, appointments, clinic_info, edit_insurance, confirm_appointment
 *
 * This version calls Node Red endpoints instead of Cloud9 directly.
 * All Cloud9 XML/SOAP logic is handled by Node Red.
 *
 * v14: PII MASKING DETECTION - Catch masked phone numbers before hitting Node-RED
 *     - lookup.validate() rejects phoneNumber matching /^[*Xx]+$/
 *     - Returns helpful llm_guidance directing LLM to search by name instead
 *     - Prevents wasted API call and confusing error for the LLM
 *
 * v13: Updated DEFAULT_PROVIDER_GUID to Dr. Troy McCartney (0f588ace-e0bf-44ba-b8ef-be8cbb63153b)
 *
 * v12: FIX - Clarified that each child create returns THEIR OWN bookingAuthToken
 *     - Updated LLM guidance to emphasize child token usage (not parent's)
 *     - Works with scheduling tool v72 for correct token validation
 *
 * v11: REMOVED children array from create action - was dead code causing LLM confusion
 *     - Each child must be created with a SEPARATE create call (isChild=true)
 *     - Removed $children from rawParams to prevent LLM from passing children in single call
 *
 * v10: INDIVIDUAL_PATIENT_PER_PERSON MODEL
 *     - Each person (adult and child) gets their own unique patientGUID
 *     - PARENT: Created first with phone number, gets familyId generated
 *     - CHILD: Created with isChild=true, parentPatientGUID, familyId, NO phone
 *     - Appointments tie directly to child's patientGUID (not parent's)
 *     - Insurance/family linkage stored via SetPatientComment on child's record
 *     - New params: isChild (boolean), parentPatientGUID (string), familyId (string)
 *     - New params: insurance.provider, insurance.groupId, insurance.memberId
 *
 * v9: BOOKING AUTHORIZATION TOKEN
 *     - Returns bookingAuthToken on successful patient creation
 *     - Token MUST be passed to book_child to prevent parallel tool call collisions
 *     - Token validates that the patientGUID matches what was just created
 *     - Prevents LLM from using stale/hallucinated GUIDs in sibling booking
 *
 * v8: PARENT-AS-PATIENT MODEL (DEPRECATED - replaced by v10)
 * v7: SIBLING BOOKING FIX (DEPRECATED - see v10)
 * v6: Updated field descriptions in schema to clarify CHILD's info, not parent
 * v5: API CALL TRACING - Add _debug_calls array to track all HTTP calls
 * v4: General improvements
 * v3: Fixed clinic_info to use DEFAULT_LOCATION_GUID
 * v2: Added default locationGUID and providerGUID with GUID validation
 * ============================================================================
 */

const fetch = require('node-fetch');

const TOOL_VERSION = 'v14';

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
// DEFAULT GUIDS - Production values for CDH Allegheny
// ============================================================================

const DEFAULT_LOCATION_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b';  // CDH - Allegheny 202 (PROD)
const DEFAULT_PROVIDER_GUID = '0f588ace-e0bf-44ba-b8ef-be8cbb63153b';  // Dr. Troy McCartney (TRMC)

function isValidGUID(value) {{
    if (!value || typeof value !== 'string') return false;
    return /^[a-f0-9]{{8}}-[a-f0-9]{{4}}-[a-f0-9]{{4}}-[a-f0-9]{{4}}-[a-f0-9]{{12}}$/i.test(value);
}}

// ============================================================================
// ACTION CONFIGURATIONS - Node Red Endpoints
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
            // v14: PII masking detection - catch masked phone numbers before API call
            if (params.phoneNumber && /^[\\*Xx]+$/.test(params.phoneNumber.trim())) {{
                throw new Error(JSON.stringify({{
                    success: false,
                    error: 'PII_MASKED_PHONE',
                    llm_guidance: {{
                        error_type: 'pii_masked_phone',
                        voice_response: 'I can look you up by name instead. Could you spell your last name for me?',
                        action_required: 'search_by_name',
                        CRITICAL: 'v14: The phone number appears to be PII-masked (e.g., "***"). Do NOT retry with the same value. Ask the caller for their name and use filter parameter instead of phoneNumber.',
                        example: {{ action: 'lookup', filter: 'LastName, FirstName' }}
                    }}
                }}));
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
        buildBody: (params, uui) => {{
            // v10: INDIVIDUAL_PATIENT_PER_PERSON - build body based on isChild flag
            const body = {{
                uui: uui,
                patientFirstName: params.patientFirstName,
                patientLastName: params.patientLastName,
                birthdayDateTime: params.birthdayDateTime,
                gender: params.gender,
                providerGUID: isValidGUID(params.providerGUID) ? params.providerGUID : DEFAULT_PROVIDER_GUID,
                locationGUID: isValidGUID(params.locationGUID) ? params.locationGUID : DEFAULT_LOCATION_GUID,
                // v10: New params for child patient creation
                isChild: params.isChild === true || params.isChild === 'true',
                parentPatientGUID: params.parentPatientGUID,
                familyId: params.familyId
            }};
            // v10: Only parents get phone number, children have no phone
            if (!body.isChild) {{
                body.phoneNumber = params.phoneNumber;
                body.emailAddress = params.emailAddress;
            }}
            // v10: Insurance stored on patient record (especially for children)
            if (params.insuranceProvider || params.insuranceGroupId || params.insuranceMemberId) {{
                body.insurance = {{
                    provider: params.insuranceProvider,
                    groupId: params.insuranceGroupId,
                    memberId: params.insuranceMemberId
                }};
            }}
            return body;
        }},
        validate: (params) => {{
            // v13: BLOCK child creation - must use atomic booking via schedule_appointment_ortho book_child
            const isChild = params.isChild === true || params.isChild === 'true';
            if (isChild) {{
                throw new Error("ATOMIC_BOOKING_REQUIRED: Do NOT create child patients separately. Use schedule_appointment_ortho action=book_child with parentFirstName, parentLastName, parentPhone, and children array. Node-RED creates parent + children + books appointments in one atomic call.");
            }}
            if (!params.patientFirstName) throw new Error("patientFirstName (PARENT's first name) is required for 'create' action");
            if (!params.patientLastName) throw new Error("patientLastName (PARENT's last name) is required for 'create' action");
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
// AUTHENTICATION
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
// ERROR DETECTION HELPER
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
// PARAMETER CLEANER
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
// HTTP REQUEST ENGINE
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
    // v10: Added isChild, parentPatientGUID, familyId for INDIVIDUAL_PATIENT_PER_PERSON model
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
        // v11: REMOVED children param - was dead code causing LLM to think it could pass children in single create call
        // Each child must be created with a SEPARATE create call (isChild=true)
        // v10: INDIVIDUAL_PATIENT_PER_PERSON - new params for child patient creation
        isChild: typeof $isChild !== 'undefined' ? $isChild : null,
        parentPatientGUID: typeof $parentPatientGUID !== 'undefined' ? $parentPatientGUID : null,
        familyId: typeof $familyId !== 'undefined' ? $familyId : null
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

        // v10: INDIVIDUAL_PATIENT_PER_PERSON MODEL - Different guidance for parent vs child
        if (action === 'create' && responseData.success && responseData.patientGUID) {{
            const isChild = responseData.isChild === true;
            if (isChild) {{
                // Child patient created - book appointment directly to this child's GUID
                responseData.llm_guidance = {{
                    model: "INDIVIDUAL_PATIENT_PER_PERSON",
                    current_state: "CHILD_CREATED",
                    next_action: "book_appointment_for_this_child",
                    critical_instruction: "Child patient created with their OWN patientGUID. Book appointment using THIS patientGUID (not parent's). No child info needed in appointment note - child has their own record.",
                    childPatientGUID: responseData.patientGUID,
                    parentPatientGUID: responseData.parentPatientGUID,
                    familyId: responseData.familyId,
                    bookingAuthToken_for_booking: responseData.bookingAuthToken,
                    MUST_INCLUDE_IN_BOOK_CHILD: {{
                        patientGUID: responseData.patientGUID,
                        bookingAuthToken: responseData.bookingAuthToken
                    }},
                    IMPORTANT: "Appointment ties directly to child's patient record. Use childPatientGUID for SetAppointment.",
                    booking_sequence: "Child created -> book appointment using child's patientGUID -> confirm to caller"
                }};
            }} else {{
                // Parent patient created - next step is to create each child
                responseData.llm_guidance = {{
                    model: "INDIVIDUAL_PATIENT_PER_PERSON",
                    current_state: "PARENT_CREATED",
                    next_action: "create_child_patients_then_book",
                    critical_instruction: "Parent created. For EACH CHILD: 1) Call action=create with isChild=true. 2) Child create returns patientGUID + bookingAuthToken. 3) Book using CHILD's patientGUID + CHILD's bookingAuthToken.",
                    parentPatientGUID: responseData.patientGUID,
                    familyId: responseData.familyId,
                    // v12: REMOVED bookingAuthToken_for_children - each child gets their OWN token
                    workflow: [
                        "1. Parent created (this response) - parentPatientGUID=" + responseData.patientGUID + ", familyId=" + responseData.familyId,
                        "2. For each child: call action=create with isChild=true, parentPatientGUID, familyId -> RETURNS child's patientGUID + child's bookingAuthToken",
                        "3. For each child: book appointment using CHILD's patientGUID + CHILD's bookingAuthToken (both from step 2)",
                        "4. Confirm all appointments to caller"
                    ],
                    sibling_note: "Each child gets their own patient record AND their own bookingAuthToken. Family linked via familyId.",
                    CRITICAL: "v12: Each child has their OWN patientGUID AND bookingAuthToken. Do NOT use parent's values for child booking."
                }};
            }}
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

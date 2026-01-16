/**
 * ============================================================================
 * CHORD DSO PATIENT - Unified Patient & Clinic Tool (Sandbox A - TEST)
 * Version: v5-SANDBOX | Updated: 2026-01-13
 * ============================================================================
 * Consolidates: lookup, get, create, appointments, clinic_info, edit_insurance, confirm_appointment
 * 
 * This version calls Node Red /ortho/ endpoints (TEST Cloud9).
 * Use /ortho-prd/ for Production.
 * 
 * v5: Sandbox A version using /ortho/ routes for TEST Cloud9
 * v4: Node Red version with /ortho-prd/ for Production
 * ============================================================================
 */

const fetch = require('node-fetch');

// ============================================================================
// DEFAULT GUIDS - TEST environment values (Location14)
// ============================================================================

const DEFAULT_LOCATION_GUID = '1070d281-0952-4f01-9a6e-1a2e6926a7db';  // Location14 (TEST)
const DEFAULT_PROVIDER_GUID = '79ec29fe-c315-4982-845a-0005baefb5a8';  // TEST Provider

function isValidGUID(value) {
    if (!value || typeof value !== 'string') return false;
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}

// ============================================================================
// ACTION CONFIGURATIONS - Node Red /ortho/ Endpoints (TEST)
// ============================================================================

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

const ACTIONS = {
    lookup: {
        endpoint: `${BASE_URL}/ortho/getPatientByFilter`,
        method: 'POST',
        buildBody: (params, uui) => ({
            uui: uui,
            phoneNumber: params.phoneNumber,
            filter: params.filter,
            locationGUID: params.locationGUID
        }),
        validate: (params) => {
            if (!params.phoneNumber && !params.filter) {
                throw new Error("phoneNumber or filter is required for 'lookup' action");
            }
        },
        successLog: 'Patient lookup completed'
    },
    get: {
        endpoint: `${BASE_URL}/ortho/getPatient`,
        method: 'POST',
        buildBody: (params, uui) => ({
            uui: uui,
            patientGUID: params.patientGUID
        }),
        validate: (params) => {
            if (!params.patientGUID) {
                throw new Error("patientGUID is required for 'get' action");
            }
        },
        successLog: 'Patient retrieved successfully'
    },
    create: {
        endpoint: `${BASE_URL}/ortho/createPatient`,
        method: 'POST',
        buildBody: (params, uui) => ({
            uui: uui,
            patientFirstName: params.patientFirstName,
            patientLastName: params.patientLastName,
            birthdayDateTime: params.birthdayDateTime,
            phoneNumber: params.phoneNumber,
            emailAddress: params.emailAddress,
            gender: params.gender,
            providerGUID: isValidGUID(params.providerGUID) ? params.providerGUID : DEFAULT_PROVIDER_GUID,
            locationGUID: isValidGUID(params.locationGUID) ? params.locationGUID : DEFAULT_LOCATION_GUID
        }),
        validate: (params) => {
            if (!params.patientFirstName) throw new Error("patientFirstName is required for 'create' action");
            if (!params.patientLastName) throw new Error("patientLastName is required for 'create' action");
        },
        successLog: 'Patient created successfully'
    },
    appointments: {
        endpoint: `${BASE_URL}/ortho/getPatientAppts`,
        method: 'POST',
        buildBody: (params, uui) => ({
            uui: uui,
            patientGUID: params.patientGUID
        }),
        validate: (params) => {
            if (!params.patientGUID) {
                throw new Error("patientGUID is required for 'appointments' action");
            }
        },
        successLog: 'Patient appointments retrieved'
    },
    clinic_info: {
        endpoint: `${BASE_URL}/ortho/getLocation`,
        method: 'POST',
        buildBody: (params, uui) => ({
            uui: uui,
            locationGUID: isValidGUID(params.locationGUID) ? params.locationGUID : DEFAULT_LOCATION_GUID
        }),
        validate: () => {},
        successLog: 'Clinic info retrieved'
    },
    edit_insurance: {
        endpoint: `${BASE_URL}/ortho/editInsurance`,
        method: 'POST',
        buildBody: (params, uui) => ({
            uui: uui,
            patientGUID: params.patientGUID,
            insuranceProvider: params.insuranceProvider,
            insuranceGroupId: params.insuranceGroupId,
            insuranceMemberId: params.insuranceMemberId
        }),
        validate: (params) => {
            if (!params.patientGUID) {
                throw new Error("patientGUID is required for 'edit_insurance' action");
            }
        },
        successLog: 'Patient insurance updated successfully'
    },
    confirm_appointment: {
        endpoint: `${BASE_URL}/ortho/confirmAppt`,
        method: 'POST',
        buildBody: (params, uui) => ({
            uui: uui,
            appointmentId: params.appointmentId
        }),
        validate: (params) => {
            if (!params.appointmentId) {
                throw new Error("appointmentId is required for 'confirm_appointment' action");
            }
        },
        successLog: 'Appointment confirmed successfully'
    }
};

// ============================================================================
// AUTHENTICATION
// ============================================================================

function getAuthHeader() {
    try {
        const username = "workflowapi";
        const password = "e^@V95&6sAJReTsb5!iq39mIC4HYIV";
        if (username && password) {
            const credentials = Buffer.from(`${username}:${password}`).toString('base64');
            return `Basic ${credentials}`;
        }
    } catch (e) {
        return null;
    }
    return null;
}

// ============================================================================
// ERROR DETECTION HELPER
// ============================================================================

function checkForError(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.success === false) return data.error || data.message || 'Operation failed';
    if (data.code === false) return Array.isArray(data.error) ? data.error.join(', ') : data.error || 'API returned error';
    if (data.error && !data.data && !data.patient && !data.patients && !data.appointments && !data.location && !data.locations) {
        return Array.isArray(data.error) ? data.error.join(', ') : data.error;
    }
    return null;
}

// ============================================================================
// PARAMETER CLEANER
// ============================================================================

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

// ============================================================================
// HTTP REQUEST ENGINE
// ============================================================================

async function executeRequest() {
    const toolName = 'chord_ortho_patient';
    const action = $action;
    const timeout = 60000;
    
    console.log(`[${toolName}] v5-SANDBOX - Node Red /ortho/ (TEST)`);
    console.log(`[${toolName}] Action: ${action}`);
    
    if (!action || !ACTIONS[action]) {
        const validActions = Object.keys(ACTIONS).join(', ');
        throw new Error(`Invalid action '${action}'. Valid actions: ${validActions}`);
    }
    
    const config = ACTIONS[action];
    
    let uui;
    if (!$vars || !$vars.c1mg_uui || $vars.c1mg_uui === 'c1mg_uui' || (typeof $vars.c1mg_uui === 'string' && $vars.c1mg_uui.trim() === '')) {
        uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';
    } else {
        uui = $vars.c1mg_uui;
    }
    
    const rawParams = {
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
        appointmentId: typeof $appointmentId !== 'undefined' ? $appointmentId : null
    };
    const params = cleanParams(rawParams);
    
    try {
        config.validate(params);
        
        const body = config.buildBody(params, uui);
        console.log(`[${toolName}] Endpoint: ${config.method} ${config.endpoint}`);
        console.log(`[${toolName}] Request Body:`, JSON.stringify(body, null, 2));
        
        const headers = { 'Content-Type': 'application/json' };
        const authHeader = getAuthHeader();
        if (authHeader) headers['Authorization'] = authHeader;
        
        const options = { method: config.method, headers: headers, body: JSON.stringify(body) };
        
        let timeoutId;
        if (typeof AbortController !== 'undefined') {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), timeout);
            options.signal = controller.signal;
        }
        
        console.log(`[${toolName}] Making request to Node Red /ortho/ (TEST)...`);
        const response = await fetch(config.endpoint, options);
        
        if (timeoutId) clearTimeout(timeoutId);
        
        console.log(`[${toolName}] Response Status: ${response.status} ${response.statusText}`);
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        if (!response.ok) {
            console.error(`[${toolName}] HTTP Error ${response.status}:`, data);
            let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            if (data) {
                const bodyError = checkForError(typeof data === 'string' ? (() => { try { return JSON.parse(data); } catch(e) { return data; } })() : data);
                if (bodyError) errorMsg = bodyError;
            }
            throw new Error(errorMsg);
        }
        
        let responseData = data;
        if (typeof data === 'string') {
            try { responseData = JSON.parse(data); } catch (e) { responseData = data; }
        }
        
        const errorMessage = checkForError(responseData);
        if (errorMessage) {
            console.error(`[${toolName}] API Error:`, responseData);
            throw new Error(errorMessage);
        }
        
        // Add LLM guidance for patient create success
        if (action === 'create' && responseData.success && responseData.patientGUID) {
            responseData.llm_guidance = {
                current_state: "EXECUTE_BOOKING",
                next_action: "call_book_child_immediately",
                critical_instruction: "Patient created successfully. You MUST now IMMEDIATELY call schedule_appointment_ortho with action=book_child using this patientGUID. Do NOT say 'Let me check' or 'One moment'. Do NOT respond to caller until booking is complete.",
                patientGUID_for_booking: responseData.patientGUID,
                prohibited_responses: ["Let me check on that", "One moment while I look into this", "I'm verifying", "Let me confirm"],
                booking_sequence: "After patient create -> IMMEDIATELY call book_child -> THEN confirm to caller"
            };
        }
        
        console.log(`[${toolName}] ${config.successLog}`);
        return JSON.stringify(responseData);
        
    } catch (error) {
        console.error(`[${toolName}] Error:`, error.message);
        
        if (error.name === 'AbortError') {
            error.message = `Request timeout after ${timeout}ms`;
        }
        
        const errorResponse = {
            error: `Failed to execute ${action}`,
            message: error.message,
            action: action,
            timestamp: new Date().toISOString()
        };
        
        throw new Error(JSON.stringify(errorResponse, null, 2));
    }
}

return executeRequest();

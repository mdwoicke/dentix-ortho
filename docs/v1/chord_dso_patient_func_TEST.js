/**
 * ============================================================================
 * CHORD DSO PATIENT - Unified Patient & Clinic Tool (TEST Cloud9 Direct)
 * Version: v5-TEST | Updated: 2026-01-13
 * ============================================================================
 * Consolidates: lookup, get, create, appointments, clinic_info
 * 
 * This version calls Cloud9 TEST SANDBOX directly via XML/SOAP.
 * For Sandbox A testing only - NOT for production.
 * ============================================================================
 */

const https = require('https');

// ============================================================================
// TEST CLOUD9 CONFIGURATION
// ============================================================================

const CLOUD9_CONFIG = {
    hostname: 'us-ea1-partnertest.cloud9ortho.com',
    path: '/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#'
};

// Default GUIDs for TEST environment (Location14 - verified working in Postman)
const DEFAULT_LOCATION_GUID = '1070d281-0952-4f01-9a6e-1a2e6926a7db';  // Location14
const DEFAULT_PROVIDER_GUID = '79ec29fe-c315-4982-845a-0005baefb5a8';  // TEST Provider

function isValidGUID(value) {
    if (!value || typeof value !== 'string') return false;
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}

// ============================================================================
// XML BUILDER HELPERS
// ============================================================================

function buildXmlRequest(procedure, parameters = '') {
    return `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CLOUD9_CONFIG.clientId}</ClientID>
    <UserName>${CLOUD9_CONFIG.userName}</UserName>
    <Password>${CLOUD9_CONFIG.password}</Password>
    <Procedure>${procedure}</Procedure>
    <Parameters>${parameters}</Parameters>
</GetDataRequest>`;
}

function parseXmlResponse(xml) {
    // Check for error
    const statusMatch = xml.match(/<ResponseStatus>([^<]+)/);
    if (statusMatch && statusMatch[1] === 'Error') {
        const errorMsg = xml.match(/<ErrorMessage>([^<]+)/);
        throw new Error(errorMsg ? errorMsg[1] : 'Cloud9 API Error');
    }
    return xml;
}

function extractRecords(xml, fields) {
    const records = [];
    const recordMatches = xml.split(/<Record>/).slice(1);
    recordMatches.forEach(rec => {
        const record = {};
        fields.forEach(field => {
            const match = rec.match(new RegExp(`<${field}>([^<]*)`));
            if (match) record[field] = match[1];
        });
        if (Object.keys(record).length > 0) records.push(record);
    });
    return records;
}

// ============================================================================
// CLOUD9 API CALL
// ============================================================================

function callCloud9(procedure, parameters = '') {
    return new Promise((resolve, reject) => {
        const xml = buildXmlRequest(procedure, parameters);
        
        const options = {
            hostname: CLOUD9_CONFIG.hostname,
            path: CLOUD9_CONFIG.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/xml',
                'Content-Length': Buffer.byteLength(xml)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    parseXmlResponse(data);
                    resolve(data);
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', e => reject(e));
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.write(xml);
        req.end();
    });
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleLookup(params) {
    // Use GetPortalPatientLookup for patient search
    const filter = params.filter || params.phoneNumber || '';
    const parameters = `<filter>${filter}</filter><lookupByPatient>1</lookupByPatient><showInactive>0</showInactive>`;
    
    const xml = await callCloud9('GetPortalPatientLookup', parameters);
    const records = extractRecords(xml, ['PatientName', 'PatientID', 'PatientBirthDate', 'PatientGUID', 'ResponsiblePartyName']);
    
    return {
        success: true,
        patients: records,
        count: records.length
    };
}

async function handleGet(params) {
    if (!params.patientGUID) throw new Error('patientGUID is required');
    
    const parameters = `<patGUID>${params.patientGUID}</patGUID>`;
    const xml = await callCloud9('GetPatientInformation', parameters);
    const records = extractRecords(xml, ['FullName', 'BirthDate', 'Email', 'Phone', 'Orthodontist', 'patGUID']);
    
    return {
        success: true,
        patient: records[0] || null
    };
}

async function handleCreate(params) {
    if (!params.patientFirstName) throw new Error('patientFirstName is required');
    if (!params.patientLastName) throw new Error('patientLastName is required');
    
    const providerGUID = isValidGUID(params.providerGUID) ? params.providerGUID : DEFAULT_PROVIDER_GUID;
    const locationGUID = isValidGUID(params.locationGUID) ? params.locationGUID : DEFAULT_LOCATION_GUID;
    
    let parameters = `
        <patientFirstName>${params.patientFirstName}</patientFirstName>
        <patientLastName>${params.patientLastName}</patientLastName>
        <providerGUID>${providerGUID}</providerGUID>
        <locationGUID>${locationGUID}</locationGUID>
        <VendorUserName>FlowiseTest</VendorUserName>`;
    
    if (params.birthdayDateTime) parameters += `<birthdayDateTime>${params.birthdayDateTime}</birthdayDateTime>`;
    if (params.gender) parameters += `<gender>${params.gender}</gender>`;
    if (params.phoneNumber) parameters += `<phoneNumber>${params.phoneNumber}</phoneNumber>`;
    if (params.emailAddress) parameters += `<addressEmail>${params.emailAddress}</addressEmail>`;
    
    const xml = await callCloud9('SetPatient', parameters);
    
    // Extract patient GUID from response
    const guidMatch = xml.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    const patientGUID = guidMatch ? guidMatch[1] : null;
    
    if (!patientGUID) {
        throw new Error('Patient creation failed - no GUID returned');
    }
    
    return {
        success: true,
        patientGUID: patientGUID,
        message: 'Patient created successfully',
        llm_guidance: {
            current_state: 'EXECUTE_BOOKING',
            next_action: 'call_book_child_immediately',
            critical_instruction: 'Patient created successfully. You MUST now IMMEDIATELY call schedule_appointment_ortho with action=book_child using this patientGUID. Do NOT say Let me check or One moment. Do NOT respond to caller until booking is complete.',
            patientGUID_for_booking: patientGUID,
            booking_sequence: 'After patient create -> IMMEDIATELY call book_child -> THEN confirm to caller'
        }
    };
}

async function handleAppointments(params) {
    if (!params.patientGUID) throw new Error('patientGUID is required');
    
    const parameters = `<patGUID>${params.patientGUID}</patGUID>`;
    const xml = await callCloud9('GetAppointmentListByPatient', parameters);
    const records = extractRecords(xml, ['AppointmentGUID', 'AppointmentDate', 'AppointmentTime', 'AppointmentType', 'LocationName', 'ProviderName']);
    
    return {
        success: true,
        appointments: records,
        count: records.length
    };
}

async function handleClinicInfo(params) {
    const xml = await callCloud9('GetLocations', '');
    const records = extractRecords(xml, ['LocationName', 'LocationGUID', 'LocationAddress1', 'LocationCity', 'LocationState', 'LocationZip', 'LocationPhone']);
    
    // If locationGUID provided, filter to that location
    let locations = records;
    if (isValidGUID(params.locationGUID)) {
        locations = records.filter(r => r.LocationGUID === params.locationGUID);
    } else {
        // Return default location only
        locations = records.filter(r => r.LocationGUID === DEFAULT_LOCATION_GUID);
        if (locations.length === 0) locations = records.slice(0, 1);
    }
    
    return {
        success: true,
        locations: locations,
        defaultLocationGUID: DEFAULT_LOCATION_GUID,
        defaultProviderGUID: DEFAULT_PROVIDER_GUID
    };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function executeRequest() {
    const toolName = 'chord_ortho_patient';
    const action = $action;
    
    console.log(`[${toolName}] v5-TEST - Cloud9 TEST Direct`);
    console.log(`[${toolName}] Action: ${action}`);
    
    const validActions = ['lookup', 'get', 'create', 'appointments', 'clinic_info', 'edit_insurance', 'confirm_appointment'];
    if (!action || !validActions.includes(action)) {
        throw new Error(`Invalid action '${action}'. Valid actions: ${validActions.join(', ')}`);
    }
    
    // Build params from Flowise variables
    const params = {};
    if (typeof $phoneNumber !== 'undefined' && $phoneNumber) params.phoneNumber = $phoneNumber;
    if (typeof $filter !== 'undefined' && $filter) params.filter = $filter;
    if (typeof $patientGUID !== 'undefined' && $patientGUID) params.patientGUID = $patientGUID;
    if (typeof $patientFirstName !== 'undefined' && $patientFirstName) params.patientFirstName = $patientFirstName;
    if (typeof $patientLastName !== 'undefined' && $patientLastName) params.patientLastName = $patientLastName;
    if (typeof $birthdayDateTime !== 'undefined' && $birthdayDateTime) params.birthdayDateTime = $birthdayDateTime;
    if (typeof $gender !== 'undefined' && $gender) params.gender = $gender;
    if (typeof $emailAddress !== 'undefined' && $emailAddress) params.emailAddress = $emailAddress;
    if (typeof $providerGUID !== 'undefined' && $providerGUID) params.providerGUID = $providerGUID;
    if (typeof $locationGUID !== 'undefined' && $locationGUID) params.locationGUID = $locationGUID;
    if (typeof $appointmentId !== 'undefined' && $appointmentId) params.appointmentId = $appointmentId;
    
    try {
        let result;
        switch (action) {
            case 'lookup':
                result = await handleLookup(params);
                break;
            case 'get':
                result = await handleGet(params);
                break;
            case 'create':
                result = await handleCreate(params);
                break;
            case 'appointments':
                result = await handleAppointments(params);
                break;
            case 'clinic_info':
                result = await handleClinicInfo(params);
                break;
            default:
                throw new Error(`Action '${action}' not implemented for TEST environment`);
        }
        
        console.log(`[${toolName}] Success:`, JSON.stringify(result).substring(0, 200));
        return JSON.stringify(result);
        
    } catch (error) {
        console.error(`[${toolName}] Error:`, error.message);
        throw new Error(JSON.stringify({
            error: `Failed to execute ${action}`,
            message: error.message,
            action: action,
            timestamp: new Date().toISOString()
        }));
    }
}

return executeRequest();

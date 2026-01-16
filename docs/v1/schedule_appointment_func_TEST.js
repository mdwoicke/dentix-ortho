/**
 * ============================================================================
 * CHORD SCHEDULING DSO - Appointment Scheduling Tool (TEST Cloud9 Direct)
 * Version: v53-TEST | Updated: 2026-01-13
 * ============================================================================
 * Actions: slots, book_child, cancel
 * 
 * This version calls Cloud9 TEST SANDBOX directly via XML/SOAP.
 * For Sandbox A testing only - NOT for production.
 * ============================================================================
 */

const https = require('https');

const TOOL_VERSION = 'v53-TEST';
const MAX_SLOTS_RETURNED = 3;

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
const DEFAULT_SCHEDULE_VIEW_GUID = '2544683a-8e79-4b32-a4d4-bf851996bac3';  // Location14
const DEFAULT_SCHEDULE_COLUMN_GUID = 'e062b81f-1fff-40fc-b4a4-1cf9ecc2f32b';  // TC 1
const DEFAULT_APPT_TYPE_GUID = '8fc9d063-ae46-4975-a5ae-734c6efe341a';  // 100 Exam - NP Child (45 min)
const DEFAULT_MINUTES = 45;

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
    const statusMatch = xml.match(/<ResponseStatus>([^<]+)/);
    if (statusMatch && statusMatch[1] === 'Error') {
        const errorMsg = xml.match(/<ErrorMessage>([^<]+)/);
        throw new Error(errorMsg ? errorMsg[1] : 'Cloud9 API Error');
    }
    return xml;
}

// ============================================================================
// CLOUD9 API CALL
// ============================================================================

function callCloud9(procedure, parameters = '') {
    return new Promise((resolve, reject) => {
        const xml = buildXmlRequest(procedure, parameters);
        
        console.log(`[Cloud9 TEST] Calling ${procedure}`);
        
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
// DATE HELPERS
// ============================================================================

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

function getDefaultDateRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 14); // 2 weeks
    return {
        startDate: formatDate(today),
        endDate: formatDate(endDate)
    };
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleSlots(params) {
    const dateRange = getDefaultDateRange();
    let startDate = params.startDate || dateRange.startDate;
    let endDate = params.endDate || dateRange.endDate;
    
    // Validate and fix dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let parsedStart = parseDate(startDate);
    let parsedEnd = parseDate(endDate);
    
    if (!parsedStart || parsedStart < today) {
        parsedStart = today;
        startDate = formatDate(parsedStart);
    }
    if (!parsedEnd || parsedEnd <= parsedStart) {
        parsedEnd = new Date(parsedStart);
        parsedEnd.setDate(parsedEnd.getDate() + 14);
        endDate = formatDate(parsedEnd);
    }
    
    console.log(`[slots] Searching ${startDate} to ${endDate}`);
    
    const scheduleViewGUID = isValidGUID(params.scheduleViewGUID) ? params.scheduleViewGUID : DEFAULT_SCHEDULE_VIEW_GUID;
    const apptTypeGUID = isValidGUID(params.appointmentTypeGUID) ? params.appointmentTypeGUID : DEFAULT_APPT_TYPE_GUID;
    
    const parameters = `
        <startDate>${startDate} 8:00:00 AM</startDate>
        <endDate>${endDate} 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
        <appttypGUIDs>${apptTypeGUID}</appttypGUIDs>
        <schdvwGUIDs>${scheduleViewGUID}</schdvwGUIDs>
        <locationGUID>${DEFAULT_LOCATION_GUID}</locationGUID>`;
    
    const xml = await callCloud9('GetOnlineReservations', parameters);
    
    // Parse slots from XML
    const slots = [];
    const records = xml.split(/<Record>/).slice(1);
    
    records.forEach(rec => {
        const startTime = rec.match(/<StartTime>([^<]+)/);
        const schdvwGUID = rec.match(/<ScheduleViewGUID>([^<]+)/);
        const schdcolGUID = rec.match(/<ScheduleColumnGUID>([^<]+)/);
        const appttypGUID = rec.match(/<AppointmentTypeGUID>([^<]+)/);
        const minutes = rec.match(/<Minutes>([^<]+)/);
        
        if (startTime) {
            slots.push({
                displayTime: startTime[1],
                startTime: startTime[1],
                scheduleViewGUID: schdvwGUID ? schdvwGUID[1] : scheduleViewGUID,
                scheduleColumnGUID: schdcolGUID ? schdcolGUID[1] : DEFAULT_SCHEDULE_COLUMN_GUID,
                appointmentTypeGUID: appttypGUID ? appttypGUID[1] : apptTypeGUID,
                minutes: minutes ? parseInt(minutes[1]) : DEFAULT_MINUTES
            });
        }
    });
    
    // Limit and return
    const limitedSlots = slots.slice(0, MAX_SLOTS_RETURNED);
    
    return {
        success: true,
        slots: limitedSlots,
        count: limitedSlots.length,
        _toolVersion: TOOL_VERSION,
        _dateRange: { start: startDate, end: endDate },
        llm_guidance: {
            timestamp: new Date().toISOString(),
            confirmation_triggers: ['yes', 'yeah', 'yep', 'sure', 'okay', 'ok', 'perfect', 'sounds good'],
            BOOKING_SEQUENCE_MANDATORY: [
                'STEP 1: Offer the slot time to the caller and wait for confirmation',
                'STEP 2: When caller confirms, FIRST call chord_ortho_patient action=create to create the patient',
                'STEP 3: Get the patientGUID from the chord_ortho_patient response',
                'STEP 4: THEN call schedule_appointment_ortho action=book_child with patientGUID from step 3 AND slot GUIDs from this response',
                'CRITICAL: NEVER call book_child before chord_ortho_patient create. The patientGUID is REQUIRED.'
            ],
            next_action: 'offer_time_to_caller_and_wait_for_confirmation',
            on_caller_confirms: 'call_chord_ortho_patient_action_create_FIRST_then_book_child',
            slot_fields_for_booking: 'startTime, scheduleViewGUID, scheduleColumnGUID, appointmentTypeGUID, minutes'
        }
    };
}

async function handleBookChild(params) {
    if (!params.patientGUID) throw new Error('BOOKING FAILED - Missing patientGUID. You MUST call chord_ortho_patient action=create FIRST.');
    if (!params.startTime) throw new Error('BOOKING FAILED - Missing startTime');
    
    const scheduleViewGUID = isValidGUID(params.scheduleViewGUID) ? params.scheduleViewGUID : DEFAULT_SCHEDULE_VIEW_GUID;
    const scheduleColumnGUID = isValidGUID(params.scheduleColumnGUID) ? params.scheduleColumnGUID : DEFAULT_SCHEDULE_COLUMN_GUID;
    const appointmentTypeGUID = isValidGUID(params.appointmentTypeGUID) ? params.appointmentTypeGUID : DEFAULT_APPT_TYPE_GUID;
    const minutes = params.minutes || DEFAULT_MINUTES;
    
    console.log(`[book_child] Booking for patient ${params.patientGUID} at ${params.startTime}`);
    
    const parameters = `
        <PatientGUID>${params.patientGUID}</PatientGUID>
        <StartTime>${params.startTime}</StartTime>
        <ScheduleViewGUID>${scheduleViewGUID}</ScheduleViewGUID>
        <ScheduleColumnGUID>${scheduleColumnGUID}</ScheduleColumnGUID>
        <AppointmentTypeGUID>${appointmentTypeGUID}</AppointmentTypeGUID>
        <Minutes>${minutes}</Minutes>
        <VendorUserName>FlowiseTest</VendorUserName>`;
    
    const xml = await callCloud9('SetAppointment', parameters);
    
    // Extract appointment GUID from response
    const guidMatch = xml.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    const appointmentGUID = guidMatch ? guidMatch[1] : null;
    
    return {
        success: true,
        appointmentGUID: appointmentGUID,
        message: 'Appointment booked successfully',
        startTime: params.startTime,
        patientGUID: params.patientGUID,
        _toolVersion: TOOL_VERSION,
        llm_guidance: {
            current_state: 'BOOKING_COMPLETE',
            next_action: 'confirm_to_caller',
            voice_response: `Your appointment has been booked for ${params.startTime}. Is there anything else I can help you with?`
        }
    };
}

async function handleCancel(params) {
    if (!params.appointmentGUID) throw new Error('appointmentGUID is required');
    
    const parameters = `<apptGUIDs>${params.appointmentGUID}</apptGUIDs>`;
    await callCloud9('CancelExistingAppts', parameters);
    
    return {
        success: true,
        message: 'Appointment cancelled successfully',
        appointmentGUID: params.appointmentGUID,
        _toolVersion: TOOL_VERSION
    };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function executeRequest() {
    const toolName = 'schedule_appointment_ortho';
    const action = $action;
    
    console.log(`[${toolName}] ${TOOL_VERSION} - Cloud9 TEST Direct`);
    console.log(`[${toolName}] Action: ${action}`);
    
    const validActions = ['slots', 'grouped_slots', 'book_child', 'cancel'];
    if (!action || !validActions.includes(action)) {
        throw new Error(`Invalid action '${action}'. Valid actions: ${validActions.join(', ')}`);
    }
    
    // Build params from Flowise variables
    const params = {};
    if (typeof $startDate !== 'undefined' && $startDate) params.startDate = $startDate;
    if (typeof $endDate !== 'undefined' && $endDate) params.endDate = $endDate;
    if (typeof $patientGUID !== 'undefined' && $patientGUID) params.patientGUID = $patientGUID;
    if (typeof $startTime !== 'undefined' && $startTime) params.startTime = $startTime;
    if (typeof $scheduleViewGUID !== 'undefined' && $scheduleViewGUID) params.scheduleViewGUID = $scheduleViewGUID;
    if (typeof $scheduleColumnGUID !== 'undefined' && $scheduleColumnGUID) params.scheduleColumnGUID = $scheduleColumnGUID;
    if (typeof $appointmentTypeGUID !== 'undefined' && $appointmentTypeGUID) params.appointmentTypeGUID = $appointmentTypeGUID;
    if (typeof $minutes !== 'undefined' && $minutes) params.minutes = $minutes;
    if (typeof $appointmentGUID !== 'undefined' && $appointmentGUID) params.appointmentGUID = $appointmentGUID;
    if (typeof $childName !== 'undefined' && $childName) params.childName = $childName;
    
    try {
        let result;
        switch (action) {
            case 'slots':
            case 'grouped_slots':
                result = await handleSlots(params);
                break;
            case 'book_child':
                result = await handleBookChild(params);
                break;
            case 'cancel':
                result = await handleCancel(params);
                break;
            default:
                throw new Error(`Action '${action}' not implemented`);
        }
        
        console.log(`[${toolName}] Success:`, JSON.stringify(result).substring(0, 300));
        return JSON.stringify(result);
        
    } catch (error) {
        console.error(`[${toolName}] Error:`, error.message);
        
        if (error.message.includes('BOOKING FAILED') || error.message.includes('Missing')) {
            return JSON.stringify({
                success: false,
                _toolVersion: TOOL_VERSION,
                _debug_error: error.message,
                llm_guidance: {
                    error_type: 'missing_params',
                    voice_response: 'Let me check those details again.',
                    action_required: 'provide_required_params',
                    CRITICAL: 'book_child requires patientGUID. Call chord_ortho_patient action=create FIRST to get patientGUID.'
                }
            });
        }
        
        throw new Error(JSON.stringify({
            error: `Failed to execute ${action}`,
            message: error.message,
            action: action,
            timestamp: new Date().toISOString()
        }));
    }
}

return executeRequest();

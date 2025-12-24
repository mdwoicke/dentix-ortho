/**
 * ============================================================================
 * CHORD SCHEDULING - Cloud9 Direct API Integration
 * ============================================================================
 * Calls Cloud9 XML APIs directly (no Node-RED intermediary)
 *
 * Actions:
 *   - slots: Get available appointment slots (GetOnlineReservations)
 *   - grouped_slots: Get slots for siblings (GetOnlineReservations + grouping)
 *   - book_child: Create appointment (SetAppointment)
 *   - cancel: Cancel appointment (SetAppointmentStatusCanceled)
 *
 * UPDATED: Now uses dynamic dates instead of hardcoded Jan 2026
 * ============================================================================
 */

const fetch = require('node-fetch');

// ============================================================================
// CLOUD9 API CONFIGURATION (Sandbox)
// ============================================================================

const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/',
    vendorUserName: 'IntelepeerTest',
    // Default appointment type for new patient ortho consult
    defaultApptTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a'
};

// ============================================================================
// XML UTILITIES
// ============================================================================

function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[<>&'"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
    }[c]));
}

function buildXmlRequest(procedure, params = {}) {
    const paramElements = Object.entries(params)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
        .join('');

    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${escapeXml(CLOUD9.password)}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
}

function parseXmlResponse(xmlText) {
    const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
    const status = statusMatch ? statusMatch[1] : 'Unknown';

    if (status === 'Error' || status !== 'Success') {
        const errorMatch = xmlText.match(/<Result>([^<]+)<\/Result>/);
        if (errorMatch && (errorMatch[1].includes('Error') || errorMatch[1].includes('error'))) {
            throw new Error(errorMatch[1]);
        }
    }

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
    return { status, records };
}

// ============================================================================
// DATE UTILITIES - UPDATED FOR DYNAMIC DATES
// ============================================================================

/**
 * Get dynamic date range for slot search
 * Returns dates starting from tomorrow (or next business day) for 2 weeks
 */
function getDynamicDateRange() {
    const today = new Date();

    // Start from tomorrow
    const startDate = new Date(today);
    startDate.setDate(today.getDate() + 1);

    // End date is 14 days from start (2 weeks of availability)
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 14);

    // Format as MM/DD/YYYY
    const formatDate = (d) => {
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const year = d.getFullYear();
        return `${month}/${day}/${year}`;
    };

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };
}

/**
 * Parse user-provided date or use dynamic default
 */
function parseDateOrDefault(dateStr, isStart) {
    if (dateStr && dateStr.trim() !== '') {
        // User provided a date, use it
        if (dateStr.includes(':')) return dateStr;
        return isStart ? `${dateStr} 7:00:00 AM` : `${dateStr} 5:00:00 PM`;
    }

    // No date provided, use dynamic dates
    const dynamic = getDynamicDateRange();
    const date = isStart ? dynamic.startDate : dynamic.endDate;
    return isStart ? `${date} 7:00:00 AM` : `${date} 5:00:00 PM`;
}

// ============================================================================
// HELPER FUNCTIONS
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

function extractGuidFromResult(result, pattern) {
    if (!result) return null;
    const match = result.match(pattern);
    return match ? match[1] : null;
}

// ============================================================================
// GROUP SLOTS POST-PROCESSING
// ============================================================================

function groupConsecutiveSlots(slots, numberOfPatients, timeWindowMinutes) {
    if (!slots || slots.length === 0) return [];

    const duration = timeWindowMinutes || (numberOfPatients >= 3 ? 45 : 30);
    const sorted = [...slots].sort((a, b) => new Date(a.StartTime) - new Date(b.StartTime));
    const groups = [];

    for (let i = 0; i <= sorted.length - numberOfPatients; i++) {
        const group = [sorted[i]];
        let lastEnd = new Date(sorted[i].StartTime);
        lastEnd.setMinutes(lastEnd.getMinutes() + parseInt(sorted[i].Minutes || 30));

        for (let j = i + 1; j < sorted.length && group.length < numberOfPatients; j++) {
            const nextStart = new Date(sorted[j].StartTime);
            const gapMinutes = (nextStart - lastEnd) / 60000;

            if (gapMinutes >= 0 && gapMinutes <= 15 &&
                sorted[j].ScheduleViewGUID === sorted[i].ScheduleViewGUID) {
                group.push(sorted[j]);
                lastEnd = new Date(sorted[j].StartTime);
                lastEnd.setMinutes(lastEnd.getMinutes() + parseInt(sorted[j].Minutes || 30));
            }
        }

        if (group.length >= numberOfPatients) {
            groups.push({
                slots: group.slice(0, numberOfPatients),
                startTime: group[0].StartTime,
                scheduleViewGUID: group[0].ScheduleViewGUID,
                locationGUID: group[0].LocationGUID
            });
        }
    }
    return groups;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function executeRequest() {
    const toolName = 'chord_scheduling';
    const action = $action;
    const timeout = 30000;

    console.log(`[${toolName}] Action: ${action}`);

    const validActions = ['slots', 'grouped_slots', 'book_child', 'cancel'];
    if (!action || !validActions.includes(action)) {
        throw new Error(`Invalid action '${action}'. Valid: ${validActions.join(', ')}`);
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
        appointmentGUID: typeof $appointmentGUID !== 'undefined' ? $appointmentGUID : null
    };
    const params = cleanParams(rawParams);

    let procedure, apiParams;

    try {
        switch (action) {
            case 'slots':
            case 'grouped_slots':
                // ========================================================
                // UPDATED: Use dynamic dates instead of hardcoded Jan 2026
                // ========================================================
                const dynamicDates = getDynamicDateRange();
                const searchStartDate = params.startDate || dynamicDates.startDate;
                const searchEndDate = params.endDate || dynamicDates.endDate;

                console.log(`[${toolName}] Searching slots from ${searchStartDate} to ${searchEndDate}`);

                if (action === 'grouped_slots' && !params.numberOfPatients) {
                    throw new Error('numberOfPatients required for grouped_slots');
                }

                procedure = 'GetOnlineReservations';
                apiParams = {
                    startDate: parseDateOrDefault(searchStartDate, true),
                    endDate: parseDateOrDefault(searchEndDate, false),
                    morning: 'True',
                    afternoon: 'True',
                    appttypGUIDs: CLOUD9.defaultApptTypeGUID
                };
                if (params.scheduleViewGUIDs) apiParams.schdvwGUIDs = params.scheduleViewGUIDs;
                break;

            case 'book_child':
                if (!params.patientGUID) throw new Error('patientGUID required');
                if (!params.startTime) throw new Error('startTime required (MM/DD/YYYY HH:MM AM)');
                if (!params.scheduleViewGUID) throw new Error('scheduleViewGUID required');
                if (!params.scheduleColumnGUID) throw new Error('scheduleColumnGUID required');
                if (!params.appointmentTypeGUID) throw new Error('appointmentTypeGUID required');
                procedure = 'SetAppointment';
                apiParams = {
                    PatientGUID: params.patientGUID,
                    StartTime: params.startTime,
                    ScheduleViewGUID: params.scheduleViewGUID,
                    ScheduleColumnGUID: params.scheduleColumnGUID,
                    AppointmentTypeGUID: params.appointmentTypeGUID,
                    Minutes: String(params.minutes || 30),
                    VendorUserName: CLOUD9.vendorUserName
                };
                break;

            case 'cancel':
                if (!params.appointmentGUID) throw new Error('appointmentGUID required');
                procedure = 'SetAppointmentStatusCanceled';
                apiParams = { apptGUID: params.appointmentGUID };
                break;
        }

        const xmlRequest = buildXmlRequest(procedure, apiParams);
        console.log(`[${toolName}] Calling Cloud9: ${procedure}`);
        console.log(`[${toolName}] Endpoint: ${CLOUD9.endpoint}`);

        const response = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlRequest,
            timeout: 30000
        });

        const xmlText = await response.text();
        console.log(`[${toolName}] Response status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const parsed = parseXmlResponse(xmlText);

        let result;
        switch (action) {
            case 'slots':
                result = {
                    slots: parsed.records,
                    count: parsed.records.length,
                    searchRange: {
                        startDate: searchStartDate,
                        endDate: searchEndDate
                    }
                };
                console.log(`[${toolName}] Found ${parsed.records.length} slots`);
                break;

            case 'grouped_slots':
                const groups = groupConsecutiveSlots(
                    parsed.records,
                    parseInt(params.numberOfPatients),
                    params.timeWindowMinutes ? parseInt(params.timeWindowMinutes) : null
                );
                result = {
                    groups: groups,
                    count: groups.length,
                    numberOfPatients: params.numberOfPatients,
                    searchRange: {
                        startDate: searchStartDate,
                        endDate: searchEndDate
                    }
                };
                console.log(`[${toolName}] Found ${groups.length} grouped options`);
                break;

            case 'book_child':
                const apptResult = parsed.records[0]?.Result || '';
                const apptGUID = extractGuidFromResult(apptResult, /Appointment GUID Added:\s*([A-Fa-f0-9-]+)/i);
                result = {
                    success: apptResult.includes('Added'),
                    appointmentGUID: apptGUID,
                    message: apptResult
                };
                console.log(`[${toolName}] Appointment created: ${apptGUID}`);
                break;

            case 'cancel':
                const cancelResult = parsed.records[0]?.Result || 'Cancellation processed';
                result = {
                    success: !cancelResult.toLowerCase().includes('error'),
                    message: cancelResult
                };
                console.log(`[${toolName}] Cancellation: ${cancelResult}`);
                break;
        }

        return JSON.stringify(result);

    } catch (error) {
        console.error(`[${toolName}] Error:`, error.message);
        return JSON.stringify({
            error: `Failed to execute ${action}`,
            message: error.message,
            action: action,
            timestamp: new Date().toISOString()
        });
    }
}

return executeRequest();

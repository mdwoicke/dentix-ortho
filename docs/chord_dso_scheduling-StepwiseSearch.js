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
 * UPDATED: Stepwise date expansion - if no slots found, automatically
 *          expands search range by 10 days and retries (max 3 attempts)
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
    defaultApptTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a'
};

// ============================================================================
// STEPWISE SEARCH CONFIGURATION
// ============================================================================

const STEPWISE_CONFIG = {
    maxAttempts: 3,           // Maximum number of search attempts
    expansionDays: 10,        // Days to add to endDate on each retry
    maxRangeDays: 196         // Cloud9 API limit: ~28 weeks from start
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
// DATE UTILITIES
// ============================================================================

function formatDate(d) {
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
}

function parseDate(dateStr) {
    // Parse MM/DD/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    }
    return new Date(dateStr);
}

function addDays(dateStr, days) {
    const date = parseDate(dateStr);
    date.setDate(date.getDate() + days);
    return formatDate(date);
}

function getDynamicDateRange() {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() + 1);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 14);

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };
}

function parseDateOrDefault(dateStr, isStart) {
    if (dateStr && dateStr.trim() !== '') {
        if (dateStr.includes(':')) return dateStr;
        return isStart ? `${dateStr} 7:00:00 AM` : `${dateStr} 5:00:00 PM`;
    }
    const dynamic = getDynamicDateRange();
    const date = isStart ? dynamic.startDate : dynamic.endDate;
    return isStart ? `${date} 7:00:00 AM` : `${date} 5:00:00 PM`;
}

function getDaysBetween(startDateStr, endDateStr) {
    const start = parseDate(startDateStr);
    const end = parseDate(endDateStr);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
}

function validateAndCorrectDates(startDateStr, endDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let correctedStart = startDateStr;
    let correctedEnd = endDateStr;
    let wasDateCorrected = false;
    let correctionMessage = null;

    // Check if startDate is in the past
    if (startDateStr) {
        const startDate = parseDate(startDateStr);
        startDate.setHours(0, 0, 0, 0);

        if (startDate < today) {
            correctedStart = formatDate(tomorrow);
            wasDateCorrected = true;
            correctionMessage = `Requested date ${startDateStr} is in the past. Searching from ${correctedStart} instead.`;
            console.log(`[DATE VALIDATION] ${correctionMessage}`);
        }
    }

    // Check if endDate is before corrected startDate
    if (endDateStr && correctedStart) {
        const endDate = parseDate(endDateStr);
        const startDate = parseDate(correctedStart);

        if (endDate <= startDate) {
            // Set endDate to startDate + 14 days
            const newEnd = new Date(startDate);
            newEnd.setDate(newEnd.getDate() + 14);
            correctedEnd = formatDate(newEnd);
            wasDateCorrected = true;
        }
    }

    return {
        startDate: correctedStart,
        endDate: correctedEnd,
        wasDateCorrected,
        correctionMessage,
        currentDate: formatDate(today)
    };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function cleanParams(params) {
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
        // Skip null/undefined
        if (value === null || value === undefined) continue;

        // For strings, check if empty or placeholder value
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed === '' ||
                trimmed.toUpperCase() === 'NULL' ||
                trimmed.toUpperCase() === 'NONE' ||
                trimmed.toUpperCase() === 'N/A' ||
                trimmed.toUpperCase() === 'UNDEFINED') {
                continue;
            }
        }

        cleaned[key] = value;
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
// STEPWISE SLOT SEARCH - Core new functionality
// ============================================================================

async function searchSlotsWithExpansion(startDate, endDate, scheduleViewGUIDs, toolName) {
    let currentEndDate = endDate;
    let attempt = 0;
    let lastError = null;
    const searchHistory = [];

    while (attempt < STEPWISE_CONFIG.maxAttempts) {
        attempt++;

        // Check if we've exceeded the max range
        const rangeDays = getDaysBetween(startDate, currentEndDate);
        if (rangeDays > STEPWISE_CONFIG.maxRangeDays) {
            console.log(`[${toolName}] Max range exceeded (${rangeDays} days > ${STEPWISE_CONFIG.maxRangeDays}). Stopping.`);
            break;
        }

        console.log(`[${toolName}] Attempt ${attempt}/${STEPWISE_CONFIG.maxAttempts}: Searching ${startDate} to ${currentEndDate}`);

        const apiParams = {
            startDate: parseDateOrDefault(startDate, true),
            endDate: parseDateOrDefault(currentEndDate, false),
            morning: 'True',
            afternoon: 'True',
            appttypGUIDs: CLOUD9.defaultApptTypeGUID
        };
        if (scheduleViewGUIDs) apiParams.schdvwGUIDs = scheduleViewGUIDs;

        try {
            const xmlRequest = buildXmlRequest('GetOnlineReservations', apiParams);

            const response = await fetch(CLOUD9.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: xmlRequest,
                timeout: 30000
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const xmlText = await response.text();
            const parsed = parseXmlResponse(xmlText);

            searchHistory.push({
                attempt,
                startDate,
                endDate: currentEndDate,
                slotsFound: parsed.records.length
            });

            console.log(`[${toolName}] Attempt ${attempt}: Found ${parsed.records.length} slots`);

            // SUCCESS: Found slots, return them
            if (parsed.records.length > 0) {
                return {
                    success: true,
                    records: parsed.records,
                    searchRange: { startDate, endDate: currentEndDate },
                    attempts: attempt,
                    expanded: attempt > 1,
                    searchHistory
                };
            }

            // NO SLOTS: Expand the date range and retry
            console.log(`[${toolName}] No slots found. Expanding endDate by ${STEPWISE_CONFIG.expansionDays} days...`);
            currentEndDate = addDays(currentEndDate, STEPWISE_CONFIG.expansionDays);

        } catch (error) {
            console.error(`[${toolName}] Attempt ${attempt} error:`, error.message);
            lastError = error;

            searchHistory.push({
                attempt,
                startDate,
                endDate: currentEndDate,
                error: error.message
            });

            // On error, don't expand - this is likely an API issue, not a date issue
            break;
        }
    }

    // All attempts exhausted or error occurred
    return {
        success: false,
        records: [],
        searchRange: { startDate, endDate: currentEndDate },
        attempts: attempt,
        expanded: attempt > 1,
        searchHistory,
        error: lastError ? lastError.message : 'No slots found after all attempts'
    };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function executeRequest() {
    const toolName = 'chord_dso_scheduling';
    const action = $action;

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

    try {
        switch (action) {
            case 'slots':
            case 'grouped_slots': {
                const dynamicDates = getDynamicDateRange();
                const requestedStart = params.startDate || dynamicDates.startDate;
                const requestedEnd = params.endDate || dynamicDates.endDate;

                // VALIDATE AND AUTO-CORRECT PAST DATES
                const dateValidation = validateAndCorrectDates(requestedStart, requestedEnd);
                const searchStartDate = dateValidation.startDate || dynamicDates.startDate;
                const searchEndDate = dateValidation.endDate || dynamicDates.endDate;

                console.log(`[${toolName}] Current date: ${dateValidation.currentDate}`);
                console.log(`[${toolName}] Requested: ${requestedStart} to ${requestedEnd}`);
                console.log(`[${toolName}] Searching: ${searchStartDate} to ${searchEndDate}`);
                if (dateValidation.wasDateCorrected) {
                    console.log(`[${toolName}] Date was corrected: ${dateValidation.correctionMessage}`);
                }

                // For grouped_slots, default to 2 patients if not provided (common sibling scenario)
                if (action === 'grouped_slots' && !params.numberOfPatients) {
                    params.numberOfPatients = 2;
                    console.log(`[${toolName}] numberOfPatients not provided, defaulting to 2`);
                }

                // Use stepwise expansion search
                const searchResult = await searchSlotsWithExpansion(
                    searchStartDate,
                    searchEndDate,
                    params.scheduleViewGUIDs,
                    toolName
                );

                if (action === 'slots') {
                    let message = searchResult.expanded
                        ? `Found ${searchResult.records.length} slots after expanding search to ${searchResult.searchRange.endDate}`
                        : `Found ${searchResult.records.length} slots`;
                    if (dateValidation.wasDateCorrected) {
                        message = `${dateValidation.correctionMessage} ${message}`;
                    }
                    return JSON.stringify({
                        slots: searchResult.records,
                        count: searchResult.records.length,
                        searchRange: searchResult.searchRange,
                        attempts: searchResult.attempts,
                        expanded: searchResult.expanded,
                        currentDate: dateValidation.currentDate,
                        dateWasCorrected: dateValidation.wasDateCorrected,
                        message: message
                    });
                } else {
                    // grouped_slots
                    const groups = groupConsecutiveSlots(
                        searchResult.records,
                        parseInt(params.numberOfPatients),
                        params.timeWindowMinutes ? parseInt(params.timeWindowMinutes) : null
                    );
                    let message = searchResult.expanded
                        ? `Found ${groups.length} grouped options after expanding search to ${searchResult.searchRange.endDate}`
                        : `Found ${groups.length} grouped options`;
                    if (dateValidation.wasDateCorrected) {
                        message = `${dateValidation.correctionMessage} ${message}`;
                    }
                    return JSON.stringify({
                        groups: groups,
                        count: groups.length,
                        numberOfPatients: params.numberOfPatients,
                        searchRange: searchResult.searchRange,
                        attempts: searchResult.attempts,
                        expanded: searchResult.expanded,
                        currentDate: dateValidation.currentDate,
                        dateWasCorrected: dateValidation.wasDateCorrected,
                        message: message
                    });
                }
            }

            case 'book_child': {
                if (!params.patientGUID) throw new Error('patientGUID required');
                if (!params.startTime) throw new Error('startTime required (MM/DD/YYYY HH:MM AM)');
                if (!params.scheduleViewGUID) throw new Error('scheduleViewGUID required');
                if (!params.scheduleColumnGUID) throw new Error('scheduleColumnGUID required');
                // Use default appointmentTypeGUID if not provided or empty
                const appointmentTypeGUID = params.appointmentTypeGUID || CLOUD9.defaultApptTypeGUID;
                console.log(`[${toolName}] Using appointmentTypeGUID: ${appointmentTypeGUID}`);

                const apiParams = {
                    PatientGUID: params.patientGUID,
                    StartTime: params.startTime,
                    ScheduleViewGUID: params.scheduleViewGUID,
                    ScheduleColumnGUID: params.scheduleColumnGUID,
                    AppointmentTypeGUID: appointmentTypeGUID,
                    Minutes: String(params.minutes || 30),
                    VendorUserName: CLOUD9.vendorUserName
                };

                const xmlRequest = buildXmlRequest('SetAppointment', apiParams);
                const response = await fetch(CLOUD9.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/xml' },
                    body: xmlRequest,
                    timeout: 30000
                });

                const xmlText = await response.text();
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const parsed = parseXmlResponse(xmlText);
                const apptResult = parsed.records[0]?.Result || '';
                const apptGUID = extractGuidFromResult(apptResult, /Appointment GUID Added:\s*([A-Fa-f0-9-]+)/i);

                return JSON.stringify({
                    success: apptResult.includes('Added'),
                    appointmentGUID: apptGUID,
                    message: apptResult
                });
            }

            case 'cancel': {
                if (!params.appointmentGUID) throw new Error('appointmentGUID required');

                const xmlRequest = buildXmlRequest('SetAppointmentStatusCanceled', {
                    apptGUID: params.appointmentGUID
                });

                const response = await fetch(CLOUD9.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/xml' },
                    body: xmlRequest,
                    timeout: 30000
                });

                const xmlText = await response.text();
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const parsed = parseXmlResponse(xmlText);
                const cancelResult = parsed.records[0]?.Result || 'Cancellation processed';

                return JSON.stringify({
                    success: !cancelResult.toLowerCase().includes('error'),
                    message: cancelResult
                });
            }
        }

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

// Ortho Get Appointment Slots - Calls Cloud9 GetOnlineReservations with retry logic
// v8: Added retry with 5s delay for Cloud9 API rate limiting
// v7: Added Chair 8 filter - only return slots available on Chair 8
// v6: Removed appttypGUIDs filter - was excluding target location slots
// v5: Changed to 30-day windows (2 max) - finds slots in single call
// v4: Added 3s delay between sliding windows to avoid Cloud9 rate limiting
// v3: Fixed Cloud9 API limitation - returns 0 slots for ranges > 14 days. Now uses sliding windows.

const CLOUD9 = {
    endpoint: env.get('cloud9Endpoint'),
    clientId: env.get('cloud9ClientId'),
    userName: env.get('cloud9UserName'),
    password: env.get('cloud9Password'),
    namespace: env.get('cloud9Namespace'),
    defaultApptTypeGUID: env.get('defaultApptTypeGUID'),
    defaultLocationGUID: env.get('defaultLocationGUID')
};

// Chair 8 filter - only return slots available on Chair 8 for test bookings
const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034';

// v8: Retry configuration for Cloud9 rate limiting
const RETRY_CONFIG = {
    maxRetries: 3,              // Maximum retry attempts per API call
    retryDelayMs: 5000,         // 5 seconds between retries
    retryOnZeroResults: true    // Retry when API returns 0 results (rate limiting pattern)
};

const STEPWISE_CONFIG = {
    maxAttempts: 2,             // Max sliding windows
    windowDays: 30,             // Days per window
    maxRangeDays: 196,
    requestTimeoutMs: 60000,    // Increased timeout for retries
    delayBetweenWindowsMs: 5000 // 5s delay between windows (v8: increased from 3s)
};

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const VOICE_TEMPLATES = {
    slotOffer: (time, day, date) => `I have ${time} available on ${day}. Would that work?`,
    noSlotsExpanding: "Let me check a few more dates.",
    transferOnFailure: "I want to connect you with a specialist who can assist you."
};

const CONFIRMATION_PATTERNS = {
    affirmative: ['yes', 'yeah', 'yep', 'yup', 'sure', 'okay', 'ok', 'alright', 'that works', 'works for me', 'perfect', 'sounds good'],
    negative: ['no', 'nope', 'not that', 'different', 'another', 'other times'],
    goodbye: ['that\'s all', 'that\'s it', 'no thanks', 'i\'m good', 'goodbye', 'bye']
};

function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[<>&'"]/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'}[c]));
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

function formatDate(d) {
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${month}/${day}/${d.getFullYear()}`;
}

function parseDate(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    return new Date(dateStr);
}

function addDays(dateStr, days) {
    const date = parseDate(dateStr);
    date.setDate(date.getDate() + days);
    return formatDate(date);
}

function getDayName(dateStr) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[parseDate(dateStr).getDay()];
}

function formatSlotForVoice(slot) {
    const date = slot.StartTime.split(' ')[0];
    const time = slot.StartTime.split(' ').slice(1).join(' ');
    return { time: time, date: date, day: getDayName(date), raw: slot };
}

function validateAndCorrectDates(startDateStr, endDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let correctedStart = startDateStr;
    let wasDateCorrected = false;

    if (startDateStr) {
        const startDate = parseDate(startDateStr);
        startDate.setHours(0, 0, 0, 0);
        if (startDate < today) {
            correctedStart = formatDate(tomorrow);
            wasDateCorrected = true;
        }
    }

    let correctedEnd = endDateStr;
    if (endDateStr && correctedStart) {
        const endDate = parseDate(endDateStr);
        const startDate = parseDate(correctedStart);
        if (endDate <= startDate) {
            const newEnd = new Date(startDate);
            newEnd.setDate(newEnd.getDate() + 14);
            correctedEnd = formatDate(newEnd);
        }
    }

    return { startDate: correctedStart, endDate: correctedEnd, wasDateCorrected };
}

function createLlmGuidance(scenario, context = {}) {
    const baseGuidance = {
        timestamp: new Date().toISOString(),
        confirmation_triggers: CONFIRMATION_PATTERNS.affirmative,
        goodbye_triggers: CONFIRMATION_PATTERNS.goodbye,
        prohibited_responses: ["Let me check on that", "One moment while I look into this", "I'm verifying", "sorry", "unfortunately", "error", "problem"]
    };

    switch (scenario) {
        case 'slots_found':
            return {
                ...baseGuidance,
                current_state: "SCHEDULING",
                next_state: "SCHEDULING",
                action_required: "offer_time_to_caller",
                voice_response: VOICE_TEMPLATES.slotOffer(context.firstSlot?.time, context.firstSlot?.day, context.firstSlot?.date),
                chain_of_action: [
                    "1. Speak the time offer to caller",
                    "2. Wait for response",
                    "3. If affirmative → call chord_dso_patient action=create",
                    "4. Then IMMEDIATELY call book_child with patientGUID",
                    "5. Confirm booking to caller"
                ],
                on_user_confirms: { action: "PROCEED_TO_BOOKING", do_not_say: "Would you like to book?", do_say: "Perfect! Let me get that booked." },
                on_user_declines: { action: "OFFER_ALTERNATIVE", do_say: "No problem. How about [next slot]?" }
            };
        case 'slots_not_found':
            return {
                ...baseGuidance,
                current_state: "SCHEDULING",
                next_state: context.attempts < 3 ? "SCHEDULING" : "TRANSFER",
                action_required: context.attempts < 3 ? "expand_and_retry" : "transfer_to_agent",
                voice_response: context.attempts < 3 ? VOICE_TEMPLATES.noSlotsExpanding : VOICE_TEMPLATES.transferOnFailure
            };
        default:
            return baseGuidance;
    }
}

// v8: Cloud9 API call with retry logic for rate limiting
async function fetchCloud9WithRetry(xmlRequest, context = '') {
    let lastError = null;
    let lastRecords = [];
    let totalRetries = 0;

    for (let retry = 0; retry <= RETRY_CONFIG.maxRetries; retry++) {
        try {
            if (retry > 0) {
                node.warn(`[v8 RETRY] ${context} - Retry ${retry}/${RETRY_CONFIG.maxRetries}, waiting ${RETRY_CONFIG.retryDelayMs / 1000}s...`);
                await delay(RETRY_CONFIG.retryDelayMs);
            }

            const response = await fetch(CLOUD9.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: xmlRequest,
                timeout: STEPWISE_CONFIG.requestTimeoutMs
            });

            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status}`);
                throw lastError;
            }

            const xmlText = await response.text();
            const parsed = parseXmlResponse(xmlText);
            lastRecords = parsed.records;

            // Check for zero-result rate limiting pattern
            if (RETRY_CONFIG.retryOnZeroResults && parsed.records.length === 0 && retry < RETRY_CONFIG.maxRetries) {
                node.warn(`[v8 RETRY] ${context} - Got 0 results (possible rate limit), will retry...`);
                totalRetries++;
                continue;
            }

            // Success!
            return {
                success: true,
                status: parsed.status,
                records: parsed.records,
                retries: totalRetries
            };

        } catch (error) {
            lastError = error;
            totalRetries++;
            node.warn(`[v8 RETRY] ${context} - Error: ${error.message}`);
        }
    }

    // All retries exhausted
    return {
        success: false,
        error: lastError,
        status: 'Error',
        records: lastRecords,
        retries: totalRetries
    };
}

async function searchSlotsWithSlidingWindow(initialStartDate, scheduleViewGUIDs) {
    let currentStart = initialStartDate;
    let windowAttempt = 0;
    let totalRetries = 0;

    while (windowAttempt < STEPWISE_CONFIG.maxAttempts) {
        // v8: Add 5s delay before subsequent windows
        if (windowAttempt > 0) {
            await delay(STEPWISE_CONFIG.delayBetweenWindowsMs);
            node.warn(`Waited ${STEPWISE_CONFIG.delayBetweenWindowsMs}ms before window ${windowAttempt + 1}`);
        }
        windowAttempt++;
        const currentEnd = addDays(currentStart, STEPWISE_CONFIG.windowDays);
        node.warn(`[v8] Slot search window ${windowAttempt}: ${currentStart} to ${currentEnd}`);

        const apiParams = {
            startDate: `${currentStart} 7:00:00 AM`,
            endDate: `${currentEnd} 5:00:00 PM`,
            morning: 'True',
            afternoon: 'True'
        };
        if (scheduleViewGUIDs) apiParams.schdvwGUIDs = scheduleViewGUIDs;
        const xmlRequest = buildXmlRequest('GetOnlineReservations', apiParams);

        // v8: Use retry-enabled fetch
        const result = await fetchCloud9WithRetry(xmlRequest, `Window ${windowAttempt}`);
        totalRetries += result.retries || 0;

        if (!result.success) {
            const isTimeout = (result.error?.message || '').toLowerCase().includes('timeout');
            return {
                success: false,
                records: [],
                attempts: windowAttempt,
                retries: totalRetries,
                errorType: isTimeout ? 'timeout' : 'api_error',
                shouldTransfer: true
            };
        }

        // Filter by location
        let filteredRecords = result.records;
        if (CLOUD9.defaultLocationGUID && result.records.length > 0) {
            filteredRecords = result.records.filter(slot => slot.LocationGUID === CLOUD9.defaultLocationGUID);
            node.warn(`Location filter: ${result.records.length} total -> ${filteredRecords.length} at location`);

            // v7: Filter by Chair 8
            const beforeChair8Count = filteredRecords.length;
            filteredRecords = filteredRecords.filter(slot => slot.ScheduleColumnGUID === CHAIR_8_GUID);
            node.warn(`Chair 8 filter: ${beforeChair8Count} -> ${filteredRecords.length} on Chair 8`);
        }

        if (filteredRecords.length > 0) {
            return {
                success: true,
                records: filteredRecords,
                attempts: windowAttempt,
                retries: totalRetries,
                expanded: windowAttempt > 1,
                searchRange: { startDate: currentStart, endDate: currentEnd },
                _slidingWindow: true
            };
        }

        // Slide window forward
        currentStart = addDays(currentStart, STEPWISE_CONFIG.windowDays);
    }

    return {
        success: false,
        records: [],
        attempts: windowAttempt,
        retries: totalRetries,
        shouldTransfer: windowAttempt >= STEPWISE_CONFIG.maxAttempts
    };
}

async function getApptSlots() {
    try {
        const params = msg.payload;
        const dates = validateAndCorrectDates(
            params.startDate || formatDate(new Date(Date.now() + 86400000)),
            params.endDate || formatDate(new Date(Date.now() + 15 * 86400000))
        );

        const result = await searchSlotsWithSlidingWindow(dates.startDate, params.scheduleViewGUIDs);

        if (result.success && result.records.length > 0) {
            const DEFAULT_APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';
            const enrichedSlots = result.records.map(slot => ({
                ...slot,
                scheduleViewGUID: slot.ScheduleViewGUID || slot.scheduleViewGUID,
                scheduleColumnGUID: slot.ScheduleColumnGUID || slot.scheduleColumnGUID,
                startTime: slot.StartTime || slot.startTime,
                minutes: slot.Minutes || slot.minutes || '40',
                appointmentTypeGUID: slot.AppointmentTypeGUID || slot.appointmentTypeGUID || CLOUD9.defaultApptTypeGUID || DEFAULT_APPT_TYPE_GUID,
                ScheduleViewGUID: slot.ScheduleViewGUID || slot.scheduleViewGUID,
                ScheduleColumnGUID: slot.ScheduleColumnGUID || slot.scheduleColumnGUID,
                AppointmentTypeGUID: slot.AppointmentTypeGUID || slot.appointmentTypeGUID || CLOUD9.defaultApptTypeGUID || DEFAULT_APPT_TYPE_GUID
            }));
            const voiceSlots = enrichedSlots.slice(0, 5).map(formatSlotForVoice);
            const firstSlot = voiceSlots[0];

            msg.payload = {
                slots: enrichedSlots,
                count: result.records.length,
                voiceSlots: voiceSlots,
                searchRange: result.searchRange,
                attempts: result.attempts,
                retries: result.retries,
                expanded: result.expanded,
                llm_guidance: createLlmGuidance('slots_found', { firstSlot })
            };
        } else if (result.shouldTransfer || result.errorType) {
            msg.payload = {
                slots: [],
                count: 0,
                attempts: result.attempts,
                retries: result.retries,
                llm_guidance: {
                    ...createLlmGuidance('slots_not_found', { attempts: STEPWISE_CONFIG.maxAttempts }),
                    action_required: "transfer_to_agent",
                    voice_response: "I want to connect you with a specialist who can assist you. One moment while I transfer your call.",
                    transfer_reason: result.errorType || "no_slots_after_retries",
                    CRITICAL: "Do NOT mention error, timeout, or technical problems. Transfer gracefully without explanation.",
                    prohibited_responses: ["error", "timeout", "problem", "issue", "technical", "system", "down", "difficulties", "went wrong"]
                }
            };
        } else {
            msg.payload = {
                slots: [],
                count: 0,
                attempts: result.attempts,
                retries: result.retries,
                llm_guidance: createLlmGuidance('slots_not_found', { attempts: result.attempts })
            };
        }

        return msg;
    } catch (error) {
        node.error('Get appt slots error: ' + error.message, msg);
        msg.payload = { error: 'Failed to get appointment slots', message: error.message, timestamp: new Date().toISOString() };
        msg.statusCode = 500;
        return msg;
    }
}

return getApptSlots();

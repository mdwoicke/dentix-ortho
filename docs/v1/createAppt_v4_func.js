// Ortho Create Appointment - Calls Cloud9 SetAppointment
// v5.3: Fixed spacing gap - update timestamp even when request is queued (sibling booking fix)
// v5.2: Added queue event logging for reporting
// v5.1: Reduced sync retries to 2 (~10s max) for better IVA UX, async queue handles the rest
// v5: Async queue for rate-limited requests - queue and return immediately, retry in background
// v4: Two-layer rate limit handling: automatic spacing + progressive retry
// v3: Added rate limit retry logic with 10s delay
// v2: Enhanced error logging to expose actual Cloud9 error messages
const CLOUD9 = {
    endpoint: env.get('cloud9Endpoint'),
    clientId: env.get('cloud9ClientId'),
    userName: env.get('cloud9UserName'),
    password: env.get('cloud9Password'),
    namespace: env.get('cloud9Namespace'),
    vendorUserName: env.get('vendorUserName'),
    defaultApptTypeGUID: env.get('defaultApptTypeGUID')
};

// v4: Two-layer rate limit handling for sibling bookings
// Layer 1: Automatic spacing - prevent rate limits by spacing consecutive calls
const BOOKING_SPACING_MS = 10000;  // 10s minimum between SetAppointment calls

// Layer 2: Quick sync retry - minimize dead air, then fall back to async queue
const RETRY_CONFIG = {
    maxRetries: 2,
    retryDelays: [5000]  // Single 5s retry before queueing (~10s max dead air)
};

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const VOICE_TEMPLATES = {
    bookingConfirmed: (childName, day, date, time) =>
        `Your appointment is confirmed! ${childName}, ${day} ${date} at ${time}.`,
    transferOnFailure: "I want to connect you with a specialist who can assist you."
};

// Error type detection for better debugging
// v3: Added RATE_LIMIT pattern
const ERROR_PATTERNS = {
    RATE_LIMIT: /too many requests|rate limit/i,
    PATIENT_NOT_FOUND: /patient.*guid.*does not exist/i,
    SLOT_NOT_AVAILABLE: /slot.*not available|time.*not available|already.*booked/i,
    INVALID_SCHEDULE_VIEW: /schedule.*view.*invalid|schedule.*view.*not found/i,
    INVALID_SCHEDULE_COLUMN: /schedule.*column.*invalid|column.*not found/i,
    INVALID_APPT_TYPE: /appointment.*type.*invalid/i,
    AUTHORIZATION_ERROR: /not authorized|authorization/i
};


// Helper: Log queue activity event to flow context for reporting
function logQueueEvent(eventType, operationId, data = {}) {
    const events = flow.get('queueActivityEvents') || [];
    events.push({
        eventType,
        operationId,
        patientGUID: data.patientGUID || null,
        patientName: data.childName || null,
        appointmentDateTime: data.startTime || null,
        scheduleViewGUID: data.scheduleViewGUID || null,
        scheduleColumnGUID: data.scheduleColumnGUID || null,
        appointmentTypeGUID: data.appointmentTypeGUID || null,
        attemptNumber: data.attemptNumber || 0,
        maxAttempts: data.maxAttempts || 10,
        appointmentGUID: data.appointmentGUID || null,
        errorMessage: data.errorMessage || null,
        backoffMs: data.backoffMs || null,
        nextRetryAt: data.nextRetryAt || null,
        durationMs: data.durationMs || null,
        uui: data.uui || null,
        sessionId: data.sessionId || null,
        eventTimestamp: new Date().toISOString()
    });
    // Keep only last 1000 events to prevent memory issues
    if (events.length > 1000) events.shift();
    flow.set('queueActivityEvents', events);
}

function detectErrorType(resultMessage) {
    for (const [errorType, pattern] of Object.entries(ERROR_PATTERNS)) {
        if (pattern.test(resultMessage)) return errorType;
    }
    return resultMessage.toLowerCase().includes('error') ? 'CLOUD9_ERROR' : 'UNKNOWN';
}

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
    const errorMatch = xmlText.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
    const errorMessage = errorMatch ? errorMatch[1] : null;
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
    return { status, errorMessage, records };
}

function parseDate(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    return new Date(dateStr);
}

function getDayName(dateStr) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[parseDate(dateStr).getDay()];
}

function createLlmGuidance(scenario, context = {}) {
    const baseGuidance = {
        timestamp: new Date().toISOString(),
        prohibited_responses: ["Let me check on that", "One moment while I look into this", "I'm verifying", "sorry", "unfortunately", "error", "problem"]
    };

    switch (scenario) {
        case 'booking_success':
            return {
                ...baseGuidance,
                current_state: "CONFIRMATION",
                next_state: "CONFIRMATION",
                action_required: "confirm_booking_to_caller",
                voice_response: VOICE_TEMPLATES.bookingConfirmed(context.childName, context.day, context.date, context.time),
                required_keywords: ["scheduled", "booked", "confirmed", "all set"],
                chain_of_action: [
                    "1. Confirm booking with enthusiasm",
                    "2. State child name, day, date, time, location",
                    "3. Ask 'Would you like the address?'",
                    "4. Mention legal guardian requirement",
                    "5. Ask 'Anything else?'"
                ],
                never_do: ["Ask for re-confirmation", "Say 'Let me verify'", "Delay the confirmation"]
            };
        case 'booking_failed':
            return {
                ...baseGuidance,
                current_state: "SCHEDULING",
                next_state: context.canRetry ? "SCHEDULING" : "TRANSFER",
                action_required: context.canRetry ? "offer_alternative_slot" : "transfer_to_agent",
                voice_response: context.canRetry ? "That time isn't available. How about [alternative]?" : VOICE_TEMPLATES.transferOnFailure
            };
        case 'patient_not_found':
            return {
                ...baseGuidance,
                current_state: "SCHEDULING",
                next_state: "SCHEDULING",
                action_required: "recreate_patient_then_retry",
                voice_response: "Let me verify your information.",
                CRITICAL: "Patient does not exist in Cloud9. You MUST call chord_dso_patient action=create BEFORE booking.",
                recovery_steps: ["1. Call chord_dso_patient with action=create", "2. Use returned patientGUID", "3. Retry book_child with new patientGUID"]
            };
        case 'missing_slot_data':
            return {
                ...baseGuidance,
                current_state: "TRANSFER",
                next_state: "TRANSFER",
                action_required: "transfer_to_agent",
                transfer_reason: "missing_scheduling_data",
                voice_response: VOICE_TEMPLATES.transferOnFailure
            };
        case 'booking_queued':
            return {
                ...baseGuidance,
                current_state: "BOOKING_QUEUED",
                next_state: "CONFIRMATION_PENDING",
                action_required: "inform_caller_queued",
                voice_response: "Your appointment request is being processed. You will receive a confirmation shortly.",
                internal_note: "Appointment was rate-limited and queued for async processing",
                chain_of_action: [
                    "1. Inform caller their request is being processed",
                    "2. Reassure them confirmation will come shortly",
                    "3. Ask if there's anything else you can help with",
                    "4. End call gracefully"
                ],
                never_do: ["Mention rate limit", "Mention system issue", "Say booking failed", "Transfer to agent"]
            };
        default:
            return baseGuidance;
    }
}

async function createAppt() {
    const requestTimestamp = new Date().toISOString();
    try {
        const params = msg.payload;

        // Enhanced input validation with debugging
        const missingFields = [];
        if (!params.patientGUID) missingFields.push('patientGUID');
        if (!params.startTime) missingFields.push('startTime');
        if (!params.scheduleViewGUID) missingFields.push('scheduleViewGUID');
        if (!params.scheduleColumnGUID) missingFields.push('scheduleColumnGUID');

        if (missingFields.length > 0) {
            const errorMsg = `Missing required fields: ${missingFields.join(', ')}`;
            node.warn('CreateAppt validation failed: ' + errorMsg);
            msg.payload = {
                success: false,
                message: errorMsg,
                _debug: {
                    error_type: 'VALIDATION_ERROR',
                    missing_fields: missingFields,
                    received_params: {
                        patientGUID: params.patientGUID ? params.patientGUID.substring(0, 8) + '...' : null,
                        startTime: params.startTime,
                        scheduleViewGUID: params.scheduleViewGUID ? 'present' : null,
                        scheduleColumnGUID: params.scheduleColumnGUID ? 'present' : null
                    },
                    timestamp: requestTimestamp
                },
                llm_guidance: createLlmGuidance('missing_slot_data')
            };
            return msg;
        }

        const xmlRequest = buildXmlRequest('SetAppointment', {
            PatientGUID: params.patientGUID,
            StartTime: params.startTime,
            ScheduleViewGUID: params.scheduleViewGUID,
            ScheduleColumnGUID: params.scheduleColumnGUID,
            AppointmentTypeGUID: params.appointmentTypeGUID || CLOUD9.defaultApptTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705',
            Minutes: String(params.minutes || 45),
            VendorUserName: CLOUD9.vendorUserName
        });

        node.warn('Calling Cloud9 SetAppointment for patient: ' + params.patientGUID.substring(0, 8) + '...');

        // v4 Layer 1: Automatic spacing - prevent rate limits by spacing consecutive calls
        const lastBookingTime = flow.get('lastSetAppointmentTime') || 0;
        const elapsed = Date.now() - lastBookingTime;
        let spacingWaitMs = 0;

        if (elapsed < BOOKING_SPACING_MS && lastBookingTime > 0) {
            spacingWaitMs = BOOKING_SPACING_MS - elapsed;
            node.warn(`Spacing: waiting ${spacingWaitMs}ms before SetAppointment (last call ${elapsed}ms ago)`);
            await delay(spacingWaitMs);
        }

        // v4 Layer 2: Progressive retry with increasing delays
        let attempt = 0;
        let lastError = null;
        let parsed = null;
        let xmlText = '';

        while (attempt < RETRY_CONFIG.maxRetries) {
            attempt++;

            // v4: Progressive delay before retry (not before first attempt)
            if (attempt > 1) {
                const delayMs = RETRY_CONFIG.retryDelays[attempt - 2] || 15000;
                node.warn(`Rate limit retry: waiting ${delayMs}ms before attempt ${attempt}`);
                await delay(delayMs);
            }

            try {
                const response = await fetch(CLOUD9.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/xml' },
                    body: xmlRequest,
                    timeout: 45000
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                xmlText = await response.text();
                parsed = parseXmlResponse(xmlText);

                // v4: Check for rate limit error in response
                const isRateLimited = parsed.errorMessage && ERROR_PATTERNS.RATE_LIMIT.test(parsed.errorMessage);

                if (isRateLimited && attempt < RETRY_CONFIG.maxRetries) {
                    node.warn(`Rate limit detected on attempt ${attempt}, will retry with progressive delay`);
                    lastError = parsed.errorMessage;
                    continue;  // Retry after delay
                }

                // Success or non-rate-limit error - exit retry loop
                break;

            } catch (fetchError) {
                lastError = fetchError.message;
                if (attempt >= RETRY_CONFIG.maxRetries) throw fetchError;
            }
        }

        // v5: Check if we exhausted retries and still got rate limited - queue for async processing
        const finalRateLimited = parsed?.errorMessage && ERROR_PATTERNS.RATE_LIMIT.test(parsed.errorMessage);
        if (finalRateLimited && attempt >= RETRY_CONFIG.maxRetries) {
            const operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            // Store in flow context for async retry by timer loop
            const pendingOps = flow.get('pendingOperations') || {};
            pendingOps[operationId] = {
                operationType: 'SetAppointment',
                requestPayload: {
                    patientGUID: params.patientGUID,
                    startTime: params.startTime,
                    scheduleViewGUID: params.scheduleViewGUID,
                    scheduleColumnGUID: params.scheduleColumnGUID,
                    appointmentTypeGUID: params.appointmentTypeGUID || CLOUD9.defaultApptTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705',
                    minutes: String(params.minutes || 45),
                    childName: params.childName
                },
                uui: msg.payload.uui || 'unknown',
                sessionId: msg.payload.sessionId || null,
                createdAt: new Date().toISOString(),
                attemptCount: 0,
                maxAttempts: 10,
                nextRetryAt: new Date().toISOString(), // Ready immediately
                lastError: 'Rate limited after sync retries - queued for async',
                status: 'pending'
            };
            flow.set('pendingOperations', pendingOps);

            node.warn(`QUEUED rate-limited SetAppointment for async processing: ${operationId}`);

            // v5.3: Update spacing timestamp even when queued - ensures sibling bookings are spaced
            flow.set('lastSetAppointmentTime', Date.now());

            // Log queued event for reporting
            logQueueEvent('queued', operationId, {
                patientGUID: params.patientGUID,
                childName: params.childName,
                startTime: params.startTime,
                scheduleViewGUID: params.scheduleViewGUID,
                scheduleColumnGUID: params.scheduleColumnGUID,
                appointmentTypeGUID: params.appointmentTypeGUID,
                maxAttempts: 10,
                uui: msg.payload.uui,
                sessionId: msg.payload.sessionId
            });


            msg.payload = {
                success: false,
                queued: true,
                operationId: operationId,
                message: 'Appointment request queued for processing due to high demand',
                _debug: {
                    error_type: 'RATE_LIMITED_QUEUED',
                    sync_attempts: attempt,
                    last_error: parsed.errorMessage,
                    request_params: {
                        patientGUID: params.patientGUID,
                        startTime: params.startTime,
                        scheduleViewGUID: params.scheduleViewGUID,
                        scheduleColumnGUID: params.scheduleColumnGUID
                    },
                    timestamp: requestTimestamp
                },
                llm_guidance: createLlmGuidance('booking_queued')
            };
            return msg;
        }

        // v4: Update last booking time after API call completes
        flow.set('lastSetAppointmentTime', Date.now());

        node.warn(`SetAppointment completed after ${attempt} attempt(s)${spacingWaitMs > 0 ? ` (spacing wait: ${spacingWaitMs}ms)` : ''}`)

        const result = parsed.records[0]?.Result || '';
        const apptGUID = result.match(/Appointment GUID Added:\s*([A-Fa-f0-9-]+)/i)?.[1];
        const success = result.includes('Added');
        const errorType = success ? null : detectErrorType(parsed.errorMessage || result);

        const timeParts = params.startTime.split(' ');
        const date = timeParts[0];
        const time = timeParts.slice(1).join(' ');

        // Log the actual Cloud9 response for debugging
        if (!success) {
            node.warn(`CreateAppt FAILED - Cloud9 Result: ${result || '(empty)'} | ErrorType: ${errorType}`);
        }

        // Determine appropriate guidance based on error type
        let guidance;
        if (success) {
            guidance = createLlmGuidance('booking_success', {
                childName: params.childName || 'your child',
                date: date,
                time: time,
                day: getDayName(date)
            });
        } else if (errorType === 'PATIENT_NOT_FOUND') {
            guidance = createLlmGuidance('patient_not_found', { canRetry: true });
        } else {
            guidance = createLlmGuidance('booking_failed', {
                childName: params.childName || 'your child',
                date: date,
                time: time,
                day: getDayName(date),
                canRetry: errorType === 'SLOT_NOT_AVAILABLE'
            });
        }

        msg.payload = {
            success: success,
            appointmentGUID: apptGUID,
            message: result,
            _debug: {
                cloud9_result: result,
                cloud9_status: parsed.status,
                cloud9_error_message: parsed.errorMessage,
                error_type: errorType,
                attempts: attempt,
                retried: attempt > 1,
                spacing_wait_ms: spacingWaitMs,
                request_params: {
                    patientGUID: params.patientGUID,
                    startTime: params.startTime,
                    scheduleViewGUID: params.scheduleViewGUID,
                    scheduleColumnGUID: params.scheduleColumnGUID
                },
                timestamp: requestTimestamp,
                response_timestamp: new Date().toISOString()
            },
            llm_guidance: guidance
        };

        return msg;
    } catch (error) {
        node.error('Create appt error: ' + error.message, msg);
        const isTimeout = ['timeout', 'ETIMEDOUT', 'ECONNRESET'].some(e => error.message.toLowerCase().includes(e.toLowerCase()));

        msg.payload = {
            success: false,
            message: error.message,
            _debug: {
                error_type: isTimeout ? 'TIMEOUT' : 'EXCEPTION',
                error_message: error.message,
                timestamp: requestTimestamp
            },
            llm_guidance: {
                ...createLlmGuidance('booking_failed', { canRetry: false }),
                error_type: isTimeout ? 'timeout' : 'api_error',
                voice_response: "I want to connect you with a specialist who can assist you. One moment while I transfer your call.",
                action_required: "transfer_to_agent",
                transfer_reason: isTimeout ? "scheduling_timeout" : "api_failure",
                CRITICAL: "Do NOT mention error, timeout, or system problems to caller. Transfer gracefully.",
                prohibited_responses: ["error", "timeout", "problem", "issue", "failed", "system is down", "technical difficulties", "something went wrong"]
            }
        };
        return msg;
    }
}

return createAppt();

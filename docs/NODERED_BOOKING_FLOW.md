# Node-RED Booking Flow Documentation

This document explains how the Node-RED ortho-prd endpoints handle booking multiple children, error handling, and rate limit/max usage errors.

---

## 1. Booking Multiple Children (Sibling Booking)

### Architecture: Parent-as-Patient Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SIBLING BOOKING FLOW                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Step 1: Create Parent (ONCE)                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ chord_ortho_patient action=create                            │   │
│  │   → Returns: patientGUID + bookingAuthToken                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  Step 2: Book Child 1                                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ schedule_appointment_ortho action=book_child                 │   │
│  │   patientGUID: <from step 1>                                 │   │
│  │   bookingAuthToken: <from step 1>                            │   │
│  │   childName: "Tommy"                                         │   │
│  │   childDOB: "01/15/2015"                                     │   │
│  │   startTime: "01/20/2026 2:00:00 PM"                         │   │
│  │   → Returns: appointmentGUID                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  Step 3: Book Child 2 (REUSE same patientGUID)                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ schedule_appointment_ortho action=book_child                 │   │
│  │   patientGUID: <SAME from step 1>                            │   │
│  │   bookingAuthToken: <SAME from step 1>                       │   │
│  │   childName: "Sarah"                                         │   │
│  │   childDOB: "03/22/2018"                                     │   │
│  │   startTime: "01/20/2026 2:40:00 PM"                         │   │
│  │   → Returns: appointmentGUID                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Points
- **Single Patient**: Parent is created ONCE as the patient record
- **Reuse Credentials**: Same `patientGUID` and `bookingAuthToken` for ALL children
- **Child Info in Notes**: Each child's details stored via `SetPatientComment`:
  ```
  Child: Tommy | DOB: 01/15/2015 | Insurance: Aetna | GroupID: G123 | MemberID: 456
  ```

### Why Sibling-Per-Child Failed
The attempted approach of creating separate patients per child failed because:
- Cloud9 API rejects duplicate `SetPatient` calls with the same phone number
- Returns empty error message (~100ms immediate rejection)
- No bypass available for duplicate phone detection

---

## 2. Parallel Booking Serialization (Mutex)

When LLM fires multiple `book_child` calls simultaneously:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BOOKING SERIALIZATION                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  LLM fires TWO book_child calls at same time (t=0)                 │
│                                                                     │
│  ┌─────────────┐     ┌─────────────┐                               │
│  │ book_child  │     │ book_child  │                               │
│  │  (Child 1)  │     │  (Child 2)  │                               │
│  └──────┬──────┘     └──────┬──────┘                               │
│         │                   │                                       │
│         ▼                   ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              SPACING CHECK (10 second window)                │   │
│  │                                                              │   │
│  │  lastBookingTime = flow.get('lastSetAppointmentTime')       │   │
│  │  elapsed = now - lastBookingTime                            │   │
│  │                                                              │   │
│  │  if (elapsed < 10000ms) {                                   │   │
│  │      wait(10000 - elapsed)  // SERIALIZE                    │   │
│  │  }                                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                   │                                       │
│         ▼                   │ (waits ~10s)                         │
│  ┌─────────────┐            │                                       │
│  │ Cloud9 API  │            │                                       │
│  │ SetAppt #1  │            │                                       │
│  │  (~4-5s)    │            │                                       │
│  └─────────────┘            │                                       │
│         │                   │                                       │
│         ▼                   ▼                                       │
│  flow.set('lastSetAppointmentTime', now)                           │
│                             │                                       │
│                      ┌─────────────┐                               │
│                      │ Cloud9 API  │                               │
│                      │ SetAppt #2  │                               │
│                      │  (~4-5s)    │                               │
│                      └─────────────┘                               │
│                                                                     │
│  TOTAL TIME: ~10-15 seconds for 2 children                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Serialization Config
```javascript
const BOOKING_SPACING_MS = 10000;  // 10 seconds between SetAppointment calls
```

---

## 3. Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ERROR HANDLING FLOW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  book_child request arrives                                         │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 1. VALIDATE BOOKING AUTH TOKEN                               │   │
│  │    - Token present?                                          │   │
│  │    - HMAC signature valid?                                   │   │
│  │    - Token not expired?                                      │   │
│  │    - PatientGUID matches token?                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ├── FAIL → Return BOOKING_AUTH_REQUIRED (2-3ms)            │
│         │                                                           │
│         ▼ PASS                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 2. CALL CLOUD9 SetAppointment API                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ├── SUCCESS → Return appointmentGUID ✓                     │
│         │                                                           │
│         ▼ ERROR                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 3. DETECT ERROR TYPE                                         │   │
│  │                                                              │   │
│  │    Pattern Match Against:                                    │   │
│  │    ┌──────────────────────────────────────────────────────┐ │   │
│  │    │ RATE_LIMIT     → /too many requests|rate limit/i     │ │   │
│  │    │ PATIENT_NOT_FOUND → /patient.*guid.*does not exist/i │ │   │
│  │    │ SLOT_NOT_AVAILABLE → /slot.*not available/i          │ │   │
│  │    │ INVALID_SCHEDULE → /schedule.*view.*invalid/i        │ │   │
│  │    │ AUTH_ERROR     → /not authorized/i                   │ │   │
│  │    └──────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ├── RATE_LIMIT → Go to Rate Limit Handler                  │
│         ├── SLOT_NOT_AVAILABLE → Return with "offer new time"      │
│         ├── PATIENT_NOT_FOUND → Return with "create patient first" │
│         └── OTHER → Return with "transfer to agent"                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Error Response Examples

**BOOKING_AUTH_REQUIRED:**
```json
{
  "success": false,
  "_debug_error": "BOOKING_AUTH_REQUIRED",
  "llm_guidance": {
    "CRITICAL": "You MUST call chord_ortho_patient action=create FIRST",
    "recovery_steps": ["1. Create patient", "2. Use returned token", "3. Retry"]
  }
}
```

**SLOT_NOT_AVAILABLE:**
```json
{
  "success": false,
  "_debug_error": "This appointment cannot be scheduled in the specified time slot",
  "llm_guidance": {
    "error_type": "slot_no_longer_available",
    "voice_response": "That time is no longer available. Let me find another option.",
    "action_required": "call_slots_offer_new_time"
  }
}
```

**PATIENT_NOT_FOUND:**
```json
{
  "success": false,
  "message": "Patient GUID not found",
  "llm_guidance": {
    "error_type": "patient_not_found",
    "CRITICAL": "Patient does not exist in Cloud9. You MUST call chord_dso_patient action=create BEFORE booking.",
    "recovery_steps": [
      "1. Call chord_ortho_patient action=create",
      "2. Use returned patientGUID",
      "3. Retry book_child with new patientGUID"
    ]
  }
}
```

---

## 4. Rate Limit / Max Usage Handling

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RATE LIMIT HANDLING                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PHASE 1: SYNCHRONOUS RETRIES (keeps caller waiting)               │
│  ═══════════════════════════════════════════════════                │
│                                                                     │
│  Attempt 1: Call Cloud9                                             │
│         │                                                           │
│         ├── SUCCESS → Return immediately ✓                         │
│         │                                                           │
│         ▼ RATE LIMITED                                              │
│                                                                     │
│  Attempt 2: Wait 5 seconds, retry                                   │
│         │                                                           │
│         ├── SUCCESS → Return ✓                                      │
│         │                                                           │
│         ▼ STILL RATE LIMITED                                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ MAX SYNC RETRIES EXHAUSTED (2 attempts, ~10s dead air)      │   │
│  │ → Move to ASYNC QUEUE                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  PHASE 2: ASYNC QUEUE (returns immediately to caller)              │
│  ═══════════════════════════════════════════════════                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ QUEUE OPERATION                                              │   │
│  │                                                              │   │
│  │ pendingOperations[operationId] = {                          │   │
│  │   operationType: 'SetAppointment',                          │   │
│  │   requestPayload: {...},                                    │   │
│  │   attemptCount: 0,                                          │   │
│  │   maxAttempts: 10,                                          │   │
│  │   status: 'pending'                                         │   │
│  │ }                                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  Return to caller IMMEDIATELY:                                      │
│  {                                                                  │
│    "success": false,                                               │
│    "queued": true,                                                 │
│    "operationId": "op-xxx",                                        │
│    "message": "Request queued due to high demand",                 │
│    "llm_guidance": {                                               │
│      "voice_response": "Your appointment is being processed..."    │
│    }                                                               │
│  }                                                                  │
│                                                                     │
│  PHASE 3: BACKGROUND RETRY PROCESSOR (every 30 seconds)            │
│  ═══════════════════════════════════════════════════════            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ EXPONENTIAL BACKOFF                                          │   │
│  │                                                              │   │
│  │  Attempt 3:  10s backoff                                    │   │
│  │  Attempt 4:  20s backoff                                    │   │
│  │  Attempt 5:  40s backoff                                    │   │
│  │  Attempt 6:  80s backoff                                    │   │
│  │  Attempt 7: 160s backoff                                    │   │
│  │  Attempt 8: 300s backoff (5 min max)                        │   │
│  │  Attempt 9: 300s backoff                                    │   │
│  │  Attempt 10: Final attempt → FAIL if still rate limited     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Rate Limit Config
```javascript
const RETRY_CONFIG = {
    maxRetries: 2,              // Sync phase
    retryDelays: [5000]         // 5s before sync retry
};

// Async phase
const maxAttempts = 10;
const backoffMs = Math.min(300000, 10000 * Math.pow(2, attemptCount));
```

### Queue Status Endpoint
```
GET /chord/ortho-prd/queue-status

Response:
{
  "total": 3,
  "pending": 1,
  "processing": 0,
  "completed": 2,
  "failed": 0,
  "operations": [...]
}
```

---

## 5. Complete Booking Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                 COMPLETE REQUEST LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  t=0     LLM calls book_child                                       │
│          │                                                          │
│  t=1ms   Validate bookingAuthToken                                  │
│          ├── REJECT (no token) → Return in 2-3ms                   │
│          │                                                          │
│  t=5ms   Check spacing (10s since last booking?)                   │
│          ├── WAIT if needed                                        │
│          │                                                          │
│  t=10s   Call Cloud9 SetAppointment                                │
│          │                                                          │
│  t=14s   Cloud9 responds                                           │
│          ├── SUCCESS → Return appointmentGUID                      │
│          ├── RATE_LIMIT → Retry (sync phase)                       │
│          └── OTHER_ERROR → Return with guidance                    │
│                                                                     │
│  t=19s   If rate limited, retry after 5s                           │
│          ├── SUCCESS → Return                                      │
│          └── STILL LIMITED → Queue for async                       │
│                                                                     │
│  t=20s   Return "queued" response to caller                        │
│          │                                                          │
│  t=50s   Background processor picks up (runs every 30s)            │
│          │                                                          │
│  t=60s   Retry with backoff                                        │
│          ...                                                        │
│  t=5min+ Final attempt or success                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Version Comparison: Current (v58) vs Previous Working (v5.1)

This section compares the current Node-RED flow (v58, includes v7 auth features) with the previous working version (v5.1 from `nodered/bk_up/prod/node_red_prod_1_17_v2_async.json`).

> **Note:** The createAppt function is at v58 with features introduced at various versions (v6 notes, v7 auth, v57/v58 session cache). See [NODERED_ASYNC_QUEUE_ARCHITECTURE.md](./NODERED_ASYNC_QUEUE_ARCHITECTURE.md) for complete version history.

### Feature Comparison

| Feature | v5.1 (Old/Working) | v58 (Current) | Impact |
|---------|-------------------|--------------|--------|
| **Booking Auth Token** | ❌ Not required | ✅ Required (v7) | HIGH - Major flow change |
| **Chair Selection** | Dynamic from request | Hardcoded Chair 8 | MEDIUM - Limits available slots |
| **Patient Note Support** | ❌ Not available | ✅ SetPatientComment (v6) | LOW - Additional functionality |
| **Session Cache** | ❌ None | ✅ Auto-inject token/guid | MEDIUM - Complexity increase |
| **Crypto Library** | ❌ Not loaded | ✅ Required for HMAC | LOW - Dependency |

### Key Difference 1: Booking Auth Token Validation (v7 ONLY)

**Old (v5.1) - No token validation:**
```javascript
// Directly proceeds to validation of required fields
const missingFields = [];
if (!params.patientGUID) missingFields.push('patientGUID');
if (!params.startTime) missingFields.push('startTime');
// ... proceeds to booking immediately
```

**Current (v7) - Strict token validation:**
```javascript
// v7: Validate booking authorization token BEFORE any other processing
const authResult = validateBookingAuth(params, sessionId);
if (!authResult.valid) {
    // REJECT booking immediately with error
    msg.payload = { success: false, message: authResult.message, ... };
    return msg;
}
// Only then proceed with booking
```

### Key Difference 2: Chair Selection

**Old (v5.1) - Dynamic from request:**
```javascript
ScheduleColumnGUID: params.scheduleColumnGUID,
```

**Current (v7) - Hardcoded Chair 8:**
```javascript
ScheduleColumnGUID: '07687884-7e37-49aa-8028-d43b751c9034', // CHAIR 8 - HARDCODED
```

**Impact**: If Chair 8 has no available slots but other chairs do, bookings will fail in v7.

### Key Difference 3: Session Cache Auto-Injection (v7 ONLY)

```javascript
// v56: Auto-inject bookingAuthToken from session cache if missing
const bookingSessions = flow.get('bookingSessions') || {};
const cachedSession = bookingSessions[sessionId];

if (!params.bookingAuthToken && cachedSession && cachedSession.bookingAuthToken) {
    params.bookingAuthToken = cachedSession.bookingAuthToken;
}
```

This attempts to fix FP-001 (missing token) but adds complexity.

### New Failure Modes in v7 (Not Present in v5.1)

| Failure Mode | Cause | Old v5.1 Behavior | Current v7 Behavior |
|--------------|-------|-------------------|---------------------|
| Missing token | LLM didn't pass bookingAuthToken | Would book normally | REJECTED |
| Token expired | > 15 min between create and book | N/A | REJECTED |
| GUID mismatch | LLM used wrong patientGUID | Would book (maybe wrong patient) | REJECTED |
| Chair 8 unavailable | Hardcoded chair has no slots | Would use requested chair | FAILS |
| Session context lost | Flow context cleared/lost | N/A | Token injection fails |

### Why Old Version Worked Better

1. **Simpler Flow**: No token validation = fewer points of failure
2. **Flexible Chair Selection**: Could book on any available chair
3. **No Session State Dependencies**: Didn't rely on flow context for auth
4. **Direct Booking**: Patient create → Book was a simple two-step process

### Recommendations

1. **Test with token bypass**: Temporarily disable `validateBookingAuth()` to confirm if token validation is causing failures
2. **Test Chair flexibility**: Modify to use `params.scheduleColumnGUID` instead of hardcoded Chair 8
3. **Increase token TTL**: Current 15 minutes may be too short for complex conversations
4. **Add token refresh**: If patient already created, allow re-fetching token without creating new patient

---

## 7. Important Constraints

| Constraint | Value | Notes |
|------------|-------|-------|
| Booking spacing | 10 seconds | Between consecutive SetAppointment calls |
| Sync retries | 2 attempts | ~10s max dead air before queueing |
| Async retries | 10 attempts | With exponential backoff |
| Max backoff | 5 minutes | Caps at 300,000ms |
| Queue check interval | 30 seconds | Background processor runs every 30s |
| Chair | **HARDCODED to Chair 8** (v7) | `07687884-7e37-49aa-8028-d43b751c9034` |
| Schedule View | **HARDCODED** | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` |
| Location | **HARDCODED** | `1fef9297-7c8b-426b-b0d1-f2275136e48b` (CDH Allegheny 202) |
| **Booking Auth Token** | Required (v7) | 15-minute TTL, HMAC-SHA256 signed |

---

## 8. Booking Auth Token Validation

The `bookingAuthToken` is an HMAC-SHA256 signed JWT containing:

```javascript
{
  sessionId: "765381306-000000...",
  patientGUID: "877F0034-7E09-4E35-BE0D-397E309DF2E8",
  createdAt: 1768822558209,
  expiresAt: 1768823458209,  // 15 minutes TTL
  nonce: "5b0b1d22ff73"
}
```

### Validation Chain
1. Token present in request?
2. HMAC signature valid?
3. Token not expired?
4. `patientGUID` in request matches token's `patientGUID`?

### Token Lifetime
- **Created**: When `chord_ortho_patient action=create` is called
- **Expires**: 15 minutes after creation
- **Cached**: Node-RED caches token per session, returns same token on duplicate create calls

---

## 9. LLM Guidance System

Every response includes `llm_guidance` to help Flowise respond appropriately:

```javascript
llm_guidance: {
  error_type: "slot_no_longer_available",
  voice_response: "That time is no longer available. Let me find another option.",
  action_required: "call_slots_offer_new_time",
  CRITICAL: "Do NOT mention error to caller",
  prohibited_responses: ["error", "timeout", "problem", "issue", "failed"]
}
```

This ensures the IVA provides a smooth caller experience even when backend errors occur.

---

## Related Documentation

- [FAILURE_PATTERNS.md](./FAILURE_PATTERNS.md) - Failure pattern catalog and troubleshooting
- [NODERED_ASYNC_QUEUE_ARCHITECTURE.md](./NODERED_ASYNC_QUEUE_ARCHITECTURE.md) - Async queue deep dive (v2.0 - createAppt v58, processRetryQueue v1)
  - [Booking Auth Token Validation](./NODERED_ASYNC_QUEUE_ARCHITECTURE.md#42-booking-auth-token-validation-v7)
  - [Session Cache Auto-Injection](./NODERED_ASYNC_QUEUE_ARCHITECTURE.md#44-session-cache-auto-injection-v57v58)
  - [Two Token Systems](./NODERED_ASYNC_QUEUE_ARCHITECTURE.md#7-two-token-systems)
- [GUID_DATA_FLOW.md](./GUID_DATA_FLOW.md) - GUID flow through the system

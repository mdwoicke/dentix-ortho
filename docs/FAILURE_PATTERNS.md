# Booking Failure Pattern Catalog

## Quick Troubleshooting

```bash
# QUICK: Analyze any session (uses Ortho-Test-JL-UAT config by default)
cd test-agent
node scripts/trace.js <sessionId>

# VERBOSE: Show full timeline
node scripts/trace.js <sessionId> -v

# SAVE: Detect patterns and save to database
node scripts/trace.js <sessionId> -vs

# RAW: Dump all tool calls for debugging
node scripts/trace.js <sessionId> --raw
```

**Default Langfuse Config:** `Ortho-Test-JL-UAT` (ID 2)
- Host: `langfuse-6x3cj-u15194.vm.elestio.app`
- This is where ALL production Flowise traces are stored

**Direct Link:** `https://langfuse-6x3cj-u15194.vm.elestio.app/project/cmk2l64ij000npc065mawjmyr/sessions/<sessionId>`

---

## Pattern Registry

| ID | Name | Severity | Status | First Seen |
|----|------|----------|--------|------------|
| FP-001 | Missing Booking Auth Token | High | FIXED (v56) | 2026-01-18 |
| FP-002 | Slot Freshness Decay | High | INVESTIGATING | 2026-01-19 |
| FP-003 | Double Patient Creation | Medium | INVESTIGATING | 2026-01-19 |
| FP-004 | Infrastructure 502 Errors | Critical | MONITORING | 2026-01-19 |
| FP-005 | Parallel Booking Race | Medium | MITIGATED (v57 mutex) | 2026-01-18 |

---

## Detailed Pattern Descriptions

### FP-001: Missing Booking Auth Token

**Status:** FIXED in v56

**Description:**
LLM calls `book_child` without including the `bookingAuthToken` from the `create_patient` response.

**Symptoms:**
- `book_child` fails with `BOOKING_AUTH_REQUIRED` error
- `bookingAuthToken` field is missing or empty in the request
- Duration is very short (2-3ms) - blocked at validation layer

**Root Cause:**
- LLM not following the required sequence: create_patient -> book_child
- LLM calling book_child before create_patient completes
- LLM reusing old patientGUID without fresh token

**Detection Criteria:**
```javascript
obs.input?.action === 'book_child' && !obs.input?.bookingAuthToken
```

**Fix Applied:**
- v56: Added strict validation in Flowise tool
- v58: Node-RED rejects without token (removed legacy mode)

**Sessions Exhibiting Pattern:**
- `81d174ec-f5fa-47d9-bed3-5212df7153c2` (calls 4 & 5)

---

### FP-002: Slot Freshness Decay

**Status:** INVESTIGATING

**Description:**
Slots returned by `getGroupedApptSlots` become unavailable when booking is attempted after a time delay, even though no one else booked them.

**Symptoms:**
- `grouped_slots` returns valid slots
- `book_child` called with correct token and patientGUID
- Booking fails with "This appointment cannot be scheduled in the specified time slot"
- Significant time gap (30+ seconds) between slot retrieval and booking

**Root Cause (Hypotheses):**
1. Cloud9 may have internal slot reservation expiry
2. Session context may become invalid after patient re-creation
3. Slot data structure may change between calls

**Detection Criteria:**
```javascript
// Success criteria for grouped_slots followed by failed book_child
const slotTime = new Date(groupedSlotsObs.startTime);
const bookTime = new Date(bookChildObs.startTime);
const gapMs = bookTime - slotTime;
gapMs > 30000 && bookChildObs.output?._debug_error?.includes('slot')
```

**Remediation Ideas:**
1. Refresh slots immediately before booking
2. Add slot validation step before createAppt
3. Reduce conversation time between slot offer and booking

**Sessions Exhibiting Pattern:**
- `81d174ec-f5fa-47d9-bed3-5212df7153c2` (calls 7 & 8)
  - Slots retrieved: 11:35:13
  - Booking attempted: 11:36:03
  - Gap: 50 seconds

---

### FP-003: Double Patient Creation

**Status:** INVESTIGATING

**Description:**
LLM creates multiple patients within the same session, leading to confusion about which patientGUID and bookingAuthToken to use.

**Symptoms:**
- Multiple `create_patient` calls in single session
- Different patientGUIDs generated
- book_child may use wrong combination of GUID/token

**Root Cause:**
- LLM retry behavior after initial booking failure
- LLM not understanding that patient was already created
- Prompt not clear enough about single-patient-per-session model

**Detection Criteria:**
```javascript
patientCreateCount > 1 within same sessionId
```

**Remediation Ideas:**
1. Strengthen prompt guidance about patient creation
2. Add session-level patient caching
3. Return cached patient on duplicate create attempts (partially implemented)

**Sessions Exhibiting Pattern:**
- `81d174ec-f5fa-47d9-bed3-5212df7153c2`
  - Patient 1: CF21CB4F (11:35:13)
  - Patient 2: 877F0034 (11:35:57)

---

### FP-004: Infrastructure 502 Errors

**Status:** MONITORING

**Description:**
Node-RED or Cloud9 API returns HTTP 502 Bad Gateway errors, preventing any booking operations.

**Symptoms:**
- API calls return HTML error page instead of JSON
- `_debug_error` contains "HTTP 502"
- All subsequent operations fail

**Root Cause:**
- Node-RED pod instability
- Cloud9 API outage
- Load balancer issues
- Network connectivity problems

**Detection Criteria:**
```javascript
obs.output?._debug_error?.includes('502') ||
obs.output?._debug_error?.includes('Bad Gateway')
```

**Remediation:**
- Monitor Node-RED health
- Implement retry with backoff
- Alert on repeated 502 errors

**Sessions Exhibiting Pattern:**
- `2ad9155c-3a23-42e2-8b34-8089272d8d73`
  - grouped_slots returned 502 at 12:09:11

---

### FP-005: Parallel Booking Race Condition

**Status:** MITIGATED (v57 mutex)

**Description:**
When booking multiple children, parallel `book_child` calls compete and may both fail or create conflicts.

**Symptoms:**
- Multiple book_child calls within milliseconds of each other
- Both calls may fail even though slots were available
- Short duration on second call (rejected quickly)

**Root Cause:**
- LLM fires multiple tool calls simultaneously
- Without serialization, calls race to Cloud9 API
- Cloud9 may reject if slot is "in-use" by another pending request

**Detection Criteria:**
```javascript
// Multiple book_child calls with < 100ms between start times
const timeDiff = Math.abs(new Date(call1.startTime) - new Date(call2.startTime));
timeDiff < 100
```

**Fix Applied:**
- v57: Added mutex in Node-RED to serialize createAppt calls
- 5-second minimum spacing between parallel calls

**Verification:**
- Total booking time should be > 8 seconds for 2 children (includes Cloud9 API time)

**Sessions Exhibiting Pattern:**
- `81d174ec-f5fa-47d9-bed3-5212df7153c2` (calls 7 & 8)
  - Call 7: 11:36:03.287
  - Call 8: 11:36:03.288
  - Time diff: 1ms (parallel execution)

---

## Pattern Analysis Workflow

### For New Failing Sessions:

1. **Get session ID** from user or test run
2. **Run analysis script**: `node scripts/analyze-failure-pattern.js <sessionId>`
3. **Review detected patterns** in output
4. **Update pattern registry** if new pattern discovered
5. **Link session** to pattern(s) in database

### Pattern Detection Priority:

1. FP-004 (502 errors) - Check first, indicates infrastructure issue
2. FP-001 (Missing token) - Common LLM mistake
3. FP-003 (Double patient) - Check for multiple creates
4. FP-005 (Parallel race) - Check timing of book_child calls
5. FP-002 (Freshness decay) - Check if all above pass but booking still fails

---

## Session Tracking Table

| Session ID | Date | Patterns | Notes |
|------------|------|----------|-------|
| 81d174ec-f5fa-47d9-bed3-5212df7153c2 | 2026-01-19 | FP-001, FP-002, FP-003, FP-005 | Multiple patterns in single session |
| 2ad9155c-3a23-42e2-8b34-8089272d8d73 | 2026-01-19 | FP-004 | 502 error on grouped_slots |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-19 | 1.0 | Initial pattern catalog with 5 patterns |

# INDIVIDUAL_PATIENT_PER_PERSON Model Testing Guide

This document describes the E2E test harnesses for verifying the INDIVIDUAL_PATIENT_PER_PERSON booking model is working correctly.

---

## Overview

The INDIVIDUAL_PATIENT_PER_PERSON model ensures that each family member (parent + children) gets a **unique patient GUID** in Cloud9. This is critical for:

- Proper appointment tracking per child
- Correct family linkage via `familyId`
- Booking authorization via `bookingAuthToken`

### Model Flow

```
1. Parent Creation (isChild=false)
   └─> Returns: patientGUID, familyId, bookingAuthToken

2. Child Creation (isChild=true)
   └─> Input: parentPatientGUID, familyId (NO phone)
   └─> Returns: DIFFERENT patientGUID, same familyId

3. Booking
   └─> Uses CHILD's patientGUID (not parent's)
   └─> Uses bookingAuthToken from parent creation
```

---

## Test Files

| File | Purpose | Duration |
|------|---------|----------|
| `test-individual-patient-model-e2e.js` | Happy path workflows | ~5-10 min |
| `test-individual-patient-timing.js` | Rate limits, spacing, queuing | ~8-12 min |
| `test-individual-patient-errors.js` | Error handling, edge cases | ~5-8 min |

**Location:** `test-agent/scripts/`

---

## Configuration

All tests use these shared constants:

```javascript
const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd';
const AUTH = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034';
const DEFAULT_LOCATION_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b';
const DEFAULT_PROVIDER_GUID = 'a79ec244-9503-44b2-87e4-5920b6e60392';
const DEFAULT_APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';
```

### Rate Limiting Constants

```javascript
const BOOKING_SPACING_MS = 10000;   // 10 seconds between bookings
const EXPECTED_RETRY_DELAY_MS = 5000;  // 5 seconds retry delay
const EXPECTED_MAX_RETRIES = 2;     // Max 2 retries before queue
const TOKEN_EXPIRY_MINUTES = 15;    // Token valid for 15 min
```

---

## Test Details

### File 1: E2E Happy Path Tests

**File:** `test-individual-patient-model-e2e.js`

#### TC-1.1: Single Child Complete Workflow

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Get available slots | At least 1 slot returned |
| 2 | Create PARENT (isChild=false) | Has patientGUID, familyId, bookingAuthToken |
| 3 | Create CHILD (isChild=true) | Has DIFFERENT patientGUID, same familyId |
| 4 | Book using CHILD's GUID | Booking succeeds or queued |

**Critical Assertion:**
```javascript
childResult.patientGUID !== parentResult.patientGUID
```

#### TC-1.2: Multiple Children (2 Siblings)

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Get grouped slots for 2 | At least 2 slots in group |
| 2 | Create parent | Has GUID + familyId |
| 3 | Create child 1 | Unique GUID |
| 4 | Create child 2 | Different GUID from parent AND child 1 |
| 5 | Book child 1 | Success |
| 6 | Wait 10s | Rate limit spacing |
| 7 | Book child 2 | Success |

**Critical Assertion:**
```javascript
child1GUID !== child2GUID !== parentGUID
```

#### TC-1.3: Four Children Stress Test

- Creates parent + 4 children
- Books 4 appointments with proper 10s spacing
- Verifies all GUIDs unique
- Some bookings may be queued (async fallback)

#### TC-1.4: Children Array Batch Booking (v63)

Tests the batch booking feature:
```javascript
const childrenArray = [
  { patientGUID: child1GUID, childName: 'Child1', startTime: slot1.startTime, ... },
  { patientGUID: child2GUID, childName: 'Child2', startTime: slot2.startTime, ... }
];

await bookAppointmentWithChildren(parentGUID, childrenArray, bookingAuthToken);
```

---

### File 2: Timing & Rate Limiting Tests

**File:** `test-individual-patient-timing.js`

#### TC-2.1: Spacing Verification

**Purpose:** Verify 10s minimum enforced between SetAppointment calls

**Method:**
1. Book child 1
2. Immediately book child 2 (no artificial delay)
3. Measure actual timing from response `_debug.spacing_wait_ms`

**Assertions:**
- Second call waited >= 9000ms
- Response includes `_debug.spacing_wait_ms`

#### TC-2.2: Retry Behavior

**Purpose:** Verify retry config (maxRetries=2, 5s delay)

**Method:**
1. Make 3 rapid consecutive bookings
2. Check `_debug.attempts` and `_debug.retried`

**Assertions:**
- `_debug.attempts <= 3` (max 2 retries)
- Rate-limited calls show `retried: true`

#### TC-2.3: Async Queue Activation

**Purpose:** Verify queue fallback after sync retries exhausted

**Method:**
1. Fire 5 rapid booking calls simultaneously (no wait)
2. Check for `queued: true` responses

**Assertions:**
- Some calls return `queued: true`
- Queued calls have `operationId`
- `llm_guidance.current_state === 'BOOKING_QUEUED'`

#### TC-2.4: Booking Auth Token Timing

**Purpose:** Verify token doesn't expire prematurely

**Method:**
1. Create patient, capture token
2. Wait 2 minutes
3. Book with original token

**Assertions:**
- Booking succeeds (token valid for 15 min)
- No `TOKEN_EXPIRED` error

---

### File 3: Error & Edge Case Tests

**File:** `test-individual-patient-errors.js`

#### TC-3.1: Missing bookingAuthToken

| Input | Expected |
|-------|----------|
| Valid patientGUID, no token | Legacy fallback succeeds OR `BOOKING_AUTH_MISSING` error |

#### TC-3.2: GUID Mismatch

| Input | Expected |
|-------|----------|
| Token for patient A, request patientGUID is B | `BOOKING_AUTH_GUID_MISMATCH` with `correctGUID` |

#### TC-3.3: Missing Required Child Fields

| Input | Expected |
|-------|----------|
| `isChild=true` but missing `parentPatientGUID` | Validation error |
| `isChild=true` but missing `familyId` | Validation error |
| `isChild=true` but missing both | Validation error |

#### TC-3.4: Slot Already Taken

| Action | Expected |
|--------|----------|
| Book slot with child 1 | Success |
| Book SAME slot with child 2 | Fail with "slot unavailable" |

#### TC-3.5: Invalid GUID Formats

| GUID | Expected |
|------|----------|
| `12345` (too short) | Validation error |
| `GGGG...` (invalid hex) | Validation error |
| Empty string | Validation error |
| Spaces only | Validation error |
| Missing dashes | Validation error |
| `null` string | Validation error |

#### TC-3.6: Special Characters in Names

| Name | Expected |
|------|----------|
| O'Brien | Success (XML escaped) |
| María | Success |
| Jean-Pierre | Success |
| Björk | Success |
| José García | Success |

---

## Execution

### Run Individual Test Files

```bash
# E2E happy path tests
cd test-agent && node scripts/test-individual-patient-model-e2e.js

# Timing and rate limit tests
cd test-agent && node scripts/test-individual-patient-timing.js

# Error and edge case tests
cd test-agent && node scripts/test-individual-patient-errors.js
```

### Run All Tests (Sequential)

```bash
cd test-agent && \
  node scripts/test-individual-patient-model-e2e.js && \
  node scripts/test-individual-patient-timing.js && \
  node scripts/test-individual-patient-errors.js
```

### Run with Output Redirection

```bash
cd test-agent && node scripts/test-individual-patient-model-e2e.js 2>&1 | tee data/e2e-run-output.txt
```

---

## Log Files

Each test writes detailed logs to:

| Test File | Log File |
|-----------|----------|
| `test-individual-patient-model-e2e.js` | `test-agent/data/individual-patient-e2e-log.txt` |
| `test-individual-patient-timing.js` | `test-agent/data/individual-patient-timing-log.txt` |
| `test-individual-patient-errors.js` | `test-agent/data/individual-patient-errors-log.txt` |

### Log Format

```
[2026-01-26T10:30:45.123Z] ═══ STEP 1: Get Available Slots ═══
[2026-01-26T10:30:45.456Z] Getting available slots from 02/02/2026 to 03/04/2026...
[2026-01-26T10:30:46.789Z] Slots response: found 42 slots
[2026-01-26T10:30:46.790Z] ✅ 1.1.1: Available slots returned: PASSED
```

---

## Test Record Tracking

All tests use `prod-tracker-hook.js` to track created records in the database:

```javascript
const { addTestResults } = require('./lib/prod-tracker-hook');

// After successful creation
addTestResults({
    patients: [{
        patient_guid: patientGUID,
        patient_first_name: 'TEST_Child1',
        patient_last_name: 'IndividualModel_1234',
        phone_number: null,  // Children have no phone
        location_guid: DEFAULT_LOCATION_GUID
    }],
    appointments: [{
        patient_guid: childPatientGUID,
        appointment_guid: apptGUID,
        appointment_datetime: startTime,
        schedule_view_guid: scheduleViewGUID,
        schedule_column_guid: CHAIR_8_GUID
    }]
});
```

### Query Test Records

```sql
-- Find all test records from these tests
SELECT * FROM prod_test_records
WHERE patient_first_name LIKE 'TEST_%IndModel%'
   OR patient_last_name LIKE '%IndModel%'
ORDER BY created_at DESC;

-- Count by test
SELECT patient_last_name, COUNT(*) as count
FROM prod_test_records
WHERE patient_first_name LIKE 'TEST_%'
GROUP BY patient_last_name
ORDER BY count DESC;
```

---

## Naming Convention

All test-created records use identifiable prefixes:

| Type | Format | Example |
|------|--------|---------|
| Parent | `TEST_Parent` + `IndModel{N}_{timestamp}` | `TEST_Parent IndModel1_123456` |
| Child | `TEST_Child{N}` + `IndModel{N}_{timestamp}` | `TEST_Child1 IndModel1_123456` |
| Phone | `555-000-{random 4 digits}` | `555-000-7892` |

This makes cleanup and identification easy.

---

## Verification Checklist

After running tests, verify:

### 1. Database Records

```sql
SELECT
    patient_first_name,
    patient_last_name,
    patient_guid,
    record_type,
    created_at
FROM prod_test_records
WHERE patient_first_name LIKE 'TEST_%IndModel%'
ORDER BY created_at DESC
LIMIT 20;
```

### 2. Log File Review

Check for:
- ✅ All critical tests passed
- ❌ No unexpected failures
- ⚠️ Any skipped tests (insufficient slots)

### 3. Cloud9 Verification (Optional)

Use Postman to query appointments:

```xml
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetAppointmentListByPatient</Procedure>
    <Parameters>
        <patGUID>{child_patient_guid}</patGUID>
    </Parameters>
</GetDataRequest>
```

Verify appointment is tied to the child's GUID (not parent's).

---

## Troubleshooting

### "Not enough slots" Errors

- Slots are queried 7-37 days in the future
- Chair 8 (`07687884-7e37-49aa-8028-d43b751c9034`) may have limited availability
- Try running tests at different times or extending date range

### Rate Limit Failures

- Tests include 10s spacing between bookings
- If failures persist, increase `BOOKING_SPACING_MS`
- Check if async queue is functioning (TC-2.3)

### Token Expired Errors

- Tokens are valid for 15 minutes
- If TC-2.4 fails, check system clock sync
- Verify `bookingAuthToken` is being captured correctly

### GUID Mismatch in Legacy Mode

- If TC-3.2 succeeds instead of returning error, legacy fallback is active
- This is acceptable - it means the system gracefully handles mismatches

---

## Related Files

| File | Purpose |
|------|---------|
| `nodered/nodered_Cloud9_flows.json` | Node-RED flow with createPatient/createAppt functions |
| `docs/v1/patient_tool_func.js` | Patient tool JavaScript (v10 with isChild params) |
| `test-agent/scripts/lib/prod-tracker-hook.js` | Test record tracking utility |
| `test-agent/scripts/test-sibling-e2e-flow.js` | Original sibling test (reference) |

---

## Summary

| Test File | Scenarios | Focus |
|-----------|-----------|-------|
| `test-individual-patient-model-e2e.js` | 4 tests | Happy path workflows |
| `test-individual-patient-timing.js` | 4 tests | Rate limits, spacing, queuing |
| `test-individual-patient-errors.js` | 6 tests | Error handling, edge cases |
| **Total** | **14 tests** | Full coverage of INDIVIDUAL_PATIENT_PER_PERSON model |

---

*Last updated: 2026-01-26*

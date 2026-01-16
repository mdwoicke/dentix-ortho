# Sandbox A Failure Analysis Report
**Date:** 2026-01-13
**Run ID:** run-2026-01-13-b79023d7
**Trace:** https://langfuse-6x3cj-u15194.vm.elestio.app/traces/32db0793-c52b-46c0-a486-13958700b023

---

## Executive Summary

The test failed due to **two root causes**:
1. **Flowise Tool Version Mismatch**: v49 is deployed but v52 is needed
2. **Agent Booking Before Patient Creation**: Agent tried to book with `patientGUID: null`

---

## Detailed Analysis

### Issue 1: Flowise Tool Version Mismatch

**Evidence:**
- Error response contained `_toolVersion: "v49"`
- Error message: `"BOOKING FAILED - Missing bookingToken"`
- The file `docs/v1/schedule_appointment_dso_Tool.json` contains v52

**What v49 does:**
```javascript
// v49 slots response format:
{ "displayTime": "1/13/2026 2:00:00 PM", "bookingToken": "eyJzdCI6Li4u" }

// v49 book_child validation:
validate: (params) => {
    if (!params.bookingToken) throw new Error('Missing bookingToken');
}
```

**What v52 does:**
```javascript
// v52 slots response format:
{
  "displayTime": "1/13/2026 2:00:00 PM",
  "startTime": "1/13/2026 2:00:00 PM",
  "scheduleViewGUID": "3bdce548-603d-4d03-a198-7403ea2d3fe0",
  "scheduleColumnGUID": "88711971-c417-49a1-9b96-d6aea4a301b5",
  "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
  "minutes": 40
}

// v52 book_child validation:
validate: (params) => {
    if (!params.patientGUID) throw new Error('Missing patientGUID');
    if (!params.startTime) throw new Error('Missing startTime');
    if (!params.scheduleViewGUID) throw new Error('Missing scheduleViewGUID');
}
```

**Agent Behavior:**
The LLM actually decoded the bookingToken and extracted individual GUIDs:
```
Decoded bookingToken: {"st":"1/13/2026 2:00:00 PM","sv":"3bdce548-...","sc":"88711971-...","at":"f6c20c35-...","mn":"40"}

Agent passed to book_child:
{
  "startTime": "1/13/2026 2:00:00 PM",
  "scheduleViewGUID": "3bdce548-603d-4d03-a198-7403ea2d3fe0",  // Matches!
  "scheduleColumnGUID": "88711971-c417-49a1-9b96-d6aea4a301b5", // Matches!
  ...
}
```

The GUIDs **match exactly** - the agent correctly decoded the token. But v49 expected the raw bookingToken, not the decoded values.

---

### Issue 2: Agent Booking Before Patient Creation

**Evidence from API call sequence:**
1. Call #2: `slots` → Success (returned slot with bookingToken)
2. Call #3: `book_child` with `patientGUID: null` → Failed (no response captured)
3. Call #4: `chord_ortho_patient` create → Success (response not captured by test framework)
4. Call #5: `chord_ortho_patient` create → Retry
5. Call #6: `book_child` with `patientGUID: null` → Failed again
...pattern continues...

**Problem:** The agent attempted to book BEFORE creating the patient, then never properly captured the patientGUID from the creation response.

---

## Unit Test Verification

Direct calls to Node-RED (bypassing Flowise):

| Test | Result |
|------|--------|
| Patient Creation | ✓ Returns patientGUID correctly |
| Get Slots | ✓ Returns individual GUIDs (no bookingToken) |
| Book with Individual GUIDs | ✓ Works when patientGUID is provided |

**Conclusion:** Node-RED endpoints work correctly. The issue is the Flowise tool layer (v49 vs v52).

---

## Root Cause

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ROOT CAUSE CHAIN                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Agent collects info ──────────────────────────────────────► OK  │
│                                                                     │
│  2. Agent calls slots ────────────────────────────────────────► OK  │
│     └─► v49 adds bookingToken to response                           │
│                                                                     │
│  3. Agent offers time, user confirms ─────────────────────────► OK  │
│                                                                     │
│  4. Agent calls book_child with patientGUID: null ────────────► ✗   │
│     └─► Should create patient first!                                │
│                                                                     │
│  5. Agent calls book_child with individual GUIDs ─────────────► ✗   │
│     └─► v49 requires bookingToken, not individual GUIDs             │
│                                                                     │
│  6. Error triggers handoff loop ──────────────────────────────► ✗   │
│     └─► "I want to connect you with a specialist..."                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Fix Required

### Primary Fix: Deploy v52 to Sandbox A Flowise

The v52 tool must be deployed to the Flowise chatflow:
- **Flowise URL:** https://flowiseai-helnl-u15194.vm.elestio.app
- **Chatflow ID:** 6fe5b0ca-b99a-4065-b881-a898df72a3a3
- **Tool:** schedule_appointment_ortho

**v52 Benefits:**
1. Returns slots with individual GUIDs (no bookingToken confusion)
2. Accepts individual GUIDs for booking (matches what agent sends)
3. Validates for patientGUID (surfaces correct error if missing)

### Secondary Issue: Booking Before Patient Creation

Even with v52 deployed, if the agent tries to book before creating a patient, it will fail with "Missing patientGUID". The system prompt should ensure:

1. Create patient first (get patientGUID)
2. Then call book_child with that patientGUID

---

## Test Verification After Fix

Run this test to verify the fix:
```bash
cd test-agent && node scripts/test-sandbox-a-tools.js
```

Expected output after v52 deployment:
- Slots should NOT have bookingToken
- Slots should have individual GUIDs
- Booking with individual GUIDs should work

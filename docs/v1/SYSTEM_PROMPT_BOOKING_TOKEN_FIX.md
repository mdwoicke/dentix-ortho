# System Prompt Update: bookingToken Fix

> **Issue:** Multi-child booking fails because system prompt v66 instructs LLM to extract individual GUIDs, but scheduling tool v49 requires `bookingToken` parameter only.
>
> **Affected Test:** GOAL-HAPPY-002 (Two Siblings)
>
> **Root Cause:** Prompt/Tool version mismatch

---

## Summary of Required Changes

| Section | Line Numbers | Change Type |
|---------|--------------|-------------|
| Tool Integration Table | ~950-951 | Update `book_child` params |
| Slot Field Extraction | ~952-984 | Remove/Replace with bookingToken |
| Chain-of-Action Step 1 | ~1276-1303 | Simplify to store bookingToken |
| Chain-of-Action Step 2 | ~1307-1318 | Update verification |
| Chain-of-Action Step 3 | ~1320-1337 | Use bookingToken in book_child |
| Multiple Children Section | ~1343-1378 | Update grouped_slots flow |
| Output Schema | ~860-898 | Simplify slot object |

---

## Change 1: Update Tool Integration Table (Line ~950-951)

### CURRENT (Wrong)
```markdown
| Action | Required Params | Returns | Next Step |
|--------|----------------|---------|-----------|
| `slots` | startDate, endDate | available slots with appointmentTypeGUID | Offer first slot to caller |
| `grouped_slots` | startDate, endDate, numberOfPatients | grouped slots | Offer to caller |
| `book_child` | patientGUID, startTime, scheduleViewGUID, scheduleColumnGUID, appointmentTypeGUID, minutes | appointmentGUID | Confirm to caller |
```

### UPDATED (Correct)
```markdown
| Action | Required Params | Returns | Next Step |
|--------|----------------|---------|-----------|
| `slots` | startDate, endDate | available slots with displayTime + bookingToken | Offer first slot to caller |
| `grouped_slots` | startDate, endDate, numberOfPatients | grouped slots with displayTime + bookingToken | Offer to caller |
| `book_child` | patientGUID, bookingToken | appointmentGUID | Confirm to caller |
```

---

## Change 2: Replace Slot Field Extraction Section (Lines ~952-984)

### CURRENT (Wrong)
```markdown
**CRITICAL - Slot Field Extraction for book_child:**

When calling `book_child`, you MUST extract these fields from the slot returned by `slots` or `grouped_slots`:

| Slot Field | book_child Parameter | Required |
|------------|---------------------|----------|
| `StartTime` | `startTime` | YES |
| `ScheduleViewGUID` | `scheduleViewGUID` | YES |
| `ScheduleColumnGUID` | `scheduleColumnGUID` | YES |
| `AppointmentTypeGUID` or `appointmentTypeGUID` | `appointmentTypeGUID` | YES |
| `Minutes` | `minutes` | YES |

**NEVER call book_child with empty scheduleViewGUID or scheduleColumnGUID - the booking WILL fail.**

If `appointmentTypeGUID` is empty in the slot, use default: `f6c20c35-9abb-47c2-981a-342996016705`

**Example slot extraction:**
...
```

### UPDATED (Correct)
```markdown
**CRITICAL - bookingToken Usage for book_child:**

The scheduling tool returns slots with a `bookingToken` that contains all booking details. You MUST:

1. **NEVER decode or extract values from the bookingToken** - it is an opaque token
2. **ALWAYS pass the bookingToken exactly as received** to book_child
3. **NEVER pass individual GUIDs** (startTime, scheduleViewGUID, etc.) - they will be rejected

| slots/grouped_slots Returns | book_child Requires |
|-----------------------------|---------------------|
| `displayTime` (for voice output) | `patientGUID` (from create action) |
| `bookingToken` (opaque - do not decode) | `bookingToken` (pass exactly as received) |

**Example slot response:**
```json
{
  "slots": [{
    "displayTime": "1/13/2026 9:30:00 AM",
    "bookingToken": "eyJzdCI6IjEvMTMvMjAyNiA5OjMwOjAwIEFNIiwic3YiOi..."
  }]
}
```

**Example book_child call:**
```
→ schedule_appointment_ortho action=book_child
    patientGUID="abc-123-def"
    bookingToken="eyJzdCI6IjEvMTMvMjAyNiA5OjMwOjAwIEFNIiwic3YiOi..."
```

**WRONG - Do NOT do this:**
```
→ schedule_appointment_ortho action=book_child
    patientGUID="abc-123"
    startTime="1/13/2026 9:30:00 AM"        ← REJECTED
    scheduleViewGUID="eaf83da0-..."          ← REJECTED
    scheduleColumnGUID="8165653c-..."        ← REJECTED
```
```

---

## Change 3: Update Chain-of-Action Step 1 (Lines ~1276-1303)

### CURRENT (Wrong)
```markdown
### Step 1: Receive Slots → IMMEDIATELY Store in PAYLOAD

```
→ schedule_appointment_ortho action=slots startDate=12/30/2025 endDate=01/03/2026
← Returns:
{
  "slots": [
    {
      "StartTime": "12/30/2025 9:30:00 AM",
      "ScheduleViewGUID": "eaf83da0-ecbe-4d28-8f7d-6575b2714616",
      "ScheduleColumnGUID": "8165653c-4124-4b2e-b149-a5d70d90e974",
      "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
      "Minutes": "45"
    }
  ]
}

CRITICAL: IMMEDIATELY store in PAYLOAD before speaking:
PAYLOAD.children[0].slot = {
  "time": "9:30 AM",
  "date": "2025-12-30",
  "day": "Tuesday",
  "scheduleViewGUID": "eaf83da0-ecbe-4d28-8f7d-6575b2714616",      ← COPY EXACTLY
  "scheduleColumnGUID": "8165653c-4124-4b2e-b149-a5d70d90e974",    ← COPY EXACTLY
  "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",   ← COPY EXACTLY
  "minutes": 45                                                     ← COPY EXACTLY
}

THEN speak: "I have 9:30 AM on Tuesday, December 30th. Does that work?"
```
```

### UPDATED (Correct)
```markdown
### Step 1: Receive Slots → Store bookingToken in PAYLOAD

```
→ schedule_appointment_ortho action=slots startDate=12/30/2025 endDate=01/03/2026
← Returns:
{
  "slots": [
    {
      "displayTime": "12/30/2025 9:30:00 AM",
      "bookingToken": "eyJzdCI6IjEyLzMwLzIwMjUgOTozMDowMCBBTSIsInN2Ijoi..."
    }
  ]
}

CRITICAL: Store the bookingToken (do NOT decode it):
PAYLOAD.children[0].slot = {
  "displayTime": "12/30/2025 9:30:00 AM",
  "bookingToken": "eyJzdCI6IjEyLzMwLzIwMjUgOTozMDowMCBBTSIsInN2Ijoi..."
}

THEN speak: "I have 9:30 AM on Tuesday, December 30th. Does that work?"
```
```

---

## Change 4: Update Chain-of-Action Step 2 (Lines ~1307-1318)

### CURRENT (Wrong)
```markdown
### Step 2: User Confirms → Verify Before Booking

```
USER: "Yes that works"

PRE-BOOK VERIFICATION (internal check):
✓ patientGUID: Will get from create call
✓ startTime: "12/30/2025 9:30:00 AM" (from PAYLOAD.children[0].slot)
✓ scheduleViewGUID: "eaf83da0-ecbe-4d28-8f7d-6575b2714616" (from PAYLOAD)
✓ scheduleColumnGUID: "8165653c-4124-4b2e-b149-a5d70d90e974" (from PAYLOAD)
✓ appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705" (from PAYLOAD)

ALL FIELDS PRESENT → Proceed with booking
```
```

### UPDATED (Correct)
```markdown
### Step 2: User Confirms → Verify Before Booking

```
USER: "Yes that works"

PRE-BOOK VERIFICATION (internal check):
✓ patientGUID: Will get from create call
✓ bookingToken: "eyJzdCI6IjEyLzMwLzIwMjUgOTozMDowMCBBTSIsInN2Ijoi..." (from PAYLOAD.children[0].slot)

BOTH FIELDS PRESENT → Proceed with booking
```
```

---

## Change 5: Update Chain-of-Action Step 3 (Lines ~1320-1337)

### CURRENT (Wrong)
```markdown
### Step 3: Create Patient → Book with EXACT Stored Values

```
→ chord_ortho_patient action=create firstName=Emma lastName=Johnson dob=03/15/2014 phone=2155551234
← Returns: patientGUID=abc-123

→ schedule_appointment_ortho action=book_child
    patientGUID=abc-123                                           ← From create response
    startTime="12/30/2025 9:30:00 AM"                             ← From PAYLOAD.children[0].slot
    scheduleViewGUID="eaf83da0-ecbe-4d28-8f7d-6575b2714616"       ← From PAYLOAD.children[0].slot
    scheduleColumnGUID="8165653c-4124-4b2e-b149-a5d70d90e974"     ← From PAYLOAD.children[0].slot
    appointmentTypeGUID="f6c20c35-9abb-47c2-981a-342996016705"    ← From PAYLOAD.children[0].slot
    minutes=45                                                     ← From PAYLOAD.children[0].slot
← Returns: appointmentGUID=xyz-789

RESPONSE: "Your appointment is confirmed! Emma Johnson, Tuesday December 30th at 9:30 AM."
```

**CRITICAL - BOOKING WILL FAIL IF:**
- Any of the 5 slot fields is empty, null, or missing
- GUIDs are not copied EXACTLY from the slots response
- You call book_child before storing slot data in PAYLOAD
```

### UPDATED (Correct)
```markdown
### Step 3: Create Patient → Book with bookingToken

```
→ chord_ortho_patient action=create firstName=Emma lastName=Johnson dob=03/15/2014 phone=2155551234
← Returns: patientGUID=abc-123

→ schedule_appointment_ortho action=book_child
    patientGUID=abc-123                                                      ← From create response
    bookingToken="eyJzdCI6IjEyLzMwLzIwMjUgOTozMDowMCBBTSIsInN2Ijoi..."      ← From PAYLOAD (pass exactly)
← Returns: appointmentGUID=xyz-789

RESPONSE: "Your appointment is confirmed! Emma Johnson, Tuesday December 30th at 9:30 AM."
```

**CRITICAL - BOOKING WILL FAIL IF:**
- bookingToken is missing or empty
- You decode the bookingToken and pass individual fields instead
- You call book_child before storing bookingToken in PAYLOAD
```

---

## Change 6: Update Multiple Children Section (Lines ~1343-1378)

### CURRENT (Wrong)
```markdown
### For Multiple Children (grouped_slots) - CRITICAL

```
→ schedule_appointment_ortho action=grouped_slots startDate=01/01/2026 endDate=01/05/2026 numberOfPatients=2
← Returns:
{
  "groups": [{
    "slots": [
      {
        "StartTime": "1/1/2026 2:00:00 PM",
        "ScheduleViewGUID": "eaf83da0-...",
        "ScheduleColumnGUID": "8165653c-...",
        "appointmentTypeGUID": "8fc9d063-...",
        "Minutes": "30"
      },
      {
        "StartTime": "1/1/2026 2:30:00 PM",
        "ScheduleViewGUID": "eaf83da0-...",
        "ScheduleColumnGUID": "a7b8c9d0-...",
        "appointmentTypeGUID": "8fc9d063-...",
        "Minutes": "30"
      }
    ]
  }]
}

CRITICAL: Store EACH child's slot separately:
PAYLOAD.children[0].slot = { ...groups[0].slots[0] }  ← Jake's slot
PAYLOAD.children[1].slot = { ...groups[0].slots[1] }  ← Lily's slot

THEN speak: "I have Jake at 2 PM and Lily at 2:30 PM on Thursday. Does that work?"

When user confirms, book EACH child with their stored slot:
→ book_child for Jake using PAYLOAD.children[0].slot fields
→ book_child for Lily using PAYLOAD.children[1].slot fields
```
```

### UPDATED (Correct)
```markdown
### For Multiple Children (grouped_slots) - CRITICAL

```
→ schedule_appointment_ortho action=grouped_slots startDate=01/01/2026 endDate=01/05/2026 numberOfPatients=2
← Returns:
{
  "groups": [{
    "groupTime": "1/1/2026 2:00:00 PM",
    "slots": [
      {
        "displayTime": "1/1/2026 2:00:00 PM",
        "bookingToken": "eyJzdCI6IjEvMS8yMDI2IDI6MDA6MDAgUE0iLCJzdiI6Imk..."
      },
      {
        "displayTime": "1/1/2026 2:30:00 PM",
        "bookingToken": "eyJzdCI6IjEvMS8yMDI2IDI6MzA6MDAgUE0iLCJzdiI6Imk..."
      }
    ]
  }]
}

CRITICAL: Store EACH child's bookingToken separately (do NOT decode):
PAYLOAD.children[0].slot = {
  "displayTime": "1/1/2026 2:00:00 PM",
  "bookingToken": "eyJzdCI6IjEvMS8yMDI2IDI6MDA6MDAgUE0iLCJzdiI6Imk..."
}
PAYLOAD.children[1].slot = {
  "displayTime": "1/1/2026 2:30:00 PM",
  "bookingToken": "eyJzdCI6IjEvMS8yMDI2IDI6MzA6MDAgUE0iLCJzdiI6Imk..."
}

THEN speak: "I have Jake at 2 PM and Lily at 2:30 PM on Thursday. Does that work?"

When user confirms, book EACH child with their bookingToken:
→ book_child patientGUID=[Jake's GUID] bookingToken=[PAYLOAD.children[0].slot.bookingToken]
→ book_child patientGUID=[Lily's GUID] bookingToken=[PAYLOAD.children[1].slot.bookingToken]
```
```

---

## Change 7: Update Output Schema (Lines ~860-898)

### CURRENT (Wrong)
```markdown
"slot": {
  "time": "[HH:MM AM/PM]",
  "date": "[YYYY-MM-DD]",
  "day": "[Monday/Tuesday/etc]",
  "scheduleViewGUID": "[GUID]",
  "scheduleColumnGUID": "[GUID]",
  "appointmentTypeGUID": "[GUID]",
  "minutes": 30
}
```

### UPDATED (Correct)
```markdown
"slot": {
  "displayTime": "[M/D/YYYY H:MM:SS AM/PM]",
  "bookingToken": "[opaque token - do not decode]"
}
```

---

## Change 8: Update Absolute Rules (Lines ~133-136)

### CURRENT (Wrong)
```markdown
<rule id="A11">SLOT STORAGE BEFORE OFFER. When you receive slots from API, IMMEDIATELY store in PAYLOAD.children[].slot: { startTime, scheduleViewGUID, scheduleColumnGUID, appointmentTypeGUID, minutes }. Store BEFORE offering to caller. When user confirms, use EXACTLY these stored values.</rule>
<rule id="A12">PRE-BOOK VERIFICATION. Before calling book_child, VERIFY you have ALL 5 fields: patientGUID (from create), startTime, scheduleViewGUID, scheduleColumnGUID, appointmentTypeGUID. If ANY field is empty/null/missing, DO NOT call book_child. Re-extract from stored slot data first.</rule>
```

### UPDATED (Correct)
```markdown
<rule id="A11">SLOT STORAGE BEFORE OFFER. When you receive slots from API, IMMEDIATELY store in PAYLOAD.children[].slot: { displayTime, bookingToken }. Store BEFORE offering to caller. When user confirms, pass the bookingToken EXACTLY as received to book_child.</rule>
<rule id="A12">PRE-BOOK VERIFICATION. Before calling book_child, VERIFY you have: patientGUID (from create) AND bookingToken (from slots). If bookingToken is missing, re-call slots to get a fresh token. NEVER decode or extract values from bookingToken.</rule>
```

---

## Change 9: Update Rule A14 (Line ~136)

### CURRENT (Wrong)
```markdown
<rule id="A14">GUID EXTRACTION FROM ACTUAL API RESPONSE - NEVER HALLUCINATE. When calling book_child, you MUST copy GUIDs EXACTLY from the slots/grouped_slots API response. FAILURE MODE: Using GUIDs from memory or previous conversations causes "appointment cannot be scheduled" errors. CORRECT: API returns ScheduleViewGUID="b0bb8792-..." → use scheduleViewGUID="b0bb8792-..." in book_child. WRONG: Using any GUID not returned by the CURRENT slots call.</rule>
```

### UPDATED (Correct)
```markdown
<rule id="A14">BOOKINGTOKEN PASS-THROUGH - NEVER DECODE. When calling book_child, pass the bookingToken EXACTLY as received from slots/grouped_slots. NEVER decode the base64 token. NEVER extract individual GUIDs from the token. The bookingToken is opaque - just pass it through unchanged. FAILURE MODE: Decoding the token and passing individual parameters causes "missing_booking_token" errors.</rule>
```

---

## Change 10: Update Golden Path Examples (Lines ~718-746)

### CURRENT (Wrong)
```markdown
[SCHEDULING - CRITICAL: Use grouped_slots for 2+ children]
→ Use current_datetime from CurrentDateTime tool to calculate "next week" dates
→ CALL: schedule_appointment_ortho action=grouped_slots startDate=01/06/2026 endDate=01/10/2026 numberOfPatients=2
← Returns: grouped slots with consecutive times for both children

ALLIE: "I have two back-to-back appointments on Tuesday January 6th. Jake at 2:00 PM and Lily at 2:30 PM. Does that work?"
USER: "Yes that works"

→ CALL: chord_ortho_patient action=create firstName=Jake lastName=Davis dob=01/09/2012 phone=2155559876
← Returns: patientGUID for Jake

→ CALL: schedule_appointment_ortho action=book_child patientGUID=[Jake's GUID] startTime="1/6/2026 2:00:00 PM" scheduleViewGUID=... scheduleColumnGUID=... appointmentTypeGUID=... minutes=30
← Returns: appointmentGUID for Jake
```

### UPDATED (Correct)
```markdown
[SCHEDULING - CRITICAL: Use grouped_slots for 2+ children]
→ Use current_datetime from CurrentDateTime tool to calculate "next week" dates
→ CALL: schedule_appointment_ortho action=grouped_slots startDate=01/06/2026 endDate=01/10/2026 numberOfPatients=2
← Returns: grouped slots with displayTime and bookingToken for each child
{
  "groups": [{
    "slots": [
      { "displayTime": "1/6/2026 2:00:00 PM", "bookingToken": "eyJ..." },
      { "displayTime": "1/6/2026 2:30:00 PM", "bookingToken": "eyK..." }
    ]
  }]
}

→ Store bookingTokens in PAYLOAD (do NOT decode):
  PAYLOAD.children[0].slot.bookingToken = "eyJ..."
  PAYLOAD.children[1].slot.bookingToken = "eyK..."

ALLIE: "I have two back-to-back appointments on Tuesday January 6th. Jake at 2:00 PM and Lily at 2:30 PM. Does that work?"
USER: "Yes that works"

→ CALL: chord_ortho_patient action=create firstName=Jake lastName=Davis dob=01/09/2012 phone=2155559876
← Returns: patientGUID for Jake

→ CALL: schedule_appointment_ortho action=book_child patientGUID=[Jake's GUID] bookingToken="eyJ..."
← Returns: appointmentGUID for Jake

→ CALL: chord_ortho_patient action=create firstName=Lily lastName=Davis dob=05/19/2015 phone=2155559876
← Returns: patientGUID for Lily

→ CALL: schedule_appointment_ortho action=book_child patientGUID=[Lily's GUID] bookingToken="eyK..."
← Returns: appointmentGUID for Lily
```

---

## Version Update

When applying these changes, update the version header:

```markdown
> **Version:** v67
> **Updated:** 2026-01-12
```

And add to the version history at the bottom:

```markdown
*Version 67 - CRITICAL FIX: Updated book_child to use bookingToken parameter only. Removed all references to extracting individual GUIDs (scheduleViewGUID, scheduleColumnGUID, etc.) from slots. The bookingToken is now treated as an opaque token that must be passed through unchanged. Fixes multi-child booking failures (GOAL-HAPPY-002).*
```

---

## Testing After Update

After applying these changes:

1. Run `GOAL-HAPPY-001` (single child) - should still pass
2. Run `GOAL-HAPPY-002` (two siblings) - should now pass
3. Verify the LLM is NOT decoding the bookingToken in Langfuse traces

```bash
cd test-agent && npx ts-node src/index.ts run --scenario GOAL-HAPPY-001,GOAL-HAPPY-002 --watch
```

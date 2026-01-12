# bookingToken Technical Overview

> **Purpose:** Prevent LLM from extracting and misusing individual slot GUIDs by encapsulating all booking details in an opaque token.
>
> **Introduced:** Scheduling Tool v47-v49
>
> **Status:** Production

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution: bookingToken](#solution-bookingtoken)
3. [Token Structure](#token-structure)
4. [Encoding Process](#encoding-process)
5. [Decoding Process](#decoding-process)
6. [API Flow](#api-flow)
7. [Sample Code](#sample-code)
8. [Why Base64 JSON?](#why-base64-json)
9. [Security Considerations](#security-considerations)

---

## Problem Statement

### The Original Issue

When the scheduling tool returned slot data with individual GUIDs:

```json
{
  "slots": [{
    "StartTime": "1/13/2026 9:30:00 AM",
    "ScheduleViewGUID": "eaf83da0-ecbe-4d28-8f7d-6575b2714616",
    "ScheduleColumnGUID": "8165653c-4124-4b2e-b149-a5d70d90e974",
    "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
    "Minutes": "45"
  }]
}
```

The LLM would:
1. Extract individual GUIDs from the response
2. Store them in its context/PAYLOAD
3. Sometimes mix up GUIDs from different slots
4. Sometimes hallucinate GUIDs from previous conversations
5. Pass incorrect combinations to `book_child`

This caused booking failures with errors like:
- "appointment cannot be scheduled at the specified time"
- "invalid scheduleViewGUID"
- "slot mismatch"

### Version History

| Version | Approach | Result |
|---------|----------|--------|
| v1-v44 | Return raw GUIDs, trust LLM to copy correctly | ~60% booking success |
| v45 | Added DEFAULT_SCHEDULE_COLUMN_GUID fallback | ~70% success |
| v46 | Reduced MAX_SLOTS_RETURNED to 1 | ~75% success |
| v47 | Introduced bookingToken (optional) | LLM ignored it |
| v48 | Made bookingToken required, reject individual GUIDs | LLM decoded token |
| v49 | Strip GUIDs from response, only return displayTime + bookingToken | Current |

---

## Solution: bookingToken

The bookingToken encapsulates all slot details into a single opaque string that:

1. **Cannot be partially extracted** - It's all-or-nothing
2. **Contains all required booking fields** - No missing data possible
3. **Is validated on decode** - Invalid tokens are rejected
4. **Prevents GUID mixing** - Each token is self-contained

### Design Principle

```
┌─────────────────────────────────────────────────────────────┐
│                      SLOTS RESPONSE                          │
├─────────────────────────────────────────────────────────────┤
│  BEFORE (v1-v46):           AFTER (v49):                    │
│                                                              │
│  {                          {                                │
│    "StartTime": "...",        "displayTime": "1/13/2026...", │
│    "ScheduleViewGUID": "...", "bookingToken": "eyJzdCI6Li4." │
│    "ScheduleColumnGUID": "..",}                              │
│    "appointmentTypeGUID": ".",                               │
│    "Minutes": "45"                                           │
│  }                                                           │
│                                                              │
│  LLM extracts GUIDs ❌       LLM passes token as-is ✓       │
└─────────────────────────────────────────────────────────────┘
```

---

## Token Structure

The bookingToken is a Base64-encoded JSON object with compressed field names:

### Internal Structure

```json
{
  "st": "1/13/2026 9:30:00 AM",           // startTime
  "sv": "eaf83da0-ecbe-4d28-8f7d-...",    // scheduleViewGUID
  "sc": "8165653c-4124-4b2e-b149-...",    // scheduleColumnGUID
  "at": "f6c20c35-9abb-47c2-981a-...",    // appointmentTypeGUID
  "mn": "45"                               // minutes
}
```

### Field Mapping

| Token Field | Full Name | Description |
|-------------|-----------|-------------|
| `st` | startTime | Appointment start time (M/D/YYYY H:MM:SS AM/PM) |
| `sv` | scheduleViewGUID | Schedule view identifier (provider/location) |
| `sc` | scheduleColumnGUID | Schedule column identifier (chair/room) |
| `at` | appointmentTypeGUID | Type of appointment (new patient consult, etc.) |
| `mn` | minutes | Appointment duration |

### Example Token

**Decoded JSON:**
```json
{
  "st": "1/13/2026 9:30:00 AM",
  "sv": "8a30eeee-12e9-4b03-bf60-f19df9a00461",
  "sc": "79d5e6e1-16f5-4c15-952d-41316027989e",
  "at": "f6c20c35-9abb-47c2-981a-342996016705",
  "mn": "40"
}
```

**Encoded bookingToken:**
```
eyJzdCI6IjEvMTMvMjAyNiA5OjMwOjAwIEFNIiwic3YiOiI4YTMwZWVlZS0xMmU5LTRiMDMtYmY2MC1mMTlkZjlhMDA0NjEiLCJzYyI6Ijc5ZDVlNmUxLTE2ZjUtNGMxNS05NTJkLTQxMzE2MDI3OTg5ZSIsImF0IjoiZjZjMjBjMzUtOWFiYi00N2MyLTk4MWEtMzQyOTk2MDE2NzA1IiwibW4iOiI0MCJ9
```

---

## Encoding Process

When `slots` or `grouped_slots` returns data from the Cloud9 API, the scheduling tool:

1. Receives raw slot data with all GUIDs
2. Creates a bookingToken for each slot
3. Strips the individual GUIDs from the response
4. Returns only `displayTime` + `bookingToken`

### Encoding Function

```javascript
/**
 * Encode slot data into a bookingToken
 * @param {Object} slot - Raw slot object from Cloud9 API
 * @returns {string} Base64-encoded bookingToken
 */
function encodeBookingToken(slot) {
    const data = {
        st: slot.startTime || slot.StartTime,
        sv: slot.scheduleViewGUID || slot.ScheduleViewGUID,
        sc: slot.scheduleColumnGUID || slot.ScheduleColumnGUID,
        at: slot.appointmentTypeGUID || slot.AppointmentTypeGUID,
        mn: slot.minutes || slot.Minutes
    };
    return Buffer.from(JSON.stringify(data)).toString('base64');
}
```

### Response Transformation

```javascript
/**
 * Transform slots response to use bookingTokens
 * Strips individual GUIDs, adds bookingToken
 */
function addBookingTokensToSlots(data) {
    // Transform regular slots
    if (data && data.slots && Array.isArray(data.slots)) {
        data.slots = data.slots.map(slot => ({
            displayTime: slot.startTime || slot.StartTime,
            bookingToken: encodeBookingToken(slot)
        }));
    }

    // Transform grouped slots (for siblings)
    if (data && data.groups && Array.isArray(data.groups)) {
        data.groups = data.groups.map(group => ({
            groupTime: group.slots?.[0]?.startTime || group.slots?.[0]?.StartTime || null,
            slots: group.slots ? group.slots.map(slot => ({
                displayTime: slot.startTime || slot.StartTime,
                bookingToken: encodeBookingToken(slot)
            })) : []
        }));
    }

    // Remove voiceSlots as it also contains GUIDs
    delete data.voiceSlots;

    return data;
}
```

---

## Decoding Process

When `book_child` is called, the scheduling tool:

1. Validates that `bookingToken` parameter is present
2. Decodes the Base64 token
3. Parses the JSON
4. Extracts the booking fields
5. Calls the Cloud9 API with the decoded values

### Decoding Function

```javascript
/**
 * Decode bookingToken back to slot data
 * @param {string} token - Base64-encoded bookingToken
 * @returns {Object|null} Decoded slot data or null if invalid
 */
function decodeBookingToken(token) {
    try {
        const jsonString = Buffer.from(token, 'base64').toString('utf8');
        const data = JSON.parse(jsonString);

        return {
            startTime: data.st,
            scheduleViewGUID: data.sv,
            scheduleColumnGUID: data.sc,
            appointmentTypeGUID: data.at,
            minutes: data.mn
        };
    } catch (e) {
        console.error('[decodeBookingToken] Failed to decode:', e.message);
        return null;
    }
}
```

### Validation in book_child

```javascript
const ACTIONS = {
    book_child: {
        endpoint: `${BASE_URL}/ortho-prd/createAppt`,
        method: 'POST',

        validate: (params) => {
            if (!params.patientGUID) {
                throw new Error('BOOKING FAILED - Missing patientGUID');
            }
            if (!params.bookingToken) {
                throw new Error('BOOKING FAILED - Missing bookingToken. You must call slots first and use the bookingToken from the response.');
            }
        },

        buildBody: (params, uui) => {
            // REQUIRE bookingToken - no fallback to individual params
            if (!params.bookingToken) {
                throw new Error('BOOKING FAILED - bookingToken is required. Call slots first to get a bookingToken.');
            }

            const slotData = decodeBookingToken(params.bookingToken);
            if (!slotData) {
                throw new Error('BOOKING FAILED - Invalid bookingToken. Call slots again to get a fresh token.');
            }

            console.log('[book_child] Decoded bookingToken:', JSON.stringify(slotData));

            return {
                uui: uui,
                patientGUID: params.patientGUID,
                startTime: slotData.startTime,
                scheduleViewGUID: slotData.scheduleViewGUID,
                scheduleColumnGUID: slotData.scheduleColumnGUID || DEFAULT_SCHEDULE_COLUMN_GUID,
                appointmentTypeGUID: slotData.appointmentTypeGUID || DEFAULT_APPT_TYPE_GUID,
                minutes: slotData.minutes || 45,
                childName: params.childName
            };
        }
    }
};
```

---

## API Flow

### Single Child Booking

```
┌─────────┐     ┌──────────────────┐     ┌─────────────┐     ┌──────────┐
│   LLM   │     │ Scheduling Tool  │     │  Node-RED   │     │ Cloud9   │
└────┬────┘     └────────┬─────────┘     └──────┬──────┘     └────┬─────┘
     │                   │                      │                  │
     │ action=slots      │                      │                  │
     │ startDate=...     │                      │                  │
     │──────────────────>│                      │                  │
     │                   │  POST /getApptSlots  │                  │
     │                   │─────────────────────>│                  │
     │                   │                      │  SOAP Request    │
     │                   │                      │─────────────────>│
     │                   │                      │                  │
     │                   │                      │<─────────────────│
     │                   │                      │  Raw slots       │
     │                   │<─────────────────────│  (with GUIDs)    │
     │                   │                      │                  │
     │                   │ encodeBookingToken() │                  │
     │                   │ stripGUIDs()         │                  │
     │                   │                      │                  │
     │<──────────────────│                      │                  │
     │ { displayTime,    │                      │                  │
     │   bookingToken }  │                      │                  │
     │                   │                      │                  │
     │ "I have 9:30 AM"  │                      │                  │
     │ ════════════════> │                      │                  │
     │     (to user)     │                      │                  │
     │                   │                      │                  │
     │ action=book_child │                      │                  │
     │ patientGUID=...   │                      │                  │
     │ bookingToken=...  │                      │                  │
     │──────────────────>│                      │                  │
     │                   │ decodeBookingToken() │                  │
     │                   │ validate()           │                  │
     │                   │                      │                  │
     │                   │  POST /createAppt    │                  │
     │                   │─────────────────────>│                  │
     │                   │                      │  SOAP Request    │
     │                   │                      │─────────────────>│
     │                   │                      │                  │
     │                   │                      │<─────────────────│
     │                   │<─────────────────────│  appointmentGUID │
     │<──────────────────│                      │                  │
     │ { appointmentGUID │                      │                  │
     │   success: true } │                      │                  │
     │                   │                      │                  │
```

### Two Children Booking (grouped_slots)

```
┌─────────┐     ┌──────────────────┐
│   LLM   │     │ Scheduling Tool  │
└────┬────┘     └────────┬─────────┘
     │                   │
     │ action=grouped_slots
     │ numberOfPatients=2│
     │──────────────────>│
     │                   │
     │<──────────────────│
     │ {                 │
     │   groups: [{      │
     │     slots: [      │
     │       { displayTime: "2:00 PM", bookingToken: "eyJ..." },  ← Child 1
     │       { displayTime: "2:30 PM", bookingToken: "eyK..." }   ← Child 2
     │     ]             │
     │   }]              │
     │ }                 │
     │                   │
     │ Store tokens:     │
     │ child[0].token = "eyJ..."
     │ child[1].token = "eyK..."
     │                   │
     │ "Jake at 2 PM, Lily at 2:30 PM"
     │ ════════════════════════════════>  (to user)
     │                   │
     │ User: "Yes"       │
     │                   │
     │ action=book_child │
     │ patientGUID=[Jake]│
     │ bookingToken="eyJ..."  ← Token for 2:00 PM slot
     │──────────────────>│
     │<──────────────────│
     │ appointmentGUID   │
     │                   │
     │ action=book_child │
     │ patientGUID=[Lily]│
     │ bookingToken="eyK..."  ← Token for 2:30 PM slot
     │──────────────────>│
     │<──────────────────│
     │ appointmentGUID   │
     │                   │
```

---

## Sample Code

### Complete Example: Encoding and Decoding

```javascript
// ============================================================
// bookingToken Utilities
// ============================================================

const TOOL_VERSION = 'v49';

/**
 * Encode slot data into a bookingToken
 */
function encodeBookingToken(slot) {
    const data = {
        st: slot.startTime || slot.StartTime,
        sv: slot.scheduleViewGUID || slot.ScheduleViewGUID,
        sc: slot.scheduleColumnGUID || slot.ScheduleColumnGUID,
        at: slot.appointmentTypeGUID || slot.AppointmentTypeGUID,
        mn: slot.minutes || slot.Minutes
    };
    return Buffer.from(JSON.stringify(data)).toString('base64');
}

/**
 * Decode bookingToken back to slot data
 */
function decodeBookingToken(token) {
    try {
        const data = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
        return {
            startTime: data.st,
            scheduleViewGUID: data.sv,
            scheduleColumnGUID: data.sc,
            appointmentTypeGUID: data.at,
            minutes: data.mn
        };
    } catch (e) {
        console.error('[decodeBookingToken] Failed:', e.message);
        return null;
    }
}

// ============================================================
// Example Usage
// ============================================================

// Raw slot from Cloud9 API
const rawSlot = {
    StartTime: "1/13/2026 9:30:00 AM",
    ScheduleViewGUID: "8a30eeee-12e9-4b03-bf60-f19df9a00461",
    ScheduleColumnGUID: "79d5e6e1-16f5-4c15-952d-41316027989e",
    AppointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
    Minutes: "40"
};

// Encode for LLM response
const bookingToken = encodeBookingToken(rawSlot);
console.log('Encoded token:', bookingToken);
// Output: eyJzdCI6IjEvMTMvMjAyNiA5OjMwOjAwIEFNIiwic3YiOiI4YTMwZWVlZS0...

// What LLM receives (GUIDs stripped)
const llmResponse = {
    slots: [{
        displayTime: "1/13/2026 9:30:00 AM",
        bookingToken: bookingToken
    }]
};
console.log('LLM receives:', JSON.stringify(llmResponse, null, 2));

// Decode when booking
const decoded = decodeBookingToken(bookingToken);
console.log('Decoded for booking:', decoded);
// Output: {
//   startTime: "1/13/2026 9:30:00 AM",
//   scheduleViewGUID: "8a30eeee-12e9-4b03-bf60-f19df9a00461",
//   scheduleColumnGUID: "79d5e6e1-16f5-4c15-952d-41316027989e",
//   appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
//   minutes: "40"
// }
```

### Node.js Test Script

```javascript
// test-booking-token.js
// Run: node test-booking-token.js

const assert = require('assert');

function encodeBookingToken(slot) {
    const data = {
        st: slot.startTime || slot.StartTime,
        sv: slot.scheduleViewGUID || slot.ScheduleViewGUID,
        sc: slot.scheduleColumnGUID || slot.ScheduleColumnGUID,
        at: slot.appointmentTypeGUID || slot.AppointmentTypeGUID,
        mn: slot.minutes || slot.Minutes
    };
    return Buffer.from(JSON.stringify(data)).toString('base64');
}

function decodeBookingToken(token) {
    try {
        const data = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
        return {
            startTime: data.st,
            scheduleViewGUID: data.sv,
            scheduleColumnGUID: data.sc,
            appointmentTypeGUID: data.at,
            minutes: data.mn
        };
    } catch (e) {
        return null;
    }
}

// Test Cases
console.log('Running bookingToken tests...\n');

// Test 1: Encode and decode roundtrip
const slot1 = {
    StartTime: "1/13/2026 9:30:00 AM",
    ScheduleViewGUID: "8a30eeee-12e9-4b03-bf60-f19df9a00461",
    ScheduleColumnGUID: "79d5e6e1-16f5-4c15-952d-41316027989e",
    AppointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
    Minutes: "40"
};

const token1 = encodeBookingToken(slot1);
const decoded1 = decodeBookingToken(token1);

assert.strictEqual(decoded1.startTime, slot1.StartTime, 'startTime mismatch');
assert.strictEqual(decoded1.scheduleViewGUID, slot1.ScheduleViewGUID, 'scheduleViewGUID mismatch');
assert.strictEqual(decoded1.scheduleColumnGUID, slot1.ScheduleColumnGUID, 'scheduleColumnGUID mismatch');
assert.strictEqual(decoded1.appointmentTypeGUID, slot1.AppointmentTypeGUID, 'appointmentTypeGUID mismatch');
console.log('✓ Test 1: Encode/decode roundtrip passed');

// Test 2: Invalid token returns null
const invalidToken = "not-a-valid-base64-json";
const decoded2 = decodeBookingToken(invalidToken);
assert.strictEqual(decoded2, null, 'Should return null for invalid token');
console.log('✓ Test 2: Invalid token handling passed');

// Test 3: Two different slots produce different tokens
const slot2 = {
    StartTime: "1/13/2026 2:30:00 PM",
    ScheduleViewGUID: "different-guid-here",
    ScheduleColumnGUID: "another-guid-here",
    AppointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
    Minutes: "30"
};

const token2 = encodeBookingToken(slot2);
assert.notStrictEqual(token1, token2, 'Different slots should produce different tokens');
console.log('✓ Test 3: Unique tokens per slot passed');

// Test 4: Token is valid base64
const isValidBase64 = /^[A-Za-z0-9+/]+=*$/.test(token1);
assert.strictEqual(isValidBase64, true, 'Token should be valid base64');
console.log('✓ Test 4: Valid base64 format passed');

console.log('\n All tests passed!');
```

### Browser/Frontend Decoder (for debugging)

```javascript
// Browser-compatible decoder for debugging in Langfuse/console
function decodeBookingTokenBrowser(token) {
    try {
        const jsonString = atob(token);
        const data = JSON.parse(jsonString);
        return {
            startTime: data.st,
            scheduleViewGUID: data.sv,
            scheduleColumnGUID: data.sc,
            appointmentTypeGUID: data.at,
            minutes: data.mn
        };
    } catch (e) {
        console.error('Failed to decode token:', e);
        return null;
    }
}

// Usage in browser console:
// decodeBookingTokenBrowser("eyJzdCI6IjEvMTMvMjAyNiA5OjMwOjAwIEFNIiwic3Yi...")
```

---

## Why Base64 JSON?

### Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Plain JSON** | Human readable | LLM would extract GUIDs |
| **UUID reference** | Short, opaque | Requires server-side storage/lookup |
| **Encrypted token** | Truly opaque | Complexity, key management |
| **Base64 JSON** | Self-contained, decodable server-side | LLM can decode (mitigated by stripping from response) |
| **JWT** | Standard format | Overkill, LLM familiar with format |

### Why Base64 JSON Won

1. **Self-contained** - No server-side state needed
2. **Decodable** - Tool can extract values without external lookup
3. **Compact** - Smaller than full JSON
4. **Unfamiliar format** - LLM less likely to decode than plain JSON
5. **Combined with GUID stripping** - Even if decoded, LLM can't reconstruct from response

### The v49 Innovation

The key insight in v49 was: **Don't just add a token, remove the raw data**.

Before v49, the response contained BOTH the bookingToken AND the raw GUIDs. The LLM would ignore the token and use the GUIDs directly.

v49 strips all GUIDs from the response, leaving only `displayTime` (for voice output) and `bookingToken` (for booking). Even if the LLM decodes the base64, it can't use the decoded values because the tool rejects individual GUID parameters.

---

## Security Considerations

### What the Token Is NOT

- **Not encrypted** - It's just base64, easily decoded
- **Not signed** - No integrity verification
- **Not expiring** - No TTL built in

### Why This Is Acceptable

1. **Trust boundary** - The tool trusts its own output
2. **Short-lived** - Slots are typically used within minutes
3. **No sensitive data** - GUIDs are not secrets
4. **Server-side validation** - Cloud9 API validates the actual booking

### Potential Future Enhancements

```javascript
// Example: Add expiration to token
function encodeBookingTokenWithExpiry(slot, ttlMinutes = 30) {
    const data = {
        st: slot.startTime,
        sv: slot.scheduleViewGUID,
        sc: slot.scheduleColumnGUID,
        at: slot.appointmentTypeGUID,
        mn: slot.minutes,
        exp: Date.now() + (ttlMinutes * 60 * 1000)  // Expiry timestamp
    };
    return Buffer.from(JSON.stringify(data)).toString('base64');
}

function decodeBookingTokenWithExpiry(token) {
    try {
        const data = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));

        // Check expiry
        if (data.exp && Date.now() > data.exp) {
            console.error('[decodeBookingToken] Token expired');
            return null;
        }

        return {
            startTime: data.st,
            scheduleViewGUID: data.sv,
            scheduleColumnGUID: data.sc,
            appointmentTypeGUID: data.at,
            minutes: data.mn
        };
    } catch (e) {
        return null;
    }
}
```

---

## Troubleshooting

### Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| `missing_booking_token` | LLM passed individual GUIDs instead of token | Update system prompt to use bookingToken |
| `Invalid bookingToken` | Corrupted or truncated token | Re-call slots to get fresh token |
| `BOOKING FAILED` | Token decode failed | Check token is complete base64 string |

### Debugging Steps

1. **Check Langfuse trace** - Look at the book_child tool call parameters
2. **Decode token manually** - Use browser console decoder above
3. **Compare with slots response** - Ensure token matches what was returned
4. **Verify no GUID extraction** - LLM should not have scheduleViewGUID etc. in its payload

### Langfuse Query for Token Issues

Look for traces where:
- `tool_name = "schedule_appointment_ortho"`
- `action = "book_child"`
- `bookingToken` is missing OR
- `scheduleViewGUID` is present (should not be)

---

## Summary

The bookingToken system ensures reliable appointment booking by:

1. **Encapsulating** all slot details in a single opaque token
2. **Stripping** individual GUIDs from the LLM-visible response
3. **Requiring** the token for booking (rejecting individual params)
4. **Decoding** server-side to extract the original values

This prevents the LLM from:
- Mixing GUIDs from different slots
- Hallucinating GUIDs from context
- Partially copying slot data
- Making mistakes with multiple children's slots

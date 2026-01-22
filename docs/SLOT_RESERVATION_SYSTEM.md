# Slot Reservation System

## Overview

This document describes the slot reservation system implemented to prevent race conditions where multiple concurrent sessions could be offered and attempt to book the same appointment slot.

## Problem Statement

**Race Condition Discovered:** Two concurrent sessions were offered the same slot from cache:
- Session `3f4359de` at 06:37:49 got slot 9:10 AM on 3/11/2026, booked at 06:37:58
- Session `1e80226c` at 06:38:26 got SAME slot 9:10 AM (28 seconds after it was already booked!)
- Session `1e80226c` at 06:38:49 tried to book but failed with "slot already booked"

**Root Cause:** No slot reservation mechanism existed. The cache served the same slots to multiple concurrent sessions without any locking or reservation awareness.

**Previous State:**
- `func-grouped-slots` (v14) returned slots from Redis cache without checking if they're reserved
- `func-create-appt` (v9) had session-level deduplication (prevents same session double-booking) but NOT cross-session protection
- Flow context `sessionSlotBookings` only tracked within a single session

## Solution Architecture

### Redis-Based Slot Reservation

When a session begins the booking process (`createAppt` is called), the slot is immediately reserved in Redis. Other sessions requesting slots will have reserved slots filtered out.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SLOT RESERVATION FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Session A                              Session B                      │
│      │                                      │                           │
│      ▼                                      │                           │
│   getGroupedApptSlots                       │                           │
│      │                                      │                           │
│      ▼                                      │                           │
│   Filter out reserved slots                 │                           │
│      │                                      │                           │
│      ▼                                      │                           │
│   Return slots to caller                    ▼                           │
│      │                               getGroupedApptSlots                │
│      │                                      │                           │
│      │                                      ▼                           │
│      │                               Filter out reserved slots          │
│      │                               (Slot 9:10 AM now filtered!)       │
│      │                                      │                           │
│      ▼                                      ▼                           │
│   User selects 9:10 AM             User sees different slots            │
│      │                                                                  │
│      ▼                                                                  │
│   book_child (createAppt)                                               │
│      │                                                                  │
│      ▼                                                                  │
│   Reserve slot (Redis SET with TTL)                                     │
│      │                                                                  │
│      ▼                                                                  │
│   Call Cloud9 API to book                                               │
│      │                                                                  │
│      ▼                                                                  │
│   On success: Keep reservation (5 min TTL)                              │
│   On failure: Delete reservation                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Redis Key Design

**Reservation Key Pattern:**
```
SlotReservation:{locationGUID}:{date_YYYYMMDD}:{time_HHmm}:{scheduleColumnGUID}
```

**Example:**
```
SlotReservation:1fef9297-7c8b-426b-b0d1-f2275136e48b:20260311:0910:07687884-7e37-49aa-8028-d43b751c9034
```

**Reservation Value:**
```json
{
  "sessionId": "3f4359de-eb9e-413e-a4e1-cefdbda373bd",
  "reservedAt": "2026-01-22T06:37:49.000Z",
  "patientName": "TestUser3 Test3",
  "slotStartTime": "3/11/2026 9:10:00 AM"
}
```

**TTL Values:**
- Initial reservation: 90 seconds (enough time to complete booking)
- After successful booking: 300 seconds (5 minutes - prevents immediate re-offering)
- Auto-expires if session abandons the booking flow

## Implementation Details

### Phase 1: func-create-appt (v9 → v10)

**Location:** `nodered/nodered_Cloud9_flows.json` - Node: `func-create-appt`

**Changes:**

1. **Before booking, reserve the slot in Redis:**
   - Generate reservation key from slot details
   - Check if another session has this slot reserved
   - If reserved by another session, return error with guidance
   - If not reserved (or reserved by same session), create reservation with 90s TTL

2. **After booking attempt:**
   - On success: Extend reservation to 5 minutes (prevents re-offering)
   - On failure: Delete reservation (releases slot for others)

### Phase 2: func-grouped-slots (v14 → v15)

**Location:** `nodered/nodered_Cloud9_flows.json` - Node: `func-grouped-slots`

**Changes:**

1. **After fetching slots from cache, filter out reserved ones:**
   - For each slot, check Redis for existing reservation
   - Filter out slots reserved by OTHER sessions
   - Allow slots reserved by SAME session to remain visible
   - Log reservation filtering decisions for debugging

### Phase 3: scheduling_tool_func.js (v67 → v68)

**Location:** `docs/v1/scheduling_tool_func.js`

**Changes:**

1. **Pass sessionId to getGroupedApptSlots:**
   - Extract sessionId from flow context
   - Include in request body to Node-RED endpoint
   - Enables reservation filtering to know which session is asking

## Testing Plan

### Test Case 1: Concurrent Session Protection
1. Start session A, get slots including 9:10 AM
2. Session A starts booking 9:10 AM (reservation created)
3. Start session B, get slots - 9:10 AM should NOT appear
4. Session A completes booking
5. Verify session B never saw or could book 9:10 AM

### Test Case 2: Reservation Expiry
1. Session A reserves 9:10 AM
2. Wait 91 seconds (reservation expires)
3. Session B gets slots - 9:10 AM should now appear

### Test Case 3: Same Session Idempotency
1. Session A reserves 9:10 AM
2. Session A gets slots again - should still see 9:10 AM

### Test Case 4: Booking Failure Releases Reservation
1. Session A reserves 9:10 AM
2. Cloud9 booking fails
3. Reservation is released
4. Session B can now see and book 9:10 AM

## Risk Mitigation

### Risk 1: Redis Unavailable
**Mitigation:** Fall back to current behavior (no filtering). Log warning. Non-blocking.

### Risk 2: TTL Too Short
**Mitigation:** 90 seconds covers Flowise response + user confirmation + Cloud9 API call. Can extend to 120s if needed.

### Risk 3: Orphaned Reservations
**Mitigation:** TTL ensures automatic cleanup. No manual intervention required.

### Risk 4: Performance Impact
**Mitigation:** Redis operations are fast (< 10ms). Slot filtering adds negligible latency.

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v10 | 2026-01-22 | func-create-appt: Added cross-session slot reservation |
| v15 | 2026-01-22 | func-grouped-slots: Added reservation filtering |
| v68 | 2026-01-22 | scheduling_tool_func.js: Pass sessionId to endpoints |

## Debugging

### Check Active Reservations
```bash
# Via Redis CLI (if accessible)
KEYS SlotReservation:*

# Via Node-RED API
curl -H "Authorization: Basic ..." \
  "https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd/redisGet?key=SlotReservation:..."
```

### Common Issues

1. **Slot not appearing for any session:**
   - Check if reservation exists with `redisGet`
   - Check reservation TTL hasn't been extended incorrectly
   - Verify reservation sessionId matches expected session

2. **Same slot offered to multiple sessions:**
   - Verify `func-grouped-slots` is filtering correctly
   - Check Redis connectivity
   - Verify sessionId is being passed correctly

3. **Booking fails with "reserved by other session":**
   - Expected behavior if another session reserved first
   - LLM should offer alternative slot
   - Check reservation timestamp to confirm timing

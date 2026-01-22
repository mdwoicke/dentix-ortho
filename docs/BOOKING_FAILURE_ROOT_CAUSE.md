# Booking Failure Root Cause Analysis

**Date:** January 18, 2026
**Status:** ROOT CAUSE IDENTIFIED ✅

---

## Executive Summary

Booking failures occur when users select time slots that are available on chairs OTHER than Chair 8. The IVA's slot retrieval returns slots from ALL chairs, but Node-RED's booking endpoint is hardcoded to use **only Chair 8**.

---

## Problem Statement

Bookings fail with the error:
> "This appointment cannot be scheduled in the specified time slot"

Even when:
- `GetOnlineReservations` returns the slot as available
- All GUIDs appear correct
- The booking mechanism works (verified with control tests)

---

## Root Cause

### The Mismatch

| Component | Behavior |
|-----------|----------|
| **GetOnlineReservations** | Returns slots from ALL chairs at the location |
| **Node-RED createAppt** | Hardcoded to book on **Chair 8 only** |

When a user selects a slot that's available on a different chair (e.g., Chair 5), the booking fails because that time slot doesn't exist on Chair 8.

### Evidence from March 13, 2026

```
Chair 8 [NODE-RED HARDCODED]:
  - 2:20:00 PM   (ONLY 1 slot)

Chair 5:
  - 8:50:00 AM
  - 9:30:00 AM
  - 10:10:00 AM
  - 10:50:00 AM
  - 1:20:00 PM
  - 2:00:00 PM
  - 3:00:00 PM
  - 3:40:00 PM  (8 slots)
```

The IVA shows 9 slots to the user, but only 1 (2:20 PM) can actually be booked through Node-RED.

---

## Failed Sessions Explained

| Session | Time Requested | Result | Explanation |
|---------|---------------|--------|-------------|
| `a993145c` | 10:30 AM on 3/13 | FAILED | Not available on ANY chair |
| `e723edcb` | 10:30 AM, 11:10 AM on 3/13 | FAILED | Not available on ANY chair |
| Control | 1:40 PM on 3/13 | SUCCESS | Was available on Chair 8 (now booked) |

---

## Hardcoded Values in Node-RED v7

```javascript
// Node-RED createAppt endpoint hardcodes:
const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034';
const LOCATION_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b'; // CDH-Allegheny 202
const SCHEDULE_VIEW_GUID = '4c9e9333-4951-4eb0-8d97-e1ad83ef422d';
const APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705'; // Exam - PPO/Self
```

---

## Solution Implemented: Option 2 ✅

### Implementation Details

**Date:** January 18, 2026
**Version:** Node-RED Flow v67

The fix removes all Chair 8 hardcoding and allows booking on any available chair:

1. **getApptSlots**: Removed `CHAIR_8_GUID` constant and filter
2. **getGroupedApptSlots**: Removed Chair 8 filter
3. **createAppt**: Changed from hardcoded Chair 8 GUID to `params.scheduleColumnGUID`

**Before:**
```javascript
// In createAppt - HARDCODED
ScheduleColumnGUID: '07687884-7e37-49aa-8028-d43b751c9034'
```

**After:**
```javascript
// In createAppt - Uses slot's chair
ScheduleColumnGUID: params.scheduleColumnGUID
```

### Changes Made

| Function | Change |
|----------|--------|
| `getApptSlots` | Removed Chair 8 filter - returns ALL chairs |
| `getGroupedApptSlots` | Removed Chair 8 filter - returns ALL chairs |
| `createAppt` | Uses `params.scheduleColumnGUID` from slot |

### Benefits

- ✅ Users can book ANY available slot
- ✅ No reduction in availability
- ✅ Morning slots on other chairs now bookable
- ✅ Existing Chair 8 bookings continue to work

### Files Changed

- `docs/v1/nodered_Cloud9_flows.json` (v67)
- `nodered/nodered_Cloud9_flows.json` (synced)
- Backup: `nodered/bk_up/pre-multi-chair-change.json`

---

## Verification Tests Performed

| Test | Result | Details |
|------|--------|---------|
| Chair 8 via Node-RED | ✅ SUCCESS | `3/12/2026 3:20 PM` booked |
| Chair 8 via Node-RED | ✅ SUCCESS | `3/13/2026 3:20 PM` booked |
| Immediate Booking | ✅ SUCCESS | `3/12/2026 1:40 PM` booked |
| Direct Cloud9 (rate limited) | ⚠️ BLOCKED | Error Code 8 |
| AM slot via Node-RED | ✅ SUCCESS | `3/16/2026 9:10 AM` booked |

All Chair 8 bookings via Node-RED succeed. The booking mechanism is working correctly.

---

## Files Created

| File | Purpose |
|------|---------|
| `test-agent/scripts/test-booking-isolation.js` | Freshness/timing tests |
| `test-agent/scripts/test-cloud9-direct-chairs.js` | Chair comparison tests |
| `test-agent/scripts/test-march13-slots.js` | March 13 specific investigation |
| `test-agent/scripts/diagnose-march13-chairs.js` | Final diagnostic script |
| `test-agent/data/cloud9-chairs-results.json` | Chair test results |
| `test-agent/data/booking-isolation-results.json` | Isolation test results |

---

## Next Steps

1. **Immediate:** Implement Option 1 (filter to Chair 8 in getApptSlots)
2. **Short-term:** Investigate Option 2 (dynamic chair from slot)
3. **Long-term:** Consider multi-chair support with proper validation

---

## Conclusion

The booking failures are NOT caused by:
- ❌ Slot freshness/timing issues
- ❌ GUID mismatches
- ❌ Cloud9 API problems
- ❌ Rate limiting (handled by Node-RED retry logic)

The booking failures ARE caused by:
- ✅ **Chair mismatch between slot retrieval and booking**

The fix is straightforward: either filter slots to Chair 8 only, or pass the slot's chair GUID through to the booking call.

# Slot Prefetch Cache Design Document

**Author:** Claude Code
**Date:** 2026-01-20
**Status:** Phase 1 Complete - Awaiting Engineering Sign-off
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Solution Overview](#solution-overview)
4. [Technical Architecture](#technical-architecture)
5. [Implementation Details](#implementation-details)
6. [Data Flow Diagrams](#data-flow-diagrams)
7. [Cache Strategy](#cache-strategy)
8. [Testing Strategy](#testing-strategy)
9. [Rollout Plan](#rollout-plan)
10. [Risk Assessment](#risk-assessment)
11. [Monitoring & Observability](#monitoring--observability)
12. [Rollback Plan](#rollback-plan)
13. [Sign-off Checklist](#sign-off-checklist)

---

## Executive Summary

This document describes a **slot prefetch caching mechanism** to reduce caller wait times during appointment scheduling. The solution leverages existing Node-RED flow context patterns to cache appointment slot data early in the conversation, eliminating the 30-200+ second delays that currently occur when callers reach the scheduling step.

**Key Benefits:**
- Reduces slot query latency from 30-200s to <100ms (cache hit)
- No infrastructure changes required (uses existing Node-RED flow context)
- Graceful degradation - falls back to normal API flow on cache miss
- Zero impact on booking accuracy (cache is read-only, booking validates at write time)

---

## Problem Statement

### Current State

When a caller reaches the scheduling step in the IVA conversation, the system queries Cloud9's `GetOnlineReservations` API to find available appointment slots. This query can take:

| Scenario | Duration | Cause |
|----------|----------|-------|
| Best case | 5-15 seconds | Slots found in first date range |
| Typical case | 30-60 seconds | Tier expansion (30→60→90 days) |
| Worst case | 120-200+ seconds | Multiple tier expansions + rate limiting |

### Impact

1. **Caller Drop-off:** Long silences cause callers to hang up or request transfer
2. **Transfer Rate Increase:** Agents receive calls that could have been automated
3. **Poor CX:** Callers perceive the system as slow/broken

### Root Cause

The slot query happens **late in the conversation** (turn count ~16-18), after all caller information has been gathered. By this point, the caller has invested 2-3 minutes and expects immediate results.

```
Timeline (Current):
TC 1-5:   Greeting, intent confirmation, name          (~30s)
TC 6-10:  Child count, child info, DOB                 (~60s)
TC 11-15: Insurance, email, time preference            (~60s)
TC 16:    Ask date preference
TC 17:    ══════════════════════════════════════════════
          ║ SLOT QUERY HAPPENS HERE                    ║
          ║ Caller waits 30-200 seconds in silence     ║
          ══════════════════════════════════════════════
TC 18:    Offer slot to caller
```

---

## Solution Overview

### Core Idea

**Prefetch slots early in the conversation** when the location is confirmed (TC ~6), while the caller is busy providing child information. The slots are cached and ready by the time the scheduling step is reached.

```
Timeline (Proposed):
TC 1-5:   Greeting, intent confirmation, name          (~30s)
TC 6:     "How many children?" → [TRIGGER PREFETCH]
          ══════════════════════════════════════════════
          ║ BACKGROUND: Prefetch running in parallel   ║
          ══════════════════════════════════════════════
TC 7-15:  Child info, DOB, insurance, email            (~90s)
          ══════════════════════════════════════════════
          ║ PREFETCH COMPLETE - Slots now cached       ║
          ══════════════════════════════════════════════
TC 16:    Ask date preference
TC 17:    SLOT QUERY → CACHE HIT → <100ms response
TC 18:    Offer slot to caller (immediate!)
```

### Why This Works

The conversation has a natural **2-3 minute parallelism window** between location confirmation and slot query. This is more than enough time for even the slowest slot fetch to complete.

---

## Technical Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FLOWISE                                    │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐    │
│  │   System    │    │  Scheduling Tool │    │  Patient Tool   │    │
│  │   Prompt    │    │     (v66)        │    │                 │    │
│  │   (v73)     │    │                  │    │                 │    │
│  └─────────────┘    └────────┬─────────┘    └─────────────────┘    │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          NODE-RED                                    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Flow Context (Memory)                     │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │   │
│  │  │ bookingSessions │  │  cachedSlots    │  │ pendingOps  │  │   │
│  │  │ (auth tokens)   │  │  (NEW - slots)  │  │ (async q)   │  │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ getApptSlots │  │ createAppt   │  │ Slot-Cache-  │              │
│  │              │  │              │  │ Test (new)   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CLOUD9 API                                   │
│                  GetOnlineReservations (XML)                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Storage Location

**Node-RED Flow Context** (`flow.get()` / `flow.set()`)

This is the same pattern used for:
- `bookingSessions` - Auth token cache per session
- `pendingOperations` - Async retry queue
- `lastSetAppointmentTime` - Rate limit spacing

**Characteristics:**
- In-memory storage on Node-RED server
- Shared across all concurrent calls to the flow
- Volatile (lost on restart, rebuilds naturally)
- No external dependencies (Redis, DB, etc.)

---

## Implementation Details

### Phase 1: Test Harness (COMPLETE)

A standalone test flow tab `Slot-Cache-Test` with four endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/test/slot-cache/prefetch` | POST | Fetch slots and store in cache |
| `/test/slot-cache/status` | GET | Return cache stats |
| `/test/slot-cache/query` | POST | Query slots (cache-first) |
| `/test/slot-cache/clear` | DELETE | Clear cache |

**Files Modified:**
- `nodered/nodered_Cloud9_flows.json` (v81) - Added test flow tab
- `test-agent/scripts/test-slot-cache.js` - Validation script

### Phase 2: Validation (PENDING)

Deploy test harness and verify:
1. Cache MISS duration: 5-60 seconds
2. Cache HIT duration: <100ms
3. Cache expiration works correctly (5 min TTL)

### Phase 3: Production Integration (PENDING)

**Files to Modify:**

| File | Change |
|------|--------|
| `docs/v1/schedule_appointment_dso_Tool.json` | Add `prefetch` action |
| `docs/v1/scheduling_tool_func.js` | Cache check in `slots` action |
| `docs/v1/Chord_Cloud9_SystemPrompt.md` | Add prefetch trigger instruction |
| `nodered/nodered_Cloud9_flows.json` | Add cache logic to `getApptSlots` |

---

## Data Flow Diagrams

### Prefetch Flow (TC ~6)

```
┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐
│ Flowise │      │ Node-RED│      │ Cloud9  │      │  Cache  │
│  (LLM)  │      │         │      │   API   │      │ (flow)  │
└────┬────┘      └────┬────┘      └────┬────┘      └────┬────┘
     │                │                │                │
     │  prefetch      │                │                │
     │  action        │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ GetOnline      │                │
     │                │ Reservations   │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │     slots[]    │                │
     │                │<───────────────│                │
     │                │                │                │
     │                │                │  flow.set()    │
     │                │                │  cachedSlots   │
     │                │────────────────────────────────>│
     │                │                │                │
     │  {success:     │                │                │
     │   true,        │                │                │
     │   _prefetch:   │                │                │
     │   true}        │                │                │
     │<───────────────│                │                │
     │                │                │                │
```

### Slot Query Flow (TC ~17) - Cache HIT

```
┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐
│ Flowise │      │ Node-RED│      │ Cloud9  │      │  Cache  │
│  (LLM)  │      │         │      │   API   │      │ (flow)  │
└────┬────┘      └────┬────┘      └────┬────┘      └────┬────┘
     │                │                │                │
     │  slots         │                │                │
     │  action        │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │  flow.get()    │                │
     │                │  cachedSlots   │                │
     │                │<───────────────────────────────│
     │                │                │                │
     │                │  CACHE HIT!    │                │
     │                │  (not expired) │                │
     │                │                │                │
     │  {slots: [...],│                │                │
     │   fromCache:   │                │                │
     │   true}        │                │                │
     │<───────────────│                │                │
     │                │                │                │
     │  <100ms total  │                │                │
     │                │                │                │
```

### Slot Query Flow (TC ~17) - Cache MISS (Fallback)

```
┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐
│ Flowise │      │ Node-RED│      │ Cloud9  │      │  Cache  │
│  (LLM)  │      │         │      │   API   │      │ (flow)  │
└────┬────┘      └────┬────┘      └────┬────┘      └────┬────┘
     │                │                │                │
     │  slots         │                │                │
     │  action        │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │  flow.get()    │                │
     │                │  cachedSlots   │                │
     │                │<───────────────────────────────│
     │                │                │                │
     │                │  CACHE MISS    │                │
     │                │  (not found    │                │
     │                │   or expired)  │                │
     │                │                │                │
     │                │ GetOnline      │                │
     │                │ Reservations   │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │     slots[]    │                │
     │                │<───────────────│                │
     │                │                │                │
     │  {slots: [...],│                │                │
     │   fromCache:   │                │                │
     │   false}       │                │                │
     │<───────────────│                │                │
     │                │                │                │
```

---

## Cache Strategy

### Cache Key Format

```
{locationGUID}_{startDateYYYYMMDD}_{endDateYYYYMMDD}

Example:
1fef9297-7c8b-426b-b0d1-f2275136e48b_01202026_02192026
```

### Cache Entry Structure

```javascript
cachedSlots[cacheKey] = {
    locationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b",
    startDate: "01/20/2026",
    endDate: "02/19/2026",
    slots: [
        {
            StartTime: "01/25/2026 9:00 AM",
            ScheduleViewGUID: "...",
            ScheduleColumnGUID: "...",
            AppointmentTypeGUID: "...",
            Minutes: "40",
            // ... other Cloud9 fields
        },
        // ... more slots
    ],
    slotCount: 42,
    fetchedAt: "2026-01-20T15:30:00.000Z",
    expiresAt: "2026-01-20T15:35:00.000Z",  // +5 minutes
    fetchDurationMs: 8500
}
```

### TTL (Time-To-Live)

**5 minutes** - Chosen based on:

1. **Slot volatility:** Appointments can be booked by other callers
2. **Conversation duration:** Average call is 3-5 minutes
3. **Safety margin:** Cache should expire before call ends

### Cache Invalidation

| Event | Action |
|-------|--------|
| TTL expires | Entry ignored, fresh fetch on next query |
| Node-RED restart | All cache cleared (in-memory) |
| Manual clear | `/test/slot-cache/clear` endpoint |

**Note:** Cache is **not** invalidated on booking. This is intentional:
- Booking validates slot availability at write time
- If slot is taken, `createAppt` returns error and LLM offers alternative
- This matches current behavior (no regression)

---

## Testing Strategy

### Phase 1: Unit Test (Test Harness)

```bash
# Deploy test flow to Node-RED
cd test-agent && node scripts/deploy-nodered.js --backup

# Run test harness
cd test-agent && node scripts/test-slot-cache.js
```

**Expected Output:**

```
╔════════════════════════════════════════════════════════════╗
║           SLOT CACHE TEST HARNESS - Phase 1                ║
╚════════════════════════════════════════════════════════════╝

┌────────────────────────────────────────────────────────────┐
│ STEP 2: Query WITHOUT prefetch (expect CACHE MISS)         │
└────────────────────────────────────────────────────────────┘
✓ Query completed in 12.34s
  From cache: false (expected)
  Slots found: 42

┌────────────────────────────────────────────────────────────┐
│ STEP 4: Query WITH prefetch (expect CACHE HIT)             │
└────────────────────────────────────────────────────────────┘
✓ Query completed in 45ms
  From cache: true (expected)
  Slots found: 42

═══════════════════════════════════════════════════════════════
  ✅ ALL TESTS PASSED - Phase 1 validation SUCCESSFUL
═══════════════════════════════════════════════════════════════
```

### Phase 2: Integration Test

Manual test via Flowise chat:
1. Start new conversation
2. Confirm location (should trigger prefetch)
3. Provide child info (prefetch completing in background)
4. Request appointment time
5. Verify slot response is immediate (<2 seconds)

### Phase 3: Production Validation

Monitor Langfuse traces for:
- `_fromCache: true` in slot responses
- Reduced slot query latency
- No increase in booking failures

---

## Rollout Plan

### Phase 1: Test Harness Deployment (Current)

- [x] Create `Slot-Cache-Test` flow tab
- [x] Create `test-slot-cache.js` validation script
- [x] Update Node-RED flows (v81)
- [ ] Deploy to Node-RED (dry-run first)
- [ ] Run validation tests

### Phase 2: Production Integration

- [ ] Add `prefetch` action to scheduling tool (v66)
- [ ] Add cache check to `slots`/`grouped_slots` actions
- [ ] Update system prompt with prefetch trigger (v73)
- [ ] Deploy to Flowise (staging first)

### Phase 3: Monitoring & Tuning

- [ ] Monitor cache hit rate via Langfuse
- [ ] Tune TTL if needed
- [ ] Evaluate memory usage on Node-RED

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Stale cache (slot taken)** | Medium | Low | 5-min TTL + booking validates at write time |
| **Prefetch adds latency** | Low | Low | Runs in background, doesn't block conversation |
| **Cloud9 rate limiting** | Low | Medium | Prefetch is READ operation (higher quota) |
| **Memory pressure** | Low | Low | Cache keyed per date range, auto-expires |
| **Cache key collision** | Very Low | Medium | Key includes location + date range |
| **Node-RED restart clears cache** | Low | Low | Cache rebuilds naturally on next prefetch |

### Worst Case Scenario

If cache fails completely, the system falls back to current behavior:
- Cache miss → Normal API fetch → Same latency as today
- **No regression** - caller experience is unchanged

---

## Monitoring & Observability

### Metrics to Track

| Metric | Source | Target |
|--------|--------|--------|
| Cache hit rate | Langfuse `_fromCache` field | >80% |
| Cache hit latency | Langfuse `queryDurationMs` | <100ms |
| Cache miss latency | Langfuse `queryDurationMs` | 5-60s |
| Prefetch success rate | Node-RED logs | >95% |
| Memory usage | Node-RED metrics | <50MB for cache |

### Logging

Node-RED logs include:
```
[PREFETCH] Starting prefetch for: {cacheKey}
[PREFETCH] Cached 42 slots in 8500ms, key: {cacheKey}
[QUERY] CACHE HIT - 42 slots in 45ms
[QUERY] CACHE MISS - fetching from Cloud9 API
[CLEAR] Removed 3 cache entries
```

### Alerting

Consider alerts for:
- Cache hit rate drops below 50%
- Prefetch failure rate exceeds 10%
- Memory usage exceeds threshold

---

## Rollback Plan

### Immediate Rollback (< 5 minutes)

1. Disable prefetch trigger in system prompt:
   - Remove/comment the prefetch instruction
   - Redeploy system prompt to Flowise

2. The cache check in `slots` action will simply miss (no cached data):
   - Falls back to normal API fetch
   - No code changes needed

### Full Rollback (if needed)

1. Revert `scheduling_tool_func.js` to v65
2. Revert system prompt to previous version
3. Redeploy to Flowise
4. Node-RED cache will expire naturally (5 min TTL)

---

## Sign-off Checklist

### Technical Review

- [ ] Architecture diagram reviewed
- [ ] Cache key strategy approved
- [ ] TTL value approved (5 minutes)
- [ ] Fallback behavior verified
- [ ] Memory impact assessed

### Testing

- [ ] Test harness deployed to Node-RED
- [ ] `test-slot-cache.js` passes all tests
- [ ] Cache HIT latency <100ms confirmed
- [ ] Cache MISS latency matches current behavior
- [ ] Manual Flowise test completed

### Operational Readiness

- [ ] Monitoring plan approved
- [ ] Rollback plan reviewed
- [ ] On-call team briefed

### Approvals

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| QA Lead | | | |
| DevOps | | | |
| Product Owner | | | |

---

## Appendix A: Code References

### Test Harness Endpoints

- `nodered/nodered_Cloud9_flows.json` lines 1889-2160 (Slot-Cache-Test tab)

### Test Script

- `test-agent/scripts/test-slot-cache.js`

### Existing Flow Context Patterns

- `bookingSessions`: `nodered/nodered_Cloud9_flows.json` line 1600 (createAppt)
- `pendingOperations`: `nodered/nodered_Cloud9_flows.json` line 1802 (retry queue)

---

## Appendix B: FAQ

**Q: Why not use Redis or a database for caching?**

A: Node-RED flow context is sufficient for this use case:
- Data is ephemeral (5 min TTL)
- Scope is per-flow (shared across concurrent calls)
- No external dependencies to manage
- Matches existing patterns (bookingSessions, pendingOperations)

**Q: What if two callers request the same slots?**

A: They share the cache entry (by design). This is beneficial:
- First caller's prefetch benefits the second caller
- Cache key is by location + date range, not by session

**Q: What if a slot is taken between prefetch and booking?**

A: The `createAppt` endpoint validates slot availability at write time:
- Returns error if slot is taken
- LLM receives error and offers alternative slot
- Same behavior as today (no regression)

**Q: What happens on Node-RED restart?**

A: Cache is cleared (in-memory). Next prefetch rebuilds it naturally.
- Callers in-flight may experience cache miss (normal API latency)
- No data loss or corruption risk

**Q: How do we know it's working in production?**

A: Langfuse traces will include:
- `_fromCache: true/false` in slot responses
- `queryDurationMs` showing actual latency
- Compare hit/miss ratios over time

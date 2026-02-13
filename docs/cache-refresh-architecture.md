# Cache Refresh Architecture

## Overview

The slot cache system uses a tiered caching strategy to store appointment availability from Cloud9 API. This document explains the auto-refresh mechanism and fixes implemented for load-balanced Node-RED environments.

## Cache Tiers

| Tier | Days | Purpose |
|------|------|---------|
| 1 | 30 | Near-term availability |
| 2 | 60 | Mid-term availability |
| 3 | 90 | Long-term availability |

**Storage:** Redis (shared across all Node-RED instances)

---

## Auto-Refresh Mechanism

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     Node-RED Instance                        │
│                                                              │
│  ┌─────────────────┐    ┌──────────────────┐                │
│  │ Inject Node     │───►│ Business Hours   │                │
│  │ crontab: */5    │    │ + Redis Lock     │                │
│  └─────────────────┘    └────────┬─────────┘                │
│                                  │                           │
│         ┌────────────────────────┼────────────────────┐     │
│         ▼                        ▼                    ▼     │
│  ┌─────────────┐         ┌─────────────┐      ┌───────────┐│
│  │ Fetch Tier 1│         │ Fetch Tier 2│      │Fetch Tier 3││
│  │ (30 days)   │         │ (60 days)   │      │(90 days)   ││
│  └──────┬──────┘         └──────┬──────┘      └─────┬─────┘│
│         │                       │                    │      │
│         └───────────────────────┴────────────────────┘      │
│                                 │                            │
│                                 ▼                            │
│                          ┌───────────┐                       │
│                          │   Redis   │  (Shared)             │
│                          └───────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### Schedule

- **Frequency:** Every 5 minutes (crontab: `*/5 * * * *`)
- **Fires at:** :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55
- **Sequential delays:** 12 seconds between each tier to avoid Cloud9 rate limiting

---

## Problems Fixed

### Problem 1: Stale Cache Health Reporting

**Issue:** The `/cache-health` endpoint showed stale data even when Redis had fresh data.

**Root Cause:**
- Cache health read from `flow.get()` (per-instance flow context)
- Flow context is NOT shared across load-balanced instances
- Instance A refreshes → updates A's flow context
- Request goes to Instance B → reads B's stale flow context

**Fix:** Modified cache health function to read directly from Redis.

```
Before: flow.get('slotCacheSummary_Tier1')  ❌ Per-instance
After:  fetch('/redisGet?key=SlotCache-...')  ✅ Shared Redis
```

### Problem 2: Duplicate Refreshes from Multiple Instances

**Issue:** All load-balanced instances fire cron simultaneously, causing:
- Multiple Cloud9 API calls (wastes rate limit)
- Potential race conditions

**Root Cause:**
- Each Node-RED instance has its own cron scheduler
- No coordination between instances

**Fix:** Added Redis distributed lock.

```
Instance A: Try lock → ✅ Acquired → Refresh → Release
Instance B: Try lock → ❌ Held → Skip
Instance C: Try lock → ❌ Held → Skip
```

**Lock details:**
- Key: `SlotCache-RefreshLock`
- TTL: 120 seconds (auto-expires as failsafe)
- Only one instance refreshes at a time

### Problem 3: Unreliable Interval Timer

**Issue:** Node-RED inject node with `repeat: 300` was not firing reliably.

**Root Cause:**
- Interval timer requires deploy to start
- Timer state lost on Node-RED restart
- Known issues with interval drift over time

**Fix:** Changed from interval to crontab.

```
Before: repeat: "300"           ❌ Interval-based
After:  crontab: "*/5 * * * *"  ✅ Cron-based
```

**Why crontab is better:**
- More deterministic timing
- Fires at specific clock times
- Uses cronosjs library (actively maintained)
- Recommended by Node-RED for scheduled tasks

---

## Configuration

### Inject Node (`inject-slot-refresh`)

```json
{
  "name": "Auto-Refresh Every 5min (cron)",
  "crontab": "*/5 * * * *",
  "repeat": "",
  "once": true,
  "onceDelay": "30"
}
```

### Business Hours Check (`func-check-business-hours`)

Key settings:
```javascript
const BYPASS_BUSINESS_HOURS = true;  // Set false for business hours only
const LOCK_KEY = 'SlotCache-RefreshLock';
const LOCK_TTL_SECONDS = 120;
const TIER_DELAY_MS = 12000;  // 12s between tiers
```

### Cache Health (`func-cache-health`)

Reads directly from Redis:
```javascript
const url = REDIS_BASE_URL + '/redisGet?key=SlotCache-...-Tier' + tier;
const response = await fetch(url, { headers: { 'Authorization': REDIS_AUTH } });
```

---

## Troubleshooting

### Cache shows stale after deploy

1. Check Redis directly:
   ```bash
   curl -u user:pass "https://nodered/api/chord/ortho-prd/redisGet?key=SlotCache-...-Tier1"
   ```
2. If Redis is stale, trigger manual refresh:
   ```bash
   curl -X POST -u user:pass "https://nodered/api/chord/ortho-prd/cache/refresh"
   ```

### Cron not firing

1. Verify deploy completed successfully
2. Check Node-RED logs for `[SLOT_CACHE]` or `[REFRESH_LOCK]` messages
3. Cron only fires at clock times (:00, :05, etc.) - wait for next interval

### Lock stuck (refresh not happening)

Lock auto-expires after 2 minutes. If stuck longer:
1. Check Redis for stale lock:
   ```bash
   curl -u user:pass "https://nodered/api/chord/ortho-prd/redisGet?key=SlotCache-RefreshLock"
   ```
2. Lock will be overwritten if older than TTL

---

## Files Modified

| File | Changes |
|------|---------|
| `nodered/nodered_Cloud9_flows.json` | Inject crontab, Redis lock, cache health |
| `test-agent/scripts/fix-cache-health-redis.js` | Script to update cache health function |
| `test-agent/scripts/add-redis-lock.js` | Script to add Redis lock |

---

## Related Scripts

```bash
# Check cache status
cd test-agent && node scripts/check-redis-cache.js

# Deploy to production (backup first)
cd test-agent && node scripts/deploy-nodered.js --backup

# Manual refresh
curl -X POST -u user:pass "https://nodered/api/chord/ortho-prd/cache/refresh"
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Load Balancer                                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ Node-RED A    │       │ Node-RED B    │       │ Node-RED C    │
│               │       │               │       │               │
│ Cron: */5     │       │ Cron: */5     │       │ Cron: */5     │
│ Lock: Check   │       │ Lock: Check   │       │ Lock: Check   │
└───────┬───────┘       └───────┬───────┘       └───────┬───────┘
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │        Redis          │
                    │  - SlotCache-Tier1    │
                    │  - SlotCache-Tier2    │
                    │  - SlotCache-Tier3    │
                    │  - RefreshLock        │
                    └───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │     Cloud9 API        │
                    │  (Rate Limited)       │
                    └───────────────────────┘
```

---

*Last updated: 2026-01-23*

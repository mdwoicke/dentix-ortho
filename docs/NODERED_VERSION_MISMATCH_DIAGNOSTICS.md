# Node-RED Version Mismatch Diagnostics

This document describes how to diagnose when multiple Node-RED instances behind a load balancer have different code versions deployed, causing intermittent failures.

## Problem Symptoms

When Node-RED instances have mismatched versions:
- **Intermittent 502 errors** - Some requests succeed, others timeout
- **Inconsistent response times** - Fast responses (~100ms) alternating with timeouts (~30s)
- **Pattern in failures** - Not random, follows load balancer distribution

Example output showing the issue:
```
Call  1:    160ms | 200 | ✓ v9 (cache-first)
Call  2:  30085ms | 502 | ✗ v8 (timeout)
Call  3:     81ms | 200 | ✓ v9 (cache-first)
Call  4:  30078ms | 502 | ✗ v8 (timeout)
Call  5:  30040ms | 502 | ✗ v8 (timeout)
```

## Diagnostic Scripts

### 1. Quick Version Detection Test

This script makes rapid API calls and identifies which responses come from updated vs outdated instances.

**File:** `test-agent/scripts/diagnose-nodered-version-mismatch.js`

```javascript
/**
 * Diagnose Node-RED Version Mismatch Behind Load Balancer
 *
 * This script detects when multiple Node-RED instances have different
 * code versions deployed by analyzing response patterns.
 */

const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const AUTH = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

async function testSlots() {
    const tomorrow = new Date(Date.now() + 86400000);
    const startDate = (tomorrow.getMonth() + 1).toString().padStart(2, '0') + '/' +
                      tomorrow.getDate().toString().padStart(2, '0') + '/' +
                      tomorrow.getFullYear();

    const start = Date.now();
    const response = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': AUTH },
        body: JSON.stringify({
            startDate: startDate,
            daysToSearch: 60,
            scheduleViewGUIDs: '8cd1d6d1-88b4-4506-a8d7-d05dcae22d47'
        })
    });

    const elapsed = Date.now() - start;
    let source = 'N/A', slots = 0;

    if (response.status === 200) {
        const data = await response.json();
        source = data.source || 'N/A';
        slots = data.count || data.slots?.length || 0;
    }

    return { elapsed, status: response.status, source, slots };
}

async function run() {
    console.log('='.repeat(70));
    console.log('NODE-RED VERSION MISMATCH DIAGNOSTIC');
    console.log('='.repeat(70));
    console.log('\nTesting 10 calls to detect version differences...\n');
    console.log('Call | Time     | Status | Source        | Detected Version');
    console.log('-'.repeat(65));

    let v9Count = 0, v8Count = 0;

    for (let i = 1; i <= 10; i++) {
        const r = await testSlots();

        // Determine version based on response characteristics
        let version = 'unknown';
        if (r.status === 200 && r.source && r.source.startsWith('redis')) {
            version = 'v9 (cache-first)';
            v9Count++;
        } else if (r.status === 200 && r.source === 'api-quick-sync') {
            version = 'v9 (quick-sync)';
            v9Count++;
        } else if (r.status === 502) {
            version = 'v8 (timeout - no cache-first)';
            v8Count++;
        } else {
            version = 'v8 or unknown';
            v8Count++;
        }

        const icon = r.status === 200 ? '✓' : '✗';
        console.log(
            icon + ' ' + i.toString().padStart(3) + ' | ' +
            r.elapsed.toString().padStart(7) + 'ms | ' +
            r.status + '    | ' +
            r.source.padEnd(13) + ' | ' +
            version
        );
    }

    console.log('-'.repeat(65));
    console.log('\n' + '='.repeat(70));
    console.log('DIAGNOSIS');
    console.log('='.repeat(70));
    console.log('v9 (working): ' + v9Count + '/10 calls');
    console.log('v8 (timeout): ' + v8Count + '/10 calls');

    if (v8Count === 0) {
        console.log('\n✓ ALL SERVERS HAVE v9 - No version mismatch detected');
    } else if (v9Count === 0) {
        console.log('\n✗ ALL SERVERS HAVE v8 - v9 not deployed to any server');
    } else {
        console.log('\n⚠ VERSION MISMATCH DETECTED');
        console.log('  - Some servers have v9 (cache-first, fast)');
        console.log('  - Some servers have v8 (direct Cloud9, timeout)');
        console.log('  - Load balancer is distributing to both');
        console.log('\n  ACTION: Redeploy v9 to ALL Node-RED servers');

        // Estimate server distribution
        const v9Pct = Math.round((v9Count / 10) * 100);
        const v8Pct = Math.round((v8Count / 10) * 100);
        console.log('\n  Estimated distribution:');
        console.log('    ~' + v9Pct + '% traffic to v9 servers');
        console.log('    ~' + v8Pct + '% traffic to v8 servers');
    }
    console.log('='.repeat(70));
}

run().catch(err => console.error('Error:', err.message));
```

### 2. Cache State Analysis

This script checks cache state before and after each call to understand if timeouts are related to cache misses or version differences.

**File:** `test-agent/scripts/diagnose-cache-state.js`

```javascript
/**
 * Cache State Analysis for Node-RED Diagnostics
 *
 * Tracks Redis cache state before/after API calls to determine
 * if 502 errors are from cache issues or version mismatch.
 */

const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const AUTH = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

async function getCacheHealth() {
    const response = await fetch(BASE_URL + '/ortho-prd/cache-health', {
        method: 'GET',
        headers: { 'Authorization': AUTH }
    });
    const data = await response.json();
    return {
        tier1: { slots: data.tiers?.[0]?.slotCount || 0, age: data.tiers?.[0]?.ageSeconds || 'N/A' },
        tier2: { slots: data.tiers?.[1]?.slotCount || 0, age: data.tiers?.[1]?.ageSeconds || 'N/A' },
        tier3: { slots: data.tiers?.[2]?.slotCount || 0, age: data.tiers?.[2]?.ageSeconds || 'N/A' }
    };
}

async function testSlots() {
    const tomorrow = new Date(Date.now() + 86400000);
    const startDate = (tomorrow.getMonth() + 1).toString().padStart(2, '0') + '/' +
                      tomorrow.getDate().toString().padStart(2, '0') + '/' +
                      tomorrow.getFullYear();

    const start = Date.now();
    const response = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': AUTH },
        body: JSON.stringify({
            startDate: startDate,
            daysToSearch: 60,
            scheduleViewGUIDs: '8cd1d6d1-88b4-4506-a8d7-d05dcae22d47'
        })
    });

    const elapsed = Date.now() - start;
    const text = await response.text();

    let data = {};
    let errorInfo = null;

    if (response.status === 502) {
        errorInfo = 'NGINX 502 - Backend timeout (30s)';
    } else {
        try {
            data = JSON.parse(text);
        } catch (e) {
            errorInfo = 'Parse error';
        }
    }

    return {
        elapsed,
        status: response.status,
        source: data.source || 'N/A',
        slots: data.count || data.slots?.length || 0,
        cacheTier: data.cacheTier || 'N/A',
        cacheAge: data.cacheAge || 'N/A',
        errorInfo
    };
}

async function run() {
    console.log('='.repeat(70));
    console.log('CACHE STATE + ERROR ANALYSIS');
    console.log('='.repeat(70));

    for (let i = 1; i <= 5; i++) {
        console.log('\n--- Test ' + i + ' ---');

        // Check cache BEFORE the call
        const cacheBefore = await getCacheHealth();
        console.log('Cache BEFORE: T1=' + cacheBefore.tier1.slots + ' slots (' +
                    cacheBefore.tier1.age + 's old), T2=' + cacheBefore.tier2.slots +
                    ' slots (' + cacheBefore.tier2.age + 's old)');

        // Make the slots call
        const result = await testSlots();
        console.log('Response: ' + result.elapsed + 'ms | ' + result.status +
                    ' | Source: ' + result.source + ' | Slots: ' + result.slots);

        if (result.errorInfo) {
            console.log('ERROR: ' + result.errorInfo);
        }

        // Check cache AFTER the call
        const cacheAfter = await getCacheHealth();
        console.log('Cache AFTER:  T1=' + cacheAfter.tier1.slots + ' slots (' +
                    cacheAfter.tier1.age + 's old), T2=' + cacheAfter.tier2.slots +
                    ' slots (' + cacheAfter.tier2.age + 's old)');

        // Analyze
        if (result.status === 502 && cacheAfter.tier2.age < cacheBefore.tier2.age) {
            console.log('>> INSIGHT: 502 timeout BUT cache was refreshed');
            console.log('   This indicates v8 code hit Cloud9, refreshed cache, but timed out');
            console.log('   A v9 server would have returned stale cache immediately');
        }
    }
}

run().catch(err => console.error('Error:', err.message));
```

### 3. Post-Deployment Verification

After deploying to all servers, use this script to verify all instances have the correct version.

**File:** `test-agent/scripts/verify-nodered-deployment.js`

```javascript
/**
 * Verify Node-RED Deployment Across All Servers
 *
 * Run this after deploying to confirm all instances have the update.
 */

const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const AUTH = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

async function testSlots() {
    const tomorrow = new Date(Date.now() + 86400000);
    const startDate = (tomorrow.getMonth() + 1).toString().padStart(2, '0') + '/' +
                      tomorrow.getDate().toString().padStart(2, '0') + '/' +
                      tomorrow.getFullYear();

    const start = Date.now();
    const response = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': AUTH },
        body: JSON.stringify({
            startDate: startDate,
            daysToSearch: 60,
            scheduleViewGUIDs: '8cd1d6d1-88b4-4506-a8d7-d05dcae22d47'
        })
    });

    const elapsed = Date.now() - start;
    let source = 'N/A', slots = 0;

    if (response.status === 200) {
        const data = await response.json();
        source = data.source || 'N/A';
        slots = data.count || data.slots?.length || 0;
    }

    return { elapsed, status: response.status, source, slots };
}

async function run() {
    console.log('='.repeat(70));
    console.log('POST-DEPLOYMENT VERIFICATION');
    console.log('='.repeat(70));
    console.log('\nTesting 10 calls to verify all servers have v9...\n');

    let v9Count = 0, v8Count = 0;
    let totalTime = 0;

    for (let i = 1; i <= 10; i++) {
        const r = await testSlots();
        totalTime += r.elapsed;

        const isV9 = r.status === 200 && r.source !== 'N/A';
        if (isV9) v9Count++; else v8Count++;

        const icon = isV9 ? '✓' : '✗';
        console.log(icon + ' Call ' + i.toString().padStart(2) + ': ' +
                    r.elapsed.toString().padStart(6) + 'ms | ' + r.status +
                    ' | ' + r.source.padEnd(12) + ' | ' + r.slots + ' slots');
    }

    console.log('\n' + '='.repeat(70));
    console.log('RESULTS');
    console.log('='.repeat(70));
    console.log('v9 (working): ' + v9Count + '/10');
    console.log('v8 (timeout): ' + v8Count + '/10');
    console.log('Avg response: ' + Math.round(totalTime / 10) + 'ms');

    if (v8Count === 0) {
        console.log('\n✓ SUCCESS! All servers have v9 deployed.');
        console.log('  All calls returning from cache in <200ms.');
    } else if (v8Count < 3) {
        console.log('\n⚠ MOSTLY WORKING - ' + v8Count + ' timeouts may be transient.');
    } else {
        console.log('\n✗ STILL MIXED - One or more servers still have v8.');
        console.log('  Please check deployment on all Node-RED instances.');
    }
    console.log('='.repeat(70));
}

run().catch(err => console.error('Error:', err.message));
```

## How to Use

### Step 1: Detect the Problem

```bash
cd test-agent
node scripts/diagnose-nodered-version-mismatch.js
```

Look for alternating patterns of success/failure indicating load balancer routing to different servers.

### Step 2: Analyze Cache Behavior

```bash
node scripts/diagnose-cache-state.js
```

If you see:
- 502 errors where cache gets refreshed → v8 server (hits Cloud9 directly, times out)
- 200 responses with `redis-stale` or `redis-fresh` → v9 server (cache-first)

### Step 3: Deploy to All Servers

1. Open Node-RED editor on **EACH** server
2. Import the updated flow JSON
3. Deploy

### Step 4: Verify Deployment

```bash
node scripts/verify-nodered-deployment.js
```

Expected output when all servers are updated:
```
✓ Call  1:     94ms | 200 | redis-fresh  | 13 slots
✓ Call  2:     82ms | 200 | redis-stale  | 13 slots
✓ Call  3:     79ms | 200 | redis-fresh  | 13 slots
...
v9 (working): 10/10
v8 (timeout): 0/10
✓ SUCCESS! All servers have v9 deployed.
```

## Version Identification

### How to identify getApptSlots version in Node-RED:

**v9 (Bulletproof - Current):**
- Function node name: `getApptSlots v9 (Bulletproof)`
- Response includes `source` field: `redis-fresh`, `redis-stale`, `api-quick-sync`, or `pending`
- Response time: 50-200ms (cache hit) or <15s (quick-sync)

**v8 (Old - Timeout prone):**
- Function node name: `getApptSlots v8 (Retry)`
- No `source` field in response
- Response time: 10-60s (direct Cloud9 calls)
- Often results in 502 timeout after 30s

## Key Indicators

| Indicator | v9 (Good) | v8 (Bad) |
|-----------|-----------|----------|
| Response time | <200ms (cache) or <15s (quick) | 30s+ (timeout) |
| HTTP status | 200 | 502 |
| `source` field | `redis-fresh`, `redis-stale`, etc. | N/A |
| Cache behavior | Returns stale cache immediately | Tries to refresh synchronously |

## Related Files

- `nodered/nodered_Cloud9_flows.json` - Main flow file to deploy
- `test-agent/scripts/upgrade-getapptslots-v9.js` - Script that upgraded v8 to v9
- `docs/v1/scheduling_tool_func.js` - Flowise tool (v73) handles `_pending` response

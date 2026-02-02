# Phase 5: Replay - Research

**Researched:** 2026-02-02
**Domain:** Trace replay, mock harness generation, Flowise message replay, Cloud9 API direct testing
**Confidence:** HIGH

## Summary

Phase 5 builds replay capabilities on top of an already substantial foundation. The codebase already has a working `replayService.ts` that emulates both tool scripts (patient and scheduling) against live Node-RED endpoints, a `ReplayPanel.tsx` frontend component, API routes at `/api/test-monitor/replay`, and multiple ad-hoc replay scripts in `test-agent/scripts/`. The existing `FlowiseClient` in the test-agent provides session-based message sending to the Flowise prediction API.

The three requirements map to three distinct replay modes: (1) mock harness that replays tool logic with captured Cloud9 responses, (2) Flowise end-to-end replay that re-sends caller messages, and (3) Cloud9 direct API testing to isolate whether failures are in tool logic or the upstream API. All three can be built by extending existing services rather than creating new ones from scratch.

**Primary recommendation:** Extend the existing `replayService.ts` with a mock mode that intercepts HTTP calls and returns captured responses from Langfuse observations, add a Flowise replay endpoint that leverages `FlowiseClient`, and add a Cloud9 direct-test endpoint that calls the production API with the same parameters from the trace.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing `replayService.ts` | N/A | Tool script emulation | Already replicates full tool logic with live HTTP |
| Existing `FlowiseClient` | N/A | Flowise prediction API client | Already handles sessions, tool call extraction |
| Existing `langfuseTraceService.ts` | N/A | Trace/observation data retrieval | Already fetches observations with inputs/outputs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:vm` | Built-in | Execute tool JS in sandbox | Already used in `replay-via-tools.js` for exact tool replay |
| `diff` | Already installed | Generate diffs between expected/actual | Already used by `expertAgentService.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom mock interceptor | nock/msw | Overkill - we only need to intercept 2 endpoints per replay, not a full HTTP mock layer |
| New replay service | Extend existing | Existing service already has 90% of the logic |

## Architecture Patterns

### Recommended Structure
```
backend/src/services/
├── replayService.ts          # EXTEND: add mock mode, Cloud9 direct mode
├── langfuseTraceService.ts   # REUSE: extract observation data for mock harness
├── diagnosticOrchestrator.ts # REUSE: StepStatus drives which replays to run
└── (new) cloud9DirectService.ts  # Cloud9 API direct testing
```

### Pattern 1: Mock Harness from Trace Observations
**What:** Extract Cloud9 API responses from Langfuse observations, inject them as mock responses when replaying tool logic
**When to use:** REPLAY-01 - isolating whether tool logic or Cloud9 API caused failure

The existing `replayService.ts` calls live Node-RED endpoints via `executeHttpRequest`. The mock harness replaces this function with one that returns captured responses from the trace observations. Key data flow:

1. Fetch observations for the trace from `langfuse_observations` table
2. Filter for tool-call type observations (type='SPAN', name contains tool name)
3. Extract the `output` field which contains the Node-RED/Cloud9 response
4. Create a response map: `endpoint+action -> captured response`
5. Execute tool logic with the mock response map instead of live HTTP

### Pattern 2: Flowise End-to-End Replay
**What:** Re-send the caller's actual messages through Flowise to reproduce the full pipeline
**When to use:** REPLAY-02 - reproducing issues at the integration layer

Uses existing `FlowiseClient` from test-agent or a simplified version in backend:
1. Extract caller messages from transcript (already parsed by callerIntentClassifier)
2. Create new Flowise session
3. Send messages sequentially with appropriate delays
4. Compare new tool calls/responses with original trace
5. Report differences

### Pattern 3: Cloud9 Direct API Testing
**What:** When Node-RED returns unexpected results, call Cloud9 API directly with same parameters
**When to use:** REPLAY-03 - isolating Cloud9 API vs tool logic bottleneck

The existing Node-RED endpoints at `BASE_URL/ortho-prd/*` wrap Cloud9 XML API calls. Direct testing means:
1. Extract the tool call input parameters from the trace observation
2. Build the equivalent Cloud9 XML request (same as Node-RED would build)
3. Send directly to Cloud9 API endpoint
4. Compare response with what Node-RED returned
5. If Cloud9 returns same error -> Cloud9 is the bottleneck; if different -> tool logic issue

### Anti-Patterns to Avoid
- **Full HTTP mock framework:** Don't add nock/msw - the mock surface is tiny (2-3 endpoints)
- **Replaying tool JS via vm module in backend:** The existing `replayService.ts` TypeScript emulation is more maintainable than running raw JS via vm. Reserve vm-based replay for exact reproduction only.
- **New session for Cloud9 direct test:** Reuse existing Cloud9 credentials/auth from config, don't create separate auth flow.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Observation data extraction | New Langfuse fetcher | Existing `langfuseTraceService` + `langfuse_observations` table | Data already imported and cached locally |
| Flowise message sending | Custom HTTP client | Existing `FlowiseClient` or simplified version | Handles session management, tool call extraction |
| Tool logic emulation | New emulator | Existing `replayService.ts` | Already replicates both tool scripts faithfully |
| Response comparison | Custom differ | `diff` library (already installed) | Used by expert agents for code diffs |
| Transcript parsing | New parser | Existing `callerIntentClassifier` transcript extraction | Already extracts caller/assistant messages |

## Common Pitfalls

### Pitfall 1: Stale Observation Data
**What goes wrong:** Mock harness uses imported observations that may not have output data
**Why it happens:** `langfuseTraceService` imports observations but some fields may be truncated or missing
**How to avoid:** Before generating mock harness, verify all required observations have non-null output. If missing, re-fetch from Langfuse API with `refreshObservations: true`.
**Warning signs:** Mock responses returning null/undefined instead of actual API data

### Pitfall 2: Session State in Flowise Replay
**What goes wrong:** Flowise maintains session state (Redis cache, flow context) that differs between original and replay
**Why it happens:** Node-RED slot cache, reservation system, and session variables are time-dependent
**How to avoid:** Document that Flowise replay tests integration logic, not exact reproduction. Slot availability will differ.
**Warning signs:** Different slots offered, different cache hits

### Pitfall 3: Cloud9 API Rate Limiting
**What goes wrong:** Direct Cloud9 API testing triggers rate limits
**Why it happens:** Cloud9 partner API has undocumented rate limits; existing code uses 200ms delays
**How to avoid:** Serial execution with 200ms+ delays between Cloud9 calls (already established pattern from fulfillment verifier)
**Warning signs:** HTTP 429 or timeout errors from Cloud9

### Pitfall 4: Mock vs Live Response Format Differences
**What goes wrong:** Captured responses from trace have different structure than current Node-RED version
**Why it happens:** Node-RED flow versions change between trace capture and replay
**How to avoid:** Include the flow version from the trace metadata in the mock harness context. Flag version mismatches.
**Warning signs:** Tool logic parsing errors on mock data that worked on live

## Code Examples

### Extracting Mock Data from Observations
```typescript
// From existing langfuse_observations table
function buildMockMap(observations: any[]): Map<string, any> {
  const mockMap = new Map();
  for (const obs of observations) {
    if (obs.type === 'SPAN' && obs.output) {
      const output = typeof obs.output === 'string' ? JSON.parse(obs.output) : obs.output;
      const key = `${obs.name}`;  // e.g., "chord_ortho_patient_lookup"
      mockMap.set(key, output);
    }
  }
  return mockMap;
}
```

### Extending replayService with Mock Mode
```typescript
// Add to existing replayService.ts
export interface MockReplayRequest extends ReplayRequest {
  mockResponses: Map<string, any>;  // endpoint -> response
  mode: 'live' | 'mock';
}

// Replace executeHttpRequest with mock-aware version
async function executeHttpRequestOrMock(
  endpoint: string, method: string, body: Record<string, unknown>,
  logs: string[], mockMap?: Map<string, any>
): Promise<{ ok: boolean; status: number; data: unknown }> {
  if (mockMap) {
    const mockKey = endpoint; // or derive from action
    const mockData = mockMap.get(mockKey);
    if (mockData) {
      logs.push(`[Mock] Returning captured response for ${endpoint}`);
      return { ok: true, status: 200, data: mockData };
    }
    logs.push(`[Mock] WARNING: No mock data for ${endpoint}, falling through to live`);
  }
  return executeHttpRequest(endpoint, method, body, logs);
}
```

### Cloud9 Direct Test
```typescript
// New endpoint: POST /api/test-monitor/replay/cloud9-direct
// Takes observation ID, extracts params, calls Cloud9 XML API directly
async function testCloud9Direct(observationId: string): Promise<{
  nodeRedResponse: any;    // from trace
  cloud9Response: any;     // from direct call
  match: boolean;
  differences: string[];
}> {
  // 1. Get observation from DB
  // 2. Extract input params
  // 3. Build Cloud9 XML request
  // 4. Send to Cloud9 production endpoint
  // 5. Compare with observation output
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ad-hoc scripts (replay-via-tools.js) | Structured replayService.ts | Phase 1-4 | Already have backend service, just needs mock mode |
| Manual Flowise testing | Goal test runner with FlowiseClient | Pre-Phase 1 | Client exists, needs replay-specific wrapper |

## Open Questions

1. **Cloud9 XML Request Format**
   - What we know: Node-RED builds XML requests for Cloud9 from JSON params
   - What's unclear: Exact XML templates needed for direct Cloud9 testing (they're embedded in Node-RED flow nodes)
   - Recommendation: Extract XML templates from `nodered_Cloud9_flows.json` function nodes during plan 05-02. Alternatively, use the Node-RED `ortho-prd` endpoints as "semi-direct" test (still through Node-RED but with known-good params).

2. **Flowise Session Variable Injection**
   - What we know: FlowiseClient supports `sessionVars` for caller ID etc.
   - What's unclear: Whether original session variables can be fully reconstructed from trace metadata
   - Recommendation: Extract what's available from trace, use defaults for missing vars. Document limitations.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `backend/src/services/replayService.ts` - existing tool emulation with full HTTP execution
- Codebase analysis: `frontend/src/components/features/testMonitor/CallFlowNavigator/ReplayPanel.tsx` - existing UI
- Codebase analysis: `test-agent/src/core/flowise-client.ts` - existing Flowise API client
- Codebase analysis: `backend/src/services/langfuseTraceService.ts` - observation data import
- Codebase analysis: `backend/src/services/diagnosticOrchestrator.ts` - StepStatus routing
- Codebase analysis: `backend/src/routes/testMonitor.ts` lines 398-402 - existing replay routes

### Secondary (MEDIUM confidence)
- Codebase analysis: `test-agent/scripts/replay-via-tools.js` - vm-based exact tool replay pattern
- Codebase analysis: `backend/src/services/toolSequenceMapper.ts` - expected step sequences

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components already exist in codebase
- Architecture: HIGH - extending existing services with clear patterns
- Pitfalls: HIGH - based on actual production issues documented in codebase (rate limiting, cache state)

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (stable domain, no external library changes)

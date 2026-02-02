---
phase: 05-replay
plan: 01
subsystem: replay-engine
tags: [mock-harness, replay, testing, langfuse]
dependency-graph:
  requires: [04-01, 04-02]
  provides: [mock-replay-endpoints, mock-harness-generation]
  affects: [06-frontend]
tech-stack:
  added: []
  patterns: [mock-map-injection, endpoint-key-extraction]
key-files:
  created: []
  modified:
    - backend/src/services/replayService.ts
    - backend/src/controllers/testMonitorController.ts
    - backend/src/routes/testMonitor.ts
decisions:
  - id: mock-key-extraction
    choice: "Extract last URL segment as mock map key (e.g., getPatientByFilter)"
    why: "Matches regardless of base URL changes between environments"
  - id: mock-map-threading
    choice: "Thread optional mockMap parameter through all internal functions"
    why: "Minimal refactor - same code paths for live and mock, just different HTTP layer"
  - id: harness-from-observations
    choice: "Query production_trace_observations table directly with readonly DB"
    why: "Observations already imported by LangfuseTraceService; no new data pipeline needed"
metrics:
  duration: ~3 min
  completed: 2026-02-02
---

# Phase 5 Plan 1: Mock Harness Generation Summary

Mock replay mode for tool logic testing against captured Cloud9 responses from Langfuse traces.

## What Was Built

### Mock Harness Generation (`generateMockHarness`)
- Queries `production_trace_observations` for a given trace ID
- Extracts captured request/response pairs from tool-call observations
- Builds a `mockMap` keyed by endpoint action name (last URL segment)
- Also keys by observation name for broader matching
- Returns `MockHarness` with observations array and serializable mock map

### Mock Replay Execution (`executeMockReplay`)
- Same tool logic as live replay but intercepts HTTP calls
- When `mockMap` provided, `executeHttpRequest` returns captured response instead of fetching
- Logs `[MOCK]` prefix for all mock HTTP interactions
- Returns 404-like error if no mock match found (no fallthrough to live)

### API Endpoints
- `POST /api/test-monitor/replay/mock-harness` - Generate harness from trace
- `POST /api/test-monitor/replay/mock` - Execute mock replay (auto-generates harness from traceId)

## Commits

| Commit | Description |
|--------|-------------|
| 19edf34 | Add mock harness generation and mock replay mode to replayService |
| b31472a | Add mock harness and mock replay API endpoints |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Mock key extraction** - Use last URL path segment as mock map key for environment-agnostic matching
2. **mockMap threading** - Optional parameter through existing function chain rather than separate code paths
3. **Direct DB access** - Readonly connection to test-agent DB for observation queries

## Next Phase Readiness

Mock replay endpoints ready for frontend integration in Phase 6.

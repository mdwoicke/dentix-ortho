---
phase: 1
plan: 3
subsystem: trace-analysis
tags: [express, controller, routes, caching, langfuse]
dependency-graph:
  requires: [01-01, 01-02]
  provides: [trace-analysis-api, session-analysis-caching]
  affects: [02-xx, 03-xx]
tech-stack:
  added: []
  patterns: [controller-route-mount, auto-table-creation, cache-with-force-refresh]
key-files:
  created:
    - backend/src/controllers/traceAnalysisController.ts
    - backend/src/routes/traceAnalysis.ts
  modified:
    - backend/src/app.ts
decisions:
  - Auto-create session_analysis table in getDb() rather than relying on external migration
  - Use test-agent DB path consistent with testMonitorController pattern
metrics:
  duration: ~5 min
  completed: 2026-02-02
---

# Phase 1 Plan 3: Trace Analysis Controller & Route Summary

**One-liner:** Express controller wiring callerIntentClassifier + toolSequenceMapper behind cached GET endpoints with force-refresh support.

## What Was Built

- `GET /api/trace-analysis/:sessionId` -- full session analysis (transcript, intent, tool sequence) with 1-hour cache
- `GET /api/trace-analysis/:sessionId/intent` -- lightweight intent-only endpoint
- Both endpoints support `?force=true` to bypass cache and `?configId=N` for Langfuse config override
- Auto-imports sessions from Langfuse if not found locally
- Proper error handling: 404 for missing sessions, graceful degradation if LLM classification fails

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] session_analysis table not created in test-agent DB**
- **Found during:** Task 2 (smoke test)
- **Issue:** The schema.sql defined the table but it was never applied to test-agent/data/test-results.db
- **Fix:** Added auto-creation of table and indexes in getDb() function
- **Files modified:** backend/src/controllers/traceAnalysisController.ts
- **Commit:** 2d0892c

## Verification

- `npx tsc --noEmit` passes cleanly
- GET /api/trace-analysis/:sessionId returns full analysis with all fields
- Caching works (second request returns cached: true, same analyzedAt)
- Force refresh works (cached: false, new analyzedAt)
- Intent endpoint returns cached intent data
- Route mounted in Express app at /api/trace-analysis

## Commits

| Hash | Message |
|------|---------|
| 13b6046 | feat(01-03): add trace analysis controller and routes |
| 2d0892c | fix(01-03): ensure session_analysis table created on first use |

## Next Phase Readiness

Phase 1 complete. All three plans delivered:
- 01-01: callerIntentClassifier + toolSequenceMapper services
- 01-02: schema + Langfuse import pipeline
- 01-03: REST API exposing analysis

Ready for Phase 2 (Cloud9 verification layer).

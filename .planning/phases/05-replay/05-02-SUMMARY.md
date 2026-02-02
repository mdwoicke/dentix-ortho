---
phase: 05-replay
plan: 02
subsystem: replay-engine
tags: [flowise, cloud9, replay, api-testing, bottleneck-isolation]
depends_on:
  requires: [05-01]
  provides: [flowise-replay-service, cloud9-direct-service, replay-modes-endpoint]
  affects: [06-frontend]
tech-stack:
  added: []
  patterns: [dynamic-import-controllers, xml-template-strings, positional-tool-comparison]
key-files:
  created:
    - backend/src/services/flowiseReplayService.ts
    - backend/src/services/cloud9DirectService.ts
  modified:
    - backend/src/controllers/testMonitorController.ts
    - backend/src/routes/testMonitor.ts
decisions:
  - id: replay-flowise-dynamic-import
    description: Used dynamic import() in controller to avoid circular dependency and keep lazy loading
  - id: cloud9-xml-template-strings
    description: Used template strings for XML building instead of xml library -- format is simple enough
  - id: positional-tool-comparison
    description: Tool call comparison is index-based (positional), not semantic matching
metrics:
  duration: ~3 min
  completed: 2026-02-02
---

# Phase 5 Plan 2: Flowise Replay & Cloud9 Direct Test Summary

Flowise end-to-end replay re-sends caller messages and Cloud9 direct testing isolates API vs tool logic bottlenecks.

## What Was Built

### flowiseReplayService.ts
- `replayThroughFlowise(traceId, flowiseConfigId?)` extracts caller messages from trace observations, creates a fresh Flowise session, sends each message sequentially with 2s delays, collects responses and tool calls, then produces a positional comparison of original vs replayed tool calls.

### cloud9DirectService.ts
- `testCloud9Direct(observationId)` extracts input parameters from a trace observation, maps the tool action to the corresponding Cloud9 XML procedure (e.g., `slots` -> `GetOnlineReservations`, `book_child` -> `SetAppointment`), sends the XML request directly to Cloud9 production API, parses the response, and classifies the bottleneck as `cloud9`, `tool_logic`, or `inconclusive`.

### API Endpoints
- `POST /api/test-monitor/replay/flowise` - Flowise replay
- `POST /api/test-monitor/replay/cloud9-direct` - Cloud9 direct test
- `GET /api/test-monitor/replay/modes` - Lists all 4 replay modes (live, mock, flowise, cloud9-direct)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Description |
|------|-------------|
| b55d8f2 | feat(05-02): add Flowise replay and Cloud9 direct test services |
| af9d072 | feat(05-02): add Flowise replay, Cloud9 direct, and replay modes endpoints |

---
phase: 04-expert-agents-diagnostics
plan: 03
subsystem: diagnostics
tags: [diff, deploy-tracking, version-correlation]
depends_on: ["04-02"]
provides: ["unified-diffs-in-diagnostics", "deploy-event-tracking"]
affects: ["05-xx", "06-xx"]
tech-stack:
  added: ["diff"]
  patterns: ["deploy-event-recording", "unified-diff-generation"]
key-files:
  created: []
  modified:
    - backend/src/services/expertAgentService.ts
    - backend/src/services/diagnosticOrchestrator.ts
    - backend/src/services/promptService.ts
    - backend/src/services/noderedDeployService.ts
    - backend/package.json
decisions: []
metrics:
  duration: "~3 min"
  completed: "2026-02-02"
---

# Phase 4 Plan 3: Unified Diffs & Deploy Event Tracking Summary

**One-liner:** PR-ready unified diffs in expert analysis output plus artifact_deploy_events recording on prompt saves and Node-RED deploys.

## What Was Done

### Task 1: Unified Diff Generation
- Added `createTwoFilesPatch` from `diff` library to expertAgentService
- `attachDiff()` method detects partial vs full suggestions and generates appropriate output
- Partial suggestions (< 50% of artifact size or missing file-level markers) get formatted comment blocks
- Full suggestions get proper unified diff via `createTwoFilesPatch`
- DiagnosticOrchestrator renders diffs in fenced `diff` code blocks in combined markdown

### Task 2: Deploy Event Recording
- promptService: records `artifact_deploy_events` on `saveNewVersion()` and `applyFix()` calls
- noderedDeployService: records deploy events after successful `deployFromV1File()` with Node-RED revision
- Both auto-create the table if missing, wrapped in try/catch for resilience
- Events include artifact_key, version, deploy_method, nodered_rev, and description

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Description |
|------|-------------|
| 5fad335 | feat(04-03): add unified diff generation to expert analysis results |
| 7d20c5d | feat(04-03): wire deploy event recording into promptService and noderedDeployService |

## Verification

- TypeScript compiles cleanly (no errors)
- `createTwoFilesPatch` present in expertAgentService.ts
- `artifact_deploy_events` referenced in both promptService.ts and noderedDeployService.ts
- Combined markdown includes diff code blocks

## Phase 4 Completion

All 3 plans in Phase 4 are now complete:
- 04-01: Expert agent service, diagnostic orchestrator, tool sequence mapper
- 04-02: Caller intent classifier, diagnostic controller/routes
- 04-03: Unified diffs and deploy event tracking

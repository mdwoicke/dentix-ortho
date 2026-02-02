# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** Every failed call gets a complete diagnosis -- from what the caller wanted, to what actually happened, to exactly where and why it broke.
**Current focus:** Phase 5 complete. Ready for Phase 6.

## Current Position

Phase: 5 of 6 (Replay Engine)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-02-02 -- Completed 05-01-PLAN.md

Progress: [█████████████░] ~92%

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: ~3.3 min
- Total execution time: ~42 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | ~11 min | ~4 min |
| 2 | 2/2 | ~8 min | ~4 min |
| 3 | 2/2 | ~7 min | ~3.5 min |
| 4 | 3/3 | ~10 min | ~3.3 min |
| 5 | 2/2 | ~6 min | ~3 min |

**Recent Trend:**
- Last 5 plans: 04-03, 05-02, 05-01
- Trend: Consistent, slightly improving

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Export trace utilities from controller (minimal change) rather than extracting to shared utility file.
- Direct HTTP fetch to Anthropic API for caller intent classifier (no shared LLM provider in backend).
- ConversationTurn defined locally in callerIntentClassifier to avoid circular deps.
- Optional flag on create_patient step in tool sequences.
- Auto-create session_analysis table in getDb() rather than relying on external migration.
- Serial Cloud9 calls with 200ms delay in fulfillment verifier to avoid rate limiting.
- Partial name matching for claim verification (first-name-only claims).
- Group claims by childName; null childName = responsible_party (parent), excluded from childVerifications.
- Cross-reference intent.bookingDetails.childNames to detect children never attempted by tools.
- TraceAnalysis types inline in testMonitorApi.ts (no separate types file).
- API function returns raw response since backend returns flat JSON (not wrapped).
- Reuse existing diagnoseProductionTrace; diagnose uses first trace in session.
- Independent loading states per action button (verify, diagnose, refresh).
- Sequential expert execution to avoid LLM rate limiting.
- StepStatus from session_analysis cache with on-the-fly fallback.
- Backward-compatible diagnoseProductionTrace response with new diagnosticReport field.
- Dynamic import() in controllers for lazy loading replay/cloud9 services.
- XML template strings for Cloud9 direct testing (no xml library needed).
- Positional (index-based) tool call comparison for Flowise replay.
- Mock key extraction uses last URL segment for environment-agnostic matching.
- Optional mockMap parameter threaded through existing replay functions.

### Pending Todos

None yet.

### Blockers/Concerns

- Correlation ID propagation through Node-RED should be audited before Phase 1 implementation.

## Session Continuity

Last session: 2026-02-02
Stopped at: Completed 05-01-PLAN.md (Phase 5 complete)
Resume file: None

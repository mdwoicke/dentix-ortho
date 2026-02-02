# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** Every failed call gets a complete diagnosis -- from what the caller wanted, to what actually happened, to exactly where and why it broke.
**Current focus:** Phase 4 in progress. Expert agents and diagnostics pipeline.

## Current Position

Phase: 4 of 6 (Expert Agents & Diagnostics)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-02-02 -- Completed 04-01-PLAN.md

Progress: [████████░░] ~62%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: ~3.5 min
- Total execution time: ~29 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | ~11 min | ~4 min |
| 2 | 2/2 | ~8 min | ~4 min |
| 3 | 2/2 | ~7 min | ~3.5 min |
| 4 | 1/3 | ~3 min | ~3 min |

**Recent Trend:**
- Last 5 plans: 02-02, 03-01, 03-02, 04-01
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

### Pending Todos

None yet.

### Blockers/Concerns

- Correlation ID propagation through Node-RED should be audited before Phase 1 implementation.

## Session Continuity

Last session: 2026-02-02
Stopped at: Completed 04-01-PLAN.md
Resume file: None

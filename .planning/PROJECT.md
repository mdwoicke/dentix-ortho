# Call Trace Analyzer

## What This Is

An end-to-end automated call diagnosis system for the Dentix Ortho IVA platform. It pulls complete Langfuse traces for any call, classifies caller intent from the transcript, verifies fulfillment against live Cloud9 records, diagnoses failures with domain expert agents producing PR-ready diffs, enables replay testing, and automatically monitors every completed call without manual intervention.

## Core Value

Every failed call gets a complete diagnosis — from what the caller wanted, to what actually happened, to exactly where and why it broke — without manual investigation.

## Requirements

### Validated

- TRACE-01..04: Full trace retrieval, transcript extraction, observation tree, session grouping — v1.0
- INTENT-01..04: Intent classification, booking data extraction, tool sequence mapping, all call types — v1.0
- VERIFY-01..05: Cloud9 cross-reference, per-child booking verification, pass/fail verdicts — v1.0
- EXPERT-01..05: 4 domain expert agents loaded with V1 artifacts — v1.0
- DIAG-01..05: Diagnostic orchestrator, markdown reports, PR-ready diffs, deploy correlation, standalone invocation — v1.0
- REPLAY-01..03: Mock harness, Flowise replay, Cloud9 direct testing — v1.0
- MON-01..03: Automatic monitoring, auto-diagnostics, filter UI — v1.0
- UI-01..04: Trace analysis page, verdict display, diagnostic reports, manual triggers — v1.0

### Active

(No active requirements — next milestone will define new ones)

### Out of Scope

- Real-time call monitoring — post-call analysis covers the need
- Automatic fix deployment — generating diffs is safe, auto-deploying is dangerous
- Historical batch reanalysis — can be added later
- Multi-tenant / multi-practice — over-engineering for one practice

## Context

Shipped v1.0 with ~5,200 LOC TypeScript across 24 files.
Tech stack: Express, React, SQLite (better-sqlite3), Tailwind CSS, Langfuse API, Cloud9 XML API, Anthropic Claude 3.5 Haiku.

Key services: callerIntentClassifier, fulfillmentVerifier, expertAgentService, diagnosticOrchestrator, replayService, flowiseReplayService, cloud9DirectService, monitoringService.

Frontend: TraceAnalysisPage (manual investigation), CallTracePage monitoring tab (automated results with filters).

HeartbeatService runs monitoring every 5 minutes, auto-triggers diagnostics on failures (capped at 3 per cycle).

## Constraints

- **Data source**: Langfuse is the primary trace source
- **Cloud9 API**: Rate-limited XML SOAP API — serial calls with 200ms delay
- **Node-RED**: Read-only analysis of flow JSON
- **Existing stack**: Express/React/SQLite architecture
- **LLM rate limits**: Sequential expert agent execution, diagnostics capped at 3 per cycle

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Transcript-based intent parsing via Claude 3.5 Haiku | Most reliable signal for caller intent | Good |
| Both trace output + live Cloud9 verification | Catches silent failures by comparing claims vs ground truth | Good |
| Serial Cloud9 calls with 200ms delay | Avoid rate limiting | Good |
| Sequential expert agent execution | Prevent LLM rate limit storms | Good |
| Dynamic import() for heavy services | Lazy loading avoids circular deps, faster startup | Good |
| 5-minute monitoring interval via heartbeat | Single orchestration point, no separate timer | Good |
| Diagnostics capped at 3 per cycle | Prevents rate limit storms during outage recovery | Good |
| PR-ready unified diffs in diagnostic output | Reduces time from diagnosis to fix | Good |

---
*Last updated: 2026-02-02 after v1.0 milestone*

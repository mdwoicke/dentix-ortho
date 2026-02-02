# Roadmap: Call Trace Analyzer

## Overview

Build an end-to-end call trace analysis system that starts with deterministic trace parsing and intent extraction, layers on Cloud9 fulfillment verification, surfaces results through a dedicated UI, adds LLM-powered diagnostic agents for root cause analysis, enables replay-based regression detection, and closes the loop with automated monitoring. Each phase delivers standalone value while building toward the full automated diagnosis pipeline.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Trace Foundation** - Deterministic trace parsing, transcript extraction, and intent classification
- [ ] **Phase 2: Fulfillment Verification** - Cross-reference intent against live Cloud9 records
- [ ] **Phase 3: Trace Analysis UI** - Dedicated page for interactive trace investigation
- [ ] **Phase 4: Expert Agents & Diagnostics** - LLM-powered root cause analysis with domain expert agents
- [ ] **Phase 5: Replay** - Test harness generation and regression detection via trace replay
- [ ] **Phase 6: Automated Monitoring** - Continuous post-call analysis pipeline with alert integration

## Phase Details

### Phase 1: Trace Foundation
**Goal**: User can pull any call trace and see structured intent classification with tool call timeline
**Depends on**: Nothing (first phase)
**Requirements**: TRACE-01, TRACE-02, TRACE-03, TRACE-04, INTENT-01, INTENT-02, INTENT-03, INTENT-04
**Success Criteria** (what must be TRUE):
  1. Given a session ID, user retrieves complete trace with all observations, tool calls, and generations displayed in a hierarchy
  2. System extracts and displays structured transcript (caller messages, assistant messages, tool inputs/outputs) from any trace
  3. System classifies caller intent (booking, rescheduling, cancellation, info lookup) and for booking intents extracts child count, names, parent info, and requested dates
  4. System maps classified intent to expected tool call sequence and shows which steps occurred vs which were expected
  5. Multi-trace sessions are grouped into a single conversation view
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md -- Caller intent classifier and tool sequence mapper services
- [ ] 01-02-PLAN.md -- Database schema for analysis cache and verify existing trace infrastructure
- [ ] 01-03-PLAN.md -- Trace analysis API endpoint (orchestration)

### Phase 2: Fulfillment Verification
**Goal**: User can see whether a call actually achieved its goal by comparing trace claims against live Cloud9 records
**Depends on**: Phase 1
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04, VERIFY-05
**Success Criteria** (what must be TRUE):
  1. System queries Cloud9 API and compares live patient/appointment records against what the trace tool calls claimed to create
  2. For booking calls, system verifies adult patient record + child patient record + appointment record exist per child, with correct names and dates
  3. For multi-child bookings, system verifies ALL N children have complete records, not just the first
  4. Each analyzed trace shows a clear pass/fail/partial verdict with specific gap details (which records missing, which data mismatched)
**Plans**: TBD

Plans:
- [ ] 02-01: Cloud9 verification service
- [ ] 02-02: Multi-child booking verification and verdict logic

### Phase 3: Trace Analysis UI
**Goal**: User can interactively investigate any call trace through a dedicated page in the App UI
**Depends on**: Phase 1 (Phase 2 data displayed when available)
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Dedicated trace analysis page exists in App UI accessible from navigation
  2. Page displays trace tree, transcript, intent classification, and fulfillment verdict for any selected trace
  3. Page shows diagnostic report (root cause, affected artifact, proposed diff) when available
  4. User can manually trigger deep analysis on any trace from the page
**Plans**: TBD

Plans:
- [ ] 03-01: Trace analysis page with tree and transcript view
- [ ] 03-02: Verdict display, diagnostic report view, and manual trigger

### Phase 4: Expert Agents & Diagnostics
**Goal**: When a call fails, system automatically identifies root cause across the full stack and produces a fix proposal
**Depends on**: Phase 1, Phase 2
**Requirements**: EXPERT-01, EXPERT-02, EXPERT-03, EXPERT-04, EXPERT-05, DIAG-01, DIAG-02, DIAG-03, DIAG-04, DIAG-05
**Success Criteria** (what must be TRUE):
  1. Four expert agents exist (Node-RED Flow, Patient Tool, Scheduling Tool, System Prompt), each loaded with its current V1 artifact as working context
  2. When fulfillment gaps are detected, diagnostic orchestrator routes to relevant expert agent(s) and produces markdown report with root cause, affected artifact, confidence level
  3. Diagnostic report includes PR-ready code diff for the failing artifact
  4. Expert agents can be invoked standalone for manual troubleshooting outside the automated pipeline
  5. System correlates failures with Node-RED flow deploy versions to identify regression timing
**Plans**: TBD

Plans:
- [ ] 04-01: Expert agent framework and artifact loading
- [ ] 04-02: Diagnostic orchestrator and routing logic
- [ ] 04-03: Report generation with PR-ready diffs and version correlation

### Phase 5: Replay
**Goal**: User can reproduce a failed call scenario to verify whether a fix resolves it
**Depends on**: Phase 1
**Requirements**: REPLAY-01, REPLAY-02, REPLAY-03
**Success Criteria** (what must be TRUE):
  1. System generates test harness from a trace that mocks Cloud9 API responses to isolate Node-RED/tool logic failures
  2. System can re-send caller messages through Flowise to reproduce issues at the integration layer
  3. When Node-RED does not produce expected results, system tests Cloud9 API directly to isolate whether the bottleneck is Cloud9 or tool logic
**Plans**: TBD

Plans:
- [ ] 05-01: Mock harness generation from trace data
- [ ] 05-02: Flowise replay and Cloud9 direct testing

### Phase 6: Automated Monitoring
**Goal**: Every completed call is automatically checked and failures trigger the full diagnostic pipeline
**Depends on**: Phase 1, Phase 2, Phase 4
**Requirements**: MON-01, MON-02, MON-03
**Success Criteria** (what must be TRUE):
  1. System runs lightweight intent-vs-fulfillment check automatically on every completed call without manual intervention
  2. When alert engine flags issues, system auto-triggers full trace analysis with diagnostics
  3. User can filter traces by date, pass/fail status, intent type, and search by session ID
**Plans**: TBD

Plans:
- [ ] 06-01: Post-call automatic analysis pipeline
- [ ] 06-02: Alert integration and trace filtering

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6
Note: Phase 3 and Phase 5 can proceed in parallel with Phase 2 and Phase 4 respectively.

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Trace Foundation | 0/3 | Planned | - |
| 2. Fulfillment Verification | 0/2 | Not started | - |
| 3. Trace Analysis UI | 0/2 | Not started | - |
| 4. Expert Agents & Diagnostics | 0/3 | Not started | - |
| 5. Replay | 0/2 | Not started | - |
| 6. Automated Monitoring | 0/2 | Not started | - |

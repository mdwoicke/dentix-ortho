# Requirements: Call Trace Analyzer

**Defined:** 2026-02-02
**Core Value:** Every failed call gets a complete diagnosis -- from what the caller wanted, to what actually happened, to exactly where and why it broke.

## v1 Requirements

### Trace Foundation

- [ ] **TRACE-01**: Given a Langfuse session ID or call ID, system retrieves complete trace with all observations, tool calls, and generations
- [ ] **TRACE-02**: System extracts structured transcript from trace (caller messages, assistant messages, tool call inputs/outputs)
- [ ] **TRACE-03**: System renders observation tree showing hierarchy: LLM generation → tool call → API response with latency and status
- [ ] **TRACE-04**: System groups multi-trace sessions into single conversation view

### Intent Classification

- [ ] **INTENT-01**: System parses conversation transcript to classify caller intent (booking, rescheduling, cancellation, info lookup)
- [ ] **INTENT-02**: For booking intents, system extracts structured data: number of children, child names, parent name, phone number, requested dates/times
- [ ] **INTENT-03**: System maps intent to expected tool call sequence (e.g., booking → patient lookup → slot search → appointment creation per child)
- [ ] **INTENT-04**: System supports all call types: booking, rescheduling, cancellation, info lookup

### Fulfillment Verification

- [x] **VERIFY-01**: System cross-references Langfuse trace tool outputs against live Cloud9 API records (patient profiles, appointments)
- [x] **VERIFY-02**: For booking intents, system verifies: adult patient record exists, child patient record exists per child, appointment record exists per child
- [x] **VERIFY-03**: System verifies record data matches caller-provided info (names, dates, appointment types)
- [x] **VERIFY-04**: System produces pass/fail verdict with specific gap details (which records missing, which data mismatched)
- [x] **VERIFY-05**: For multi-child bookings, system verifies ALL N children have complete records, not just the first

### Expert Agents

- [x] **EXPERT-01**: Node-RED Flow Expert agent/skill that deeply understands flow routing, session cache, API orchestration, chair selection, slot grouping, and can troubleshoot flow-level failures
- [x] **EXPERT-02**: Patient Tool Expert agent/skill that deeply understands patient lookup, creation, family linkage, sibling handling, and Cloud9 patient API interactions
- [x] **EXPERT-03**: Scheduling Tool Expert agent/skill that deeply understands slot search, appointment booking, reservation logic, multi-child scheduling, and Cloud9 appointment API interactions
- [x] **EXPERT-04**: System Prompt Expert agent/skill that deeply understands conversation flow design, persona rules, data gathering sequences, and edge case handling
- [x] **EXPERT-05**: Each expert agent is loaded with the current version of its artifact (Node-RED flow JSON, tool JS, prompt MD) as working context

### Diagnostics

- [x] **DIAG-01**: When fulfillment gaps detected, diagnostic orchestrator routes to the relevant expert agent(s) based on where the failure occurred in the call flow
- [x] **DIAG-02**: Expert agents produce markdown report: root cause identification, affected code artifact, confidence level, call flow context
- [x] **DIAG-03**: Diagnostic report includes PR-ready code diff for the failing artifact (Node-RED function, tool JS, prompt)
- [x] **DIAG-04**: System correlates failures with Node-RED flow deploy versions to identify regression timing
- [x] **DIAG-05**: Expert agents can be invoked standalone for manual troubleshooting outside the automated pipeline

### Replay

- [ ] **REPLAY-01**: System generates test harness that mocks Cloud9 API responses from the trace to isolate Node-RED/tool logic
- [ ] **REPLAY-02**: System can re-send caller messages through Flowise to reproduce issues at the integration layer
- [ ] **REPLAY-03**: When Node-RED doesn't produce expected results, system tests Cloud9 API directly to isolate bottleneck

### Monitoring

- [ ] **MON-01**: System runs lightweight intent-vs-fulfillment check automatically on every completed call
- [ ] **MON-02**: When alert engine flags issues, system auto-triggers full trace analysis with diagnostics
- [ ] **MON-03**: User can filter traces by date, pass/fail status, intent type, and search by session ID

### UI

- [x] **UI-01**: Dedicated trace analysis page in App UI for interactive investigation
- [x] **UI-02**: Page displays trace tree, transcript, intent classification, and fulfillment verdict
- [x] **UI-03**: Page shows diagnostic report when available (root cause, affected artifact, proposed diff)
- [x] **UI-04**: Page allows manual trigger of deep analysis on any trace

## v2 Requirements

### Enhanced Monitoring

- **MON-V2-01**: Cost and latency tracking per call and aggregate
- **MON-V2-02**: Trend analysis -- failure rate over time by intent type
- **MON-V2-03**: SLA tracking -- percentage of calls fully fulfilled within target

### Enhanced UI

- **UI-V2-01**: Dashboard with aggregate pass/fail metrics and trend charts
- **UI-V2-02**: Diff viewer for PR-ready patches directly in UI
- **UI-V2-03**: One-click replay trigger from trace page

### Enhanced Diagnostics

- **DIAG-V2-01**: Multi-trace pattern analysis -- find common root cause across multiple failures
- **DIAG-V2-02**: Automatic regression detection when new Node-RED version deployed

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time streaming trace viewer | Post-call analysis is sufficient; real-time adds significant complexity for 2-5 min calls |
| Custom trace collection SDK | Langfuse already instruments Flowise; consume Langfuse API instead |
| Audio playback / TTS replay | Different product; text transcript is sufficient for debugging |
| Multi-tenant / multi-practice | Over-engineering for one practice; add only if second practice appears |
| Generic LLM evaluation framework | Langfuse/LangSmith already do this; focus on domain-specific Cloud9 verification |
| Automated fix deployment | Generating diffs is safe; auto-deploying to production Node-RED is dangerous |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRACE-01 | Phase 1 | Pending |
| TRACE-02 | Phase 1 | Pending |
| TRACE-03 | Phase 1 | Pending |
| TRACE-04 | Phase 1 | Pending |
| INTENT-01 | Phase 1 | Pending |
| INTENT-02 | Phase 1 | Pending |
| INTENT-03 | Phase 1 | Pending |
| INTENT-04 | Phase 1 | Pending |
| VERIFY-01 | Phase 2 | Pending |
| VERIFY-02 | Phase 2 | Pending |
| VERIFY-03 | Phase 2 | Pending |
| VERIFY-04 | Phase 2 | Pending |
| VERIFY-05 | Phase 2 | Pending |
| UI-01 | Phase 3 | Complete |
| UI-02 | Phase 3 | Complete |
| UI-03 | Phase 3 | Complete |
| UI-04 | Phase 3 | Complete |
| EXPERT-01 | Phase 4 | Complete |
| EXPERT-02 | Phase 4 | Complete |
| EXPERT-03 | Phase 4 | Complete |
| EXPERT-04 | Phase 4 | Complete |
| EXPERT-05 | Phase 4 | Complete |
| DIAG-01 | Phase 4 | Complete |
| DIAG-02 | Phase 4 | Complete |
| DIAG-03 | Phase 4 | Complete |
| DIAG-04 | Phase 4 | Complete |
| DIAG-05 | Phase 4 | Complete |
| REPLAY-01 | Phase 5 | Complete |
| REPLAY-02 | Phase 5 | Complete |
| REPLAY-03 | Phase 5 | Complete |
| MON-01 | Phase 6 | Complete |
| MON-02 | Phase 6 | Complete |
| MON-03 | Phase 6 | Complete |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-02-02*
*Last updated: 2026-02-02 after roadmap creation*

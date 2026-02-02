# Call Trace Analyzer

## What This Is

An end-to-end call trace analysis and debugging system for the Dentix Ortho IVA platform. It pulls complete Langfuse traces for any call, parses caller intent from the transcript, verifies fulfillment against live Cloud9 records (patients, appointments), and when mismatches are found, spins up diagnostic agents to identify root causes across the full stack (Flowise, Node-RED, Cloud9 tools, system prompt) and produce fix proposals with replay test harnesses.

## Core Value

Every failed call gets a complete diagnosis — from what the caller wanted, to what actually happened, to exactly where and why it broke — without manual investigation.

## Requirements

### Validated

Capabilities that already exist in the codebase:

- ✓ Langfuse trace import and storage — `langfuseTraceService.ts`, production_traces tables — existing
- ✓ Cloud9 API integration (patient lookup, appointment queries) — `cloud9/client.ts` — existing
- ✓ Node-RED flow management and deployment — `noderedDeployService.ts` — existing
- ✓ Alert engine with configurable rules — `alertEngine.ts` — existing
- ✓ Slack notifications for alerts — `slackNotifier.ts` — existing
- ✓ Test execution framework with Flowise — `test-agent/` — existing
- ✓ Goal test runner with conversation replay — `goal-test-runner.ts` — existing
- ✓ App UI with test monitor dashboard — `frontend/src/pages/TestMonitor/` — existing
- ✓ V1 artifact management (prompt, tools, flows) — `docs/v1/` — existing
- ✓ Category classification for call types — `category-classifier.ts` — existing

### Active

- [ ] Full trace pull: given a session ID or call ID, retrieve complete Langfuse trace with all observations, tool calls, generations
- [ ] Intent parsing: analyze conversation transcript to determine what the caller was trying to accomplish (book N children, reschedule, cancel, info lookup, etc.)
- [ ] Fulfillment verification: cross-reference intent against Langfuse trace output AND live Cloud9 records (patient profiles, appointment records)
- [ ] Fulfillment mapping: for booking intents, verify adult patient record + child patient records + appointment records per child all exist and match caller-provided data
- [ ] Gap detection: identify which expected records are missing or incorrect
- [ ] Automatic lightweight check: post-call intent-vs-fulfillment check on every completed call
- [ ] Alert-triggered deep analysis: when alert engine flags issues, auto-run full trace analysis
- [ ] Diagnostic agents: when gaps found, spin up agents that examine Node-RED flow logic, tool JavaScript, system prompt, and Cloud9 API responses to find root cause
- [ ] Diagnostic report: markdown report with root cause, affected code artifacts, confidence level, and PR-ready code diff
- [ ] Replay harness: generate test harnesses that mock Cloud9 API responses from the trace to isolate Node-RED/tool logic failures
- [ ] Flowise replay: re-send caller messages through the chatflow to reproduce issues at the integration layer
- [ ] Cloud9 direct testing: when Node-RED doesn't produce expected results, test Cloud9 API directly to isolate whether the bottleneck is Cloud9 or tool logic
- [ ] App UI page: dedicated trace analysis page in the frontend for interactive investigation
- [ ] All call types: support booking, rescheduling, cancellation, and info lookup flows

### Out of Scope

- Real-time call monitoring (live streaming analysis during calls) — adds complexity, post-call analysis covers the need
- Automatic fix deployment (auto-apply proposed diffs) — too risky, human review required
- Historical batch reanalysis (retroactively analyze all past calls) — can be added later, focus on per-call analysis first

## Context

- The platform is an IVA (Intelligent Virtual Assistant) named "Allie" that handles orthodontic appointment scheduling via phone
- Flowise orchestrates the LLM conversation, which invokes tools hosted in Node-RED that call the Cloud9 API
- Full call data flow: Caller → Flowise (LLM + tools) → Node-RED (API orchestration) → Cloud9 (practice management)
- Langfuse captures the complete trace: conversation turns, tool invocations, tool responses, errors
- Current debugging is manual — inspecting Langfuse traces, checking Cloud9 records, reading Node-RED flow logic
- The existing test-agent framework already has Flowise client, category classification, and goal-based testing that can be extended
- V1 artifacts (system prompt, patient tool JS, scheduling tool JS, Node-RED flows) are the code that needs to be analyzed when diagnosing failures

## Constraints

- **Data source**: Langfuse is the primary trace source — all analysis starts from Langfuse data
- **Cloud9 API**: Rate-limited XML SOAP API — fulfillment checks must be efficient, not bulk queries
- **Node-RED**: Read-only analysis of flow JSON — never modify flows as part of diagnosis
- **Existing stack**: Must integrate with existing Express/React/SQLite architecture
- **Tool artifacts**: Diagnostic agents need access to current V1 tool JavaScript (`docs/v1/*_func.js`) and Node-RED flows (`docs/v1/nodered_Cloud9_flows.json`)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Transcript-based intent parsing | Most reliable signal for what caller actually wanted, tool calls may be incomplete if flow failed early | — Pending |
| Both trace output + live Cloud9 verification | Trace shows what the system thinks happened, Cloud9 shows ground truth — comparing both catches silent failures | — Pending |
| All call types from v1 | Booking is most complex but limiting scope delays value for simpler call types that are easy to verify | — Pending |
| App UI as primary interface | Interactive investigation needs visual trace display, but automatic checks run headless | — Pending |
| PR-ready diffs in diagnostic output | Reduces time from diagnosis to fix — human reviews but doesn't have to write the code | — Pending |

---
*Last updated: 2026-02-02 after initialization*

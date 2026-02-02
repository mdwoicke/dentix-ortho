# Project Research Summary

**Project:** Call Trace Analysis & Diagnostic Agent for Dentix-Ortho IVA
**Domain:** End-to-end conversational AI observability and automated diagnostics
**Researched:** 2026-02-02
**Confidence:** HIGH

## Executive Summary

This project adds trace analysis, intent extraction, fulfillment verification, and automated diagnostics capabilities to an existing orthodontic scheduling IVA platform. The platform already has mature infrastructure (Express/React/SQLite, Langfuse tracing, test harness, alert engine) — the goal is to extend it, not replace it. The recommended approach is to build deterministic trace analysis first (intent parsing, tool call verification), then layer in LLM-powered diagnostics only for failures. This avoids the common trap of over-using LLMs for tasks that are better solved with structured parsing.

The key differentiator is **Cloud9 fulfillment verification** — cross-referencing what the IVA claimed to do (from Langfuse traces) against live orthodontic practice management system records. No generic observability tool does this. The primary risk is **intent modeling** — treating caller intent as a single classification label rather than a multi-step goal graph leads to false-positive "success" verdicts when partial fulfillment occurs. Prevention: model intents as goal graphs with per-step verification against Cloud9 records.

Stack recommendations favor extending existing assets (llm-provider abstraction, category-classifier, goal-test-runner) over adding new frameworks. Only 2 new dependencies needed (date-fns for backend, diff for diagnostic diffs). Avoid LangChain (unnecessary abstraction), AutoGen/CrewAI (Python dependency for single-agent scenario), and OpenAI SDK (Claude handles all LLM use cases).

## Key Findings

### Recommended Stack

The platform already has the right foundation — the research strongly recommends **extending rather than replacing**. The existing `shared/llm-provider.ts` abstraction with Langfuse tracing, the `category-classifier.ts` two-tier intent parser, and the `goal-test-runner.ts` conversational test infrastructure are production-ready assets that should be reused. The primary housekeeping task is aligning the `@anthropic-ai/sdk` version (backend has ^0.71, test-agent has ^0.52) before building diagnostic agents.

**Core technologies:**
- **Claude (via @anthropic-ai/sdk ^0.71)**: Intent extraction (Haiku 3.5 for classification), diagnostic reasoning (Sonnet 4 for complex analysis), agent tool orchestration. No need for a second LLM provider or abstraction framework like LangChain.
- **Zod (already present)**: Structured output parsing for intent schemas and verification results. Use `.parse()` on LLM JSON outputs to validate structure.
- **xml2js (already present)**: Parse Cloud9 XML responses to verify fulfillment — compare "what the IVA said it did" against "what the practice management system records show."
- **date-fns**: Add to backend/test-agent for comparing scheduled appointment dates and time windows during verification.
- **diff**: Show code diffs in diagnostic agent outputs when proposing fixes to Node-RED functions or system prompts.

**Avoid:**
- **LangChain/LlamaIndex**: Massive abstraction overhead when the project already has an LLM provider abstraction with Langfuse tracing built in.
- **AutoGen/CrewAI**: Python-first agent frameworks add complexity for multi-agent coordination this project doesn't need (single diagnostic agent is sufficient).
- **Flowise for diagnostics**: Flowise is the system being diagnosed — don't use the patient to operate on itself.

### Expected Features

The trace analysis and diagnostics domain has **table stakes features** users expect from any observability tool (trace import, observation tree rendering, session grouping, cost/latency tracking), plus **differentiators** that set this product apart for the orthodontic IVA domain.

**Must have (table stakes):**
- **Trace import and storage** — already built via `LangfuseTraceService`
- **Observation tree rendering** — show LLM generation -> tool call -> API response hierarchy with latency, cost, status
- **Session-level grouping** — group multiple traces by `sessionId` to show full conversation flow
- **Transcript extraction** — parse system prompt, user messages, assistant messages, tool calls from Langfuse observations
- **Intent classification** — extract what the caller was trying to do (already partially built in `category-classifier.ts`)
- **Pass/fail verdict per call** — binary outcome: did the call achieve the caller's goal?
- **Alert rules on failure patterns** — already built in `alertEngine.ts` with threshold-based alerts and Slack notifications
- **Filtering and search** — filter by date, status, intent type, error type; search by phone, patient name, session ID
- **Cost and latency tracking** — Langfuse already provides this per trace and observation

**Should have (competitive differentiators):**
- **Cloud9 fulfillment verification** — THE differentiator. Cross-reference Langfuse traces against live Cloud9 API to verify appointments were actually created, patient records exist. No generic tool does this.
- **Automated root cause diagnosis** — when verification finds a mismatch, agent traces through Flowise config -> Node-RED flow -> tool JS -> system prompt to find the failure point.
- **PR-ready diff generation** — diagnostic agent produces actual code fixes (Node-RED function patches, system prompt changes, tool JS fixes), not just "something went wrong."
- **Replay test harness generation** — from a failed trace, auto-generate a test case that reproduces the exact scenario using the existing goal-test-runner infrastructure.
- **Multi-child booking verification** — domain-specific: verify ALL N children got appointments, not just the first one (sibling booking is the hardest IVA flow).
- **Intent-to-tool-call mapping** — define expected tool call sequences per intent type, verify each step happened in correct order.

**Defer (v2+):**
- **Real-time streaming trace viewer** — expensive to build, low value for post-call analysis (calls are 2-5 minutes, 1-5 minute delay is acceptable)
- **Custom trace collection SDK** — Langfuse already instruments Flowise, don't reinvent tracing
- **Full conversation replay UI** — audio/TTS playback is a different product; transcript text with tool annotations is sufficient
- **Automated fix deployment** — generating diffs is safe; auto-deploying to production Node-RED is dangerous (requires human review)

### Architecture Approach

The recommended architecture follows existing platform patterns: service classes that take `BetterSqlite3.Database` in constructors, post-import hooks for automatic processing, two-tier classification (pattern matching + LLM fallback), and strict separation between deterministic analysis (no LLM) and diagnostic reasoning (LLM-powered). This avoids the common mistakes of analyzing raw observations in the UI, running diagnostics on every trace regardless of status, and synchronous replay during import.

**Major components:**
1. **TraceAnalysisService** — Parse imported traces into structured call analysis: extract caller intent, tool calls made, fulfillment outcome, conversation flow anomalies. Writes to new `trace_analyses` table. Deterministic (no LLM needed for 90% of cases).
2. **DiagnosticAgent** — LLM-powered root cause analysis. Given a failed trace analysis, determine why it failed by reasoning over conversation turns, tool responses, and known failure patterns. Uses Claude tool_use API to inspect traces, read code, form hypotheses. Writes to new `diagnostic_results` table.
3. **ReplayHarness** — Orchestrate replaying a trace's tool calls via existing `ReplayService`, compare live results against recorded results, surface diffs. On-demand only (user clicks "Replay") or scheduled separately, never during import.
4. **TraceAnalysisController** — Express routes exposing analysis, diagnosis, and replay to frontend.
5. **TraceAnalysisPage** — React UI for deep-dive trace diagnostics, extending existing `CallTracePage` patterns. Three-tier display: verdict + one-line summary (default), failure chain visualization (expandable), raw data (debug).

**Data flow:**
```
1. Langfuse API -> LangfuseTraceService -> production_traces + observations (EXISTING)
2. production_traces -> TraceAnalysisService -> trace_analyses (parse into structured timeline)
3. trace_analyses (failures) -> DiagnosticAgent -> diagnostic_results (root cause + fix)
4. diagnostic_results -> AlertEngine (EXISTING, extended with new metric types)
5. trace_analyses -> ReplayHarness -> ReplayService (EXISTING) -> replay_results (on-demand)
6. Frontend fetches trace_analyses + diagnostic_results + replay_results
```

**Build order:**
- **Phase 1**: TraceAnalysisService (deterministic parsing, no LLM) — enables "what happened?" view
- **Phase 2**: TraceAnalysisPage UI + Controller — shows intent, fulfillment status, tool timeline
- **Phase 3**: DiagnosticAgent (LLM-powered) — root cause analysis for failures only
- **Phase 4**: ReplayHarness — diff comparison between recorded and live replays
- **Phase 5**: Automated pipeline — post-import hook triggers analysis -> failures trigger diagnostics -> diagnostics feed alerts

### Critical Pitfalls

The research identified 10 domain-specific pitfalls. The top 5 require design-time mitigation and cannot be retrofitted later.

1. **Intent extraction conflates caller words with caller goals** — Modeling intent as a single classification label (e.g., "schedule appointment") misses multi-step goal decomposition (patient lookup -> patient creation -> slot search -> slot booking). When verification checks only the final action, it misses partial fulfillment failures. **Prevention:** Model intent as a goal graph with per-step verification against Cloud9 records. Must be addressed in the intent parsing design phase.

2. **Trace reassembly across Flowise/Node-RED/Cloud9 loses causality** — Four distinct trace boundaries use different correlation IDs (Langfuse `traceId`, Node-RED `msg._msgid`, Cloud9 has none). Stitching by timestamp proximity breaks when Node-RED retries or caches. **Prevention:** Inject a correlation ID at Flowise tool-call level, propagate through Node-RED via `msg.correlationId`, store correlation chain explicitly. Must be done in infrastructure/instrumentation phase.

3. **Diagnostic agent generates plausible but wrong fixes** — LLMs are pattern matchers, not debuggers. Without constraint on fix scope and automated regression testing, proposed diffs introduce regressions. **Prevention:** Constrain fix scope to single component, require replay test for every diff, human-in-loop for all changes, include confidence score and evidence chain. Must be addressed in diagnostic agent phase.

4. **Alert-triggered deep analysis creates cascading LLM costs** — A single root cause (e.g., Cloud9 API down) produces hundreds of failing traces. Without deduplication, every trace gets full LLM analysis, burning through API budgets. **Prevention:** Deduplicate by failure signature before analysis, budget caps on LLM calls per alert cycle, tiered analysis (rule-based first, LLM only for novel failures), circuit breaker for systemic failures. Must be addressed in alert integration phase.

5. **Verification against Cloud9 records has no ground truth for "should have happened"** — Checking whether an appointment exists after a booking-intent call gives false positives when the caller changed their mind or slots were genuinely full. **Prevention:** Build conversation outcome classifier that determines expected outcome from full transcript before checking Cloud9 records. Distinguish "IVA failure" from "correct non-fulfillment." Must be designed alongside intent parsing.

## Implications for Roadmap

Based on research findings, the recommended phase structure follows the dependency chain discovered in architecture analysis. The critical path is TraceAnalysisService -> UI -> DiagnosticAgent -> ReplayHarness. Phases 2 and 3 can be parallelized after Phase 1 completes.

### Phase 1: Foundation - Deterministic Trace Analysis
**Rationale:** Everything downstream depends on structured trace data. Must come first. No LLM needed — purely parsing observations into clean, typed fields.

**Delivers:**
- `TraceAnalysisService` with intent extraction (reusing `category-classifier.ts` two-tier pattern)
- New `trace_analyses` table with structured fields: caller_intent, tools_invoked, fulfillment_status, anomalies, conversation_turns, latency
- Post-import hook: automatically analyze traces after Langfuse import completes
- Basic fulfillment verification: check tool response status codes, compare against expected tool call sequences

**Addresses features:**
- Transcript extraction (table stakes)
- Intent classification (table stakes)
- Tool call timeline parsing (table stakes)

**Avoids pitfalls:**
- Pitfall 1 (intent modeling): Implement goal graph data structure from the start, not single-label classification
- Pitfall 2 (correlation): Add correlation ID propagation through Node-RED before building verification logic
- Pitfall 7 (SQLite contention): Set up write queue and WAL mode before concurrent analysis

**Complexity:** MEDIUM (deterministic parsing, no LLM orchestration)

---

### Phase 2: Verification - Cloud9 Fulfillment Check
**Rationale:** THE differentiator. Requires Phase 1's structured analysis as input. Can be built in parallel with Phase 3.

**Delivers:**
- Cloud9 record verification: for each trace, call Cloud9 API (`GetAppointmentListByPatient`, `GetPatientInformation`) and compare against tool call claims
- Conversation outcome classifier: read full transcript to determine expected outcome before checking records (addresses Pitfall 5)
- Pass/fail verdict logic: success (fulfilled), partial (some steps failed), failed (no fulfillment), unknown (cannot verify)
- Extend `trace_analyses` table with Cloud9 verification fields: verified_at, verification_status, cloud9_discrepancies

**Addresses features:**
- Cloud9 fulfillment verification (THE differentiator)
- Pass/fail verdict per call (table stakes)
- Multi-child booking verification (differentiator)

**Avoids pitfalls:**
- Pitfall 5 (ground truth): Classify expected outcome from conversation before checking Cloud9
- Pitfall 9 (timestamp drift): Normalize Cloud9 datetime to UTC before comparison

**Complexity:** HIGH (requires domain understanding of Cloud9 API, multi-step verification logic)

---

### Phase 3: UI - Trace Analysis Page
**Rationale:** Make analysis results visible and actionable. Depends on Phase 1's data. Can be built in parallel with Phase 2.

**Delivers:**
- `TraceAnalysisPage` React component extending existing `CallTracePage` patterns
- Three-tier display: (1) verdict badge + one-line summary (default), (2) failure chain visualization with tool timeline, (3) expandable raw observation data
- Filtering and search: by date, status, intent type, error type; search by phone, patient name, session ID
- Integration with existing `PerformanceWaterfall` component for observation tree rendering
- Reuse existing `@monaco-editor/react` for code artifact viewer, `recharts` for trend dashboards, `allotment` for split pane layout

**Addresses features:**
- Observation tree rendering (table stakes)
- Session-level grouping (table stakes)
- Filtering and search (table stakes)
- Cost and latency tracking (table stakes)

**Avoids pitfalls:**
- Pitfall 1 (anti-pattern): Backend produces structured data, UI just renders (don't parse raw observations in frontend)
- Pitfall 10 (UI overload): Default to tier 1 display (verdict + summary), make raw data expandable

**Complexity:** LOW (extends existing UI patterns, no new component libraries)

---

### Phase 4: Diagnostics - Automated Root Cause Agent
**Rationale:** LLM-powered reasoning for failures only. Requires Phase 1's structured analysis and Phase 2's verification results as input.

**Delivers:**
- `DiagnosticAgent` using Claude tool_use API with tools: inspect_trace, read_code (Node-RED functions, system prompt, tool JS), match_failure_patterns, generate_hypothesis
- New `diagnostic_results` table: root_cause, root_cause_category (tool_error, prompt_gap, api_timeout, data_mismatch), confidence, suggested_fix, related_trace_ids, fingerprint_id
- Deduplication logic: group failing traces by failure signature, analyze one representative per signature (addresses Pitfall 4)
- Budget caps: hard limit on LLM calls per alert cycle (max $5 per alert)
- Circuit breaker: if >50 traces fail in 15 minutes, skip per-trace analysis and report "systemic failure"
- Integration with existing `AlertEngine`: new metric types (fulfillment_failure_rate, intent_mismatch_rate)

**Addresses features:**
- Automated root cause diagnosis (differentiator)
- Error clustering (table stakes, already partially built)
- Alert rules on failure patterns (table stakes, extend existing)

**Avoids pitfalls:**
- Pitfall 3 (wrong fixes): Constrain scope to single component, require evidence chain, human-in-loop for all diffs
- Pitfall 4 (cascading costs): Dedup before LLM analysis, budget caps, circuit breaker
- Pitfall 2 (anti-pattern): Only run diagnostics on failures, not every trace

**Complexity:** HIGH (LLM orchestration, tool definition, failure pattern matching)

---

### Phase 5: Replay - Diff Comparison Harness
**Rationale:** Enables "does it still fail?" verification and regression detection. Depends on Phase 1's analysis and existing `ReplayService`.

**Delivers:**
- `ReplayHarness` orchestrating existing `ReplayService` for tool call replay
- New `replay_results` table: observation_id, tool_name, action, original vs replay status/latency, response_diff, verdict (match/drift/regression/improvement)
- Replay version pinning: store prompt version, tool version, Node-RED flow version active at trace time (addresses Pitfall 6)
- Dual replay mode: against original version (reproduce failure) and current version (verify fix)
- UI integration: "Replay" button in `TraceAnalysisPage`, diff viewer using existing `@monaco-editor/react`

**Addresses features:**
- Replay test harness generation (differentiator)
- Node-RED flow version correlation (differentiator)

**Avoids pitfalls:**
- Pitfall 6 (version mismatch): Pin component versions at trace time, replay against both original and current
- Pitfall 2 (anti-pattern): Replay is on-demand only, never during import

**Complexity:** MEDIUM (orchestration layer, version tracking integration)

---

### Phase 6: Automation - Full Pipeline Integration
**Rationale:** Close the loop. All components exist, now wire them together for continuous monitoring.

**Delivers:**
- Post-import hook: `LangfuseTraceService` completes -> triggers `TraceAnalysisService` batch analysis
- Failed analysis hook: `trace_analyses` with status != 'success' -> triggers `DiagnosticAgent` (with dedup)
- Alert integration: `diagnostic_results` feed into `AlertEngine` with new metric types
- Heartbeat mode: continuously pull new traces -> analyze -> diagnose failures -> alert -> notify Slack
- Optional: scheduled replay runs to detect regressions (e.g., nightly replay of last 24h failures)

**Addresses features:**
- Automatic post-call check (heartbeat mode) (differentiator)

**Avoids pitfalls:**
- Pitfall 4 (cascading costs): Dedup and budget enforcement at alert integration layer

**Complexity:** LOW (wiring existing components, no new logic)

---

### Phase Ordering Rationale

- **Sequential dependencies:** Phase 1 (analysis) must complete before Phase 2 (verification) and Phase 3 (UI) can start. Phase 4 (diagnostics) requires Phase 1 and Phase 2 results. Phase 5 (replay) requires Phase 1 analysis. Phase 6 (automation) wires everything together.
- **Parallelization opportunities:** Phase 2 (verification) and Phase 3 (UI) can be built in parallel after Phase 1. Phase 4 (diagnostics) and Phase 5 (replay) can be built in parallel after Phase 2.
- **Risk mitigation:** Building deterministic analysis first (Phase 1) without LLM dependencies de-risks the critical path. If LLM-powered diagnostics (Phase 4) prove too complex or expensive, the product is still valuable with manual root cause investigation.
- **Incremental value:** Each phase delivers standalone value. Phase 1 enables "what happened" analysis. Phase 2 adds automated verification. Phase 3 makes it visible. Phase 4 adds automated diagnosis. Phase 5 adds regression detection. Phase 6 closes the monitoring loop.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 2 (Cloud9 verification):** Complex integration with Cloud9 API, requires understanding practice-specific appointment types, patient data model, timezone handling. Suggest `/gsd:research-phase` with focus on Cloud9 API edge cases and multi-child booking flows.
- **Phase 4 (Diagnostic agent):** Tool definition for Claude tool_use API requires experimentation. Failure pattern taxonomy needs domain knowledge. Consider prototyping diagnostic tools on 5-10 sample failed traces before full build.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Trace analysis):** Extends existing `LangfuseTraceService` and `category-classifier` patterns. Well-documented in codebase.
- **Phase 3 (UI):** Extends existing `CallTracePage`, `PerformanceWaterfall`, `@monaco-editor/react` usage. Standard React patterns.
- **Phase 5 (Replay):** Extends existing `ReplayService`. Orchestration layer only, no novel patterns.
- **Phase 6 (Automation):** Wiring phase, no research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified in codebase. Existing abstractions (`llm-provider`, `category-classifier`, `goal-test-runner`) are production-ready assets. Version alignment task is trivial. |
| Features | HIGH | Table stakes features derived from existing platform capabilities (trace import, alerts, error clustering already built). Differentiators grounded in domain analysis (Cloud9 verification, multi-child booking) and existing test infrastructure inspection. |
| Architecture | HIGH | All patterns derived from existing codebase conventions. Component boundaries follow established service layer pattern. Data flow matches existing `LangfuseTraceService` -> `AlertEngine` pipeline. New tables extend existing schema patterns. |
| Pitfalls | HIGH | All pitfalls derived from inspection of existing platform complexity (Flowise/Node-RED/Cloud9 stack), analysis of 200+ test-agent debugging scripts showing common failure modes, and Claude9 API documentation showing stateless design. |

**Overall confidence:** HIGH

All research grounded in codebase inspection and existing infrastructure analysis, not external sources. Zero speculative recommendations. Only 2 new dependencies needed (date-fns, diff), both minor additions.

### Gaps to Address

- **Cloud9 API edge cases:** The research covered the happy path for fulfillment verification (appointments created, patient records exist), but did not exhaustively research error states, retry semantics, or race conditions in the Cloud9 API. **Mitigation:** Phase 2 planning should include dedicated Cloud9 API research session focusing on failure modes, especially for multi-child booking flows. Review existing test-agent scripts (200+ files in `test-agent/scripts/`) for real-world Cloud9 failure patterns observed during testing.

- **LLM cost modeling for diagnostic agent:** The research recommends budget caps and deduplication to control costs, but did not model actual LLM API spend for diagnostic agent operations at production scale. **Mitigation:** During Phase 4 planning, run cost estimation based on: (1) expected failure rate from existing alert metrics, (2) average observations per failed trace, (3) tool call count for diagnosis, (4) Claude Sonnet 4 pricing. Set budget thresholds empirically after prototype.

- **Correlation ID propagation through Node-RED:** The research identified the need for end-to-end correlation IDs but did not verify whether existing Node-RED flows already include correlation mechanisms. **Mitigation:** Before Phase 1 implementation, audit `nodered/nodered_Cloud9_flows.json` for existing correlation ID handling. If present, reuse. If absent, add correlation propagation as a prerequisite infrastructure task.

- **SQLite vs PostgreSQL threshold:** The research recommends planning a migration path to PostgreSQL if concurrent analysis volume exceeds ~50 traces, but did not validate this threshold against actual system load. **Mitigation:** Monitor SQLite write contention (`SQLITE_BUSY` errors) during Phase 1 implementation. If contention appears before 50 concurrent traces, adjust architecture (increase write queue batch size, consider PostgreSQL earlier).

## Sources

### Primary (HIGH confidence)
- **Codebase inspection:** All findings derived from reading actual source files: `backend/package.json`, `frontend/package.json`, `test-agent/package.json`, `shared/services/llm-provider.ts`, `backend/src/services/langfuseTraceService.ts`, `backend/src/services/alertEngine.ts`, `backend/src/services/replayService.ts`, `test-agent/src/services/category-classifier.ts`, `test-agent/src/services/response-strategy-engine.ts`, `test-agent/src/tests/goal-test-runner.ts`, `frontend/src/pages/TestMonitor/CallTracePage.tsx`
- **Project documentation:** `CLAUDE.md` (system architecture, Node-RED safety rules, V1 file management, escaping rules), database schema from SQLite inspection
- **Test infrastructure analysis:** 200+ test-agent scripts showing real-world failure patterns, debugging approaches, and Cloud9 API edge cases
- **Cloud9 API documentation:** `Cloud9_API_Markdown.md` (API structure, endpoints, data types, error codes, request/response format)

### Secondary (MEDIUM confidence)
- **Langfuse data model:** Inferred from existing `LangfuseTraceService` implementation (traces, observations, spans, generations, tool calls)
- **Anthropic SDK tool_use patterns:** Based on existing SDK usage in `llm-provider.ts` and knowledge of Claude tool_use API capabilities (from training data)

### Tertiary (LOW confidence)
- None. All recommendations grounded in codebase inspection or project documentation.

---
*Research completed: 2026-02-02*
*Ready for roadmap: yes*

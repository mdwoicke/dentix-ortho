# Domain Pitfalls

**Domain:** End-to-end call trace analysis and automated debugging for LLM-based IVA (Flowise/Node-RED/Cloud9)
**Researched:** 2026-02-02

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Intent Extraction Conflates Caller Words with Caller Goals

**What goes wrong:** The trace analyzer extracts what the caller *said* rather than what they *wanted*. A caller saying "I need to schedule my daughter for braces" gets parsed as intent=schedule_appointment, but the actual goal is a multi-step flow: lookup/create patient, find slots, book appointment. When verification checks only the final action (was an appointment booked?), it misses partial fulfillment failures -- the call that found slots but failed at booking still shows "intent matched."

**Why it happens:** Intent parsing is treated as a classification problem (one label) instead of a goal decomposition problem (sequence of required outcomes). Your existing `category-classifier.ts` already demonstrates this tension -- it has 6 response categories but the real call goals span multiple categories across turns.

**Consequences:** False-positive "call succeeded" verdicts. Failure root causes misattributed. Diagnostic agent generates wrong fixes because the failure point was misidentified.

**Prevention:**
- Model intent as a goal graph, not a single label. A "book appointment for new patient" intent requires: patient lookup -> patient creation -> slot search -> slot booking. Each step is independently verifiable.
- Verify each step against Cloud9 records separately (did SetPatient fire? did SetAppointment fire? did both succeed?).
- Store the goal decomposition alongside the intent so the diagnostic agent knows which step to investigate.

**Detection:** Look for traces where the alert engine fires but the intent-fulfillment check says "success." That gap means your intent model is too coarse.

**Phase:** Must be addressed in the intent parsing design phase, before building verification.

---

### Pitfall 2: Trace Reassembly Across Flowise/Node-RED/Cloud9 Loses Causality

**What goes wrong:** Your stack has four distinct trace boundaries: Langfuse traces (LLM turns), Flowise session (tool orchestration), Node-RED flow execution (HTTP calls to Cloud9), and Cloud9 API responses. These use different correlation IDs. The trace analyzer stitches them together by timestamp proximity or session ID, but when Node-RED retries, caches, or batches requests, the causal chain breaks. You end up attributing a Cloud9 failure to the wrong Flowise tool call.

**Why it happens:** Langfuse observations have `traceId` + `parentObservationId`. Node-RED flows have their own `msg._msgid`. Cloud9 responses have no correlation ID at all -- they are stateless XML. There is no single request ID that flows end-to-end. Your existing `langfuseTraceService.ts` imports traces and observations but has no mechanism to link them to Node-RED execution logs or Cloud9 response payloads.

**Consequences:** Diagnostic agent proposes fixes for the wrong component. A Cloud9 XML parse error gets blamed on the Flowise prompt. A Node-RED retry success masks the initial failure.

**Prevention:**
- Inject a correlation ID at the Flowise tool-call level and propagate it through Node-RED (via `msg.correlationId`) into Cloud9 request logging.
- Store the correlation chain explicitly: `{langfuseTraceId, langfuseObservationId, noderedMsgId, cloud9RequestTimestamp}`.
- When reassembling, require correlation ID match, not timestamp proximity.

**Detection:** Run the analyzer on a known multi-retry trace. If it cannot distinguish the failed attempt from the successful retry, your correlation is broken.

**Phase:** Infrastructure/instrumentation phase -- must be done before the trace analysis logic is built.

---

### Pitfall 3: Diagnostic Agent Generates Plausible But Wrong Fixes

**What goes wrong:** An LLM-based diagnostic agent examines a failure trace and generates a code diff that looks correct but introduces a regression. Common case: the agent sees a Node-RED function node returning empty slots and proposes changing the filtering logic, but the actual root cause was a Cloud9 API returning cached/stale data. The fix "works" for the specific trace but breaks the general case.

**Why it happens:** LLMs are pattern matchers, not debuggers. They see symptoms and propose fixes that match similar patterns from training data. Without constraint on what components the fix can touch and without automated regression testing of proposed diffs, the diagnostic agent is a confident hallucination machine.

**Consequences:** PR-ready diffs that introduce regressions. Team loses trust in the system fast. Worse: if auto-applied, production breaks.

**Prevention:**
- Constrain the diagnostic agent's fix scope: it can only propose changes to the component identified as the failure point (prompt text, tool function, Node-RED flow config). Never cross-component fixes.
- Every proposed diff must include a replay harness that reproduces the original failure AND passes existing test cases. No diff without a test.
- Human-in-the-loop for all diffs. "PR-ready" means "ready for review," not "ready to merge."
- Include a confidence score and the specific evidence chain (trace observation IDs) that led to the diagnosis.

**Detection:** Track fix accuracy over time. If more than 30% of proposed diffs are rejected in review, the diagnostic agent needs better grounding.

**Phase:** Must be addressed in the diagnostic agent phase. Build replay harness infrastructure first, then the diff generator.

---

### Pitfall 4: Alert-Triggered Deep Analysis Creates Cascading LLM Costs

**What goes wrong:** An alert fires (e.g., booking failure rate > threshold). The system triggers deep analysis on all matching traces. Each trace analysis involves multiple LLM calls (intent extraction, failure classification, root cause diagnosis, diff generation). During an outage or systematic failure, hundreds of traces trigger simultaneously, burning through API budgets and creating a backlog that delays actionable results.

**Why it happens:** The alert engine (your existing `alertEngine.ts`) evaluates metrics over a lookback window and fires when thresholds are breached. But a single root cause (Cloud9 API down) can produce hundreds of failing traces in the lookback window. Without deduplication, every trace gets full analysis.

**Consequences:** LLM API costs spike 10-100x during incidents. Analysis backlog means the diagnostic result arrives after the incident is already resolved manually. Rate limits hit, blocking other system LLM usage.

**Prevention:**
- Deduplicate before deep analysis: group failing traces by failure signature (same error, same component, same step). Analyze one representative trace per failure signature.
- Budget caps: hard limit on LLM calls per alert cycle. Analyze top-N most recent traces, sample the rest.
- Tiered analysis: Tier 1 is rule-based pattern matching (no LLM) for known failure modes. Tier 2 is LLM analysis only for novel failures. Your existing two-tier classifier pattern in `category-classifier.ts` is the right model.
- Circuit breaker: if more than X traces fail in Y minutes, skip per-trace analysis and report "systemic failure -- likely upstream outage."

**Detection:** Monitor LLM API spend per alert cycle. If a single alert trigger costs more than $5 in LLM calls, deduplication is insufficient.

**Phase:** Alert integration phase. Build deduplication and budgeting before connecting alerts to deep analysis.

---

### Pitfall 5: Verification Against Cloud9 Records Has No Ground Truth for "Should Have Happened"

**What goes wrong:** The analyzer checks whether an appointment was booked in Cloud9 after a booking-intent call. But it has no way to know if the appointment *should* have been booked. Maybe the caller changed their mind. Maybe all slots were genuinely full. The system flags these as failures when they are correct outcomes.

**Why it happens:** Fulfillment verification requires knowing expected outcome, not just actual outcome. The expected outcome is embedded in the conversation flow, which requires understanding multi-turn context, not just the initial intent.

**Consequences:** High false-positive failure rate. Alert fatigue. Team ignores the system.

**Prevention:**
- Track conversation terminal state explicitly. Your existing `TerminalState` type in the category classifier is a start -- propagate it to the trace analyzer. If the conversation reached `APPOINTMENT_BOOKED`, verify booking exists. If it reached `NO_SLOTS_AVAILABLE`, verify no booking was expected.
- Build a "conversation outcome classifier" that reads the full transcript and determines expected outcome before checking Cloud9 records.
- Distinguish between "IVA failure" (system error prevented correct outcome) and "correct non-fulfillment" (caller declined, no availability).

**Detection:** Sample 20 "failure" verdicts manually. If more than 25% are actually correct call outcomes, your verification logic conflates non-fulfillment with failure.

**Phase:** Verification logic phase. Must be designed alongside intent parsing, not bolted on after.

## Moderate Pitfalls

### Pitfall 6: Replaying Traces Against Changed Prompts/Tools Gives Misleading Results

**What goes wrong:** The replay harness sends the same user messages through the current system to reproduce a failure. But the prompt, tools, or Node-RED flow have been updated since the original call. The replay succeeds (or fails differently), giving false confidence that the issue is fixed (or creating confusion about a "new" bug).

**Prevention:**
- Pin replay harnesses to specific versions of all components: prompt version, tool version, Node-RED flow version. Your existing version tracking (`update-prompt-version.js`) provides the versioning infrastructure.
- Store the component versions active at trace time alongside the trace data.
- Replay against both the original version (to reproduce) and current version (to verify fix).

**Phase:** Replay harness phase.

---

### Pitfall 7: SQLite Write Contention Under Concurrent Analysis

**What goes wrong:** Multiple trace analyses run concurrently (alert-triggered batch). All write results to the same SQLite database. SQLite's single-writer lock causes `SQLITE_BUSY` errors or silent data loss with WAL mode under heavy write contention.

**Why it happens:** Your existing stack uses SQLite (`better-sqlite3`) extensively. It works fine for sequential operations but concurrent analysis workers writing trace results, diagnostic findings, and alert state simultaneously will contend.

**Prevention:**
- Use WAL mode with busy timeout (minimum 5000ms).
- Serialize writes through a single write queue (e.g., a worker that batches inserts).
- Keep analysis computation concurrent but funnel all DB writes through one path.
- Consider: if analysis volume grows beyond ~50 concurrent traces, plan migration path to PostgreSQL.

**Phase:** Infrastructure phase. Set up write queue before building concurrent analysis.

---

### Pitfall 8: Prompt Diff Generation Without Semantic Understanding

**What goes wrong:** The diagnostic agent proposes prompt changes by string-diffing the current prompt against a "fixed" version. The diff looks clean but changes prompt semantics in unintended ways -- removing a guardrail, changing tone, or altering tool-calling instructions for unrelated flows.

**Prevention:**
- Scope prompt diffs to specific sections. Your system prompt is large and structured -- the diagnostic agent should only modify the section relevant to the failure (e.g., scheduling instructions, not patient lookup instructions).
- Include a "blast radius" assessment with each prompt diff: which conversation flows could be affected.
- Require A/B testing of prompt changes before merge. Your existing A/B sandbox infrastructure supports this.

**Phase:** Diff generation phase.

## Minor Pitfalls

### Pitfall 9: Timestamp Drift Between Langfuse and Cloud9

**What goes wrong:** Langfuse timestamps are server-side UTC. Cloud9 appointment timestamps use local timezone (MM/DD/YYYY format per their API docs). When correlating "did the booking happen during this call," timezone mismatches cause false negatives.

**Prevention:** Normalize all timestamps to UTC at ingestion. Convert Cloud9 datetime fields from practice-local timezone to UTC before comparison.

**Phase:** Data ingestion phase.

---

### Pitfall 10: Overloading the Trace Viewer UI with Raw Analysis Data

**What goes wrong:** The App UI trace analysis page dumps the full diagnostic output -- every observation, every LLM reasoning chain, every candidate fix. Users cannot find the actionable information.

**Prevention:** Three-tier display: (1) verdict + one-line summary, (2) failure chain visualization (which component, which step), (3) expandable raw data. Default to tier 1.

**Phase:** UI phase.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Intent parsing | Pitfall 1: single-label intent misses multi-step goals | Model as goal graph with per-step verification |
| Trace instrumentation | Pitfall 2: no end-to-end correlation ID | Add correlationId propagation through Node-RED |
| Alert integration | Pitfall 4: cascading LLM costs on outages | Dedup by failure signature, budget caps, circuit breaker |
| Verification logic | Pitfall 5: no ground truth for expected outcome | Classify conversation terminal state before checking records |
| Diagnostic agent | Pitfall 3: plausible-but-wrong fixes | Constrain scope, require replay test, human-in-loop |
| Replay harness | Pitfall 6: version mismatch in replays | Pin component versions at trace time |
| Infrastructure | Pitfall 7: SQLite write contention | Write queue, WAL mode, busy timeout |
| Diff generation | Pitfall 8: unscoped prompt changes | Section-scoped diffs, blast radius assessment |

## Sources

- Analysis of existing codebase: `alertEngine.ts`, `langfuseTraceService.ts`, `category-classifier.ts`, `response-strategy-engine.ts`, `goal-test-runner.ts`
- Patterns observed from existing test-agent scripts (200+ debugging/analysis scripts in `test-agent/scripts/`)
- Cloud9 API documentation (stateless XML, no correlation IDs)
- Langfuse trace/observation data model (from existing service implementation)

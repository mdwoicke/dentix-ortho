# Feature Landscape

**Domain:** End-to-end call trace analysis and automated diagnosis for IVA (orthodontic scheduling)
**Researched:** 2026-02-02
**Confidence:** HIGH (based on existing codebase inspection + domain knowledge of LLM observability tools)

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Trace import and storage | Can't analyze what you can't see. Every observability tool starts here. | Low | Already built: `LangfuseTraceService` imports traces + observations into SQLite |
| Observation tree rendering | Users need to see the call hierarchy (LLM generation -> tool call -> API response). Langfuse, LangSmith, Braintrust all show this. | Med | Trace -> spans -> generations must render as a tree with latency, cost, status |
| Session-level grouping | A single caller interaction spans multiple traces. Grouping by `sessionId` is fundamental. | Low | Langfuse provides sessionId; must group and show conversation flow |
| Transcript extraction | The raw conversation (what the caller said, what Allie said) is the primary debugging artifact. | Med | Parse from Langfuse observations: system prompt, user messages, assistant messages, tool calls |
| Intent classification from transcript | "What was the caller trying to do?" Booking 2 kids, rescheduling, cancellation, info lookup. Without this, no verification is possible. | Med | Already partially built: `category-classifier.ts` has category types. Needs production trace classification. |
| Pass/fail verdict per call | Binary: did the call achieve what the caller wanted? Every monitoring tool gives a status. | Med | Requires intent + fulfillment comparison. Core value prop. |
| Alert rules on failure patterns | When things break, get notified. Table stakes for any monitoring product. | Med | Already built: `alertEngine.ts` with threshold-based alerts, Slack notifications, cooldowns |
| Filtering and search | Filter by date, status, intent type, error type. Search by phone, patient name, session ID. | Low | Standard CRUD. Must exist or the tool is unusable at any volume. |
| Cost and latency tracking | LLM calls cost money. Users expect to see per-call and aggregate cost/latency. | Low | Langfuse provides `totalCost` and `latency` per trace and observation |
| Error clustering | Group similar failures together so you debug 1 pattern, not 50 instances. | Med | Already built: `errorClusteringService.ts` with Levenshtein-based clustering |

## Differentiators

Features that set this product apart. Not expected in generic observability, but high-value for this domain.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Cloud9 fulfillment verification** | Cross-reference Langfuse traces against live Cloud9 API records. Did the appointment actually get created? Does the patient record exist? No generic tool does this. | High | Must call Cloud9 `GetAppointmentListByPatient`, `GetPatientInformation` and compare against what the LLM said it did. This is THE differentiator. |
| **Automated root cause diagnosis** | When a mismatch is found, spin up an agent to trace through Flowise config -> Node-RED flow -> tool JS -> system prompt to find where things went wrong. | High | Requires parsing Node-RED flow JSON, understanding tool function logic, correlating with observation data. No off-the-shelf tool does this. |
| **PR-ready diff generation** | Diagnosis produces actual code fixes, not just "something went wrong." | High | Agent generates patches for Node-RED functions, system prompt changes, tool JS fixes. Requires deep domain knowledge. |
| **Replay test harness generation** | From a failed trace, auto-generate a test that reproduces the exact scenario. | Med | Extract persona (parent name, children, phone), goal (book N kids), and constraints from the trace. Feed into existing goal test runner. |
| **Multi-child booking verification** | Specific to ortho: verify that ALL N children got appointments, not just the first one. Sibling booking is the hardest flow. | Med | Already have sibling booking test infrastructure. Extend to production trace verification. |
| **Intent-to-tool-call mapping** | Map "caller wanted to book" -> expected tool calls (patient lookup, slot search, appointment creation) -> verify each happened in correct order. | Med | Define expected tool call sequences per intent type. Compare against actual observation tree. |
| **Node-RED flow version correlation** | Link trace failures to specific Node-RED flow versions. "This failure started after v102 deploy." | Med | Already track flow versions. Correlate with trace timestamps. |
| **Automatic post-call check (heartbeat mode)** | Continuously pull new traces, verify, alert. Not just manual deep-dives. | Med | Combine existing heartbeat service + trace import + verification pipeline. Run on interval. |

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Generic LLM evaluation framework | Langfuse, LangSmith, Braintrust already do this well. Don't rebuild prompt scoring, A/B testing infrastructure. | Use Langfuse for generic LLM metrics. Focus on domain-specific verification (did Cloud9 actually reflect what the LLM said?). |
| Real-time streaming trace viewer | Expensive to build, low value for post-call analysis. Calls are 2-5 minutes; real-time adds complexity for little gain. | Batch import traces after calls complete. 1-5 minute delay is fine. |
| Custom trace collection SDK | Don't build your own tracing. Langfuse already instruments Flowise. | Consume Langfuse API. Never instrument the IVA directly. |
| Full conversation replay UI | Playing back audio/TTS is a different product entirely. | Show transcript text with tool call annotations. That's sufficient for debugging. |
| Multi-tenant / multi-practice support | Over-engineering for one orthodontic practice. Don't abstract prematurely. | Hardcode Cloud9 credentials and Langfuse config. Add multi-tenancy only if a second practice appears. |
| Custom alerting infrastructure | Don't build PagerDuty. Slack webhook is sufficient. | Keep existing Slack notifier. Add email later if needed. |
| Automated fix deployment | Generating diffs is safe. Auto-deploying fixes to production Node-RED is dangerous. | Generate PR-ready diffs. Human reviews and deploys. |

## Feature Dependencies

```
Trace Import (exists)
  |
  v
Transcript Extraction
  |
  +---> Intent Classification
  |       |
  |       v
  |     Cloud9 Fulfillment Verification  <--- Cloud9 API integration (exists)
  |       |
  |       v
  |     Pass/Fail Verdict
  |       |
  |       +---> Alert Rules (exists)
  |       |
  |       +---> Error Clustering (exists)
  |       |
  |       v
  |     Root Cause Diagnosis Agent
  |       |
  |       +---> PR-Ready Diff Generation
  |       |
  |       +---> Replay Test Harness Generation
  |
  +---> Session Grouping
  |
  +---> Observation Tree Rendering
```

Key dependency chain: Transcript Extraction -> Intent Classification -> Fulfillment Verification -> Diagnosis. Each step requires the previous. Cannot skip ahead.

## MVP Recommendation

For MVP, prioritize:
1. **Transcript extraction from Langfuse traces** - Foundation for everything
2. **Intent classification** - "What was this call about?"
3. **Cloud9 fulfillment verification** - "Did it actually work?" (THE differentiator)
4. **Pass/fail verdict with basic alert** - Close the loop

Defer to post-MVP:
- **Automated root cause diagnosis agent**: High complexity, requires stable verification pipeline first
- **PR-ready diff generation**: Depends on diagnosis agent
- **Replay test harness generation**: Nice-to-have, manual test creation works initially
- **Node-RED version correlation**: Useful but not blocking

## Sources

- Existing codebase inspection: `langfuseTraceService.ts`, `alertEngine.ts`, `errorClusteringService.ts`, `goalAnalysisService.ts`
- Domain knowledge of Langfuse, LangSmith, Braintrust feature sets (MEDIUM confidence, based on training data)
- Project context from CLAUDE.md and git status showing existing infrastructure

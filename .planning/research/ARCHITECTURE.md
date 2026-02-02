# Architecture Patterns

**Domain:** End-to-end call trace analysis and automated diagnostics for an AI voice agent (IVA) platform
**Researched:** 2026-02-02
**Confidence:** HIGH (based on existing codebase patterns, not external research)

## Existing System Context

The platform already has these components in place:

| Component | Location | What It Does |
|-----------|----------|-------------|
| `LangfuseTraceService` | `backend/src/services/langfuseTraceService.ts` | Pulls traces + observations from Langfuse API, stores in SQLite |
| `AlertEngine` | `backend/src/services/alertEngine.ts` | Evaluates metrics against thresholds, triggers alerts |
| `ReplayService` | `backend/src/services/replayService.ts` | Emulates tool scripts (patient_tool, scheduling_tool) with real Node-RED calls |
| `CategoryClassifier` | `test-agent/src/services/category-classifier.ts` | Two-tier intent classification (pattern + LLM fallback) |
| `ResponseStrategyEngine` | `test-agent/src/services/response-strategy-engine.ts` | Determines what response to generate based on category |
| `GoalTestRunner` | `test-agent/src/tests/goal-test-runner.ts` | Runs goal-oriented tests against Flowise |
| `CallTracePage` | `frontend/src/pages/TestMonitor/CallTracePage.tsx` | UI for viewing imported Langfuse traces |
| SQLite tables | `production_traces`, `production_trace_observations`, `heartbeat_alerts`, `heartbeat_runs` | Trace and alert storage |

## Recommended Architecture for Trace Analysis + Diagnostics

### Component Boundaries

```
                                EXISTING                          NEW
                        +-----------------------+      +-------------------------+
                        |                       |      |                         |
  Langfuse API -------->| LangfuseTraceService  |----->| TraceAnalysisService    |
                        | (pull + store)        |      | (intent parse +         |
                        |                       |      |  fulfillment verify)    |
                        +-----------------------+      +-------------------------+
                                                              |
                                                              v
                        +-----------------------+      +-------------------------+
                        |                       |      |                         |
                        | AlertEngine           |<-----| DiagnosticAgent         |
                        | (threshold eval)      |      | (root cause analysis)   |
                        |                       |      |                         |
                        +-----------------------+      +-------------------------+
                                                              |
                        +-----------------------+              v
                        |                       |      +-------------------------+
                        | ReplayService         |<-----| ReplayHarness           |
                        | (tool emulation)      |      | (orchestrates replay    |
                        |                       |      |  with diff comparison)  |
                        +-----------------------+      +-------------------------+
                                                              |
                        +-----------------------+              v
                        |                       |      +-------------------------+
                        | CallTracePage (UI)    |<---->| TraceAnalysisPage (UI)  |
                        | (raw trace view)      |      | (diagnostics + replay   |
                        |                       |      |  results + verdicts)    |
                        +-----------------------+      +-------------------------+
```

### New Components

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **TraceAnalysisService** | Parse imported traces into structured call analysis: extract caller intent, tool calls made, fulfillment outcome, conversation flow anomalies | Reads from `production_traces` + `production_trace_observations`. Writes to new `trace_analyses` table |
| **DiagnosticAgent** | Given a failed/suspicious trace analysis, determine root cause. Uses LLM to reason over conversation turns, tool responses, and known failure patterns | Reads from `trace_analyses`, `failure_fingerprints`. Writes to new `diagnostic_results` table. Triggers `AlertEngine` for new failure patterns |
| **ReplayHarness** | Orchestrate replaying a trace's tool calls via `ReplayService`, compare live results against recorded results, surface diffs | Uses existing `ReplayService`. Writes to new `replay_results` table |
| **TraceAnalysisController** | Express routes for analysis endpoints | Exposes TraceAnalysisService, DiagnosticAgent, ReplayHarness to frontend |
| **TraceAnalysisPage** | React page for deep-dive trace diagnostics | Calls TraceAnalysisController APIs. Extends existing CallTracePage patterns |

### Data Flow

```
1. PULL:    Langfuse API --> LangfuseTraceService --> production_traces + observations (EXISTING)

2. ANALYZE: production_traces --> TraceAnalysisService --> trace_analyses
            - For each trace: parse observations into structured timeline
            - Extract: caller_intent, tools_invoked[], fulfillment_status, anomalies[]
            - Run automatically after each import batch OR on-demand per trace

3. DIAGNOSE: trace_analyses (where status != 'success') --> DiagnosticAgent --> diagnostic_results
             - LLM-powered root cause analysis
             - Matches against known failure_fingerprints
             - Produces: root_cause, confidence, suggested_fix, related_traces[]

4. ALERT:   diagnostic_results --> AlertEngine (EXISTING, extended)
            - New metric types: fulfillment_failure_rate, intent_mismatch_rate
            - Feeds into existing heartbeat_alerts + Slack notification

5. REPLAY:  trace_analyses --> ReplayHarness --> ReplayService (EXISTING) --> replay_results
            - Re-execute tool calls with same inputs
            - Compare: response diff, latency diff, error presence
            - Surface: "tool worked then but fails now" or "still broken"

6. DISPLAY: Frontend fetches trace_analyses + diagnostic_results + replay_results
            - Timeline view (observation waterfall - EXISTING PerformanceWaterfall)
            - Verdict badge (pass/fail/degraded)
            - Root cause card (from DiagnosticAgent)
            - Replay diff viewer
```

### New Database Tables

```sql
CREATE TABLE IF NOT EXISTS trace_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT NOT NULL,
  langfuse_config_id INTEGER,
  caller_intent TEXT,           -- extracted primary intent
  intent_confidence REAL,
  tools_invoked TEXT,           -- JSON array of tool call summaries
  fulfillment_status TEXT CHECK(fulfillment_status IN ('success','partial','failed','unknown')),
  anomalies TEXT,               -- JSON array of detected anomalies
  conversation_turns INTEGER,
  total_latency_ms REAL,
  analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trace_id) REFERENCES production_traces(trace_id)
);

CREATE TABLE IF NOT EXISTS diagnostic_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_analysis_id INTEGER NOT NULL,
  root_cause TEXT,
  root_cause_category TEXT,     -- e.g. 'tool_error', 'prompt_gap', 'api_timeout', 'data_mismatch'
  confidence REAL,
  suggested_fix TEXT,
  related_trace_ids TEXT,       -- JSON array
  fingerprint_id INTEGER,       -- link to existing failure_fingerprints if matched
  diagnosed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trace_analysis_id) REFERENCES trace_analyses(id)
);

CREATE TABLE IF NOT EXISTS replay_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_analysis_id INTEGER NOT NULL,
  observation_id TEXT,          -- which tool call was replayed
  tool_name TEXT,
  action TEXT,
  original_status_code INTEGER,
  replay_status_code INTEGER,
  original_latency_ms REAL,
  replay_latency_ms REAL,
  response_diff TEXT,           -- JSON diff summary
  verdict TEXT CHECK(verdict IN ('match','drift','regression','improvement')),
  replayed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trace_analysis_id) REFERENCES trace_analyses(id)
);
```

## Patterns to Follow

### Pattern 1: Service Layer with SQLite (Existing Convention)

Every new capability follows the existing pattern: a service class that takes `BetterSqlite3.Database` in its constructor.

```typescript
export class TraceAnalysisService {
  private db: BetterSqlite3.Database;
  constructor(db: BetterSqlite3.Database) { this.db = db; }

  async analyzeTrace(traceId: string): Promise<TraceAnalysis> { ... }
  async analyzeImportBatch(importId: number): Promise<TraceAnalysis[]> { ... }
}
```

**Why:** Every existing service (`LangfuseTraceService`, `AlertEngine`, `ReplayService`) uses this pattern. Consistency reduces cognitive load.

### Pattern 2: Two-Tier Classification (Reuse from test-agent)

The `CategoryClassifier` already implements fast pattern matching with LLM fallback. The `TraceAnalysisService` intent extraction should use the same approach:

1. Pattern-match common intents from first user message (fast, no LLM cost)
2. Fall back to LLM for ambiguous cases

**Why:** The test-agent already proved this works. The classifier code can be imported directly into the backend via the shared services path.

### Pattern 3: Post-Import Hook

Trigger analysis automatically after each Langfuse import completes, rather than requiring manual invocation.

```typescript
// In LangfuseTraceService, after import completes:
const analysisService = new TraceAnalysisService(this.db);
await analysisService.analyzeImportBatch(importId);
```

**Why:** The value of trace analysis is automatic detection. Manual-only analysis defeats the purpose.

### Pattern 4: LLM for Diagnostics, Not for Analysis

- **TraceAnalysisService** (analysis): Deterministic. Parse observations, check tool responses for error codes, count turns. No LLM needed for 90% of cases.
- **DiagnosticAgent** (diagnosis): LLM-powered. Given structured analysis output, reason about root cause. This is where LLM adds value -- connecting symptoms to causes.

**Why:** LLM calls are expensive and slow. Reserve them for the task that actually requires reasoning (diagnosis), not the task that is mostly structured data extraction (analysis).

## Anti-Patterns to Avoid

### Anti-Pattern 1: Analyzing Raw Observations Directly in the UI

**What:** Having the frontend parse and interpret raw Langfuse observations
**Why bad:** Observations are deeply nested, inconsistently structured. Logic belongs in the backend.
**Instead:** Backend produces `trace_analyses` with clean, typed fields. Frontend renders verdicts and timelines from structured data.

### Anti-Pattern 2: Running Diagnostics on Every Trace

**What:** Running the LLM-powered DiagnosticAgent on successful traces
**Why bad:** Most traces succeed. LLM cost scales linearly. Alert fatigue.
**Instead:** Only run diagnostics on traces where `fulfillment_status != 'success'` or where anomalies were detected. This should be 5-15% of traces.

### Anti-Pattern 3: Synchronous Replay During Import

**What:** Replaying tool calls as part of the import/analysis pipeline
**Why bad:** Replay hits live Node-RED/Cloud9 APIs. Adds latency and rate limit pressure to the import flow.
**Instead:** Replay is always on-demand (user clicks "Replay" in UI) or scheduled separately.

### Anti-Pattern 4: Storing Full Response Bodies in Analysis Tables

**What:** Copying entire tool response XML into `trace_analyses`
**Why bad:** Bloats SQLite. The data already exists in `production_trace_observations`.
**Instead:** Store only extracted fields (status, error code, key values). Link back to observations via ID.

## Build Order (Dependencies)

The components have clear dependency ordering:

```
Phase 1: TraceAnalysisService
  - Depends on: production_traces (EXISTING)
  - Produces: trace_analyses table
  - No LLM needed, purely deterministic parsing
  - Enables: "What happened in this call?" view in UI

Phase 2: TraceAnalysisPage (UI) + Controller
  - Depends on: TraceAnalysisService (Phase 1)
  - Extends existing CallTracePage patterns
  - Shows: intent, fulfillment status, tool timeline, anomalies

Phase 3: DiagnosticAgent
  - Depends on: trace_analyses (Phase 1)
  - Requires LLM integration (already available via shared/services/llm-provider)
  - Produces: diagnostic_results with root cause + suggested fix
  - Extends AlertEngine with new metric types

Phase 4: ReplayHarness
  - Depends on: trace_analyses (Phase 1), ReplayService (EXISTING)
  - Orchestrates replay + diff comparison
  - UI integration into TraceAnalysisPage (Phase 2)

Phase 5: Automated Pipeline
  - Depends on: All above
  - Post-import hook triggers analysis
  - Failed analyses trigger diagnostics
  - Diagnostics feed alert engine
  - Full loop: import -> analyze -> diagnose -> alert -> notify
```

**Critical path:** Phase 1 must come first. Everything reads from `trace_analyses`. Phase 2 and Phase 3 can be parallelized after Phase 1.

## Sources

- Existing codebase analysis (HIGH confidence) -- all component references verified against actual source files
- Architecture patterns derived from existing service conventions in the repository

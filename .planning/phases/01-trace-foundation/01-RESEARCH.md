# Phase 1: Trace Foundation - Research

**Researched:** 2026-02-02
**Domain:** Langfuse trace retrieval, transcript extraction, intent classification, tool call mapping
**Confidence:** HIGH

## Summary

Phase 1 builds on a mature existing codebase. The Langfuse trace import, session grouping, transcript extraction, observation tree rendering, and even a pattern-based intent classifier already exist. The work is primarily about **enhancing and reorganizing** existing capabilities, not building from scratch.

Key findings:
- `LangfuseTraceService` already handles TRACE-01 (single trace + session import), TRACE-02 (transcript via `transformToConversationTurns`), TRACE-03 (observations with hierarchy via `parentObservationId`), and TRACE-04 (session grouping via `rebuildSessions`)
- `CategoryClassifier` in test-agent already does pattern-based + LLM intent classification, but for **agent responses** (what the bot said), not **caller intent** (what the caller wanted overall)
- The intent-to-tool-sequence mapping (INTENT-03) is genuinely new work
- The frontend `CallTracePage.tsx` already has session/trace modals with Transcript, Performance, and Flow View tabs

**Primary recommendation:** Refactor existing services into a dedicated `traceAnalysis` module. Most code exists -- the gap is a caller-intent classifier (vs the existing agent-response classifier) and the intent-to-expected-tool-sequence mapper.

## Standard Stack

### Core (Already In Use)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| better-sqlite3 | Local trace storage | Already used for production_traces, production_sessions, production_trace_observations |
| Langfuse REST API | Trace source | Already integrated via LangfuseTraceService with Basic auth |
| React + Vite | Frontend | Already the app stack |
| Tailwind CSS | Styling | Already the app stack |

### Supporting (Already In Use)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| claude-3-5-haiku | LLM classification (Tier 2) | When pattern matching confidence < 0.75 |
| zod | Schema validation | Already used for CategoryClassificationResult |

### No New Libraries Needed
This phase requires zero new dependencies. Everything builds on existing infrastructure.

## Architecture Patterns

### Existing Code to Reuse (NOT Rewrite)

```
backend/src/services/langfuseTraceService.ts
  - importSingleTrace()          -> TRACE-01
  - importSessionTraces()        -> TRACE-01, TRACE-04
  - getTrace()                   -> TRACE-01
  - getSession()                 -> TRACE-04
  - rebuildSessions()            -> TRACE-04

backend/src/controllers/testMonitorController.ts
  - transformToConversationTurns() -> TRACE-02
  - transformToApiCalls()          -> TRACE-03
  - filterInternalTraces()         -> TRACE-03

test-agent/src/services/category-classifier.ts
  - CategoryClassifier             -> Partial INTENT-01 (agent-side, needs caller-side)

frontend/src/pages/TestMonitor/CallTracePage.tsx
  - SessionModal                   -> TRACE-04 UI
  - TraceModal                     -> TRACE-01 UI
  - TranscriptViewer component     -> TRACE-02 UI
  - CallFlowNavigator component    -> TRACE-03 UI
  - PerformanceWaterfall component -> TRACE-03 UI
```

### New Code Needed

```
backend/src/services/callerIntentClassifier.ts    (NEW - INTENT-01, INTENT-02, INTENT-04)
  - Classifies CALLER intent from full conversation transcript
  - Extracts structured booking data (child count, names, dates)
  - Supports: booking, rescheduling, cancellation, info_lookup

backend/src/services/toolSequenceMapper.ts        (NEW - INTENT-03)
  - Maps intent type to expected tool call sequence
  - Compares expected vs actual tool calls from observations
  - Returns step-by-step status: occurred/missing/failed

backend/src/controllers/traceAnalysisController.ts (NEW - orchestration)
  - GET /api/trace-analysis/:sessionId
  - Combines: trace retrieval + transcript + intent + tool sequence
  - Single endpoint for the analysis page
```

### Pattern: Intent Classification

The existing `CategoryClassifier` classifies **individual agent responses** (what category of reply the agent gave). Phase 1 needs a **caller intent classifier** that looks at the **full conversation** to determine what the caller wanted.

Key differences:
| Existing CategoryClassifier | New CallerIntentClassifier |
|---|---|
| Classifies single agent message | Classifies full conversation |
| 6 response categories | 4 caller intents (booking, reschedule, cancel, info) |
| Pattern rules on agent text | LLM analysis on full transcript |
| Used by test-agent at runtime | Used by trace analysis post-hoc |

### Pattern: Expected Tool Sequence Mapping

For booking intent with N children:
```
1. current_date_time (1x)
2. chord_ortho_patient action=lookup (1x - find parent)
3. schedule_appointment_ortho action=slots (1x per child)
4. chord_ortho_patient action=create_patient (0-1x per child, if new)
5. schedule_appointment_ortho action=book_child (1x per child)
```

For rescheduling:
```
1. current_date_time (1x)
2. chord_ortho_patient action=lookup (1x)
3. schedule_appointment_ortho action=slots (1x)
4. schedule_appointment_ortho action=cancel (1x)
5. schedule_appointment_ortho action=book_child (1x)
```

### Anti-Patterns to Avoid
- **Do not duplicate LangfuseTraceService logic** -- import the existing service
- **Do not build a new frontend page yet** -- Phase 3 covers UI; Phase 1 is backend services + API endpoints
- **Do not re-implement session grouping** -- `rebuildSessions()` already handles this with 60s gap detection

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Trace import from Langfuse | Custom fetch logic | `LangfuseTraceService.importSingleTrace()` | Already handles auth, pagination, observation import |
| Transcript extraction | Custom parser | `transformToConversationTurns()` | Already handles Flowise input format (history + question) |
| Observation filtering | Custom filter | `filterInternalTraces()` | Already excludes RunnableMap, RunnableLambda, etc. |
| Session grouping | Custom grouper | `LangfuseTraceService.rebuildSessions()` | Already handles 60s gap, max 5min, user_id grouping |
| Agent response classification | New classifier | `CategoryClassifier` | 800+ lines of tuned patterns for this domain |

## Common Pitfalls

### Pitfall 1: Flowise Trace Input Format
**What goes wrong:** The Flowise trace input is `{ question: "...", history: [{ role: "apiMessage"|"userMessage", content: "..." }] }`, not standard OpenAI format.
**How to avoid:** Use existing `transformToConversationTurns()` which already handles this format.

### Pitfall 2: Session ID Inconsistency
**What goes wrong:** Flowise generates unique session IDs per trace, so raw session_id grouping creates single-trace "sessions."
**How to avoid:** `rebuildSessions()` already handles this by grouping by user_id + time proximity (60s gap). Use the rebuilt session_id, not the raw Langfuse session_id.

### Pitfall 3: Internal Langchain Observations
**What goes wrong:** Observations include `RunnableMap`, `RunnableLambda`, etc. that are internal Langchain execution details, not meaningful tool calls.
**How to avoid:** Use `filterInternalTraces()` before processing observations. The known tool names are: `chord_ortho_patient`, `schedule_appointment_ortho`, `current_date_time`, `chord_handleEscalation`.

### Pitfall 4: Tool Call Action Detection
**What goes wrong:** Tool calls are identified by observation `name`, but the specific action (lookup vs create_patient, slots vs book_child) is in the `input` JSON field.
**How to avoid:** Parse `obs.input` JSON to extract the `action` field. Example: `{ "action": "slots", "patientGUID": "..." }`.

### Pitfall 5: Error Detection in Tool Outputs
**What goes wrong:** Errors aren't always `level=ERROR`. Some failures show as `"success":false` or `"_debug_error"` in the output JSON.
**How to avoid:** Use the same error detection logic as `updateSessionCachedStats()`: check `level='ERROR'` OR output contains `"success":false` OR `"_debug_error"`.

## Code Examples

### Existing: Retrieve Trace with Observations
```typescript
// From langfuseTraceService.ts - already works
const service = new LangfuseTraceService(db);
const result = service.getTrace(traceId);
// result = { trace, observations }

// On-demand import if not cached locally
if (!result) {
  result = await service.importSingleTrace(traceId, configId);
}
```

### Existing: Extract Transcript
```typescript
// From testMonitorController.ts - already works
const transcript = transformToConversationTurns(trace, filteredObservations);
// Returns: [{ role: 'user'|'assistant', content: string, timestamp: string }]
```

### New: Caller Intent Classification (Pattern)
```typescript
// New service to build
interface CallerIntent {
  type: 'booking' | 'rescheduling' | 'cancellation' | 'info_lookup';
  confidence: number;
  bookingDetails?: {
    childCount: number;
    childNames: string[];
    parentName: string;
    parentPhone: string;
    requestedDates: string[];
  };
}

// Use LLM on full transcript (not pattern matching - too complex for full-conversation analysis)
async function classifyCallerIntent(transcript: ConversationTurn[]): Promise<CallerIntent> {
  // Build transcript text
  const text = transcript.map(t => `[${t.role}]: ${t.content}`).join('\n');
  // Send to LLM with structured output schema
  // ...
}
```

### New: Tool Sequence Mapping (Pattern)
```typescript
interface ExpectedStep {
  toolName: string;
  action?: string;
  description: string;
  occurrences: 'once' | 'per_child';
}

interface StepStatus {
  step: ExpectedStep;
  status: 'completed' | 'failed' | 'missing';
  observationId?: string;
  error?: string;
}

function getExpectedSequence(intent: CallerIntent): ExpectedStep[] {
  if (intent.type === 'booking') {
    return [
      { toolName: 'current_date_time', description: 'Get current date', occurrences: 'once' },
      { toolName: 'chord_ortho_patient', action: 'lookup', description: 'Look up parent/patient', occurrences: 'once' },
      { toolName: 'schedule_appointment_ortho', action: 'slots', description: 'Search available slots', occurrences: 'per_child' },
      { toolName: 'schedule_appointment_ortho', action: 'book_child', description: 'Book appointment', occurrences: 'per_child' },
    ];
  }
  // ... other intents
}
```

## State of the Art

| What Exists | What Phase 1 Adds | Impact |
|-------------|-------------------|--------|
| Trace import + local caching | Nothing new | Reuse as-is |
| Transcript extraction (per-trace) | Session-level transcript (already works via getSession) | Minor enhancement |
| Observation tree display | Nothing new (CallFlowNavigator exists) | Reuse as-is |
| Session grouping | Nothing new (rebuildSessions exists) | Reuse as-is |
| Agent response classifier | **Caller intent classifier** | New service |
| No tool sequence mapping | **Expected vs actual tool sequence** | New service |
| No structured booking data extraction | **Booking detail extraction** | New service |

## Open Questions

1. **LLM for intent classification vs rules?**
   - What we know: The existing CategoryClassifier uses rules for agent responses. For full-conversation intent classification, rules would be fragile.
   - Recommendation: Use LLM (haiku) for caller intent since it analyzes full conversation context. Keep it cheap with structured output.

2. **Where to expose the new API?**
   - What we know: Existing endpoints are under `/api/test-monitor/production-calls/` and `/api/test-monitor/sessions/`
   - Recommendation: Add new endpoints under `/api/test-monitor/trace-analysis/:sessionId` to keep analysis separate from raw data retrieval.

3. **Database schema changes needed?**
   - What we know: production_traces, production_sessions, production_trace_observations tables exist (created by migration, not in schema.sql)
   - Recommendation: Add `caller_intent`, `intent_details_json`, `tool_sequence_status_json` columns to production_sessions (or a new `session_analysis` table) to cache analysis results.

## Sources

### Primary (HIGH confidence)
- `backend/src/services/langfuseTraceService.ts` - Read in full, 1648 lines
- `backend/src/controllers/testMonitorController.ts` - Read lines 8447-8700 (trace/session handlers)
- `test-agent/src/services/category-classifier.ts` - Read in full, 1411 lines
- `frontend/src/pages/TestMonitor/CallTracePage.tsx` - Read in full, 1896 lines

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` - Phase 1 requirements (TRACE-01 through INTENT-04)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, verified by reading codebase
- Architecture: HIGH - existing code thoroughly analyzed, gaps clearly identified
- Pitfalls: HIGH - all pitfalls derived from reading actual code patterns

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (stable codebase, no external dependencies changing)

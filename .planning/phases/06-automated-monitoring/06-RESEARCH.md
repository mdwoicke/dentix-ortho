# Phase 6: Automated Monitoring - Research

**Researched:** 2026-02-02
**Domain:** Automated call monitoring pipeline (Langfuse traces -> intent check -> diagnostics)
**Confidence:** HIGH

## Summary

Phase 6 wires together services built in Phases 1, 2, and 4 into an automated monitoring loop. The existing `HeartbeatService` already runs on a 1-minute interval evaluating alerts. The existing `LangfuseTraceService` already imports traces with observations. The `traceAnalysisController` already runs intent classification + fulfillment verification with caching in `session_analysis`.

The core work is: (1) add a new heartbeat-triggered pipeline that imports recent traces, runs lightweight intent-vs-fulfillment checks on each completed session, and stores pass/fail results; (2) when failures are detected, auto-trigger the `diagnosticOrchestrator` from Phase 4; (3) add filtering UI for the trace/session list.

**Primary recommendation:** Extend the existing `HeartbeatService` with a new "monitoring cycle" that runs after each alert evaluation -- import new traces, classify+verify new sessions, and trigger diagnostics on failures. Do NOT create a separate scheduler.

## Standard Stack

### Core (already in codebase)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| better-sqlite3 | Local DB for traces, session_analysis, monitoring results | Already used everywhere |
| HeartbeatService | Periodic scheduler with interval management | Already running, singleton |
| AlertEngine | Metric evaluation with cooldowns | Already has langfuse metrics |
| LangfuseTraceService | Trace import, session grouping | Already imports+stores traces |
| callerIntentClassifier | Intent classification | Phase 1 service |
| fulfillmentVerifier | Cloud9 cross-reference verification | Phase 2 service |
| diagnosticOrchestrator | Expert agent diagnostics | Phase 4 service |

### No new libraries needed
This phase is pure orchestration of existing services.

## Architecture Patterns

### Recommended Pipeline Flow
```
HeartbeatService (1-min interval)
  |
  +-> evaluateAlerts() [existing]
  |
  +-> runMonitoringCycle() [NEW]
       |
       +-> 1. importRecentTraces() - fetch last N minutes from Langfuse
       |
       +-> 2. findUnanalyzedSessions() - sessions not in session_analysis
       |
       +-> 3. For each unanalyzed session:
       |     a. classifyCallerIntent()
       |     b. mapToolSequence()
       |     c. verifyFulfillment() [lightweight, with 200ms Cloud9 delay]
       |     d. Store result in session_analysis with pass/fail
       |
       +-> 4. For failed sessions:
              diagnosticOrchestrator.analyze() [sequential, avoid LLM rate limits]
```

### Pattern 1: Incremental Processing
**What:** Only process sessions that haven't been analyzed yet
**When to use:** Every monitoring cycle
**Example:**
```typescript
// Find sessions imported but not yet analyzed
const unanalyzed = db.prepare(`
  SELECT DISTINCT ps.session_id, ps.langfuse_config_id
  FROM production_sessions ps
  LEFT JOIN session_analysis sa ON ps.session_id = sa.session_id
  WHERE sa.id IS NULL
    AND ps.last_trace_at >= datetime('now', '-60 minutes')
    AND ps.trace_count >= 4  -- skip abandoned sessions
  ORDER BY ps.last_trace_at ASC
  LIMIT 10
`).all();
```

### Pattern 2: Monitoring Results Table
**What:** New table to store per-session monitoring verdicts
**When to use:** Store automated check results separate from manual analysis
```sql
CREATE TABLE IF NOT EXISTS monitoring_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  langfuse_config_id INTEGER NOT NULL,
  intent_type TEXT,
  intent_confidence REAL,
  fulfillment_status TEXT CHECK(fulfillment_status IN ('pass', 'fail', 'partial', 'error')),
  fulfillment_summary TEXT,
  diagnostics_triggered INTEGER DEFAULT 0,
  diagnostics_json TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id)
);
```

### Pattern 3: Session Filtering API
**What:** Extend existing getSessions with pass/fail, intent type, session ID search
**Example:**
```typescript
// Add to getSessions query
if (status === 'fail') {
  whereClauses.push(`EXISTS (SELECT 1 FROM monitoring_results mr WHERE mr.session_id = ps.session_id AND mr.fulfillment_status = 'fail')`);
}
if (intentType) {
  whereClauses.push(`EXISTS (SELECT 1 FROM monitoring_results mr WHERE mr.session_id = ps.session_id AND mr.intent_type = ?)`);
  params.push(intentType);
}
if (searchSessionId) {
  whereClauses.push(`ps.session_id LIKE ?`);
  params.push(`%${searchSessionId}%`);
}
```

### Anti-Patterns to Avoid
- **Separate scheduler:** Do NOT create a new setInterval/cron. Use the existing HeartbeatService cycle.
- **Processing all sessions every cycle:** Use incremental approach (only unanalyzed sessions).
- **Parallel Cloud9 calls:** Prior decision mandates serial calls with 200ms delay.
- **Parallel LLM calls:** Prior decision mandates sequential expert execution.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduling | New cron/setInterval | HeartbeatService.runHeartbeat() extension | Already manages lifecycle, logging, error handling |
| Trace import | Custom Langfuse fetcher | LangfuseTraceService.importTraces() | Already handles pagination, dedup, session grouping |
| Intent classification | New classifier | callerIntentClassifier.classifyCallerIntent() | Phase 1 service, tested |
| Fulfillment checking | New verifier | fulfillmentVerifier.verifyFulfillment() | Phase 2 service with Cloud9 cross-ref |
| Diagnostics | New diagnostic pipeline | diagnosticOrchestrator | Phase 4 service with 4 expert agents |

## Common Pitfalls

### Pitfall 1: Rate Limiting Langfuse API
**What goes wrong:** Importing traces too frequently overwhelms Langfuse
**Why it happens:** 1-minute heartbeat interval could trigger too many imports
**How to avoid:** Only import every 5-10 minutes, use `last_import_date` to avoid re-fetching. Add a separate check interval for the monitoring cycle (e.g., `monitoring_interval_minutes` config).

### Pitfall 2: Processing Incomplete Sessions
**What goes wrong:** Analyzing a session while the caller is still on the phone
**Why it happens:** Traces arrive incrementally during a conversation
**How to avoid:** Only analyze sessions where `last_trace_at` is at least 5 minutes old (conversation likely ended). Use `trace_count >= 4` to skip abandoned/incomplete sessions.

### Pitfall 3: Diagnostic Storms
**What goes wrong:** Many failed sessions trigger many concurrent diagnostic runs, hitting LLM rate limits
**Why it happens:** Batch of failures from an outage period
**How to avoid:** Limit diagnostics to N per cycle (e.g., 3). Queue the rest for the next cycle. Sequential execution per prior decision.

### Pitfall 4: Database Locking
**What goes wrong:** Long-running monitoring cycle blocks UI queries
**Why it happens:** better-sqlite3 is single-writer
**How to avoid:** Keep transactions small. Commit after each session analysis, not in one big batch.

## Code Examples

### Monitoring Cycle Integration Point
```typescript
// In heartbeatService.ts, add to runHeartbeat():
async runHeartbeat(): Promise<HeartbeatResult> {
  // ... existing alert evaluation ...

  // Run monitoring cycle (separate interval tracking)
  await this.runMonitoringCycleIfDue();

  // ... existing result recording ...
}

private async runMonitoringCycleIfDue(): Promise<void> {
  const MONITORING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  if (this.lastMonitoringRunAt &&
      Date.now() - new Date(this.lastMonitoringRunAt).getTime() < MONITORING_INTERVAL_MS) {
    return; // Not due yet
  }
  // ... run monitoring cycle ...
  this.lastMonitoringRunAt = new Date().toISOString();
}
```

### Session Completion Detection
```typescript
// Only analyze sessions that are "done" (no new traces in 5 min)
const COMPLETION_WINDOW_MINUTES = 5;
const completedSessions = db.prepare(`
  SELECT ps.session_id, ps.langfuse_config_id, ps.trace_count
  FROM production_sessions ps
  LEFT JOIN monitoring_results mr ON ps.session_id = mr.session_id
  WHERE mr.id IS NULL
    AND ps.trace_count >= 4
    AND ps.last_trace_at < datetime('now', '-${COMPLETION_WINDOW_MINUTES} minutes')
    AND ps.first_trace_at >= datetime('now', '-24 hours')
  ORDER BY ps.last_trace_at DESC
  LIMIT 10
`).all();
```

## Open Questions

1. **Monitoring cycle frequency:** 5 minutes seems reasonable but may need tuning based on Langfuse API rate limits and typical call volume. Configurable via DB setting recommended.

2. **Diagnostic depth on auto-trigger:** Should auto-triggered diagnostics run all 4 expert agents or just the most relevant? Recommendation: run all 4 but cap at 3 sessions per cycle.

## Sources

### Primary (HIGH confidence)
- Codebase: `backend/src/services/alertEngine.ts` - existing alert evaluation loop
- Codebase: `backend/src/services/heartbeatService.ts` - existing scheduler with singleton pattern
- Codebase: `backend/src/services/langfuseTraceService.ts` - trace import with pagination
- Codebase: `backend/src/controllers/traceAnalysisController.ts` - existing session_analysis caching
- Codebase: `backend/src/services/fulfillmentVerifier.ts` - Cloud9 verification

### Secondary (MEDIUM confidence)
- Prior decisions from STATE.md regarding serial Cloud9 calls and sequential expert execution

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all services already exist in codebase
- Architecture: HIGH - clear orchestration pattern, no new technologies
- Pitfalls: HIGH - based on existing codebase patterns and prior decisions

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (stable, internal orchestration only)

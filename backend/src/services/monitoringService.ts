/**
 * Monitoring Service
 *
 * Automated post-call monitoring pipeline that runs on each heartbeat cycle.
 * Imports recent traces, runs intent classification + fulfillment verification
 * on unanalyzed sessions, stores pass/fail results, and auto-triggers diagnostics.
 *
 * MON-01: Auto-check every completed call
 * MON-02: Auto-trigger diagnostics on failures
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { LangfuseTraceService } from './langfuseTraceService';
import { classifyCallerIntent, CallerIntent } from './callerIntentClassifier';
import { verifyFulfillment, FulfillmentVerdict } from './fulfillmentVerifier';
import {
  transformToConversationTurns,
  filterInternalTraces,
} from '../controllers/testMonitorController';

// Path to test-agent database
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface MonitoringCycleResult {
  sessionsChecked: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
}

export interface MonitoringResult {
  id: number;
  session_id: string;
  intent_type: string | null;
  intent_confidence: number | null;
  verification_status: string | null;
  verdict_summary: string | null;
  diagnostic_status: string | null;
  diagnostic_report_json: string | null;
  analyzed_at: string;
  diagnosed_at: string | null;
}

// ============================================================================
// MONITORING SERVICE
// ============================================================================

export class MonitoringService {
  private db: BetterSqlite3.Database;

  constructor(db?: BetterSqlite3.Database) {
    this.db = db || new BetterSqlite3(TEST_AGENT_DB_PATH);
    this.ensureTable();
  }

  /**
   * Create monitoring_results table if it doesn't exist
   */
  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monitoring_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        intent_type TEXT,
        intent_confidence REAL,
        verification_status TEXT,
        verdict_summary TEXT,
        diagnostic_status TEXT,
        diagnostic_report_json TEXT,
        analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
        diagnosed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_monitoring_results_session ON monitoring_results(session_id);
      CREATE INDEX IF NOT EXISTS idx_monitoring_results_status ON monitoring_results(verification_status);
    `);
  }

  /**
   * Run a full monitoring cycle:
   * 1. Import recent traces from Langfuse (last 10 minutes)
   * 2. Find completed sessions not yet analyzed
   * 3. Run intent classification + fulfillment verification
   * 4. Store results in monitoring_results
   */
  async runMonitoringCycle(configId?: number): Promise<MonitoringCycleResult> {
    const effectiveConfigId = configId || this.getDefaultConfigId();
    const result: MonitoringCycleResult = {
      sessionsChecked: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
    };

    console.log(`[MonitoringService] Starting monitoring cycle (configId=${effectiveConfigId})`);

    try {
      // Step 1: Import recent traces (last 10 minutes)
      const service = new LangfuseTraceService(this.db);
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      try {
        await service.importTraces({
          configId: effectiveConfigId,
          fromDate: tenMinutesAgo,
          limit: 50,
        });
      } catch (importErr: any) {
        console.warn(`[MonitoringService] Trace import failed (non-fatal): ${importErr.message}`);
      }

      // Step 2: Find completed sessions not yet analyzed
      // "Completed" = last trace is >= 5 minutes old
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const unanalyzedSessions = this.db.prepare(`
        SELECT ps.session_id, ps.langfuse_config_id, ps.last_trace_at, ps.trace_count
        FROM production_sessions ps
        WHERE ps.langfuse_config_id = ?
          AND ps.last_trace_at <= ?
          AND ps.last_trace_at >= ?
          AND ps.session_id NOT IN (SELECT session_id FROM monitoring_results)
        ORDER BY ps.last_trace_at DESC
        LIMIT 10
      `).all(effectiveConfigId, fiveMinutesAgo, tenMinutesAgo) as any[];

      if (unanalyzedSessions.length === 0) {
        console.log('[MonitoringService] No unanalyzed sessions found');
        return result;
      }

      console.log(`[MonitoringService] Found ${unanalyzedSessions.length} unanalyzed sessions`);

      // Step 3: Analyze each session
      for (const session of unanalyzedSessions) {
        try {
          await this.analyzeSession(session.session_id, effectiveConfigId, service);
          result.sessionsChecked++;

          // Check what we stored
          const stored = this.db.prepare(
            'SELECT verification_status FROM monitoring_results WHERE session_id = ?'
          ).get(session.session_id) as any;

          if (stored) {
            if (stored.verification_status === 'verified') result.passed++;
            else if (stored.verification_status === 'failed' || stored.verification_status === 'partial') result.failed++;
            else result.skipped++;
          }
        } catch (err: any) {
          console.error(`[MonitoringService] Error analyzing session ${session.session_id}: ${err.message}`);
          result.errors++;
        }
      }

      console.log(`[MonitoringService] Cycle complete: ${result.sessionsChecked} checked, ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped, ${result.errors} errors`);

    } catch (err: any) {
      console.error(`[MonitoringService] Monitoring cycle error: ${err.message}`);
    }

    return result;
  }

  /**
   * Analyze a single session: classify intent, verify fulfillment, store result
   */
  private async analyzeSession(
    sessionId: string,
    configId: number,
    service: LangfuseTraceService,
  ): Promise<void> {
    console.log(`[MonitoringService] Analyzing session ${sessionId}`);

    // Get session data
    let sessionData = service.getSession(sessionId, configId);

    if (!sessionData) {
      // Try importing
      try {
        sessionData = await service.importSessionTraces(sessionId, configId);
      } catch (importErr: any) {
        console.warn(`[MonitoringService] Could not import session ${sessionId}: ${importErr.message}`);
        this.storeResult(sessionId, null, 'error', `Import failed: ${importErr.message}`);
        return;
      }
    }

    if (!sessionData || !sessionData.traces || sessionData.traces.length === 0) {
      this.storeResult(sessionId, null, 'error', 'Session has no traces');
      return;
    }

    // Build transcript
    const sortedTraces = [...sessionData.traces].sort((a: any, b: any) =>
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );

    const allTurns: any[] = [];
    for (const trace of sortedTraces) {
      const traceObs = sessionData.observations.filter((o: any) => o.trace_id === trace.trace_id);
      const filtered = filterInternalTraces(traceObs);
      const turns = transformToConversationTurns(trace, filtered);
      allTurns.push(...turns);
    }

    // Classify intent
    let intent: CallerIntent | null = null;
    try {
      intent = await classifyCallerIntent(allTurns);
    } catch (err: any) {
      console.error(`[MonitoringService] Intent classification failed for ${sessionId}: ${err.message}`);
    }

    // Skip verification for unknown/low-confidence intents
    if (!intent || intent.type === ('unknown' as any) || intent.confidence < 0.5) {
      this.storeResult(sessionId, intent, 'skipped', 'Low confidence or unknown intent');
      return;
    }

    // Verify fulfillment
    let verification: FulfillmentVerdict | null = null;
    try {
      const allObs = filterInternalTraces(sessionData.observations);
      verification = await verifyFulfillment(sessionId, allObs, intent);
    } catch (verifyErr: any) {
      console.error(`[MonitoringService] Verification failed for ${sessionId}: ${verifyErr.message}`);
      this.storeResult(sessionId, intent, 'error', `Verification failed: ${verifyErr.message}`);
      return;
    }

    // Store result
    this.db.prepare(`
      INSERT OR REPLACE INTO monitoring_results
        (session_id, intent_type, intent_confidence, verification_status, verdict_summary, analyzed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(
      sessionId,
      intent.type,
      intent.confidence,
      verification.status,
      verification.summary,
    );

    console.log(`[MonitoringService] Session ${sessionId}: intent=${intent.type}, verification=${verification.status}`);
  }

  /**
   * Store a monitoring result (helper for error/skip cases)
   */
  private storeResult(
    sessionId: string,
    intent: CallerIntent | null,
    status: string,
    summary: string,
  ): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO monitoring_results
        (session_id, intent_type, intent_confidence, verification_status, verdict_summary, analyzed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(
      sessionId,
      intent?.type ?? null,
      intent?.confidence ?? null,
      status,
      summary,
    );
  }

  /**
   * Trigger diagnostics for failed sessions.
   * Caps at 3 sessions per invocation to avoid LLM rate limiting.
   */
  async triggerDiagnostics(): Promise<{ diagnosed: number; errors: number }> {
    const failedSessions = this.db.prepare(`
      SELECT session_id FROM monitoring_results
      WHERE verification_status IN ('failed', 'partial')
        AND diagnostic_status IS NULL
      ORDER BY analyzed_at DESC
      LIMIT 3
    `).all() as any[];

    if (failedSessions.length === 0) {
      return { diagnosed: 0, errors: 0 };
    }

    console.log(`[MonitoringService] Triggering diagnostics for ${failedSessions.length} failed sessions`);

    let diagnosed = 0;
    let errors = 0;

    for (const row of failedSessions) {
      try {
        // Dynamic import to avoid circular dependencies and lazy-load
        const { DiagnosticOrchestrator } = await import('./diagnosticOrchestrator');
        const orchestrator = new DiagnosticOrchestrator(this.db);
        const report = await orchestrator.diagnose({
          traceId: row.session_id,
          sessionId: row.session_id,
          transcript: '',
          apiErrors: [],
          stepStatuses: [],
        });

        this.db.prepare(`
          UPDATE monitoring_results
          SET diagnostic_status = 'completed',
              diagnostic_report_json = ?,
              diagnosed_at = datetime('now')
          WHERE session_id = ?
        `).run(JSON.stringify(report), row.session_id);

        diagnosed++;
        console.log(`[MonitoringService] Diagnosed session ${row.session_id}`);
      } catch (err: any) {
        console.error(`[MonitoringService] Diagnostic failed for ${row.session_id}: ${err.message}`);

        this.db.prepare(`
          UPDATE monitoring_results
          SET diagnostic_status = 'error',
              diagnosed_at = datetime('now')
          WHERE session_id = ?
        `).run(row.session_id);

        errors++;
      }
    }

    return { diagnosed, errors };
  }

  /**
   * Get the default Langfuse config ID
   */
  private getDefaultConfigId(): number {
    const row = this.db.prepare(
      'SELECT id FROM langfuse_configs WHERE is_default = 1 LIMIT 1'
    ).get() as any;
    return row?.id || 1;
  }

  /**
   * Get recent monitoring results
   */
  getRecentResults(limit: number = 20): MonitoringResult[] {
    return this.db.prepare(`
      SELECT * FROM monitoring_results
      ORDER BY analyzed_at DESC
      LIMIT ?
    `).all(limit) as MonitoringResult[];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let monitoringServiceInstance: MonitoringService | null = null;

export function getMonitoringService(db?: BetterSqlite3.Database): MonitoringService {
  if (!monitoringServiceInstance) {
    monitoringServiceInstance = new MonitoringService(db);
  }
  return monitoringServiceInstance;
}

export function resetMonitoringService(): void {
  monitoringServiceInstance = null;
}

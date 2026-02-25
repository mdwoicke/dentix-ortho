/**
 * Langfuse Trace Service
 * Fetches and transforms production traces from Langfuse API
 */

import BetterSqlite3 from 'better-sqlite3';
import { getToolNamesForConfig, getAllKnownToolNames, sqlInList } from './toolNameResolver';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LangfuseConfig {
  id: number;
  name: string;
  host: string;
  publicKey: string;
  secretKey: string;
}

export interface ImportOptions {
  configId: number;
  fromDate: string;  // ISO date
  toDate?: string;   // ISO date, defaults to now
  limit?: number;    // Per-page limit, max 100
  refreshObservations?: boolean;  // Re-import observations for existing traces
}

export interface ImportResult {
  importId: number;
  tracesImported: number;
  tracesSkipped: number;
  status: 'completed' | 'failed';
  errorMessage?: string;
  // Effective date used for API call (may differ from user's fromDate if we already have data)
  effectiveFromDate?: string;
  // Prod Tracer auto-import results (if any bookings were found)
  prodTracerImported?: {
    patientsFound: number;
    appointmentsFound: number;
  };
}

interface LangfuseTrace {
  id: string;
  timestamp: string;
  name?: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  release?: string;
  version?: string;
  input?: any;
  output?: any;
  latency?: number;
  totalCost?: number;
}

interface LangfuseObservation {
  id: string;
  traceId: string;
  type: 'GENERATION' | 'SPAN' | 'EVENT';
  name?: string;
  parentObservationId?: string;
  model?: string;
  input?: any;
  output?: any;
  metadata?: Record<string, any>;
  startTime?: string;
  endTime?: string;
  completionStartTime?: string;
  latency?: number;
  usage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  calculatedTotalCost?: number;
  level?: string;
  statusMessage?: string;
}

// ============================================================================
// LANGFUSE TRACE SERVICE
// ============================================================================

export class LangfuseTraceService {
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;

    // Ensure has_transfer column exists on production_sessions (migration for existing databases)
    try {
      this.db.exec(`ALTER TABLE production_sessions ADD COLUMN has_transfer INTEGER DEFAULT 0`);
    } catch {
      // Column already exists, ignore
    }

    // Ensure has_order column exists on production_sessions (for Dominos order tracking)
    try {
      this.db.exec(`ALTER TABLE production_sessions ADD COLUMN has_order INTEGER DEFAULT 0`);
    } catch {
      // Column already exists, ignore
    }

    // Ensure original_session_id column exists on production_traces
    // Stores the original Langfuse session ID before rebuildSessions overwrites session_id with conv_ IDs
    try {
      this.db.exec(`ALTER TABLE production_traces ADD COLUMN original_session_id TEXT`);
      // Backfill: for existing traces, set original_session_id = session_id where not already a conv_ ID
      this.db.exec(`
        UPDATE production_traces
        SET original_session_id = session_id
        WHERE original_session_id IS NULL AND session_id NOT LIKE 'conv_%'
      `);
    } catch {
      // Column already exists, ignore
    }
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_production_traces_original_session ON production_traces(original_session_id)`);
    } catch {
      // Index already exists, ignore
    }
  }

  /**
   * Get Langfuse config by ID
   * Handles both regular configs (positive IDs from langfuse_configs table)
   * and sandbox configs (negative IDs: -1 = sandbox_a, -2 = sandbox_b from ab_sandboxes table)
   */
  getConfig(configId: number): LangfuseConfig | null {
    // Handle sandbox configs (negative IDs)
    if (configId < 0) {
      const sandboxId = configId === -1 ? 'sandbox_a' : 'sandbox_b';
      const row = this.db.prepare(`
        SELECT sandbox_id, name, langfuse_host, langfuse_public_key, langfuse_secret_key
        FROM ab_sandboxes
        WHERE sandbox_id = ?
          AND langfuse_host IS NOT NULL AND langfuse_host != ''
          AND langfuse_public_key IS NOT NULL AND langfuse_public_key != ''
      `).get(sandboxId) as any;

      if (!row) return null;

      return {
        id: configId,
        name: row.name,
        host: row.langfuse_host,
        publicKey: row.langfuse_public_key,
        secretKey: row.langfuse_secret_key,
      };
    }

    // Handle regular configs (positive IDs)
    const row = this.db.prepare(`
      SELECT id, name, host, public_key, secret_key
      FROM langfuse_configs
      WHERE id = ?
    `).get(configId) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      host: row.host,
      publicKey: row.public_key,
      secretKey: row.secret_key,
    };
  }

  /**
   * Ensure sandbox config exists in langfuse_configs table for FK constraints
   * Called before import to ensure negative IDs have corresponding rows
   */
  private ensureSandboxConfigSynced(configId: number): void {
    if (configId >= 0) return; // Only handle sandbox configs (negative IDs)

    const sandboxId = configId === -1 ? 'sandbox_a' : 'sandbox_b';
    const sandbox = this.db.prepare(`
      SELECT sandbox_id, name, langfuse_host, langfuse_public_key, langfuse_secret_key
      FROM ab_sandboxes
      WHERE sandbox_id = ?
    `).get(sandboxId) as any;

    if (!sandbox) return;

    // Upsert into langfuse_configs with the negative ID
    const existing = this.db.prepare(`
      SELECT id FROM langfuse_configs WHERE id = ?
    `).get(configId);

    if (!existing) {
      this.db.prepare(`
        INSERT INTO langfuse_configs (id, name, host, public_key, secret_key, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      `).run(
        configId,
        sandbox.name,
        sandbox.langfuse_host,
        sandbox.langfuse_public_key,
        sandbox.langfuse_secret_key
      );
      console.log(`[LangfuseTraceService] Synced sandbox config ${sandbox.name} to langfuse_configs with id ${configId}`);
    } else {
      // Update existing entry in case settings changed
      this.db.prepare(`
        UPDATE langfuse_configs
        SET name = ?, host = ?, public_key = ?, secret_key = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        sandbox.name,
        sandbox.langfuse_host,
        sandbox.langfuse_public_key,
        sandbox.langfuse_secret_key,
        configId
      );
    }
  }

  /**
   * Create auth header for Langfuse API
   */
  private createAuthHeader(config: LangfuseConfig): string {
    return Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64');
  }

  /**
   * Normalize host URL (remove trailing slash)
   */
  private normalizeHost(host: string): string {
    return host.replace(/\/+$/, '');
  }

  /**
   * Import traces from Langfuse
   * Uses pagination to handle large datasets
   * OPTIMIZATION: Calculates effective fromDate based on latest trace in DB
   * to avoid re-fetching traces we already have from the Langfuse API
   */
  async importTraces(options: ImportOptions): Promise<ImportResult> {
    const { configId, fromDate, toDate, limit = 50 } = options;

    // For sandbox configs (negative IDs), ensure they're synced to langfuse_configs table
    // This is needed for foreign key constraints
    this.ensureSandboxConfigSynced(configId);

    // Get config
    const config = this.getConfig(configId);

    if (!config) {
      throw new Error(`Langfuse config ${configId} not found`);
    }

    if (!config.secretKey) {
      throw new Error(`Langfuse config ${configId} is missing secret key`);
    }

    // OPTIMIZATION: Calculate effective fromDate to avoid re-fetching traces we already have
    // Use the LATER of: user's fromDate OR latest existing trace timestamp + 1ms
    let effectiveFromDate = fromDate;
    const latestExisting = this.getLastImportDate(configId);
    if (latestExisting) {
      const latestTime = new Date(latestExisting).getTime();
      const userFromTime = new Date(fromDate).getTime();
      if (latestTime >= userFromTime) {
        // Add 1ms to avoid re-fetching the exact same trace
        effectiveFromDate = new Date(latestTime + 1).toISOString();
        console.log(`[LangfuseTraceService] Optimizing fromDate: ${fromDate} → ${effectiveFromDate.split('T')[0]} (already have data up to ${latestExisting})`);
      }
    }

    // Create import history record
    const importResult = this.db.prepare(`
      INSERT INTO langfuse_import_history (langfuse_config_id, import_started_at, from_date, to_date, status)
      VALUES (?, datetime('now'), ?, ?, 'running')
    `).run(configId, fromDate, toDate || null);

    const importId = Number(importResult.lastInsertRowid);

    try {
      const authHeader = this.createAuthHeader(config);
      const normalizedHost = this.normalizeHost(config.host);

      let tracesImported = 0;
      let tracesSkipped = 0;
      let page = 1;
      let hasMore = true;

      // Paginated fetch
      while (hasMore) {
        // Build URL with query params
        // Langfuse API orderBy format: [field].[asc/desc] e.g., "timestamp.desc"
        const params = new URLSearchParams();
        params.append('fromTimestamp', new Date(effectiveFromDate).toISOString());
        if (toDate) {
          params.append('toTimestamp', new Date(toDate).toISOString());
        }
        params.append('limit', String(limit));
        params.append('page', String(page));
        params.append('orderBy', 'timestamp.desc');

        const tracesUrl = `${normalizedHost}/api/public/traces?${params.toString()}`;

        console.log(`[LangfuseTraceService] Fetching page ${page}: ${tracesUrl}`);

        const response = await fetch(tracesUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Langfuse API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as { data: LangfuseTrace[]; meta?: { totalItems?: number; page?: number; totalPages?: number } };
        const traces = data.data || [];

        console.log(`[LangfuseTraceService] Received ${traces.length} traces on page ${page}`);

        // Track affected users for incremental session rebuild
        const affectedUserIds = new Set<string>();

        for (const trace of traces) {
          // Check if already imported
          const existing = this.db.prepare(`
            SELECT id FROM production_traces WHERE trace_id = ?
          `).get(trace.id);

          if (existing) {
            tracesSkipped++;
            continue;
          }

          // Use session_id if available, otherwise use trace_id as synthetic session
          const effectiveSessionId = trace.sessionId || trace.id;
          const userId = trace.userId || 'unknown';

          // Track this user for incremental rebuild
          affectedUserIds.add(userId);

          // Insert trace (store original Langfuse session ID for reverse-lookup after rebuildSessions)
          this.db.prepare(`
            INSERT INTO production_traces (
              trace_id, langfuse_config_id, session_id, user_id, name,
              input, output, metadata_json, tags_json, release, version,
              total_cost, latency_ms, started_at, ended_at, environment,
              original_session_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            trace.id,
            configId,
            effectiveSessionId,
            trace.userId || null,
            trace.name || null,
            trace.input ? JSON.stringify(trace.input) : null,
            trace.output ? JSON.stringify(trace.output) : null,
            trace.metadata ? JSON.stringify(trace.metadata) : null,
            trace.tags ? JSON.stringify(trace.tags) : null,
            trace.release || null,
            trace.version || null,
            trace.totalCost || null,
            trace.latency || null,
            trace.timestamp,
            null, // ended_at calculated from observations
            (trace.metadata as any)?.environment || null,
            effectiveSessionId
          );

          // Skip upsertSession here - rebuildSessionsForUsers (called after page)
          // will create properly grouped conv_ sessions. Creating raw sessions here
          // causes orphan 1-message sessions if the page is viewed during import.

          // Fetch and store observations (tool calls, generations)
          await this.importTraceObservations(config, trace.id);

          tracesImported++;
        }

        // Incremental session rebuild for affected users only (within this page)
        if (affectedUserIds.size > 0) {
          this.rebuildSessionsForUsers(configId, Array.from(affectedUserIds));
        }

        // Check pagination - stop if we got less than limit or no meta info
        const totalPages = data.meta?.totalPages || 1;
        hasMore = traces.length === limit && page < totalPages;
        page++;

        // Rate limiting - pause between pages
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // Update import history
      this.db.prepare(`
        UPDATE langfuse_import_history
        SET import_completed_at = datetime('now'), status = 'completed',
            traces_imported = ?, traces_skipped = ?
        WHERE id = ?
      `).run(tracesImported, tracesSkipped, importId);

      console.log(`[LangfuseTraceService] Import complete: ${tracesImported} imported, ${tracesSkipped} skipped`);

      // Note: Sessions are now rebuilt incrementally per-page for affected users only
      // This is much faster than rebuilding ALL sessions after each import

      return { importId, tracesImported, tracesSkipped, status: 'completed', effectiveFromDate };
    } catch (error: any) {
      console.error(`[LangfuseTraceService] Import failed:`, error);

      this.db.prepare(`
        UPDATE langfuse_import_history
        SET import_completed_at = datetime('now'), status = 'failed', error_message = ?
        WHERE id = ?
      `).run(error.message, importId);

      return {
        importId,
        tracesImported: 0,
        tracesSkipped: 0,
        status: 'failed',
        errorMessage: error.message,
      };
    }
  }

  /**
   * Import observations for a trace (generations, spans)
   */
  private async importTraceObservations(config: LangfuseConfig, traceId: string): Promise<void> {
    const authHeader = this.createAuthHeader(config);
    const normalizedHost = this.normalizeHost(config.host);

    const traceUrl = `${normalizedHost}/api/public/traces/${traceId}`;

    try {
      const response = await fetch(traceUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[LangfuseTraceService] Failed to fetch trace details for ${traceId}`);
        return;
      }

      const traceData = await response.json() as { observations?: LangfuseObservation[] };
      const observations = traceData.observations || [];

      for (const obs of observations) {
        this.db.prepare(`
          INSERT OR IGNORE INTO production_trace_observations (
            observation_id, trace_id, parent_observation_id, type, name, model,
            input, output, metadata_json, started_at, ended_at,
            completion_start_time, latency_ms, usage_input_tokens,
            usage_output_tokens, usage_total_tokens, cost, level, status_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          obs.id,
          traceId,
          obs.parentObservationId || null,
          obs.type,
          obs.name || null,
          obs.model || null,
          obs.input ? JSON.stringify(obs.input) : null,
          obs.output ? JSON.stringify(obs.output) : null,
          obs.metadata ? JSON.stringify(obs.metadata) : null,
          obs.startTime || null,
          obs.endTime || null,
          obs.completionStartTime || null,
          obs.latency || null,
          obs.usage?.input || null,
          obs.usage?.output || null,
          obs.usage?.total || null,
          obs.calculatedTotalCost || null,
          obs.level || 'DEFAULT',
          obs.statusMessage || null
        );
      }
    } catch (error) {
      console.warn(`[LangfuseTraceService] Error fetching observations for trace ${traceId}:`, error);
    }
  }

  /**
   * Update cached error_count and has_successful_booking on a session row
   *
   * IMPORTANT: These patterns must be precise to avoid false positives:
   * - Only check tool observations (not ChatPromptTemplate, RunnableAgent, etc.)
   * - For transfers/bookings in LLM output, only check GENERATION type
   */
  private updateSessionCachedStats(sessionId: string, configId: number): void {
    const tools = getToolNamesForConfig(this.db, configId);
    const toolInList = sqlInList(tools.all);

    this.db.prepare(`
      UPDATE production_sessions SET
        error_count = (
          SELECT COUNT(*) FROM production_trace_observations pto
          JOIN production_traces pt ON pto.trace_id = pt.trace_id
          WHERE pt.session_id = ? AND pt.langfuse_config_id = ?
            AND (pto.level = 'ERROR' OR pto.output LIKE '%"success":false%' OR pto.output LIKE '%"success": false%' OR pto.output LIKE '%_debug_error%')
            AND pto.name IN (${toolInList})
        ),
        has_successful_booking = (
          SELECT COUNT(*) > 0 FROM production_trace_observations pto
          JOIN production_traces pt ON pto.trace_id = pt.trace_id
          WHERE pt.session_id = ? AND pt.langfuse_config_id = ?
            AND (
              -- Tool response: Cloud9 API confirmed booking
              (pto.name IN (${sqlInList(tools.schedulingTools)}) AND pto.output LIKE '%Appointment GUID Added%')
              OR (pto.name IN (${sqlInList(tools.schedulingTools)}) AND (pto.output LIKE '%"booked":true%' OR pto.output LIKE '%"booked": true%'))
              -- Tool response: Booking was queued for async processing (appointment created by background queue)
              OR (pto.name IN (${sqlInList(tools.schedulingTools)}) AND (pto.output LIKE '%"anyQueued":true%' OR pto.output LIKE '%"anyQueued": true%'))
              -- NexHealth: appointmentId present and not null
              OR (pto.name IN (${sqlInList(tools.schedulingTools)}) AND pto.output LIKE '%"appointmentId":%' AND pto.output NOT LIKE '%"appointmentId":null%' AND pto.output NOT LIKE '%"appointmentId": null%')
              -- NexHealth K8: booking response has "id":<number>,"patient_id":<number> (appointment object returned directly)
              OR (pto.name IN (${sqlInList(tools.schedulingTools)}) AND pto.output LIKE '%"patient_id":%' AND pto.output LIKE '%"provider_id":%' AND pto.output LIKE '%"start_time":%')
              -- LLM output: Sibling booking confirmation in PAYLOAD (only check GENERATION, not prompts)
              -- Must check for actual GUID value (quoted string), not null
              -- Pattern: "Child1_appointmentGUID": "xxx" vs "Child1_appointmentGUID": null
              OR (pto.type = 'GENERATION' AND pto.output LIKE '%"Child1_appointmentGUID": "%-%-%-%-%" %')
              OR (pto.type = 'GENERATION' AND pto.output LIKE '%"Child2_appointmentGUID": "%-%-%-%-%" %')
              -- NexHealth: Sibling booking confirmation with integer appointmentId in PAYLOAD
              OR (pto.type = 'GENERATION' AND pto.output LIKE '%"Child1_appointmentId":%' AND pto.output NOT LIKE '%"Child1_appointmentId": null%' AND pto.output NOT LIKE '%"Child1_appointmentId":null%')
              OR (pto.type = 'GENERATION' AND pto.output LIKE '%"Child2_appointmentId":%' AND pto.output NOT LIKE '%"Child2_appointmentId": null%' AND pto.output NOT LIKE '%"Child2_appointmentId":null%')
            )
        ),
        has_transfer = (
          SELECT COUNT(*) > 0 FROM production_trace_observations pto
          JOIN production_traces pt ON pto.trace_id = pt.trace_id
          WHERE pt.session_id = ? AND pt.langfuse_config_id = ?
            AND (
              -- === LLM GENERATION outputs for disposition ===
              (pto.type = 'GENERATION' AND (
                -- Ortho: Check Call_Final_Disposition in the payload (most reliable)
                -- Note: Output contains escaped JSON so we match \"Transfer\" pattern
                pto.output LIKE '%\\"Call_Final_Disposition\\": \\"Transfer\\"%'
                OR pto.output LIKE '%\\"Call_Final_Disposition\\":\\"Transfer\\"%'
                -- Ortho: Also check caller_intent for backward compatibility
                OR pto.output LIKE '%\\"caller_intent\\": \\"transfer\\"%'
                OR pto.output LIKE '%\\"caller_intent\\":\\"transfer\\"%'
                -- Dominos: "ET": true in PAYLOAD means escalation transfer
                -- BUT only if telephonyTransferCall is present (not telephonyDisconnectCall which is just a hangup)
                OR (pto.output LIKE '%\\"ET\\": true%' AND pto.output LIKE '%telephonyTransferCall%')
                OR (pto.output LIKE '%\\"ET\\":true%' AND pto.output LIKE '%telephonyTransferCall%')
              ))
              -- === Chord: Escalation tool was invoked (tool SPAN observation, not GENERATION) ===
              OR (pto.name IN (${sqlInList(tools.escalationTools)}) AND pto.type = 'SPAN')
            )
        ),
        has_order = (
          SELECT COUNT(*) > 0 FROM production_trace_observations pto
          JOIN production_traces pt ON pto.trace_id = pt.trace_id
          WHERE pt.session_id = ? AND pt.langfuse_config_id = ?
            AND pto.type = 'GENERATION'
            AND (
              -- Dominos: \"orderConfirmed\": \"true\" in PAYLOAD (stored with literal backslash-quotes)
              pto.output LIKE '%\\"orderConfirmed\\": \\"true\\"%'
              OR pto.output LIKE '%\\"orderConfirmed\\":\\"true\\"%'
              -- Dominos: Agent transcript phrases indicating order processing
              OR LOWER(pto.output) LIKE '%while i process your order%'
              OR LOWER(pto.output) LIKE '%while i place your order%'
              OR LOWER(pto.output) LIKE '%placing your order%'
              OR LOWER(pto.output) LIKE '%processing your order%'
              OR LOWER(pto.output) LIKE '%order has been placed%'
              OR LOWER(pto.output) LIKE '%order is confirmed%'
              OR LOWER(pto.output) LIKE '%finalize your order%'
            )
        )
      WHERE session_id = ? AND langfuse_config_id = ?
    `).run(sessionId, configId, sessionId, configId, sessionId, configId, sessionId, configId, sessionId, configId);
  }

  /**
   * Extract a preview of the user input for display
   */
  private extractInputPreview(input: any): string | null {
    if (!input) return null;

    try {
      // Handle different input formats
      if (typeof input === 'string') {
        return input.slice(0, 200);
      }
      if (typeof input === 'object') {
        // Common patterns: { question: "..." }, { message: "..." }, { input: "..." }
        const text = input.question || input.message || input.input || input.text || input.content;
        if (typeof text === 'string') {
          return text.slice(0, 200);
        }
        // If it's an array of messages, get the last user message
        if (Array.isArray(input)) {
          const userMsg = [...input].reverse().find((m: any) => m.role === 'user');
          if (userMsg?.content) {
            return typeof userMsg.content === 'string' ? userMsg.content.slice(0, 200) : null;
          }
        }
      }
      return JSON.stringify(input).slice(0, 200);
    } catch {
      return null;
    }
  }

  /**
   * Upsert a session record - creates or updates based on session_id
   */
  private upsertSession(params: {
    sessionId: string;
    configId: number;
    userId: string | null;
    environment: string | null;
    traceTimestamp: string;
    cost: number;
    latencyMs: number;
    inputPreview: string | null;
    tags: string[] | null;
    metadata: Record<string, any> | null;
  }): void {
    const { sessionId, configId, userId, environment, traceTimestamp, cost, latencyMs, inputPreview, tags, metadata } = params;

    // Check if session exists
    const existing = this.db.prepare(`
      SELECT id, first_trace_at, trace_count, total_cost, total_latency_ms, input_preview
      FROM production_sessions
      WHERE session_id = ? AND langfuse_config_id = ?
    `).get(sessionId, configId) as any;

    if (existing) {
      // Update existing session - aggregate values
      const newFirstTraceAt = traceTimestamp < existing.first_trace_at ? traceTimestamp : existing.first_trace_at;
      const newLastTraceAt = traceTimestamp > existing.first_trace_at ? traceTimestamp : existing.first_trace_at;

      this.db.prepare(`
        UPDATE production_sessions SET
          first_trace_at = ?,
          last_trace_at = ?,
          trace_count = trace_count + 1,
          total_cost = COALESCE(total_cost, 0) + ?,
          total_latency_ms = COALESCE(total_latency_ms, 0) + ?,
          input_preview = COALESCE(input_preview, ?),
          user_id = COALESCE(user_id, ?),
          environment = COALESCE(environment, ?),
          updated_at = datetime('now')
        WHERE session_id = ? AND langfuse_config_id = ?
      `).run(
        newFirstTraceAt,
        newLastTraceAt,
        cost,
        latencyMs,
        inputPreview,
        userId,
        environment,
        sessionId,
        configId
      );
    } else {
      // Create new session
      this.db.prepare(`
        INSERT OR REPLACE INTO production_sessions (
          session_id, langfuse_config_id, user_id, environment,
          first_trace_at, last_trace_at, trace_count,
          total_cost, total_latency_ms, input_preview,
          tags_json, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        configId,
        userId,
        environment,
        traceTimestamp,
        traceTimestamp,
        cost,
        latencyMs,
        inputPreview,
        tags ? JSON.stringify(tags) : null,
        metadata ? JSON.stringify(metadata) : null
      );
    }
  }

  /**
   * Get last import timestamp for a config
   */
  getLastImportDate(configId: number): string | null {
    const result = this.db.prepare(`
      SELECT MAX(started_at) as last_date
      FROM production_traces
      WHERE langfuse_config_id = ?
    `).get(configId) as any;

    return result?.last_date || null;
  }

  /**
   * Get import history for a config
   */
  getImportHistory(configId?: number, limit: number = 10): any[] {
    let sql = `
      SELECT ih.*, lc.name as config_name
      FROM langfuse_import_history ih
      JOIN langfuse_configs lc ON ih.langfuse_config_id = lc.id
    `;
    const params: any[] = [];

    if (configId) {
      sql += ` WHERE ih.langfuse_config_id = ?`;
      params.push(configId);
    }

    sql += ` ORDER BY ih.import_started_at DESC LIMIT ?`;
    params.push(limit);

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get all production traces with pagination
   */
  getTraces(options: {
    configId?: number;
    limit?: number;
    offset?: number;
    fromDate?: string;
    toDate?: string;
    sessionId?: string;
    callerPhone?: string;
  } = {}): { traces: any[]; total: number } {
    const { configId, limit = 50, offset = 0, fromDate, toDate, sessionId, callerPhone } = options;

    let whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (configId) {
      whereClauses.push('pt.langfuse_config_id = ?');
      params.push(configId);
    }
    if (fromDate) {
      whereClauses.push('pt.started_at >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      const toDateValue = toDate.length === 10 ? toDate + 'T23:59:59.999Z' : toDate;
      whereClauses.push('pt.started_at <= ?');
      params.push(toDateValue);
    }
    if (sessionId) {
      whereClauses.push('pt.session_id = ?');
      params.push(sessionId);
    }
    if (callerPhone) {
      const digits = callerPhone.replace(/\D/g, '').slice(-10);
      whereClauses.push("pt.session_id IN (SELECT ps.session_id FROM production_sessions ps WHERE REPLACE(REPLACE(REPLACE(ps.user_id, '+1', ''), '-', ''), ' ', '') LIKE '%' || ? || '%')");
      params.push(digits);
    }

    const whereClause = whereClauses.join(' AND ');

    // Get traces with error count from observations
    // Count level='ERROR' or tool errors with success:false and _debug_error in output
    // IMPORTANT: Filter to match transformToApiCalls logic in testMonitorController.ts
    // - Exclude internal Langchain traces (RunnableMap, RunnableLambda, etc.)
    // - Only count GENERATION, SPAN, or tool/api related observations
    const allToolNames = configId ? sqlInList(getToolNamesForConfig(this.db, configId).all) : sqlInList(getAllKnownToolNames());
    const sql = `
      SELECT pt.*, lc.name as config_name, lc.host as langfuse_host,
        (SELECT COUNT(*) FROM production_trace_observations pto
         WHERE pto.trace_id = pt.trace_id
         AND (
           -- Error detection criteria
           pto.level = 'ERROR'
           OR pto.output LIKE '%"success":false%' OR pto.output LIKE '%"success": false%'
           OR pto.output LIKE '%_debug_error%'
         )
         AND (
           -- Filter: Only count errors from actual tool calls
           pto.name IN (${allToolNames})
         )
        ) as error_count
      FROM production_traces pt
      JOIN langfuse_configs lc ON pt.langfuse_config_id = lc.id
      WHERE ${whereClause}
      ORDER BY pt.started_at DESC
      LIMIT ? OFFSET ?
    `;
    const traces = this.db.prepare(sql).all(...params, limit, offset);

    // Get total count
    const countSql = `
      SELECT COUNT(*) as count
      FROM production_traces pt
      WHERE ${whereClause}
    `;
    const countResult = this.db.prepare(countSql).get(...params) as any;

    return {
      traces,
      total: countResult?.count || 0,
    };
  }

  /**
   * Get a single trace with its observations
   */
  getTrace(traceId: string): { trace: any; observations: any[] } | null {
    // Include error_count calculated dynamically (same logic as getSession/getSessions)
    const traceToolNames = sqlInList(getAllKnownToolNames());
    const trace = this.db.prepare(`
      SELECT pt.*, lc.name as config_name, lc.host as langfuse_host,
        (SELECT COUNT(*) FROM production_trace_observations pto
         WHERE pto.trace_id = pt.trace_id
           AND (
             -- Error detection criteria
             pto.level = 'ERROR'
             OR pto.output LIKE '%"success":false%' OR pto.output LIKE '%"success": false%'
             OR pto.output LIKE '%_debug_error%'
           )
           AND (
             -- Filter: Only count errors from actual tool calls
             pto.name IN (${traceToolNames})
           )
        ) as error_count
      FROM production_traces pt
      JOIN langfuse_configs lc ON pt.langfuse_config_id = lc.id
      WHERE pt.trace_id = ?
    `).get(traceId);

    if (!trace) return null;

    const observations = this.db.prepare(`
      SELECT * FROM production_trace_observations
      WHERE trace_id = ?
      ORDER BY started_at ASC
    `).all(traceId);

    return { trace, observations };
  }

  /**
   * Import a single trace from Langfuse by ID
   * Used for on-demand import when a trace is requested but not in local DB
   */
  async importSingleTrace(
    traceId: string,
    configId: number
  ): Promise<{ trace: any; observations: any[] } | null> {
    // For sandbox configs (negative IDs), ensure they're synced to langfuse_configs table
    this.ensureSandboxConfigSynced(configId);

    const config = this.getConfig(configId);
    if (!config) {
      throw new Error(`Langfuse config ${configId} not found`);
    }

    if (!config.secretKey) {
      throw new Error(`Langfuse config ${configId} is missing secret key`);
    }

    const authHeader = this.createAuthHeader(config);
    const normalizedHost = this.normalizeHost(config.host);
    const traceUrl = `${normalizedHost}/api/public/traces/${traceId}`;

    console.log(`[LangfuseTraceService] Importing single trace: ${traceId} from ${normalizedHost}`);

    try {
      const response = await fetch(traceUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[LangfuseTraceService] Trace ${traceId} not found in Langfuse`);
          return null;
        }
        const errorText = await response.text();
        throw new Error(`Langfuse API error: ${response.status} - ${errorText}`);
      }

      const traceData = await response.json() as LangfuseTrace & { observations?: LangfuseObservation[] };

      // Use session_id if available, otherwise use trace_id as synthetic session
      const effectiveSessionId = traceData.sessionId || traceData.id;

      // Check if trace already exists with a grouped conv_ session - don't overwrite
      const existingTrace = this.db.prepare(`SELECT * FROM production_traces WHERE trace_id = ?`).get(traceData.id) as any;
      const alreadyGrouped = existingTrace?.session_id?.startsWith('conv_');

      if (alreadyGrouped) {
        // Trace already imported and grouped - return existing data
        const existingObs = this.db.prepare(`SELECT * FROM production_trace_observations WHERE trace_id = ? ORDER BY started_at ASC`).all(traceData.id);
        return { trace: existingTrace, observations: existingObs };
      }

      // Insert trace into database (store original Langfuse session ID for reverse-lookup)
      this.db.prepare(`
        INSERT OR REPLACE INTO production_traces (
          trace_id, langfuse_config_id, session_id, user_id, name,
          input, output, metadata_json, tags_json, release, version,
          total_cost, latency_ms, started_at, ended_at, environment,
          original_session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        traceData.id,
        configId,
        effectiveSessionId,
        traceData.userId || null,
        traceData.name || null,
        traceData.input ? JSON.stringify(traceData.input) : null,
        traceData.output ? JSON.stringify(traceData.output) : null,
        traceData.metadata ? JSON.stringify(traceData.metadata) : null,
        traceData.tags ? JSON.stringify(traceData.tags) : null,
        traceData.release || null,
        traceData.version || null,
        traceData.totalCost || null,
        traceData.latency || null,
        traceData.timestamp,
        null,
        (traceData.metadata as any)?.environment || null,
        effectiveSessionId
      );

      // Upsert session record
      const inputPreview = this.extractInputPreview(traceData.input);
      this.upsertSession({
        sessionId: effectiveSessionId,
        configId,
        userId: traceData.userId || null,
        environment: (traceData.metadata as any)?.environment || null,
        traceTimestamp: traceData.timestamp,
        cost: traceData.totalCost || 0,
        latencyMs: traceData.latency || 0,
        inputPreview,
        tags: traceData.tags || null,
        metadata: traceData.metadata || null,
      });

      // Store observations if included in response
      const observations = traceData.observations || [];
      for (const obs of observations) {
        this.db.prepare(`
          INSERT OR IGNORE INTO production_trace_observations (
            observation_id, trace_id, parent_observation_id, type, name, model,
            input, output, metadata_json, started_at, ended_at,
            completion_start_time, latency_ms, usage_input_tokens,
            usage_output_tokens, usage_total_tokens, cost, level, status_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          obs.id,
          traceId,
          obs.parentObservationId || null,
          obs.type,
          obs.name || null,
          obs.model || null,
          obs.input ? JSON.stringify(obs.input) : null,
          obs.output ? JSON.stringify(obs.output) : null,
          obs.metadata ? JSON.stringify(obs.metadata) : null,
          obs.startTime || null,
          obs.endTime || null,
          obs.completionStartTime || null,
          obs.latency || null,
          obs.usage?.input || null,
          obs.usage?.output || null,
          obs.usage?.total || null,
          obs.calculatedTotalCost || null,
          obs.level || 'DEFAULT',
          obs.statusMessage || null
        );
      }

      console.log(`[LangfuseTraceService] Imported trace ${traceId} with ${observations.length} observations`);

      // Return the trace in the same format as getTrace
      return this.getTrace(traceId);
    } catch (error: any) {
      console.error(`[LangfuseTraceService] Failed to import trace ${traceId}:`, error);
      throw error;
    }
  }

  /**
   * Import all traces for a session from Langfuse by session ID
   * Uses the Langfuse traces API with sessionId filter
   */
  async importSessionTraces(
    sessionId: string,
    configId: number
  ): Promise<{ session: any; traces: any[]; observations: any[] } | null> {
    this.ensureSandboxConfigSynced(configId);

    const config = this.getConfig(configId);
    if (!config) throw new Error(`Langfuse config ${configId} not found`);
    if (!config.secretKey) throw new Error(`Langfuse config ${configId} is missing secret key`);

    const authHeader = this.createAuthHeader(config);
    const normalizedHost = this.normalizeHost(config.host);

    // Fetch all traces for this session
    const params = new URLSearchParams();
    params.append('sessionId', sessionId);
    params.append('limit', '100');
    params.append('orderBy', 'timestamp.asc');

    const tracesUrl = `${normalizedHost}/api/public/traces?${params.toString()}`;
    console.log(`[LangfuseTraceService] Importing session traces: ${sessionId} from ${normalizedHost}`);

    try {
      const response = await fetch(tracesUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        const errorText = await response.text();
        throw new Error(`Langfuse API error: ${response.status} - ${errorText}`);
      }

      const body = await response.json() as { data: Array<LangfuseTrace & { observations?: LangfuseObservation[] }> };
      const tracesData = body.data || [];

      if (tracesData.length === 0) {
        console.warn(`[LangfuseTraceService] No traces found for session ${sessionId}`);
        return null;
      }

      console.log(`[LangfuseTraceService] Found ${tracesData.length} traces for session ${sessionId}`);

      // Check if any of these traces are already imported and grouped into a conv_ session
      // If so, return the grouped session instead of re-importing
      for (const traceData of tracesData) {
        const existingTrace = this.db.prepare(`SELECT session_id FROM production_traces WHERE trace_id = ?`).get(traceData.id) as any;
        if (existingTrace?.session_id?.startsWith('conv_')) {
          console.log(`[LangfuseTraceService] Trace ${traceData.id} already grouped in session ${existingTrace.session_id}, returning grouped session`);
          return this.getSession(existingTrace.session_id, configId);
        }
      }

      // Import each trace and its observations
      for (const traceData of tracesData) {
        const effectiveSessionId = traceData.sessionId || traceData.id;

        this.db.prepare(`
          INSERT OR REPLACE INTO production_traces (
            trace_id, langfuse_config_id, session_id, user_id, name,
            input, output, metadata_json, tags_json, release, version,
            total_cost, latency_ms, started_at, ended_at, environment,
            original_session_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          traceData.id,
          configId,
          effectiveSessionId,
          traceData.userId || null,
          traceData.name || null,
          traceData.input ? JSON.stringify(traceData.input) : null,
          traceData.output ? JSON.stringify(traceData.output) : null,
          traceData.metadata ? JSON.stringify(traceData.metadata) : null,
          traceData.tags ? JSON.stringify(traceData.tags) : null,
          traceData.release || null,
          traceData.version || null,
          traceData.totalCost || null,
          traceData.latency || null,
          traceData.timestamp,
          null,
          (traceData.metadata as any)?.environment || null,
          effectiveSessionId
        );

        // Upsert session record
        const inputPreview = this.extractInputPreview(traceData.input);
        this.upsertSession({
          sessionId: effectiveSessionId,
          configId,
          userId: traceData.userId || null,
          environment: (traceData.metadata as any)?.environment || null,
          traceTimestamp: traceData.timestamp,
          cost: traceData.totalCost || 0,
          latencyMs: traceData.latency || 0,
          inputPreview,
          tags: traceData.tags || null,
          metadata: traceData.metadata || null,
        });

        // Store observations if included
        const observations = traceData.observations || [];
        for (const obs of observations) {
          this.db.prepare(`
            INSERT OR IGNORE INTO production_trace_observations (
              observation_id, trace_id, parent_observation_id, type, name, model,
              input, output, metadata_json, started_at, ended_at,
              completion_start_time, latency_ms, usage_input_tokens,
              usage_output_tokens, usage_total_tokens, cost, level, status_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            obs.id,
            traceData.id,
            obs.parentObservationId || null,
            obs.type,
            obs.name || null,
            obs.model || null,
            obs.input ? JSON.stringify(obs.input) : null,
            obs.output ? JSON.stringify(obs.output) : null,
            obs.metadata ? JSON.stringify(obs.metadata) : null,
            obs.startTime || null,
            obs.endTime || null,
            obs.completionStartTime || null,
            obs.latency || null,
            obs.usage?.input || null,
            obs.usage?.output || null,
            obs.usage?.total || null,
            obs.calculatedTotalCost || null,
            obs.level || 'DEFAULT',
            obs.statusMessage || null
          );
        }
      }

      console.log(`[LangfuseTraceService] Imported session ${sessionId} with ${tracesData.length} traces`);

      // Return the session in the same format as getSession
      return this.getSession(sessionId, configId);
    } catch (error: any) {
      console.error(`[LangfuseTraceService] Failed to import session ${sessionId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // SESSION METHODS - Group traces into conversations
  // ============================================================================

  /**
   * Get all sessions with pagination and filtering
   */
  getSessions(options: {
    configId?: number;
    limit?: number;
    offset?: number;
    fromDate?: string;
    toDate?: string;
    userId?: string;
    callerPhone?: string;
    disposition?: 'bookings' | 'errors' | 'transfers';
  } = {}): { sessions: any[]; total: number } {
    const { configId, limit = 50, offset = 0, fromDate, toDate, userId, callerPhone, disposition } = options;

    let whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (configId) {
      whereClauses.push('ps.langfuse_config_id = ?');
      params.push(configId);
    }
    if (fromDate) {
      whereClauses.push('ps.first_trace_at >= ?');  // Session started on or after fromDate
      params.push(fromDate);
    }
    if (toDate) {
      // If date-only string (YYYY-MM-DD), append end-of-day so sessions from that day are included
      const toDateValue = toDate.length === 10 ? toDate + 'T23:59:59.999Z' : toDate;
      whereClauses.push('ps.last_trace_at <= ?');   // Session ended on or before toDate
      params.push(toDateValue);
    }
    if (userId) {
      whereClauses.push('ps.user_id = ?');
      params.push(userId);
    }
    if (callerPhone) {
      // Normalize to last 10 digits for matching (strip +1 prefix, dashes, spaces)
      const digits = callerPhone.replace(/\D/g, '').slice(-10);
      whereClauses.push("REPLACE(REPLACE(REPLACE(ps.user_id, '+1', ''), '-', ''), ' ', '') LIKE '%' || ? || '%'");
      params.push(digits);
    }

    // Disposition filter - uses same criteria as getProductionSessionStats
    // Use config-specific tool names when configId is available, otherwise all known names
    const sessionTools = configId ? getToolNamesForConfig(this.db, configId) : null;
    const schedToolIn = sessionTools ? sqlInList(sessionTools.schedulingTools) : sqlInList(['schedule_appointment_ortho', 'chord_scheduling_v08', 'chord_scheduling_v07_dev']);
    const escalToolIn = sessionTools ? sqlInList(sessionTools.escalationTools) : sqlInList(['chord_handleEscalation', 'chord_OGHandleEscalation']);

    if (disposition === 'bookings') {
      whereClauses.push(`ps.session_id IN (
        SELECT DISTINCT t.session_id
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name IN (${schedToolIn}) AND o.input LIKE '%book_%'
      )`);
    } else if (disposition === 'errors') {
      whereClauses.push('ps.error_count > 0');
    } else if (disposition === 'transfers') {
      whereClauses.push(`ps.session_id IN (
        SELECT DISTINCT t.session_id
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name IN (${escalToolIn})
      )`);
    }

    const whereClause = whereClauses.join(' AND ');

    // Get sessions with cached error_count and has_successful_booking columns
    // These are pre-computed during import and session rebuild for performance
    const sql = `
      SELECT ps.*, lc.name as config_name, lc.host as langfuse_host
      FROM production_sessions ps
      JOIN langfuse_configs lc ON ps.langfuse_config_id = lc.id
      WHERE ${whereClause}
      ORDER BY ps.last_trace_at DESC
      LIMIT ? OFFSET ?
    `;
    const sessions = this.db.prepare(sql).all(...params, limit, offset) as any[];

    // Enrich booking sessions with patient name + GUID from tool observations
    const bookingSessions = sessions.filter((s: any) => s.has_successful_booking);
    if (bookingSessions.length > 0) {
      const bookingStmt = this.db.prepare(`
        SELECT o.input, o.output FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE t.session_id = ?
          AND o.name IN (${schedToolIn})
          AND o.input LIKE '%book_%'
        LIMIT 1
      `);
      for (const s of bookingSessions) {
        try {
          const row = bookingStmt.get(s.session_id) as any;
          if (row) {
            const inp = JSON.parse(row.input);
            const children = JSON.parse(inp.children || '[]');
            s.patient_names = children.map((c: any) => `${c.firstName} ${c.lastName}`).join(', ');

            // Extract patient GUIDs from the output
            if (row.output) {
              const out = JSON.parse(row.output);
              if (out.children && Array.isArray(out.children)) {
                s.patient_guids = out.children
                  .filter((c: any) => c.patientGUID)
                  .map((c: any) => ({ name: c.firstName, guid: c.patientGUID }));
              }
            }
          }
        } catch { /* ignore parse errors */ }
      }
    }

    // Get total count
    const countSql = `
      SELECT COUNT(*) as count
      FROM production_sessions ps
      WHERE ${whereClause}
    `;
    const countResult = this.db.prepare(countSql).get(...params) as any;

    return {
      sessions,
      total: countResult?.count || 0,
    };
  }

  /**
   * Reverse-lookup: find a session by the original Langfuse session ID
   * Used when rebuildSessions has renamed session_id to a conv_ ID
   */
  getSessionByOriginalId(originalSessionId: string, configId?: number): {
    session: any;
    traces: any[];
    observations: any[];
  } | null {
    // Find any trace that had this original Langfuse session ID
    let query = `SELECT session_id FROM production_traces WHERE original_session_id = ?`;
    const params: any[] = [originalSessionId];
    if (configId) {
      query += ` AND langfuse_config_id = ?`;
      params.push(configId);
    }
    query += ` LIMIT 1`;

    const trace = this.db.prepare(query).get(...params) as any;
    if (!trace || trace.session_id === originalSessionId) return null; // No redirect needed

    console.log(`[LangfuseTraceService] Reverse-lookup: ${originalSessionId} -> ${trace.session_id}`);
    return this.getSession(trace.session_id, configId);
  }

  /**
   * Get a single session with all its traces and observations
   * Returns a combined transcript of the entire conversation
   */
  getSession(sessionId: string, configId?: number): {
    session: any;
    traces: any[];
    observations: any[];
  } | null {
    // Build query for session with error_count calculated dynamically
    // (same logic as getSessions() to ensure consistency)
    // Resolve tool names: use config-specific if configId known, otherwise all known names
    const sessToolNames = configId ? sqlInList(getToolNamesForConfig(this.db, configId).all) : sqlInList(getAllKnownToolNames());
    const sessSchedTools = configId
      ? sqlInList(getToolNamesForConfig(this.db, configId).schedulingTools)
      : sqlInList(['schedule_appointment_ortho', 'chord_scheduling_v08', 'chord_scheduling_v07_dev']);

    let sessionQuery = `
      SELECT ps.*, lc.name as config_name, lc.host as langfuse_host,
        (SELECT COUNT(*) FROM production_trace_observations pto
         JOIN production_traces pt ON pto.trace_id = pt.trace_id
         WHERE pt.session_id = ps.session_id
           AND pt.langfuse_config_id = ps.langfuse_config_id
           AND (
             -- Error detection criteria
             pto.level = 'ERROR'
             OR pto.output LIKE '%"success":false%' OR pto.output LIKE '%"success": false%'
             OR pto.output LIKE '%_debug_error%'
           )
           AND (
             -- Filter: Only count errors from actual tool calls
             pto.name IN (${sessToolNames})
           )
        ) as error_count,
        (SELECT COUNT(*) > 0 FROM production_trace_observations pto
         JOIN production_traces pt ON pto.trace_id = pt.trace_id
         WHERE pt.session_id = ps.session_id
           AND pt.langfuse_config_id = ps.langfuse_config_id
           AND (
             -- Tool response: Cloud9 API confirmed booking
             (pto.name IN (${sessSchedTools}) AND pto.output LIKE '%Appointment GUID Added%')
             OR (pto.name IN (${sessSchedTools}) AND (pto.output LIKE '%"booked":true%' OR pto.output LIKE '%"booked": true%'))
             -- Tool response: Booking was queued for async processing (appointment created by background queue)
             OR (pto.name IN (${sessSchedTools}) AND (pto.output LIKE '%"anyQueued":true%' OR pto.output LIKE '%"anyQueued": true%'))
             -- NexHealth: appointmentId present and not null
             OR (pto.name IN (${sessSchedTools}) AND pto.output LIKE '%"appointmentId":%' AND pto.output NOT LIKE '%"appointmentId":null%' AND pto.output NOT LIKE '%"appointmentId": null%')
             -- NexHealth K8: booking response has "patient_id"/<number>,"provider_id":<number>,"start_time" (appointment object)
             OR (pto.name IN (${sessSchedTools}) AND pto.output LIKE '%"patient_id":%' AND pto.output LIKE '%"provider_id":%' AND pto.output LIKE '%"start_time":%')
             -- LLM output: Sibling booking confirmation in PAYLOAD (only check GENERATION, not prompts)
             -- Must check for actual GUID value (quoted string), not null
             OR (pto.type = 'GENERATION' AND pto.output LIKE '%"Child1_appointmentGUID": "%-%-%-%-%" %')
             OR (pto.type = 'GENERATION' AND pto.output LIKE '%"Child2_appointmentGUID": "%-%-%-%-%" %')
           )) as has_successful_booking,
        (SELECT COUNT(*) > 0 FROM production_trace_observations pto
         JOIN production_traces pt ON pto.trace_id = pt.trace_id
         WHERE pt.session_id = ps.session_id
           AND pt.langfuse_config_id = ps.langfuse_config_id
           -- Only check LLM GENERATION outputs for actual disposition, not system prompt templates
           AND pto.type = 'GENERATION'
           AND (
             -- Check Call_Final_Disposition in the payload (most reliable)
             -- Note: Output contains escaped JSON so we match \"Transfer\" pattern
             pto.output LIKE '%\\"Call_Final_Disposition\\": \\"Transfer\\"%'
             OR pto.output LIKE '%\\"Call_Final_Disposition\\":\\"Transfer\\"%'
             -- Also check caller_intent for backward compatibility
             OR pto.output LIKE '%\\"caller_intent\\": \\"transfer\\"%'
             OR pto.output LIKE '%\\"caller_intent\\":\\"transfer\\"%'
             -- Dominos: "ET": true in PAYLOAD means escalation transfer
             -- BUT only if telephonyTransferCall is present (not telephonyDisconnectCall which is just a hangup)
             OR (pto.output LIKE '%\\"ET\\": true%' AND pto.output LIKE '%telephonyTransferCall%')
             OR (pto.output LIKE '%\\"ET\\":true%' AND pto.output LIKE '%telephonyTransferCall%')
           )) as has_transfer,
        (SELECT COUNT(*) > 0 FROM production_trace_observations pto
         JOIN production_traces pt ON pto.trace_id = pt.trace_id
         WHERE pt.session_id = ps.session_id
           AND pt.langfuse_config_id = ps.langfuse_config_id
           AND pto.type = 'GENERATION'
           AND (
             -- Dominos: "orderConfirmed": "true" in PAYLOAD
             pto.output LIKE '%\\"orderConfirmed\\": \\"true\\"%'
             OR pto.output LIKE '%\\"orderConfirmed\\":\\"true\\"%'
             OR pto.output LIKE '%"orderConfirmed": "true"%'
             OR pto.output LIKE '%"orderConfirmed":"true"%'
             -- Dominos: Agent transcript phrases indicating order processing
             OR LOWER(pto.output) LIKE '%while i process your order%'
             OR LOWER(pto.output) LIKE '%while i place your order%'
             OR LOWER(pto.output) LIKE '%placing your order%'
             OR LOWER(pto.output) LIKE '%processing your order%'
             OR LOWER(pto.output) LIKE '%order has been placed%'
             OR LOWER(pto.output) LIKE '%order is confirmed%'
             OR LOWER(pto.output) LIKE '%finalize your order%'
           )) as has_order
      FROM production_sessions ps
      JOIN langfuse_configs lc ON ps.langfuse_config_id = lc.id
      WHERE ps.session_id = ?
    `;
    const sessionParams: any[] = [sessionId];

    if (configId) {
      sessionQuery += ` AND ps.langfuse_config_id = ?`;
      sessionParams.push(configId);
    }

    const session = this.db.prepare(sessionQuery).get(...sessionParams);

    if (!session) return null;

    // Get all traces in this session, ordered chronologically
    // Include error_count per trace (same logic as session-level error count)
    const traces = this.db.prepare(`
      SELECT pt.*, lc.name as config_name, lc.host as langfuse_host,
        (SELECT COUNT(*) FROM production_trace_observations pto
         WHERE pto.trace_id = pt.trace_id
           AND (
             -- Error detection criteria
             pto.level = 'ERROR'
             OR pto.output LIKE '%"success":false%' OR pto.output LIKE '%"success": false%'
             OR pto.output LIKE '%_debug_error%'
           )
           AND (
             -- Filter: Only count errors from actual tool calls
             pto.name IN (${sessToolNames})
           )
        ) as error_count
      FROM production_traces pt
      JOIN langfuse_configs lc ON pt.langfuse_config_id = lc.id
      WHERE pt.session_id = ?
      ORDER BY pt.started_at ASC
    `).all(sessionId);

    // Get all observations for all traces in the session
    const traceIds = traces.map((t: any) => t.trace_id);
    let observations: any[] = [];

    if (traceIds.length > 0) {
      const placeholders = traceIds.map(() => '?').join(',');
      observations = this.db.prepare(`
        SELECT * FROM production_trace_observations
        WHERE trace_id IN (${placeholders})
        ORDER BY started_at ASC
      `).all(...traceIds);
    }

    return { session, traces, observations };
  }

  /**
   * Rebuild sessions from existing traces
   * Groups traces by user_id + time window (30 minute gap = new conversation)
   * This handles cases where Flowise generates unique session_ids per trace
   */
  rebuildSessions(configId?: number): { sessionsCreated: number; tracesUpdated: number } {
    let sessionsCreated = 0;
    let tracesUpdated = 0;

    const SESSION_GAP_MS = 60 * 1000; // 60 seconds - gap larger than this starts new conversation
    const MAX_CONVERSATION_MS = 5 * 60 * 1000; // 5 minutes max conversation duration for anonymous traces

    // Clear existing sessions for the config (or all if no config specified)
    if (configId) {
      this.db.prepare(`DELETE FROM production_sessions WHERE langfuse_config_id = ?`).run(configId);
    } else {
      this.db.prepare(`DELETE FROM production_sessions`).run();
    }

    // Get all traces ordered by user_id and time
    let tracesQuery = `
      SELECT trace_id, session_id, langfuse_config_id, user_id, environment,
             started_at, total_cost, latency_ms, input
      FROM production_traces
    `;
    const params: any[] = [];

    if (configId) {
      tracesQuery += ` WHERE langfuse_config_id = ?`;
      params.push(configId);
    }

    // Order by user_id first, then by time - this allows us to detect conversation boundaries
    tracesQuery += ` ORDER BY langfuse_config_id, user_id, started_at ASC`;

    const allTraces = this.db.prepare(tracesQuery).all(...params) as any[];

    // Group traces into conversations based on user_id + time gaps
    const conversationGroups: Map<string, any[]> = new Map();
    let currentUserId: string | null = null;
    let currentConfigId: number | null = null;
    let lastTraceTime: Date | null = null;
    let currentConversationId: string | null = null;
    let conversationStartTime: Date | null = null;

    for (const trace of allTraces) {
      const traceTime = new Date(trace.started_at);
      const userId = trace.user_id || 'unknown';
      const cfgId = trace.langfuse_config_id;

      // Start new conversation if:
      // 1. Different user
      // 2. Different config
      // 3. Time gap > SESSION_GAP_MS
      const shouldStartNewConversation =
        userId !== currentUserId ||
        cfgId !== currentConfigId ||
        !lastTraceTime ||
        (traceTime.getTime() - lastTraceTime.getTime() > SESSION_GAP_MS) ||
        (!trace.user_id && conversationStartTime && (traceTime.getTime() - conversationStartTime.getTime() > MAX_CONVERSATION_MS));

      if (shouldStartNewConversation) {
        // Generate a new conversation ID based on user + first trace timestamp
        currentConversationId = `conv_${cfgId}_${userId}_${traceTime.getTime()}`;
        currentUserId = userId;
        currentConfigId = cfgId;
        conversationGroups.set(currentConversationId, []);
        conversationStartTime = traceTime;
      }

      // Add trace to current conversation
      conversationGroups.get(currentConversationId!)!.push(trace);
      lastTraceTime = traceTime;
    }

    // Now create sessions and update traces for each conversation group
    for (const [conversationId, traces] of conversationGroups) {
      if (traces.length === 0) continue;

      const firstTrace = traces[0];
      const lastTrace = traces[traces.length - 1];

      // Calculate aggregated values
      const totalCost = traces.reduce((sum, t) => sum + (t.total_cost || 0), 0);
      const totalLatency = traces.reduce((sum, t) => sum + (t.latency_ms || 0), 0);

      // Safely parse input for preview (handle malformed JSON gracefully)
      let inputPreview: string | null = null;
      if (firstTrace.input) {
        try {
          const parsed = JSON.parse(firstTrace.input);
          inputPreview = this.extractInputPreview(parsed);
        } catch (parseErr) {
          // If JSON parsing fails, use raw input as preview (truncated)
          inputPreview = firstTrace.input.slice(0, 200);
        }
      }

      // Create session record
      this.db.prepare(`
        INSERT OR REPLACE INTO production_sessions (
          session_id, langfuse_config_id, user_id, environment,
          first_trace_at, last_trace_at, trace_count,
          total_cost, total_latency_ms, input_preview
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        conversationId,
        firstTrace.langfuse_config_id,
        firstTrace.user_id,
        firstTrace.environment,
        firstTrace.started_at,
        lastTrace.started_at,
        traces.length,
        totalCost,
        totalLatency,
        inputPreview
      );

      sessionsCreated++;

      // Update all traces in this conversation to use the new computed session_id
      for (const trace of traces) {
        this.db.prepare(`
          UPDATE production_traces
          SET session_id = ?
          WHERE trace_id = ?
        `).run(conversationId, trace.trace_id);
        tracesUpdated++;
      }

      // Update cached stats (has_transfer, has_successful_booking, error_count) for this session
      this.updateSessionCachedStats(conversationId, firstTrace.langfuse_config_id);
    }

    console.log(`[LangfuseTraceService] Rebuilt sessions: ${sessionsCreated} conversations from ${tracesUpdated} traces`);

    return { sessionsCreated, tracesUpdated };
  }

  /**
   * Incrementally rebuild sessions for specific users only
   * Much faster than full rebuild - only touches affected users' data
   */
  rebuildSessionsForUsers(configId: number, userIds: string[]): { sessionsCreated: number; tracesUpdated: number } {
    if (userIds.length === 0) return { sessionsCreated: 0, tracesUpdated: 0 };

    let sessionsCreated = 0;
    let tracesUpdated = 0;

    const SESSION_GAP_MS = 60 * 1000; // 60 seconds gap = new conversation
    const MAX_CONVERSATION_MS = 5 * 60 * 1000; // 5 minutes max for anonymous

    console.log(`[LangfuseTraceService] Incremental rebuild for ${userIds.length} users in config ${configId}`);

    // Process each affected user
    for (const userId of userIds) {
      // Delete existing sessions for this user only
      this.db.prepare(`
        DELETE FROM production_sessions
        WHERE langfuse_config_id = ? AND (user_id = ? OR (user_id IS NULL AND ? = 'unknown'))
      `).run(configId, userId, userId);

      // Get all traces for this user ordered by time
      const userTraces = this.db.prepare(`
        SELECT trace_id, session_id, langfuse_config_id, user_id, environment,
               started_at, total_cost, latency_ms, input
        FROM production_traces
        WHERE langfuse_config_id = ? AND (user_id = ? OR (user_id IS NULL AND ? = 'unknown'))
        ORDER BY started_at ASC
      `).all(configId, userId, userId) as any[];

      if (userTraces.length === 0) continue;

      // Group into conversations
      let currentConversationId: string | null = null;
      let lastTraceTime: Date | null = null;
      let conversationStartTime: Date | null = null;
      const conversationGroups: Map<string, any[]> = new Map();

      for (const trace of userTraces) {
        const traceTime = new Date(trace.started_at);

        const shouldStartNew =
          !lastTraceTime ||
          (traceTime.getTime() - lastTraceTime.getTime() > SESSION_GAP_MS) ||
          (userId === 'unknown' && conversationStartTime &&
           (traceTime.getTime() - conversationStartTime.getTime() > MAX_CONVERSATION_MS));

        if (shouldStartNew) {
          currentConversationId = `conv_${configId}_${userId}_${traceTime.getTime()}`;
          conversationGroups.set(currentConversationId, []);
          conversationStartTime = traceTime;
        }

        conversationGroups.get(currentConversationId!)!.push(trace);
        lastTraceTime = traceTime;
      }

      // Create sessions and update traces
      for (const [conversationId, traces] of conversationGroups) {
        if (traces.length === 0) continue;

        const firstTrace = traces[0];
        const lastTrace = traces[traces.length - 1];
        const totalCost = traces.reduce((sum, t) => sum + (t.total_cost || 0), 0);
        const totalLatency = traces.reduce((sum, t) => sum + (t.latency_ms || 0), 0);

        let inputPreview: string | null = null;
        if (firstTrace.input) {
          try {
            const parsed = JSON.parse(firstTrace.input);
            inputPreview = this.extractInputPreview(parsed);
          } catch {
            inputPreview = firstTrace.input.slice(0, 200);
          }
        }

        // Create session
        this.db.prepare(`
          INSERT OR REPLACE INTO production_sessions (
            session_id, langfuse_config_id, user_id, environment,
            first_trace_at, last_trace_at, trace_count,
            total_cost, total_latency_ms, input_preview
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          conversationId,
          firstTrace.langfuse_config_id,
          firstTrace.user_id,
          firstTrace.environment,
          firstTrace.started_at,
          lastTrace.started_at,
          traces.length,
          totalCost,
          totalLatency,
          inputPreview
        );

        sessionsCreated++;

        // Update traces to use new session_id
        for (const trace of traces) {
          this.db.prepare(`
            UPDATE production_traces SET session_id = ? WHERE trace_id = ?
          `).run(conversationId, trace.trace_id);
          tracesUpdated++;
        }

        // Update cached stats for this session
        this.updateSessionCachedStats(conversationId, configId);
      }
    }

    console.log(`[LangfuseTraceService] Incremental rebuild: ${sessionsCreated} sessions, ${tracesUpdated} traces for ${userIds.length} users`);

    return { sessionsCreated, tracesUpdated };
  }

  /**
   * Refresh observations for all traces in a session from Langfuse
   * Uses INSERT OR REPLACE to pick up new/updated observations,
   * then recomputes cached session stats (has_successful_booking, etc.)
   */
  async refreshSessionObservations(
    sessionId: string,
    configId: number
  ): Promise<{ session: any; traces: any[]; observations: any[] } | null> {
    const config = this.getConfig(configId);
    if (!config) throw new Error(`Langfuse config ${configId} not found`);
    if (!config.secretKey) throw new Error(`Langfuse config ${configId} is missing secret key`);

    // Get all traces for this session
    const traces = this.db.prepare(`
      SELECT trace_id FROM production_traces
      WHERE session_id = ? AND langfuse_config_id = ?
    `).all(sessionId, configId) as { trace_id: string }[];

    if (traces.length === 0) return null;

    const authHeader = this.createAuthHeader(config);
    const normalizedHost = this.normalizeHost(config.host);

    console.log(`[LangfuseTraceService] Refreshing observations for session ${sessionId} (${traces.length} traces)`);

    for (const { trace_id } of traces) {
      const traceUrl = `${normalizedHost}/api/public/traces/${trace_id}`;

      try {
        const response = await fetch(traceUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          console.warn(`[LangfuseTraceService] Failed to refresh trace ${trace_id}: ${response.status}`);
          continue;
        }

        const traceData = await response.json() as { observations?: LangfuseObservation[] };
        const observations = traceData.observations || [];

        for (const obs of observations) {
          this.db.prepare(`
            INSERT OR REPLACE INTO production_trace_observations (
              observation_id, trace_id, parent_observation_id, type, name, model,
              input, output, metadata_json, started_at, ended_at,
              completion_start_time, latency_ms, usage_input_tokens,
              usage_output_tokens, usage_total_tokens, cost, level, status_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            obs.id,
            trace_id,
            obs.parentObservationId || null,
            obs.type,
            obs.name || null,
            obs.model || null,
            obs.input ? JSON.stringify(obs.input) : null,
            obs.output ? JSON.stringify(obs.output) : null,
            obs.metadata ? JSON.stringify(obs.metadata) : null,
            obs.startTime || null,
            obs.endTime || null,
            obs.completionStartTime || null,
            obs.latency || null,
            obs.usage?.input || null,
            obs.usage?.output || null,
            obs.usage?.total || null,
            obs.calculatedTotalCost || null,
            obs.level || 'DEFAULT',
            obs.statusMessage || null
          );
        }
      } catch (error) {
        console.warn(`[LangfuseTraceService] Error refreshing observations for trace ${trace_id}:`, error);
      }
    }

    // Recompute cached stats
    this.updateSessionCachedStats(sessionId, configId);

    console.log(`[LangfuseTraceService] Refreshed session ${sessionId} observations`);

    // Return updated session data
    return this.getSession(sessionId, configId);
  }

  // ============================================================================
  // TRACE INSIGHTS
  // ============================================================================

  /**
   * Get comprehensive trace insights for a date range
   */
  getTraceInsights(configId: number, fromDate: string, toDate: string): any {
    console.log(`[LangfuseTraceService] Getting insights for config ${configId} from ${fromDate} to ${toDate}`);

    const insightTools = getToolNamesForConfig(this.db, configId);
    const insightToolInList = sqlInList(insightTools.all);
    const daysCount = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24));

    // Overview counts
    const overviewRow = this.db.prepare(`
      SELECT
        COUNT(*) as total_traces,
        COUNT(DISTINCT session_id) as total_sessions,
        COALESCE(SUM(total_cost), 0) as total_cost
      FROM production_traces
      WHERE started_at >= ? AND started_at <= ?
        AND langfuse_config_id = ?
    `).get(fromDate, toDate, configId) as any;

    const totalObservations = (this.db.prepare(`
      SELECT COUNT(*) as cnt
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
    `).get(fromDate, toDate, configId) as any)?.cnt || 0;

    // Successful bookings
    const successfulBookings = (this.db.prepare(`
      SELECT COUNT(*) as cnt
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE (
        o.output LIKE '%Appointment GUID Added%'
        OR (o.name IN (${sqlInList(insightTools.schedulingTools)}) AND o.output LIKE '%"patient_id":%' AND o.output LIKE '%"provider_id":%' AND o.output LIKE '%"start_time":%')
      )
        AND t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
    `).get(fromDate, toDate, configId) as any)?.cnt || 0;

    // Patients created
    const patientsCreated = (this.db.prepare(`
      SELECT COUNT(*) as cnt
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE o.output LIKE '%Patient Added%'
        AND t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
    `).get(fromDate, toDate, configId) as any)?.cnt || 0;

    const totalSessions = overviewRow?.total_sessions || 0;
    const totalCost = overviewRow?.total_cost || 0;

    // ========== ISSUE: Empty patientGUID ==========
    const emptyGuidSessions = this.db.prepare(`
      SELECT DISTINCT t.session_id
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE o.name IN (${sqlInList(insightTools.schedulingTools)})
        AND o.input LIKE '%"patientGUID":""%'
        AND t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
    `).all(fromDate, toDate, configId) as any[];

    // Check how many had patient creation in same trace
    const emptyGuidWithPatientCreate = (this.db.prepare(`
      SELECT COUNT(DISTINCT o.trace_id) as cnt
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE o.name IN (${sqlInList(insightTools.schedulingTools)})
        AND o.input LIKE '%"patientGUID":""%'
        AND t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
        AND EXISTS (
          SELECT 1 FROM production_trace_observations o2
          WHERE o2.trace_id = o.trace_id
            AND o2.output LIKE '%Patient Added%'
        )
    `).get(fromDate, toDate, configId) as any)?.cnt || 0;

    // ========== ISSUE: API Errors ==========
    const apiErrorSessions = this.db.prepare(`
      SELECT DISTINCT t.session_id, o.output
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE (o.output LIKE '%502%' OR o.output LIKE '%500%')
        AND o.name IN (${insightToolInList})
        AND t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
    `).all(fromDate, toDate, configId) as any[];

    let http502 = 0, http500 = 0, httpOther = 0;
    const apiErrorSessionIds = new Set<string>();
    apiErrorSessions.forEach(row => {
      if (row.session_id) apiErrorSessionIds.add(row.session_id);
      if (row.output?.includes('502')) http502++;
      else if (row.output?.includes('500')) http500++;
      else httpOther++;
    });

    // ========== ISSUE: Slot Fetch Failures ==========
    const slotAttempts = (this.db.prepare(`
      SELECT COUNT(*) as cnt
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE o.name IN (${sqlInList(insightTools.schedulingTools)})
        AND o.input LIKE '%"action":"slots"%'
        AND t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
    `).get(fromDate, toDate, configId) as any)?.cnt || 0;

    const slotFailures = this.db.prepare(`
      SELECT DISTINCT t.session_id
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE o.name IN (${sqlInList(insightTools.schedulingTools)})
        AND o.output LIKE '%"success":false%'
        AND t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
    `).all(fromDate, toDate, configId) as any[];

    // ========== ISSUE: Missing Slot Data ==========
    const missingSlotSessions = this.db.prepare(`
      SELECT DISTINCT t.session_id
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE o.output LIKE '%missing_slot_data%'
        AND t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
    `).all(fromDate, toDate, configId) as any[];

    // Check recovery rate
    let recovered = 0, notRecovered = 0;
    missingSlotSessions.forEach(row => {
      const hasBooking = this.db.prepare(`
        SELECT 1 FROM production_traces t
        JOIN production_trace_observations o ON t.trace_id = o.trace_id
        WHERE t.session_id = ?
          AND (
            o.output LIKE '%Appointment GUID Added%'
            OR (o.name IN (${sqlInList(insightTools.schedulingTools)}) AND o.output LIKE '%"patient_id":%' AND o.output LIKE '%"provider_id":%' AND o.output LIKE '%"start_time":%')
          )
        LIMIT 1
      `).get(row.session_id);
      if (hasBooking) recovered++;
      else notRecovered++;
    });

    // ========== ISSUE: Session Abandonment (1-3 turns) ==========
    const abandonedSessions = this.db.prepare(`
      SELECT session_id
      FROM production_sessions
      WHERE trace_count <= 3
        AND last_trace_at >= ? AND last_trace_at <= ?
        AND langfuse_config_id = ?
    `).all(fromDate, toDate, configId) as any[];

    // ========== ISSUE: Excessive Confirmations ==========
    const excessiveConfirmSessions = this.db.prepare(`
      SELECT session_id, COUNT(*) as confirm_count
      FROM production_traces
      WHERE (output LIKE '%Is that correct%' OR output LIKE '%is that right%')
        AND started_at >= ? AND started_at <= ?
        AND langfuse_config_id = ?
      GROUP BY session_id
      HAVING COUNT(*) >= 10
    `).all(fromDate, toDate, configId) as any[];

    const avgConfirmations = excessiveConfirmSessions.length > 0
      ? excessiveConfirmSessions.reduce((sum, r) => sum + r.confirm_count, 0) / excessiveConfirmSessions.length
      : 0;

    // ========== ISSUE: Long Sessions (19+ turns) ==========
    const longSessions = this.db.prepare(`
      SELECT session_id, trace_count, total_cost
      FROM production_sessions
      WHERE trace_count > 18
        AND last_trace_at >= ? AND last_trace_at <= ?
        AND langfuse_config_id = ?
    `).all(fromDate, toDate, configId) as any[];

    const longSessionCostImpact = longSessions.reduce((sum, r) => sum + (r.total_cost || 0), 0);
    const avgLongSessionTurns = longSessions.length > 0
      ? longSessions.reduce((sum, r) => sum + r.trace_count, 0) / longSessions.length
      : 0;

    // ========== Session Length Distribution ==========
    const sessionDistribution = this.db.prepare(`
      SELECT
        CASE
          WHEN trace_count <= 3 THEN 'abandoned'
          WHEN trace_count <= 10 THEN 'partial'
          WHEN trace_count <= 18 THEN 'complete'
          ELSE 'long'
        END as category,
        COUNT(*) as count,
        COALESCE(AVG(total_cost), 0) as avg_cost,
        COALESCE(SUM(total_cost), 0) as total_cost,
        GROUP_CONCAT(session_id) as session_ids
      FROM production_sessions
      WHERE last_trace_at >= ? AND last_trace_at <= ?
        AND langfuse_config_id = ?
      GROUP BY category
    `).all(fromDate, toDate, configId) as any[];

    const distMap: Record<string, any> = {};
    sessionDistribution.forEach(row => {
      distMap[row.category] = {
        count: row.count,
        avgCost: row.avg_cost,
        totalCost: row.total_cost,
        sessionIds: row.session_ids ? row.session_ids.split(',') : []
      };
    });

    // ========== Tool Call Stats ==========
    const toolStats = this.db.prepare(`
      SELECT o.name, COUNT(*) as count, AVG(o.latency_ms) as avg_latency
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE o.name IN (${insightToolInList})
        AND t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
      GROUP BY o.name
    `).all(fromDate, toDate, configId) as any[];

    const toolStatsMap: Record<string, any> = {};
    toolStats.forEach(row => {
      toolStatsMap[row.name] = { count: row.count, avgLatencyMs: row.avg_latency || 0 };
    });

    // ========== Escalations ==========
    const escalations = this.db.prepare(`
      SELECT DISTINCT t.session_id, o.input
      FROM production_trace_observations o
      JOIN production_traces t ON o.trace_id = t.trace_id
      WHERE o.name IN (${sqlInList(insightTools.escalationTools)})
        AND t.started_at >= ? AND t.started_at <= ?
        AND t.langfuse_config_id = ?
    `).all(fromDate, toDate, configId) as any[];

    const escalationReasons: Record<string, number> = {};
    escalations.forEach(row => {
      try {
        const inp = typeof row.input === 'string' ? JSON.parse(row.input) : row.input;
        const reason = inp?.escalationIntent || 'Unknown';
        escalationReasons[reason] = (escalationReasons[reason] || 0) + 1;
      } catch (e) {}
    });

    // Helper to aggregate tool stats across multiple tool name variants
    function sumToolStats(map: Record<string, { count: number; avgLatencyMs: number }>, names: string[]) {
      let total = { count: 0, avgLatencyMs: 0 };
      let totalLatency = 0;
      for (const n of names) {
        const s = map[n];
        if (s) { total.count += s.count; totalLatency += s.avgLatencyMs * s.count; }
      }
      if (total.count > 0) total.avgLatencyMs = Math.round(totalLatency / total.count);
      return total;
    }

    // Build response
    return {
      timeframe: {
        fromDate,
        toDate,
        daysCount
      },
      overview: {
        totalTraces: overviewRow?.total_traces || 0,
        totalSessions,
        totalObservations,
        successfulBookings,
        patientsCreated,
        patientToBookingConversion: patientsCreated > 0
          ? Math.round((successfulBookings / patientsCreated) * 1000) / 10
          : 0,
        totalCost,
        avgCostPerSession: totalSessions > 0 ? totalCost / totalSessions : 0
      },
      issues: {
        emptyPatientGuid: {
          count: emptyGuidSessions.length,
          sessionIds: emptyGuidSessions.map(r => r.session_id).filter(Boolean),
          description: 'LLM passes empty patientGUID to book_child call',
          patientsCreatedInSameTrace: emptyGuidWithPatientCreate
        },
        apiErrors: {
          count: apiErrorSessions.length,
          sessionIds: Array.from(apiErrorSessionIds),
          description: 'Cloud9 API gateway errors (502/500)',
          breakdown: { http502, http500, other: httpOther }
        },
        slotFetchFailures: {
          count: slotFailures.length,
          sessionIds: slotFailures.map(r => r.session_id).filter(Boolean),
          description: 'Slot fetch returned success:false',
          failureRate: slotAttempts > 0 ? Math.round((slotFailures.length / slotAttempts) * 1000) / 10 : 0,
          totalAttempts: slotAttempts
        },
        missingSlotData: {
          count: missingSlotSessions.length,
          sessionIds: missingSlotSessions.map(r => r.session_id).filter(Boolean),
          description: 'Booking failed with missing_slot_data error',
          recoveryRate: (recovered + notRecovered) > 0
            ? Math.round((recovered / (recovered + notRecovered)) * 1000) / 10
            : 0,
          recovered,
          notRecovered
        },
        sessionAbandonment: {
          count: abandonedSessions.length,
          sessionIds: abandonedSessions.map(r => r.session_id).filter(Boolean),
          description: 'Sessions with 1-3 turns (likely abandoned)',
          rate: totalSessions > 0 ? Math.round((abandonedSessions.length / totalSessions) * 1000) / 10 : 0
        },
        excessiveConfirmations: {
          count: excessiveConfirmSessions.length,
          sessionIds: excessiveConfirmSessions.map(r => r.session_id).filter(Boolean),
          description: 'Sessions with 10+ confirmation prompts',
          avgConfirmations: Math.round(avgConfirmations * 10) / 10,
          threshold: 10
        },
        longSessions: {
          count: longSessions.length,
          sessionIds: longSessions.map(r => r.session_id).filter(Boolean),
          description: 'Sessions with 19+ turns',
          avgTurns: Math.round(avgLongSessionTurns * 10) / 10,
          costImpact: longSessionCostImpact
        }
      },
      sessionLengthDistribution: {
        abandoned: {
          count: distMap.abandoned?.count || 0,
          range: '1-3 turns',
          sessionIds: distMap.abandoned?.sessionIds || []
        },
        partial: {
          count: distMap.partial?.count || 0,
          range: '4-10 turns',
          sessionIds: distMap.partial?.sessionIds || []
        },
        complete: {
          count: distMap.complete?.count || 0,
          range: '11-18 turns',
          sessionIds: distMap.complete?.sessionIds || []
        },
        long: {
          count: distMap.long?.count || 0,
          range: '19+ turns',
          sessionIds: distMap.long?.sessionIds || []
        }
      },
      costAnalysis: {
        bySessionType: {
          abandoned: {
            count: distMap.abandoned?.count || 0,
            avgCost: distMap.abandoned?.avgCost || 0,
            totalCost: distMap.abandoned?.totalCost || 0,
            sessionIds: distMap.abandoned?.sessionIds || []
          },
          partial: {
            count: distMap.partial?.count || 0,
            avgCost: distMap.partial?.avgCost || 0,
            totalCost: distMap.partial?.totalCost || 0,
            sessionIds: distMap.partial?.sessionIds || []
          },
          complete: {
            count: distMap.complete?.count || 0,
            avgCost: distMap.complete?.avgCost || 0,
            totalCost: distMap.complete?.totalCost || 0,
            sessionIds: distMap.complete?.sessionIds || []
          },
          long: {
            count: distMap.long?.count || 0,
            avgCost: distMap.long?.avgCost || 0,
            totalCost: distMap.long?.totalCost || 0,
            sessionIds: distMap.long?.sessionIds || []
          }
        },
        totalCost
      },
      toolCallStats: {
        patientTool: sumToolStats(toolStatsMap, insightTools.patientTools),
        schedulingTool: sumToolStats(toolStatsMap, insightTools.schedulingTools),
        currentDateTime: sumToolStats(toolStatsMap, insightTools.dateTimeTools),
        handleEscalation: sumToolStats(toolStatsMap, insightTools.escalationTools),
        // Include actual tool names for frontend display
        toolNames: {
          patientTool: insightTools.patientTool,
          schedulingTool: insightTools.schedulingTool,
          dateTimeTool: insightTools.dateTimeTool,
          escalationTool: insightTools.escalationTool,
        }
      },
      escalations: {
        count: escalations.length,
        sessionIds: escalations.map(r => r.session_id).filter(Boolean),
        reasons: Object.entries(escalationReasons).map(([reason, count]) => ({ reason, count }))
      }
    };
  }
}

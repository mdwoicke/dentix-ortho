/**
 * Alert Engine Service
 * Evaluates metrics from trace data and determines which alerts should trigger
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import {
  AlertErrorDetail,
  AlertResolution,
  API_FAILURE_RESOLUTIONS,
  GATEWAY_ERROR_RESOLUTIONS,
  PAYLOAD_LEAK_RESOLUTION,
  EMPTY_GUID_RESOLUTION,
  SLOT_FAILURE_RESOLUTION,
  ESCALATION_RESOLUTION,
  CONVERSATION_LOOP_RESOLUTION,
  CACHE_STALENESS_RESOLUTION,
} from '../types/alerts';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface HeartbeatAlert {
  id: number;
  name: string;
  description?: string;
  metricType: string;
  conditionOperator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  thresholdValue: number;
  thresholdUnit?: string;
  lookbackMinutes: number;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  slackChannel?: string;
  cooldownMinutes: number;
  environment?: string;
  checkIntervalMinutes: number;
  lastCheckedAt?: string;
}

export interface MetricResult {
  value: number;
  sampleTraceIds?: string[];
  additionalInfo?: Record<string, any>;
}

export interface EvaluatedAlert {
  alert: HeartbeatAlert;
  metricValue: number;
  triggered: boolean;
  suppressed: boolean;
  suppressionReason?: string;
  sampleTraceIds?: string[];
  additionalInfo?: Record<string, any>;
}

// ============================================================================
// ALERT ENGINE SERVICE
// ============================================================================

export class AlertEngine {
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  /**
   * Get all enabled alerts from the database
   */
  getEnabledAlerts(): HeartbeatAlert[] {
    const rows = this.db.prepare(`
      SELECT * FROM heartbeat_alerts WHERE enabled = 1
      ORDER BY severity DESC, name ASC
    `).all() as any[];

    return rows.map(row => this.mapRowToAlert(row));
  }

  /**
   * Get alerts that are due for checking based on their individual check intervals
   */
  getDueAlerts(): HeartbeatAlert[] {
    const now = new Date();

    const rows = this.db.prepare(`
      SELECT * FROM heartbeat_alerts WHERE enabled = 1
      ORDER BY severity DESC, name ASC
    `).all() as any[];

    return rows.filter(row => {
      // If never checked, it's due
      if (!row.last_checked_at) return true;

      // Check if enough time has passed since last check
      const lastChecked = new Date(row.last_checked_at.replace(' ', 'T') + 'Z');
      const intervalMs = (row.check_interval_minutes || 5) * 60 * 1000;
      const nextCheckTime = new Date(lastChecked.getTime() + intervalMs);

      return now >= nextCheckTime;
    }).map(row => this.mapRowToAlert(row));
  }

  /**
   * Map a database row to a HeartbeatAlert object
   */
  private mapRowToAlert(row: any): HeartbeatAlert {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      metricType: row.metric_type,
      conditionOperator: row.condition_operator,
      thresholdValue: row.threshold_value,
      thresholdUnit: row.threshold_unit,
      lookbackMinutes: row.lookback_minutes,
      severity: row.severity,
      enabled: row.enabled === 1,
      slackChannel: row.slack_channel,
      cooldownMinutes: row.cooldown_minutes,
      environment: row.environment,
      checkIntervalMinutes: row.check_interval_minutes || 5,
      lastCheckedAt: row.last_checked_at,
    };
  }

  /**
   * Update the last_checked_at timestamp for an alert
   */
  markAlertChecked(alertId: number): void {
    this.db.prepare(`
      UPDATE heartbeat_alerts SET last_checked_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(alertId);
  }

  /**
   * Evaluate all enabled alerts and return results
   * @param configId - Langfuse config to use
   * @param onlyDue - If true, only evaluate alerts that are due based on their check_interval_minutes
   * @param markChecked - If true, update last_checked_at after evaluating each alert
   */
  async evaluateAlerts(configId?: number, onlyDue: boolean = false, markChecked: boolean = false): Promise<EvaluatedAlert[]> {
    const alerts = onlyDue ? this.getDueAlerts() : this.getEnabledAlerts();
    const results: EvaluatedAlert[] = [];

    // Get default config if not specified
    let resolvedConfigId = configId;
    if (!resolvedConfigId) {
      const defaultConfig = this.db.prepare(`
        SELECT id FROM langfuse_configs WHERE is_default = 1 LIMIT 1
      `).get() as any;
      resolvedConfigId = defaultConfig?.id || 1;
    }

    for (const alert of alerts) {
      const metricResult = await this.getMetricValue(alert.metricType, alert.lookbackMinutes, resolvedConfigId as number);
      const triggered = this.evaluateCondition(metricResult.value, alert.conditionOperator, alert.thresholdValue);

      let suppressed = false;
      let suppressionReason: string | undefined;

      if (triggered) {
        // Check cooldown
        const cooldownResult = this.isInCooldown(alert.id, alert.cooldownMinutes);
        if (cooldownResult.inCooldown) {
          suppressed = true;
          suppressionReason = `In cooldown until ${cooldownResult.cooldownUntil}`;
        }
      }

      // Mark this alert as checked
      if (markChecked) {
        this.markAlertChecked(alert.id);
      }

      results.push({
        alert,
        metricValue: metricResult.value,
        triggered,
        suppressed,
        suppressionReason,
        sampleTraceIds: metricResult.sampleTraceIds,
        additionalInfo: metricResult.additionalInfo,
      });
    }

    return results;
  }

  /**
   * Check if an alert is in its cooldown period
   */
  isInCooldown(alertId: number, cooldownMinutes: number): { inCooldown: boolean; cooldownUntil?: string } {
    const row = this.db.prepare(`
      SELECT triggered_at FROM heartbeat_alert_history
      WHERE alert_id = ? AND suppressed = 0
      ORDER BY triggered_at DESC LIMIT 1
    `).get(alertId) as any;

    if (!row) {
      return { inCooldown: false };
    }

    // SQLite CURRENT_TIMESTAMP returns UTC time but without timezone indicator
    // We need to parse it as UTC by converting to ISO format with 'Z' suffix
    const triggeredAtStr = row.triggered_at.replace(' ', 'T') + 'Z';
    const lastTrigger = new Date(triggeredAtStr);
    const cooldownUntil = new Date(lastTrigger.getTime() + cooldownMinutes * 60 * 1000);
    const now = new Date();

    if (now < cooldownUntil) {
      return { inCooldown: true, cooldownUntil: cooldownUntil.toISOString() };
    }

    return { inCooldown: false };
  }

  /**
   * Evaluate a condition against a threshold
   */
  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  /**
   * Get the current value of a metric
   */
  async getMetricValue(metricType: string, lookbackMinutes: number, configId: number): Promise<MetricResult> {
    const now = new Date();
    const fromDate = new Date(now.getTime() - lookbackMinutes * 60 * 1000).toISOString();
    const toDate = now.toISOString();

    const evaluator = this.metricEvaluators[metricType];
    if (!evaluator) {
      console.warn(`[AlertEngine] Unknown metric type: ${metricType}`);
      return { value: 0 };
    }

    return await evaluator.call(this, fromDate, toDate, configId);
  }

  // ========================================================================
  // HELPER FUNCTIONS FOR ERROR EXTRACTION
  // ========================================================================

  /**
   * Safely parse JSON, returning null on failure
   */
  private safeJsonParse(str: string | null | undefined): any {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  /**
   * Extract error message from API output
   */
  private extractErrorMessage(output: any): string {
    if (!output) return 'No output';
    if (typeof output === 'string') {
      // Try to parse if it's a JSON string
      try {
        output = JSON.parse(output);
      } catch {
        // Check for common error patterns in string
        if (output.includes('502')) return '502 Bad Gateway';
        if (output.includes('500')) return '500 Internal Server Error';
        return output.substring(0, 200);
      }
    }
    if (output.error) return output.error;
    if (output.message) return output.message;
    if (output.data?.error) return output.data.error;
    if (output.success === false) {
      return output.data?.message || output.errorMessage || 'API returned success:false';
    }
    return 'Unknown error';
  }

  /**
   * Determine resolution for API failures based on error patterns
   */
  private getApiFailureResolution(errorDetails: AlertErrorDetail[]): AlertResolution {
    const messages = errorDetails.map(e => (e.errorMessage || '').toLowerCase());

    if (messages.some(m => m.includes('patient not found') || m.includes('patientguid'))) {
      return API_FAILURE_RESOLUTIONS.patient_not_found;
    }
    if (messages.some(m => m.includes('slot') && (m.includes('available') || m.includes('taken')))) {
      return API_FAILURE_RESOLUTIONS.slot_unavailable;
    }
    if (messages.some(m => m.includes('appointment type') || m.includes('appointmenttypeguid'))) {
      return API_FAILURE_RESOLUTIONS.invalid_appointment_type;
    }
    if (messages.some(m => m.includes('provider') && (m.includes('unavailable') || m.includes('not found')))) {
      return API_FAILURE_RESOLUTIONS.provider_unavailable;
    }

    return API_FAILURE_RESOLUTIONS.default;
  }

  /**
   * Determine resolution for gateway errors based on status codes
   */
  private getGatewayErrorResolution(errorDetails: AlertErrorDetail[]): AlertResolution {
    const messages = errorDetails.map(e => (e.errorMessage || '').toLowerCase());

    if (messages.some(m => m.includes('502'))) {
      return GATEWAY_ERROR_RESOLUTIONS['502'];
    }
    if (messages.some(m => m.includes('500'))) {
      return GATEWAY_ERROR_RESOLUTIONS['500'];
    }
    if (messages.some(m => m.includes('timeout') || m.includes('timed out'))) {
      return GATEWAY_ERROR_RESOLUTIONS.timeout;
    }

    return GATEWAY_ERROR_RESOLUTIONS.default;
  }

  /**
   * Metric evaluators - each returns a MetricResult for the given time range
   */
  private metricEvaluators: Record<string, (fromDate: string, toDate: string, configId: number) => MetricResult | Promise<MetricResult>> = {
    // Count of API errors (502/500)
    api_errors: (fromDate, toDate, configId) => {
      const rows = this.db.prepare(`
        SELECT DISTINCT t.session_id, t.trace_id
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE (o.output LIKE '%502%' OR o.output LIKE '%500%')
          AND o.name = 'schedule_appointment_ortho'
          AND t.started_at >= ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
      `).all(fromDate, toDate, configId) as any[];

      return {
        value: rows.length,
        sampleTraceIds: rows.slice(0, 5).map(r => r.trace_id).filter(Boolean),
      };
    },

    // Average tool latency in ms
    avg_latency: (fromDate, toDate, configId) => {
      const row = this.db.prepare(`
        SELECT AVG(o.latency_ms) as avg_latency
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name IN ('chord_ortho_patient', 'schedule_appointment_ortho')
          AND o.latency_ms IS NOT NULL
          AND t.started_at >= ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
      `).get(fromDate, toDate, configId) as any;

      return { value: row?.avg_latency || 0 };
    },

    // Slot fetch failure rate (percentage)
    slot_failures: (fromDate, toDate, configId) => {
      const total = (this.db.prepare(`
        SELECT COUNT(*) as cnt
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name = 'schedule_appointment_ortho'
          AND o.input LIKE '%"action":"slots"%'
          AND t.started_at >= ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
      `).get(fromDate, toDate, configId) as any)?.cnt || 0;

      const failures = this.db.prepare(`
        SELECT t.trace_id
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name = 'schedule_appointment_ortho'
          AND o.output LIKE '%"success":false%'
          AND t.started_at >= ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
      `).all(fromDate, toDate, configId) as any[];

      const rate = total > 0 ? (failures.length / total) * 100 : 0;

      return {
        value: Math.round(rate * 10) / 10,
        sampleTraceIds: failures.slice(0, 5).map(r => r.trace_id),
        additionalInfo: { total, failures: failures.length },
      };
    },

    // Session abandonment rate (percentage)
    abandonment_rate: (fromDate, toDate, configId) => {
      const totalSessions = (this.db.prepare(`
        SELECT COUNT(*) as cnt
        FROM production_sessions
        WHERE last_trace_at >= ? AND last_trace_at <= ?
          AND langfuse_config_id = ?
      `).get(fromDate, toDate, configId) as any)?.cnt || 0;

      const abandonedRows = this.db.prepare(`
        SELECT session_id
        FROM production_sessions
        WHERE trace_count <= 3
          AND last_trace_at >= ? AND last_trace_at <= ?
          AND langfuse_config_id = ?
      `).all(fromDate, toDate, configId) as any[];

      const rate = totalSessions > 0 ? (abandonedRows.length / totalSessions) * 100 : 0;

      return {
        value: Math.round(rate * 10) / 10,
        additionalInfo: { total: totalSessions, abandoned: abandonedRows.length },
      };
    },

    // Empty patient GUID errors count
    empty_guid_errors: (fromDate, toDate, configId) => {
      const rows = this.db.prepare(`
        SELECT DISTINCT t.session_id, t.trace_id
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name = 'schedule_appointment_ortho'
          AND o.input LIKE '%"patientGUID":""%'
          AND t.started_at >= ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
      `).all(fromDate, toDate, configId) as any[];

      return {
        value: rows.length,
        sampleTraceIds: rows.slice(0, 5).map(r => r.trace_id).filter(Boolean),
      };
    },

    // Escalation count
    escalation_count: (fromDate, toDate, configId) => {
      const rows = this.db.prepare(`
        SELECT DISTINCT t.session_id, t.trace_id
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name = 'chord_handleEscalation'
          AND t.started_at >= ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
      `).all(fromDate, toDate, configId) as any[];

      return {
        value: rows.length,
        sampleTraceIds: rows.slice(0, 5).map(r => r.trace_id).filter(Boolean),
      };
    },

    // Average cost per session (dollars)
    cost_per_session: (fromDate, toDate, configId) => {
      const row = this.db.prepare(`
        SELECT AVG(total_cost) as avg_cost, COUNT(*) as session_count
        FROM production_sessions
        WHERE last_trace_at >= ? AND last_trace_at <= ?
          AND langfuse_config_id = ?
      `).get(fromDate, toDate, configId) as any;

      return {
        value: row?.avg_cost || 0,
        additionalInfo: { sessionCount: row?.session_count || 0 },
      };
    },

    // Patient to booking conversion rate (percentage)
    booking_conversion: (fromDate, toDate, configId) => {
      const patientsCreated = (this.db.prepare(`
        SELECT COUNT(*) as cnt
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.output LIKE '%Patient Added%'
          AND t.started_at >= ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
      `).get(fromDate, toDate, configId) as any)?.cnt || 0;

      const successfulBookings = (this.db.prepare(`
        SELECT COUNT(*) as cnt
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.output LIKE '%Appointment GUID Added%'
          AND t.started_at >= ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
      `).get(fromDate, toDate, configId) as any)?.cnt || 0;

      const rate = patientsCreated > 0 ? (successfulBookings / patientsCreated) * 100 : 0;

      return {
        value: Math.round(rate * 10) / 10,
        additionalInfo: { patientsCreated, successfulBookings },
      };
    },

    // ========================================================================
    // LANGFUSE-SOURCED METRICS (incremental query pattern)
    // These use the same incremental query pattern as goal_test_failures
    // to only alert on NEW issues since last successful alert
    // ========================================================================

    // Langfuse: Empty patient GUID errors (LLM passes empty patientGUID to booking)
    langfuse_empty_guid: function(this: AlertEngine, fromDate, toDate, configId) {
      // Find alert ID for this metric
      const alertRow = this.db.prepare(
        `SELECT id FROM heartbeat_alerts WHERE metric_type = 'langfuse_empty_guid' LIMIT 1`
      ).get() as any;

      // Get timestamp of last successful alert (avoid re-alerting same issues)
      let effectiveFromDate = fromDate;
      if (alertRow) {
        const lastAlertRow = this.db.prepare(`
          SELECT triggered_at FROM heartbeat_alert_history
          WHERE alert_id = ? AND slack_sent = 1 AND suppressed = 0
          ORDER BY triggered_at DESC LIMIT 1
        `).get(alertRow.id) as any;

        if (lastAlertRow) {
          effectiveFromDate = lastAlertRow.triggered_at.replace(' ', 'T') + 'Z';
        }
      }

      // Query for NEW empty GUID issues since last alert - include input/output for details
      const rows = this.db.prepare(`
        SELECT DISTINCT t.session_id, t.trace_id, o.input, o.output, o.started_at, o.name
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name = 'schedule_appointment_ortho'
          AND o.input LIKE '%"patientGUID":""%'
          AND t.started_at > ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
        ORDER BY o.started_at DESC
        LIMIT 10
      `).all(effectiveFromDate, toDate, configId) as any[];

      // Extract error details
      const errorDetails: AlertErrorDetail[] = rows.slice(0, 5).map(row => {
        const input = this.safeJsonParse(row.input);
        return {
          traceId: row.trace_id,
          sessionId: row.session_id,
          timestamp: row.started_at,
          errorType: 'Empty Patient GUID',
          action: input?.action || 'booking',
          errorMessage: 'Patient GUID is empty - data collection failed',
          context: {
            tool: row.name,
            locationGUID: input?.locationGUID,
            appointmentDate: input?.appointmentDate,
          },
        };
      });

      return {
        value: rows.length,
        sampleTraceIds: rows.slice(0, 5).map(r => r.trace_id).filter(Boolean),
        additionalInfo: {
          sessionIds: rows.slice(0, 5).map(r => r.session_id),
          errorDetails,
          resolution: rows.length > 0 ? EMPTY_GUID_RESOLUTION : undefined,
        },
      };
    },

    // Langfuse: Gateway Errors (HTTP 502/500 errors from Cloud9)
    langfuse_gateway_errors: function(this: AlertEngine, fromDate, toDate, configId) {
      const alertRow = this.db.prepare(
        `SELECT id FROM heartbeat_alerts WHERE metric_type = 'langfuse_gateway_errors' LIMIT 1`
      ).get() as any;

      let effectiveFromDate = fromDate;
      if (alertRow) {
        const lastAlertRow = this.db.prepare(`
          SELECT triggered_at FROM heartbeat_alert_history
          WHERE alert_id = ? AND slack_sent = 1 AND suppressed = 0
          ORDER BY triggered_at DESC LIMIT 1
        `).get(alertRow.id) as any;

        if (lastAlertRow) {
          effectiveFromDate = lastAlertRow.triggered_at.replace(' ', 'T') + 'Z';
        }
      }

      const rows = this.db.prepare(`
        SELECT DISTINCT t.session_id, t.trace_id, o.input, o.output, o.started_at, o.name
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE (o.output LIKE '%502%' OR o.output LIKE '%500%' OR o.output LIKE '%Bad Gateway%')
          AND o.name IN ('schedule_appointment_ortho', 'chord_ortho_patient')
          AND t.started_at > ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
        ORDER BY o.started_at DESC
        LIMIT 10
      `).all(effectiveFromDate, toDate, configId) as any[];

      // Extract error details
      const errorDetails: AlertErrorDetail[] = rows.slice(0, 5).map(row => {
        const input = this.safeJsonParse(row.input);
        const output = this.safeJsonParse(row.output);
        const errorMessage = this.extractErrorMessage(output || row.output);
        return {
          traceId: row.trace_id,
          sessionId: row.session_id,
          timestamp: row.started_at,
          errorType: 'Gateway Error',
          action: input?.action || 'unknown',
          errorMessage,
          context: {
            tool: row.name,
            httpStatus: errorMessage.includes('502') ? 502 : errorMessage.includes('500') ? 500 : undefined,
          },
        };
      });

      // Determine resolution based on error patterns
      const resolution = rows.length > 0 ? this.getGatewayErrorResolution(errorDetails) : undefined;

      return {
        value: rows.length,
        sampleTraceIds: rows.slice(0, 5).map(r => r.trace_id).filter(Boolean),
        additionalInfo: {
          sessionIds: rows.slice(0, 5).map(r => r.session_id),
          errorDetails,
          resolution,
        },
      };
    },

    // Langfuse: API Failure (Cloud9 API returned success:false - distinct from gateway errors)
    langfuse_api_failure: function(this: AlertEngine, fromDate, toDate, configId) {
      const alertRow = this.db.prepare(
        `SELECT id FROM heartbeat_alerts WHERE metric_type = 'langfuse_api_failure' LIMIT 1`
      ).get() as any;

      let effectiveFromDate = fromDate;
      if (alertRow) {
        const lastAlertRow = this.db.prepare(`
          SELECT triggered_at FROM heartbeat_alert_history
          WHERE alert_id = ? AND slack_sent = 1 AND suppressed = 0
          ORDER BY triggered_at DESC LIMIT 1
        `).get(alertRow.id) as any;

        if (lastAlertRow) {
          effectiveFromDate = lastAlertRow.triggered_at.replace(' ', 'T') + 'Z';
        }
      }

      // Detect success:false in booking/patient operations (exclude slot failures - separate alert)
      const rows = this.db.prepare(`
        SELECT DISTINCT t.session_id, t.trace_id, o.input, o.output, o.started_at, o.name
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name IN ('schedule_appointment_ortho', 'chord_ortho_patient')
          AND o.output LIKE '%"success":false%'
          AND o.input NOT LIKE '%"action":"slots"%'
          AND t.started_at > ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
        ORDER BY o.started_at DESC
        LIMIT 10
      `).all(effectiveFromDate, toDate, configId) as any[];

      // Extract error details
      const errorDetails: AlertErrorDetail[] = rows.slice(0, 5).map(row => {
        const input = this.safeJsonParse(row.input);
        const output = this.safeJsonParse(row.output);
        const errorMessage = this.extractErrorMessage(output);
        return {
          traceId: row.trace_id,
          sessionId: row.session_id,
          timestamp: row.started_at,
          errorType: 'API Failure',
          action: input?.action || 'unknown',
          errorMessage,
          context: {
            tool: row.name,
            patientGUID: input?.patientGUID,
            locationGUID: input?.locationGUID,
            appointmentTypeGUID: input?.appointmentTypeGUID,
          },
        };
      });

      // Determine resolution based on error patterns
      const resolution = rows.length > 0 ? this.getApiFailureResolution(errorDetails) : undefined;

      return {
        value: rows.length,
        sampleTraceIds: rows.slice(0, 5).map(r => r.trace_id).filter(Boolean),
        additionalInfo: {
          sessionIds: rows.slice(0, 5).map(r => r.session_id),
          errorDetails,
          resolution,
        },
      };
    },

    // Langfuse: PAYLOAD Leakage (raw JSON exposed to caller - CRITICAL)
    langfuse_payload_leak: function(this: AlertEngine, fromDate, toDate, configId) {
      const alertRow = this.db.prepare(
        `SELECT id FROM heartbeat_alerts WHERE metric_type = 'langfuse_payload_leak' LIMIT 1`
      ).get() as any;

      let effectiveFromDate = fromDate;
      if (alertRow) {
        const lastAlertRow = this.db.prepare(`
          SELECT triggered_at FROM heartbeat_alert_history
          WHERE alert_id = ? AND slack_sent = 1 AND suppressed = 0
          ORDER BY triggered_at DESC LIMIT 1
        `).get(alertRow.id) as any;

        if (lastAlertRow) {
          effectiveFromDate = lastAlertRow.triggered_at.replace(' ', 'T') + 'Z';
        }
      }

      // Detect PAYLOAD: in generation outputs (assistant responses exposed raw JSON)
      const rows = this.db.prepare(`
        SELECT DISTINCT t.session_id, t.trace_id, o.output, o.started_at, o.name
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.type = 'GENERATION'
          AND o.output LIKE '%PAYLOAD:%'
          AND t.started_at > ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
        ORDER BY o.started_at DESC
        LIMIT 10
      `).all(effectiveFromDate, toDate, configId) as any[];

      // Extract error details with truncated payload preview
      const errorDetails: AlertErrorDetail[] = rows.slice(0, 5).map(row => {
        // Extract first 200 chars of leaked payload
        const output = row.output || '';
        const payloadStart = output.indexOf('PAYLOAD:');
        const payloadPreview = payloadStart >= 0
          ? output.substring(payloadStart, payloadStart + 200) + '...'
          : output.substring(0, 200) + '...';

        return {
          traceId: row.trace_id,
          sessionId: row.session_id,
          timestamp: row.started_at,
          errorType: 'Payload Leak',
          action: 'generation',
          errorMessage: 'Raw JSON exposed to caller',
          context: {
            generationName: row.name,
            payloadPreview: payloadPreview.replace(/\n/g, ' '),
          },
        };
      });

      return {
        value: rows.length,
        sampleTraceIds: rows.slice(0, 5).map(r => r.trace_id).filter(Boolean),
        additionalInfo: {
          sessionIds: rows.slice(0, 5).map(r => r.session_id),
          errorDetails,
          resolution: rows.length > 0 ? PAYLOAD_LEAK_RESOLUTION : undefined,
        },
      };
    },

    // Langfuse: Slot Fetch Failures (success:false in slot operations)
    langfuse_slot_failures: function(this: AlertEngine, fromDate, toDate, configId) {
      const alertRow = this.db.prepare(
        `SELECT id FROM heartbeat_alerts WHERE metric_type = 'langfuse_slot_failures' LIMIT 1`
      ).get() as any;

      let effectiveFromDate = fromDate;
      if (alertRow) {
        const lastAlertRow = this.db.prepare(`
          SELECT triggered_at FROM heartbeat_alert_history
          WHERE alert_id = ? AND slack_sent = 1 AND suppressed = 0
          ORDER BY triggered_at DESC LIMIT 1
        `).get(alertRow.id) as any;

        if (lastAlertRow) {
          effectiveFromDate = lastAlertRow.triggered_at.replace(' ', 'T') + 'Z';
        }
      }

      const rows = this.db.prepare(`
        SELECT DISTINCT t.session_id, t.trace_id, o.input, o.output, o.started_at
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name = 'schedule_appointment_ortho'
          AND o.input LIKE '%"action":"slots"%'
          AND o.output LIKE '%"success":false%'
          AND t.started_at > ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
        ORDER BY o.started_at DESC
        LIMIT 10
      `).all(effectiveFromDate, toDate, configId) as any[];

      // Extract error details
      const errorDetails: AlertErrorDetail[] = rows.slice(0, 5).map(row => {
        const input = this.safeJsonParse(row.input);
        const output = this.safeJsonParse(row.output);
        const errorMessage = this.extractErrorMessage(output);
        return {
          traceId: row.trace_id,
          sessionId: row.session_id,
          timestamp: row.started_at,
          errorType: 'Slot Fetch Failure',
          action: 'slots',
          errorMessage,
          context: {
            locationGUID: input?.locationGUID,
            startDate: input?.startDate,
            endDate: input?.endDate,
            tier: input?.tier,
          },
        };
      });

      return {
        value: rows.length,
        sampleTraceIds: rows.slice(0, 5).map(r => r.trace_id).filter(Boolean),
        additionalInfo: {
          sessionIds: rows.slice(0, 5).map(r => r.session_id),
          errorDetails,
          resolution: rows.length > 0 ? SLOT_FAILURE_RESOLUTION : undefined,
        },
      };
    },

    // Langfuse: Escalations (human escalation requests)
    langfuse_escalations: function(this: AlertEngine, fromDate, toDate, configId) {
      const alertRow = this.db.prepare(
        `SELECT id FROM heartbeat_alerts WHERE metric_type = 'langfuse_escalations' LIMIT 1`
      ).get() as any;

      let effectiveFromDate = fromDate;
      if (alertRow) {
        const lastAlertRow = this.db.prepare(`
          SELECT triggered_at FROM heartbeat_alert_history
          WHERE alert_id = ? AND slack_sent = 1 AND suppressed = 0
          ORDER BY triggered_at DESC LIMIT 1
        `).get(alertRow.id) as any;

        if (lastAlertRow) {
          effectiveFromDate = lastAlertRow.triggered_at.replace(' ', 'T') + 'Z';
        }
      }

      const rows = this.db.prepare(`
        SELECT DISTINCT t.session_id, t.trace_id, o.input, o.output, o.started_at
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE o.name = 'chord_handleEscalation'
          AND t.started_at > ? AND t.started_at <= ?
          AND t.langfuse_config_id = ?
        ORDER BY o.started_at DESC
        LIMIT 20
      `).all(effectiveFromDate, toDate, configId) as any[];

      // Keywords indicating a real user escalation request (case-insensitive)
      const escalationKeywords = [
        'agent', 'operator', 'human', 'representative', 'person', 'someone',
        'transfer', 'speak to', 'talk to', 'connect me', 'real person',
        'live agent', 'customer service', 'help desk', 'support',
        'escalate', 'escalation', 'frustrated', 'angry', 'unhappy',
      ];

      // Keywords indicating a successful completion (NOT an escalation)
      const completionKeywords = [
        'completed', 'complete', 'scheduled', 'booked', 'confirmed',
        'success', 'done', 'finished', 'appointment set',
      ];

      /**
       * Determine if this is a real escalation vs a completion/wrap-up call
       */
      const isRealEscalation = (input: any, output: any): { isEscalation: boolean; reason: string } => {
        const escalationIntent = (input?.escalationIntent || '').toLowerCase();
        const reason = (input?.reason || output?.reason || '').toLowerCase();
        const transferType = (input?.transferType || output?.transferType || '').toLowerCase();

        // Check if it looks like a completion (filter out false positives)
        const looksLikeCompletion = completionKeywords.some(kw =>
          escalationIntent.includes(kw) && !escalationIntent.includes('not ')
        );

        if (looksLikeCompletion && !escalationKeywords.some(kw => escalationIntent.includes(kw))) {
          return { isEscalation: false, reason: 'Completion disposition, not escalation' };
        }

        // Check for explicit escalation keywords in escalationIntent
        if (escalationKeywords.some(kw => escalationIntent.includes(kw))) {
          return { isEscalation: true, reason: escalationIntent || 'User requested human transfer' };
        }

        // Check for explicit reason field
        if (reason && escalationKeywords.some(kw => reason.includes(kw))) {
          return { isEscalation: true, reason: reason };
        }

        // Check transferType for escalation indicators
        if (transferType && ['agent', 'operator', 'human', 'live', 'escalate'].some(kw => transferType.includes(kw))) {
          return { isEscalation: true, reason: `Transfer to ${transferType}` };
        }

        // If escalationIntent is empty but there's a reason, use it
        if (reason) {
          return { isEscalation: true, reason: reason };
        }

        // If no clear indicators, don't alert (avoid false positives)
        return { isEscalation: false, reason: 'No clear escalation indicators' };
      };

      // Filter to only real escalations
      const realEscalations = rows.filter(row => {
        const input = this.safeJsonParse(row.input);
        const output = this.safeJsonParse(row.output);
        return isRealEscalation(input, output).isEscalation;
      });

      // Extract error details for real escalations only
      const errorDetails: AlertErrorDetail[] = realEscalations.slice(0, 5).map(row => {
        const input = this.safeJsonParse(row.input);
        const output = this.safeJsonParse(row.output);
        const { reason } = isRealEscalation(input, output);

        return {
          traceId: row.trace_id,
          sessionId: row.session_id,
          timestamp: row.started_at,
          errorType: 'Escalation',
          action: 'handleEscalation',
          errorMessage: reason,
          context: {
            escalationIntent: input?.escalationIntent,
            escalationReason: input?.reason,
            transferType: input?.transferType || output?.transferType,
          },
        };
      });

      return {
        value: realEscalations.length,
        sampleTraceIds: realEscalations.slice(0, 5).map(r => r.trace_id).filter(Boolean),
        additionalInfo: {
          sessionIds: realEscalations.slice(0, 5).map(r => r.session_id),
          errorDetails,
          resolution: realEscalations.length > 0 ? ESCALATION_RESOLUTION : undefined,
          // Include filtered count for debugging
          totalHandleEscalationCalls: rows.length,
          filteredAsCompletions: rows.length - realEscalations.length,
        },
      };
    },

    // Langfuse: Conversation Loop (sessions with 19+ turns - bot may be stuck)
    langfuse_conversation_loop: function(this: AlertEngine, fromDate, toDate, configId) {
      const alertRow = this.db.prepare(
        `SELECT id FROM heartbeat_alerts WHERE metric_type = 'langfuse_conversation_loop' LIMIT 1`
      ).get() as any;

      let effectiveFromDate = fromDate;
      if (alertRow) {
        const lastAlertRow = this.db.prepare(`
          SELECT triggered_at FROM heartbeat_alert_history
          WHERE alert_id = ? AND slack_sent = 1 AND suppressed = 0
          ORDER BY triggered_at DESC LIMIT 1
        `).get(alertRow.id) as any;

        if (lastAlertRow) {
          effectiveFromDate = lastAlertRow.triggered_at.replace(' ', 'T') + 'Z';
        }
      }

      const rows = this.db.prepare(`
        SELECT session_id, trace_count, first_trace_at, last_trace_at
        FROM production_sessions
        WHERE trace_count > 18
          AND last_trace_at > ? AND last_trace_at <= ?
          AND langfuse_config_id = ?
        ORDER BY trace_count DESC
        LIMIT 10
      `).all(effectiveFromDate, toDate, configId) as any[];

      // Extract error details with turn counts
      const errorDetails: AlertErrorDetail[] = rows.slice(0, 5).map(row => {
        return {
          traceId: '', // Sessions don't have single trace IDs
          sessionId: row.session_id,
          timestamp: row.last_trace_at,
          errorType: 'Conversation Loop',
          action: 'session',
          errorMessage: `Session has ${row.trace_count} turns - potential loop`,
          context: {
            turnCount: row.trace_count,
            sessionStart: row.first_trace_at,
            sessionEnd: row.last_trace_at,
          },
        };
      });

      return {
        value: rows.length,
        additionalInfo: {
          sessionIds: rows.slice(0, 5).map(r => r.session_id),
          errorDetails,
          resolution: rows.length > 0 ? CONVERSATION_LOOP_RESOLUTION : undefined,
        },
      };
    },

    // ========================================================================
    // INFRASTRUCTURE METRICS
    // ========================================================================

    // Cache Staleness: checks if slot cache auto-refresh has stopped
    cache_staleness: async function(this: AlertEngine, _fromDate: string, _toDate: string, _configId: number): Promise<MetricResult> {
      try {
        const response = await fetch('http://localhost:3002/api/test-monitor/cache-health');
        if (!response.ok) {
          return {
            value: 999,
            additionalInfo: {
              error: `Cache health endpoint returned ${response.status}`,
              resolution: CACHE_STALENESS_RESOLUTION,
            },
          };
        }

        const data = await response.json() as any;
        const tiers = data.tiers || data.data?.tiers || [];
        const overallStatus = data.status || data.data?.status || 'unknown';

        // Calculate max age across all tiers
        let maxAgeMinutes = 0;
        const tierDetails: Array<{ tier: string; ageMinutes: number; status: string; slotCount: number }> = [];
        const staleTiers: string[] = [];

        for (const tier of tiers) {
          const ageMinutes = tier.ageMinutes ?? tier.age_minutes ?? 0;
          const tierName = tier.tier || tier.name || 'unknown';
          const tierStatus = tier.status || 'unknown';
          const slotCount = tier.slotCount ?? tier.slot_count ?? 0;

          tierDetails.push({
            tier: tierName,
            ageMinutes: Math.round(ageMinutes * 10) / 10,
            status: tierStatus,
            slotCount,
          });

          if (ageMinutes > maxAgeMinutes) {
            maxAgeMinutes = ageMinutes;
          }

          if (ageMinutes > 5) {
            staleTiers.push(`${tierName} (${Math.round(ageMinutes)}min old)`);
          }
        }

        return {
          value: Math.round(maxAgeMinutes * 10) / 10,
          additionalInfo: {
            overallStatus,
            tierDetails,
            staleTiers: staleTiers.length > 0 ? staleTiers : undefined,
            resolution: maxAgeMinutes > 10 ? CACHE_STALENESS_RESOLUTION : undefined,
          },
        };
      } catch (error: any) {
        console.error('[AlertEngine] Cache health check failed:', error.message);
        return {
          value: 999,
          additionalInfo: {
            error: `Cache health check failed: ${error.message}`,
            resolution: CACHE_STALENESS_RESOLUTION,
          },
        };
      }
    },

    // ========================================================================
    // GOAL TEST METRICS
    // ========================================================================

    // Goal test failures count (from test-agent database)
    // Only counts NEW failures since last successful alert
    goal_test_failures: function(this: AlertEngine, fromDate, toDate, _configId) {
      try {
        // Find the goal_test_failures alert ID
        const alertRow = this.db.prepare(
          `SELECT id FROM heartbeat_alerts WHERE metric_type = 'goal_test_failures' LIMIT 1`
        ).get() as any;

        // Get the timestamp of the last successful alert (slack_sent=1, suppressed=0)
        let effectiveFromDate = fromDate;
        if (alertRow) {
          const lastAlertRow = this.db.prepare(`
            SELECT triggered_at FROM heartbeat_alert_history
            WHERE alert_id = ? AND slack_sent = 1 AND suppressed = 0
            ORDER BY triggered_at DESC LIMIT 1
          `).get(alertRow.id) as any;

          if (lastAlertRow) {
            // Only look for failures AFTER the last successful alert
            // Convert SQLite timestamp to ISO format for comparison
            const lastAlertTime = lastAlertRow.triggered_at.replace(' ', 'T') + 'Z';
            effectiveFromDate = lastAlertTime;
          }
        }

        // Connect to the test-agent database
        const testAgentDbPath = path.resolve(__dirname, '../../../test-agent/data/test-results.db');
        const testDb = new BetterSqlite3(testAgentDbPath, { readonly: true });

        const rows = testDb.prepare(`
          SELECT id, run_id, test_id, summary_text, flowise_session_id, langfuse_trace_id, started_at
          FROM goal_test_results
          WHERE passed = 0
            AND started_at > ? AND started_at <= ?
          ORDER BY started_at DESC
        `).all(effectiveFromDate, toDate) as any[];

        testDb.close();

        // Prioritize langfuse_trace_id for proper trace linking
        const traceIds = rows
          .slice(0, 5)
          .map(r => r.langfuse_trace_id)
          .filter(Boolean);

        // Build detailed failure info for the Slack message
        const failedTests = rows.slice(0, 5).map(r => ({
          testId: r.test_id,
          runId: r.run_id,
          summary: r.summary_text?.substring(0, 100),
          langfuseTraceId: r.langfuse_trace_id,
          flowiseSessionId: r.flowise_session_id,
        }));

        return {
          value: rows.length,
          sampleTraceIds: traceIds.length > 0 ? traceIds : rows.slice(0, 5).map(r => r.flowise_session_id).filter(Boolean),
          additionalInfo: {
            failedTests,
            // Include run_id for dashboard linking
            latestRunId: rows[0]?.run_id,
          },
        };
      } catch (error) {
        console.error('[AlertEngine] Failed to query goal test results:', error);
        return { value: 0 };
      }
    },
  };

  /**
   * Get available metric types
   */
  getAvailableMetrics(): string[] {
    return Object.keys(this.metricEvaluators);
  }
}

/**
 * Alert Engine Service
 * Evaluates metrics from trace data and determines which alerts should trigger
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

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

    return rows.map(row => ({
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
    }));
  }

  /**
   * Evaluate all enabled alerts and return results
   */
  async evaluateAlerts(configId?: number): Promise<EvaluatedAlert[]> {
    const alerts = this.getEnabledAlerts();
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

    return evaluator.call(this, fromDate, toDate, configId);
  }

  /**
   * Metric evaluators - each returns a MetricResult for the given time range
   */
  private metricEvaluators: Record<string, (fromDate: string, toDate: string, configId: number) => MetricResult> = {
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

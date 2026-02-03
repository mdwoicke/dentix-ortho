/**
 * Heartbeat Controller
 * API handlers for heartbeat alerting system
 */

import { Request, Response } from 'express';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { getHeartbeatService, resetHeartbeatService } from '../services/heartbeatService';
import { AlertEngine } from '../services/alertEngine';

const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

/**
 * Get database connection (read-write)
 */
function getDb(): BetterSqlite3.Database {
  return new BetterSqlite3(TEST_AGENT_DB_PATH);
}

// ============================================================================
// HEARTBEAT SERVICE MANAGEMENT
// ============================================================================

/**
 * GET /api/heartbeat/status
 * Get heartbeat service status
 */
export const getStatus = async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const service = getHeartbeatService(db);
    const status = service.getStatus();
    // Don't close db - singleton service keeps using it
    res.json(status);
  } catch (error: any) {
    console.error('[HeartbeatController] getStatus error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/heartbeat/start
 * Start the heartbeat service
 */
export const startService = async (req: Request, res: Response) => {
  try {
    const { intervalMinutes = 5 } = req.body;
    const db = getDb();
    const service = getHeartbeatService(db);
    service.start(intervalMinutes);
    const status = service.getStatus();
    res.json({ message: 'Heartbeat service started', status });
  } catch (error: any) {
    console.error('[HeartbeatController] startService error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/heartbeat/stop
 * Stop the heartbeat service
 */
export const stopService = async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const service = getHeartbeatService(db);
    service.stop();
    const status = service.getStatus();
    // Don't close db - singleton service keeps using it
    res.json({ message: 'Heartbeat service stopped', status });
  } catch (error: any) {
    console.error('[HeartbeatController] stopService error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/heartbeat/reset
 * Reset the heartbeat service singleton (reinitializes with fresh config)
 */
export const resetService = async (_req: Request, res: Response) => {
  try {
    resetHeartbeatService();
    res.json({ message: 'Heartbeat service reset. Call /start to reinitialize with fresh config.' });
  } catch (error: any) {
    console.error('[HeartbeatController] resetService error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/heartbeat/run
 * Trigger a manual heartbeat check
 */
export const runManual = async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const service = getHeartbeatService(db);
    const result = await service.runHeartbeat();
    res.json(result);
  } catch (error: any) {
    console.error('[HeartbeatController] runManual error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/heartbeat/history
 * Get heartbeat run history
 */
export const getHistory = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM heartbeat_runs
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    const history = rows.map(row => ({
      id: row.id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      alertsChecked: row.alerts_checked,
      alertsTriggered: row.alerts_triggered,
      alertsSent: row.alerts_sent,
      alertsSuppressed: row.alerts_suppressed,
      durationMs: row.duration_ms,
      status: row.status,
      errorMessage: row.error_message,
    }));

    db.close();
    res.json(history);
  } catch (error: any) {
    console.error('[HeartbeatController] getHistory error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// ALERT CONFIGURATION
// ============================================================================

/**
 * GET /api/heartbeat/alerts
 * List all alert definitions
 */
export const getAlerts = async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM heartbeat_alerts ORDER BY severity DESC, name ASC`).all() as any[];

    const alerts = rows.map(row => ({
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    db.close();
    res.json(alerts);
  } catch (error: any) {
    console.error('[HeartbeatController] getAlerts error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/heartbeat/alerts
 * Create a new alert
 */
export const createAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      description,
      metricType,
      conditionOperator,
      thresholdValue,
      thresholdUnit,
      lookbackMinutes = 15,
      severity = 'warning',
      enabled = true,
      slackChannel,
      cooldownMinutes = 30,
      environment,
      checkIntervalMinutes,
    } = req.body;

    // Default check interval based on severity
    const resolvedCheckInterval = checkIntervalMinutes ?? (
      severity === 'critical' ? 2 :
      severity === 'warning' ? 5 : 15
    );

    if (!name || !metricType || !conditionOperator || thresholdValue === undefined) {
      res.status(400).json({ error: 'Missing required fields: name, metricType, conditionOperator, thresholdValue' });
      return;
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO heartbeat_alerts
      (name, description, metric_type, condition_operator, threshold_value, threshold_unit,
       lookback_minutes, severity, enabled, slack_channel, cooldown_minutes, environment, check_interval_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      description,
      metricType,
      conditionOperator,
      thresholdValue,
      thresholdUnit,
      lookbackMinutes,
      severity,
      enabled ? 1 : 0,
      slackChannel,
      cooldownMinutes,
      environment,
      resolvedCheckInterval
    );

    const newAlert = db.prepare(`SELECT * FROM heartbeat_alerts WHERE id = ?`).get(result.lastInsertRowid) as any;
    db.close();

    res.status(201).json({
      id: newAlert.id,
      name: newAlert.name,
      description: newAlert.description,
      metricType: newAlert.metric_type,
      conditionOperator: newAlert.condition_operator,
      thresholdValue: newAlert.threshold_value,
      thresholdUnit: newAlert.threshold_unit,
      lookbackMinutes: newAlert.lookback_minutes,
      severity: newAlert.severity,
      enabled: newAlert.enabled === 1,
      slackChannel: newAlert.slack_channel,
      cooldownMinutes: newAlert.cooldown_minutes,
      environment: newAlert.environment,
      createdAt: newAlert.created_at,
      updatedAt: newAlert.updated_at,
    });
  } catch (error: any) {
    console.error('[HeartbeatController] createAlert error:', error);
    if (error.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Alert with this name already exists' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /api/heartbeat/alerts/:id
 * Update an alert
 */
export const updateAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const db = getDb();

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.metricType !== undefined) { fields.push('metric_type = ?'); values.push(updates.metricType); }
    if (updates.conditionOperator !== undefined) { fields.push('condition_operator = ?'); values.push(updates.conditionOperator); }
    if (updates.thresholdValue !== undefined) { fields.push('threshold_value = ?'); values.push(updates.thresholdValue); }
    if (updates.thresholdUnit !== undefined) { fields.push('threshold_unit = ?'); values.push(updates.thresholdUnit); }
    if (updates.lookbackMinutes !== undefined) { fields.push('lookback_minutes = ?'); values.push(updates.lookbackMinutes); }
    if (updates.severity !== undefined) { fields.push('severity = ?'); values.push(updates.severity); }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
    if (updates.slackChannel !== undefined) { fields.push('slack_channel = ?'); values.push(updates.slackChannel); }
    if (updates.cooldownMinutes !== undefined) { fields.push('cooldown_minutes = ?'); values.push(updates.cooldownMinutes); }
    if (updates.environment !== undefined) { fields.push('environment = ?'); values.push(updates.environment); }
    if (updates.checkIntervalMinutes !== undefined) { fields.push('check_interval_minutes = ?'); values.push(updates.checkIntervalMinutes); }

    if (fields.length === 0) {
      db.close();
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = db.prepare(`UPDATE heartbeat_alerts SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    if (result.changes === 0) {
      db.close();
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    const updatedAlert = db.prepare(`SELECT * FROM heartbeat_alerts WHERE id = ?`).get(id) as any;
    db.close();

    res.json({
      id: updatedAlert.id,
      name: updatedAlert.name,
      description: updatedAlert.description,
      metricType: updatedAlert.metric_type,
      conditionOperator: updatedAlert.condition_operator,
      thresholdValue: updatedAlert.threshold_value,
      thresholdUnit: updatedAlert.threshold_unit,
      lookbackMinutes: updatedAlert.lookback_minutes,
      severity: updatedAlert.severity,
      enabled: updatedAlert.enabled === 1,
      slackChannel: updatedAlert.slack_channel,
      cooldownMinutes: updatedAlert.cooldown_minutes,
      environment: updatedAlert.environment,
      createdAt: updatedAlert.created_at,
      updatedAt: updatedAlert.updated_at,
    });
  } catch (error: any) {
    console.error('[HeartbeatController] updateAlert error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * DELETE /api/heartbeat/alerts/:id
 * Delete an alert
 */
export const deleteAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const db = getDb();

    const result = db.prepare(`DELETE FROM heartbeat_alerts WHERE id = ?`).run(id);
    db.close();

    if (result.changes === 0) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    res.json({ message: 'Alert deleted', id: parseInt(id) });
  } catch (error: any) {
    console.error('[HeartbeatController] deleteAlert error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/heartbeat/alerts/:id/toggle
 * Enable/disable an alert
 */
export const toggleAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    if (enabled === undefined) {
      res.status(400).json({ error: 'enabled field is required' });
      return;
    }

    const db = getDb();
    const result = db.prepare(`UPDATE heartbeat_alerts SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(enabled ? 1 : 0, id);

    if (result.changes === 0) {
      db.close();
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    const alert = db.prepare(`SELECT * FROM heartbeat_alerts WHERE id = ?`).get(id) as any;
    db.close();

    res.json({
      id: alert.id,
      name: alert.name,
      enabled: alert.enabled === 1,
    });
  } catch (error: any) {
    console.error('[HeartbeatController] toggleAlert error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/heartbeat/alerts/:id/history
 * Get trigger history for a specific alert
 */
export const getAlertHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const db = getDb();
    const rows = db.prepare(`
      SELECT h.*, a.name as alert_name, a.description as alert_description, a.metric_type
      FROM heartbeat_alert_history h
      JOIN heartbeat_alerts a ON h.alert_id = a.id
      WHERE h.alert_id = ?
      ORDER BY h.triggered_at DESC
      LIMIT ? OFFSET ?
    `).all(id, limit, offset) as any[];

    const history = rows.map(row => ({
      id: row.id,
      heartbeatRunId: row.heartbeat_run_id,
      alertId: row.alert_id,
      triggeredAt: row.triggered_at,
      metricValue: row.metric_value,
      thresholdValue: row.threshold_value,
      severity: row.severity,
      slackSent: row.slack_sent === 1,
      suppressed: row.suppressed === 1,
      suppressionReason: row.suppression_reason,
      sampleTraceIds: row.sample_trace_ids ? JSON.parse(row.sample_trace_ids) : null,
      additionalInfo: row.additional_info ? JSON.parse(row.additional_info) : null,
      resolvedAt: row.resolved_at,
      alertName: row.alert_name,
      alertDescription: row.alert_description,
      metricType: row.metric_type,
    }));

    db.close();
    res.json(history);
  } catch (error: any) {
    console.error('[HeartbeatController] getAlertHistory error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/heartbeat/alerts/history
 * Get all alert trigger history
 */
export const getAllAlertHistory = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const db = getDb();
    const rows = db.prepare(`
      SELECT h.*, a.name as alert_name, a.description as alert_description, a.metric_type
      FROM heartbeat_alert_history h
      JOIN heartbeat_alerts a ON h.alert_id = a.id
      ORDER BY h.triggered_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    const history = rows.map(row => ({
      id: row.id,
      heartbeatRunId: row.heartbeat_run_id,
      alertId: row.alert_id,
      triggeredAt: row.triggered_at,
      metricValue: row.metric_value,
      thresholdValue: row.threshold_value,
      severity: row.severity,
      slackSent: row.slack_sent === 1,
      suppressed: row.suppressed === 1,
      suppressionReason: row.suppression_reason,
      sampleTraceIds: row.sample_trace_ids ? JSON.parse(row.sample_trace_ids) : null,
      additionalInfo: row.additional_info ? JSON.parse(row.additional_info) : null,
      resolvedAt: row.resolved_at,
      alertName: row.alert_name,
      alertDescription: row.alert_description,
      metricType: row.metric_type,
    }));

    db.close();
    res.json(history);
  } catch (error: any) {
    console.error('[HeartbeatController] getAllAlertHistory error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// SLACK INTEGRATION
// ============================================================================

/**
 * GET /api/heartbeat/slack/status
 * Get Slack connection status
 */
export const getSlackStatus = async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    let row = db.prepare(`SELECT * FROM heartbeat_slack_config LIMIT 1`).get() as any;

    if (!row) {
      db.prepare(`INSERT INTO heartbeat_slack_config (enabled) VALUES (0)`).run();
      row = db.prepare(`SELECT * FROM heartbeat_slack_config LIMIT 1`).get() as any;
    }

    db.close();

    res.json({
      configured: !!row.webhook_url,
      enabled: row.enabled === 1,
      defaultChannel: row.default_channel,
      criticalChannel: row.critical_channel,
      lastTestAt: row.last_test_at,
      lastTestSuccess: row.last_test_success === 1,
    });
  } catch (error: any) {
    console.error('[HeartbeatController] getSlackStatus error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/heartbeat/slack/test
 * Send a test Slack message
 */
export const testSlack = async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const service = getHeartbeatService(db);
    const result = await service.testSlackConnection();

    // Update last test result
    db.prepare(`
      UPDATE heartbeat_slack_config
      SET last_test_at = CURRENT_TIMESTAMP, last_test_success = ?
    `).run(result.success ? 1 : 0);

    db.close();

    if (result.success) {
      res.json({ success: true, message: 'Test message sent successfully' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('[HeartbeatController] testSlack error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /api/heartbeat/slack/config
 * Update Slack configuration
 */
export const updateSlackConfig = async (req: Request, res: Response) => {
  try {
    const { webhookUrl, defaultChannel, criticalChannel, enabled } = req.body;

    const db = getDb();

    // Ensure config exists
    let row = db.prepare(`SELECT * FROM heartbeat_slack_config LIMIT 1`).get() as any;
    if (!row) {
      db.prepare(`INSERT INTO heartbeat_slack_config (enabled) VALUES (0)`).run();
    }

    // Build update query
    const fields: string[] = [];
    const values: any[] = [];

    if (webhookUrl !== undefined) { fields.push('webhook_url = ?'); values.push(webhookUrl); }
    if (defaultChannel !== undefined) { fields.push('default_channel = ?'); values.push(defaultChannel); }
    if (criticalChannel !== undefined) { fields.push('critical_channel = ?'); values.push(criticalChannel); }
    if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      db.prepare(`UPDATE heartbeat_slack_config SET ${fields.join(', ')}`).run(...values);
    }

    // Update the service config as well
    const service = getHeartbeatService(db);
    service.updateSlackConfig({
      webhookUrl,
      defaultChannel,
      criticalChannel,
      enabled,
    });

    row = db.prepare(`SELECT * FROM heartbeat_slack_config LIMIT 1`).get() as any;
    db.close();

    res.json({
      configured: !!row.webhook_url,
      enabled: row.enabled === 1,
      defaultChannel: row.default_channel,
      criticalChannel: row.critical_channel,
    });
  } catch (error: any) {
    console.error('[HeartbeatController] updateSlackConfig error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// LANGFUSE CONFIG
// ============================================================================

/**
 * PUT /api/heartbeat/langfuse-config
 * Set the Langfuse config to use for alert monitoring
 */
export const setLangfuseConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { configId } = req.body;

    if (configId === undefined || configId === null) {
      res.status(400).json({ error: 'configId is required' });
      return;
    }

    const db = getDb();

    // Verify the config exists
    const config = db.prepare(`SELECT id, name, is_default FROM langfuse_configs WHERE id = ?`).get(configId) as any;
    if (!config) {
      db.close();
      res.status(404).json({ error: 'Langfuse config not found' });
      return;
    }

    // Update the heartbeat service
    const service = getHeartbeatService(db);
    service.setConfigId(configId);

    db.close();

    res.json({
      success: true,
      configId: config.id,
      configName: config.name,
      isDefault: config.is_default === 1,
    });
  } catch (error: any) {
    console.error('[HeartbeatController] setLangfuseConfig error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/heartbeat/langfuse-configs
 * Get available Langfuse configs for selection
 */
export const getLangfuseConfigs = async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const configs = db.prepare(`
      SELECT id, name, host, is_default
      FROM langfuse_configs
      ORDER BY is_default DESC, name ASC
    `).all() as any[];

    db.close();

    // Check if name contains 'sandbox' to determine if it's a sandbox config
    res.json(configs.map(c => ({
      id: c.id,
      name: c.name,
      host: c.host,
      isDefault: c.is_default === 1,
      isSandbox: c.name.toLowerCase().includes('sandbox'),
    })));
  } catch (error: any) {
    console.error('[HeartbeatController] getLangfuseConfigs error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// METRIC UTILITIES
// ============================================================================

/**
 * GET /api/heartbeat/metrics
 * Get available metric types
 */
export const getAvailableMetrics = async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const alertEngine = new AlertEngine(db);
    const metrics = alertEngine.getAvailableMetrics();
    db.close();

    // Add descriptions for each metric
    // source: 'production' = real-time production trace data
    // source: 'langfuse' = Langfuse-sourced production metrics (incremental alerting)
    // source: 'goal_testing' = Goal test results from test runs
    const metricInfo: Record<string, { name: string; description: string; unit: string; source?: string }> = {
      // Production metrics (real-time window)
      api_errors: { name: 'API Errors', description: 'Count of 502/500 errors from Cloud9 API', unit: 'count', source: 'production' },
      avg_latency: { name: 'Average Latency', description: 'Average tool call latency', unit: 'ms', source: 'production' },
      slot_failures: { name: 'Slot Fetch Failures', description: 'Percentage of failed slot fetches', unit: 'percent', source: 'production' },
      abandonment_rate: { name: 'Abandonment Rate', description: 'Percentage of sessions abandoned (1-3 turns)', unit: 'percent', source: 'production' },
      empty_guid_errors: { name: 'Empty GUID Errors', description: 'Booking attempts with empty patient GUID', unit: 'count', source: 'production' },
      escalation_count: { name: 'Escalation Count', description: 'Number of escalations to human agent', unit: 'count', source: 'production' },
      cost_per_session: { name: 'Cost Per Session', description: 'Average cost per conversation session', unit: 'dollars', source: 'production' },
      booking_conversion: { name: 'Booking Conversion', description: 'Patient creation to booking conversion rate', unit: 'percent', source: 'production' },

      // Langfuse-sourced metrics (aligned with trace skill error patterns, incremental alerting)
      langfuse_api_failure: { name: 'API Failure', description: 'Cloud9 API returned success:false (non-slot operations)', unit: 'count', source: 'langfuse' },
      langfuse_payload_leak: { name: 'PAYLOAD Leakage', description: 'Raw JSON exposed to caller (PAYLOAD: in response)', unit: 'count', source: 'langfuse' },
      langfuse_empty_guid: { name: 'Empty Patient GUID', description: 'Empty patientGUID in booking call', unit: 'count', source: 'langfuse' },
      langfuse_gateway_errors: { name: 'Gateway Errors', description: 'HTTP 502/500 errors from Cloud9', unit: 'count', source: 'langfuse' },
      langfuse_slot_failures: { name: 'Slot Failures', description: 'Slot fetch returned success:false', unit: 'count', source: 'langfuse' },
      langfuse_escalations: { name: 'Escalations', description: 'Human escalation requests (premature transfer)', unit: 'count', source: 'langfuse' },
      langfuse_conversation_loop: { name: 'Conversation Loop', description: 'Bot stuck in loop (19+ turns)', unit: 'count', source: 'langfuse' },

      // Goal testing metrics
      goal_test_failures: { name: 'Goal Test Failures', description: 'Failed goal tests from test runs (incremental)', unit: 'count', source: 'goal_testing' },
    };

    res.json(metrics.map(m => ({
      id: m,
      ...metricInfo[m] || { name: m, description: '', unit: '', source: 'unknown' },
    })));
  } catch (error: any) {
    console.error('[HeartbeatController] getAvailableMetrics error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/heartbeat/metrics/:metricType/current
 * Get current value of a specific metric
 */
export const getMetricValue = async (req: Request, res: Response) => {
  try {
    const { metricType } = req.params;
    const lookbackMinutes = parseInt(req.query.lookback as string) || 15;

    const db = getDb();
    const alertEngine = new AlertEngine(db);

    // Get default config
    const defaultConfig = db.prepare(`
      SELECT id FROM langfuse_configs WHERE is_default = 1 LIMIT 1
    `).get() as any;
    const configId = defaultConfig?.id || 1;

    const result = await alertEngine.getMetricValue(metricType, lookbackMinutes, configId);
    db.close();

    res.json({
      metricType,
      lookbackMinutes,
      ...result,
    });
  } catch (error: any) {
    console.error('[HeartbeatController] getMetricValue error:', error);
    res.status(500).json({ error: error.message });
  }
};

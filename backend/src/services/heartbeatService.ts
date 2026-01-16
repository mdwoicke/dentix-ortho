/**
 * Heartbeat Service
 * Orchestrates periodic alert checking, evaluation, and notifications
 */

import BetterSqlite3 from 'better-sqlite3';
import { AlertEngine, EvaluatedAlert } from './alertEngine';
import { SlackNotifier, TriggeredAlert, SlackConfig } from './slackNotifier';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface HeartbeatStatus {
  isRunning: boolean;
  intervalMinutes: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastRunStatus?: string;
  alertsEnabled: number;
  alertsTotal: number;
}

export interface HeartbeatResult {
  runId: number;
  alertsChecked: number;
  alertsTriggered: number;
  alertsSent: number;
  alertsSuppressed: number;
  durationMs: number;
  status: 'completed' | 'error';
  errorMessage?: string;
}

// ============================================================================
// HEARTBEAT SERVICE
// ============================================================================

export class HeartbeatService {
  private db: BetterSqlite3.Database;
  private alertEngine: AlertEngine;
  private slackNotifier: SlackNotifier;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private intervalMinutes: number = 5;
  private lastRunAt?: string;
  private nextRunAt?: string;
  private configId?: number;

  constructor(db: BetterSqlite3.Database, dashboardBaseUrl?: string) {
    this.db = db;
    this.alertEngine = new AlertEngine(db);

    // Load dashboard base URL from database if not provided
    let resolvedDashboardUrl = dashboardBaseUrl;
    if (!resolvedDashboardUrl) {
      const dashboardSetting = db.prepare(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'dashboard_base_url'`
      ).get() as any;
      resolvedDashboardUrl = dashboardSetting?.setting_value || 'http://localhost:5174';
    }

    // Load Slack config from database
    const slackConfig = this.getSlackConfigFromDb();
    this.slackNotifier = new SlackNotifier(slackConfig, resolvedDashboardUrl);

    // Get default Langfuse config
    const defaultConfig = db.prepare(`
      SELECT id FROM langfuse_configs WHERE is_default = 1 LIMIT 1
    `).get() as any;
    this.configId = defaultConfig?.id;
  }

  /**
   * Start the heartbeat service
   */
  start(intervalMinutes: number = 5): void {
    if (this.isRunning) {
      console.log('[HeartbeatService] Already running');
      return;
    }

    this.intervalMinutes = intervalMinutes;
    this.isRunning = true;

    console.log(`[HeartbeatService] Starting with ${intervalMinutes} minute interval`);

    // Run immediately, then on interval
    this.runHeartbeat().catch(err => {
      console.error('[HeartbeatService] Initial run failed:', err);
    });

    // Schedule recurring runs
    this.intervalId = setInterval(() => {
      this.runHeartbeat().catch(err => {
        console.error('[HeartbeatService] Scheduled run failed:', err);
      });
    }, intervalMinutes * 60 * 1000);

    this.updateNextRunAt();
  }

  /**
   * Stop the heartbeat service
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[HeartbeatService] Already stopped');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    this.nextRunAt = undefined;
    console.log('[HeartbeatService] Stopped');
  }

  /**
   * Execute a single heartbeat check
   */
  async runHeartbeat(): Promise<HeartbeatResult> {
    const startTime = Date.now();
    console.log('[HeartbeatService] Running heartbeat check...');

    // Create heartbeat run record
    const runId = this.createHeartbeatRun();

    let alertsChecked = 0;
    let alertsTriggered = 0;
    let alertsSent = 0;
    let alertsSuppressed = 0;
    let status: 'completed' | 'error' = 'completed';
    let errorMessage: string | undefined;

    try {
      // Evaluate all alerts
      const evaluatedAlerts = await this.alertEngine.evaluateAlerts(this.configId);
      alertsChecked = evaluatedAlerts.length;

      // Separate triggered vs suppressed alerts
      const triggeredAlerts = evaluatedAlerts.filter(a => a.triggered && !a.suppressed);
      const suppressedAlerts = evaluatedAlerts.filter(a => a.triggered && a.suppressed);

      alertsTriggered = triggeredAlerts.length + suppressedAlerts.length;
      alertsSuppressed = suppressedAlerts.length;

      // Record alert history for triggered alerts
      for (const evaluated of triggeredAlerts) {
        this.recordAlertHistory(runId, evaluated, false);
      }

      // Record suppressed alerts
      for (const evaluated of suppressedAlerts) {
        this.recordAlertHistory(runId, evaluated, true, evaluated.suppressionReason);
      }

      // Send Slack notification for non-suppressed triggered alerts
      if (triggeredAlerts.length > 0) {
        const slackAlerts: TriggeredAlert[] = triggeredAlerts.map(ea => ({
          alertId: ea.alert.id,
          alertName: ea.alert.name,
          description: ea.alert.description,
          metricType: ea.alert.metricType,
          metricValue: ea.metricValue,
          thresholdValue: ea.alert.thresholdValue,
          thresholdUnit: ea.alert.thresholdUnit,
          severity: ea.alert.severity,
          lookbackMinutes: ea.alert.lookbackMinutes,
          sampleTraceIds: ea.sampleTraceIds,
          additionalInfo: ea.additionalInfo,
        }));

        const slackResult = await this.slackNotifier.sendAlertBatch(slackAlerts);

        if (slackResult.success) {
          alertsSent = triggeredAlerts.length;
          console.log(`[HeartbeatService] Sent ${alertsSent} alerts to Slack`);
        } else {
          console.warn('[HeartbeatService] Failed to send Slack notification:', slackResult.error);
        }
      }

      this.lastRunAt = new Date().toISOString();
      this.updateNextRunAt();

    } catch (err: any) {
      status = 'error';
      errorMessage = err.message || 'Unknown error';
      console.error('[HeartbeatService] Error during heartbeat:', err);
    }

    const durationMs = Date.now() - startTime;

    // Update heartbeat run record
    this.updateHeartbeatRun(runId, {
      completedAt: new Date().toISOString(),
      alertsChecked,
      alertsTriggered,
      alertsSent,
      alertsSuppressed,
      durationMs,
      status,
      errorMessage,
    });

    console.log(`[HeartbeatService] Heartbeat complete: ${alertsChecked} checked, ${alertsTriggered} triggered, ${alertsSent} sent, ${alertsSuppressed} suppressed (${durationMs}ms)`);

    return {
      runId,
      alertsChecked,
      alertsTriggered,
      alertsSent,
      alertsSuppressed,
      durationMs,
      status,
      errorMessage,
    };
  }

  /**
   * Get service status
   */
  getStatus(): HeartbeatStatus {
    const alertCounts = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled
      FROM heartbeat_alerts
    `).get() as any;

    const lastRun = this.db.prepare(`
      SELECT status FROM heartbeat_runs ORDER BY started_at DESC LIMIT 1
    `).get() as any;

    return {
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      lastRunStatus: lastRun?.status,
      alertsEnabled: alertCounts?.enabled || 0,
      alertsTotal: alertCounts?.total || 0,
    };
  }

  /**
   * Update the Slack notifier configuration
   */
  updateSlackConfig(config: Partial<SlackConfig>): void {
    this.slackNotifier.updateConfig(config);
  }

  /**
   * Test Slack webhook connectivity
   */
  async testSlackConnection(): Promise<{ success: boolean; error?: string }> {
    return this.slackNotifier.testConnection();
  }

  /**
   * Set the Langfuse config ID to use for trace queries
   */
  setConfigId(configId: number): void {
    this.configId = configId;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private getSlackConfigFromDb(): SlackConfig {
    let row = this.db.prepare(`SELECT * FROM heartbeat_slack_config LIMIT 1`).get() as any;

    if (!row) {
      // Create default config
      this.db.prepare(`INSERT INTO heartbeat_slack_config (enabled) VALUES (0)`).run();
      row = this.db.prepare(`SELECT * FROM heartbeat_slack_config LIMIT 1`).get() as any;
    }

    // Get Langfuse settings for trace URLs
    const langfuseHost = this.db.prepare(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'langfuse_host'`
    ).get() as any;
    const langfuseProjectId = this.db.prepare(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'langfuse_project_id'`
    ).get() as any;

    return {
      webhookUrl: row?.webhook_url,
      defaultChannel: row?.default_channel,
      criticalChannel: row?.critical_channel,
      enabled: row?.enabled === 1,
      langfuseHost: langfuseHost?.setting_value,
      langfuseProjectId: langfuseProjectId?.setting_value,
    };
  }

  private createHeartbeatRun(): number {
    const result = this.db.prepare(`
      INSERT INTO heartbeat_runs (started_at, status)
      VALUES (CURRENT_TIMESTAMP, 'running')
    `).run();
    return result.lastInsertRowid as number;
  }

  private updateHeartbeatRun(id: number, updates: {
    completedAt?: string;
    alertsChecked?: number;
    alertsTriggered?: number;
    alertsSent?: number;
    alertsSuppressed?: number;
    durationMs?: number;
    status?: string;
    errorMessage?: string;
  }): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.completedAt !== undefined) { fields.push('completed_at = ?'); values.push(updates.completedAt); }
    if (updates.alertsChecked !== undefined) { fields.push('alerts_checked = ?'); values.push(updates.alertsChecked); }
    if (updates.alertsTriggered !== undefined) { fields.push('alerts_triggered = ?'); values.push(updates.alertsTriggered); }
    if (updates.alertsSent !== undefined) { fields.push('alerts_sent = ?'); values.push(updates.alertsSent); }
    if (updates.alertsSuppressed !== undefined) { fields.push('alerts_suppressed = ?'); values.push(updates.alertsSuppressed); }
    if (updates.durationMs !== undefined) { fields.push('duration_ms = ?'); values.push(updates.durationMs); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.errorMessage !== undefined) { fields.push('error_message = ?'); values.push(updates.errorMessage); }

    if (fields.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE heartbeat_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  private recordAlertHistory(
    runId: number,
    evaluated: EvaluatedAlert,
    suppressed: boolean,
    suppressionReason?: string
  ): void {
    this.db.prepare(`
      INSERT INTO heartbeat_alert_history
      (heartbeat_run_id, alert_id, triggered_at, metric_value, threshold_value, severity,
       slack_sent, suppressed, suppression_reason, sample_trace_ids)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      evaluated.alert.id,
      evaluated.metricValue,
      evaluated.alert.thresholdValue,
      evaluated.alert.severity,
      suppressed ? 0 : 1,
      suppressed ? 1 : 0,
      suppressionReason || null,
      evaluated.sampleTraceIds ? JSON.stringify(evaluated.sampleTraceIds) : null
    );
  }

  private updateNextRunAt(): void {
    if (this.isRunning) {
      const nextRun = new Date(Date.now() + this.intervalMinutes * 60 * 1000);
      this.nextRunAt = nextRun.toISOString();
    }
  }
}

// Singleton instance for global access
let heartbeatServiceInstance: HeartbeatService | null = null;

export function getHeartbeatService(db?: BetterSqlite3.Database, dashboardBaseUrl?: string): HeartbeatService {
  if (!heartbeatServiceInstance && db) {
    heartbeatServiceInstance = new HeartbeatService(db, dashboardBaseUrl);
  }
  if (!heartbeatServiceInstance) {
    throw new Error('HeartbeatService not initialized. Call with database connection first.');
  }
  return heartbeatServiceInstance;
}

export function resetHeartbeatService(): void {
  if (heartbeatServiceInstance) {
    heartbeatServiceInstance.stop();
    heartbeatServiceInstance = null;
  }
}

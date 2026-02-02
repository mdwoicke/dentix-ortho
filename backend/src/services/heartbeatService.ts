/**
 * Heartbeat Service
 * Orchestrates periodic alert checking, evaluation, and notifications
 */

import BetterSqlite3 from 'better-sqlite3';
import { AlertEngine, EvaluatedAlert } from './alertEngine';
import { SlackNotifier, TriggeredAlert, SlackConfig } from './slackNotifier';
import { getMonitoringService } from './monitoringService';

// Node-RED cache refresh config (same as testMonitorController)
const NODERED_CACHE_BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd';
const NODERED_AUTH = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

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
  langfuseConfigId?: number;
  langfuseConfigName?: string;
  monitoringEnabled: boolean;
  lastMonitoringCycleAt?: string;
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
  monitoringChecked?: number;
  monitoringFailed?: number;
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
  // The service interval is the base check frequency.
  // Each alert has its own check_interval_minutes - the service runs frequently
  // and only evaluates alerts that are due based on their individual intervals.
  private intervalMinutes: number = 1;
  private lastRunAt?: string;
  private nextRunAt?: string;
  private configId?: number;
  private monitoringEnabled: boolean = true;
  private lastMonitoringCycleAt?: string;
  private static readonly MONITORING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

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
    let monitoringChecked = 0;
    let monitoringFailed = 0;

    try {
      // Evaluate only alerts that are due based on their individual check intervals
      // Pass onlyDue=true to filter by interval, markChecked=true to update last_checked_at
      const evaluatedAlerts = await this.alertEngine.evaluateAlerts(this.configId, true, true);
      alertsChecked = evaluatedAlerts.length;

      if (alertsChecked === 0) {
        console.log('[HeartbeatService] No alerts due for checking');
      }

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

      // Auto-recovery: attempt cache refresh for cache_staleness alerts before notifying
      const cacheStaleAlerts = triggeredAlerts.filter(a => a.alert.metricType === 'cache_staleness');
      if (cacheStaleAlerts.length > 0) {
        const recovered = await this.attemptCacheRecovery(cacheStaleAlerts);
        if (recovered.length > 0) {
          // Remove auto-resolved alerts from triggeredAlerts, replace with info messages
          for (const resolvedAlert of recovered) {
            const idx = triggeredAlerts.findIndex(a => a.alert.id === resolvedAlert.alert.id);
            if (idx !== -1) {
              // Downgrade: mark as not triggered so it won't send a critical Slack alert
              triggeredAlerts.splice(idx, 1);
              alertsTriggered--;
              console.log(`[HeartbeatService] Cache staleness alert "${resolvedAlert.alert.name}" auto-resolved after refresh`);
            }
          }
        }
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

      // ================================================================
      // MONITORING CYCLE (runs every 5 minutes)
      // ================================================================
      if (this.monitoringEnabled) {
        const now = Date.now();
        const lastMonitoring = this.lastMonitoringCycleAt
          ? new Date(this.lastMonitoringCycleAt).getTime()
          : 0;

        if (now - lastMonitoring >= HeartbeatService.MONITORING_INTERVAL_MS) {
          try {
            const monitoringService = getMonitoringService(this.db);
            const monitoringResult = await monitoringService.runMonitoringCycle(this.configId);
            monitoringChecked = monitoringResult.sessionsChecked;
            monitoringFailed = monitoringResult.failed;
            this.lastMonitoringCycleAt = new Date().toISOString();

            // Auto-trigger diagnostics if there were failures
            if (monitoringResult.failed > 0) {
              try {
                const diagResult = await monitoringService.triggerDiagnostics();
                console.log(`[HeartbeatService] Diagnostics: ${diagResult.diagnosed} diagnosed, ${diagResult.errors} errors`);
              } catch (diagErr: any) {
                console.warn(`[HeartbeatService] Diagnostic trigger failed: ${diagErr.message}`);
              }
            }

            console.log(`[HeartbeatService] Monitoring: ${monitoringChecked} checked, ${monitoringFailed} failed`);
          } catch (monErr: any) {
            console.warn(`[HeartbeatService] Monitoring cycle failed (non-fatal): ${monErr.message}`);
          }
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
      monitoringChecked,
      monitoringFailed,
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

    // Get current Langfuse config name
    let langfuseConfigName: string | undefined;
    if (this.configId) {
      const config = this.db.prepare(`
        SELECT name FROM langfuse_configs WHERE id = ?
      `).get(this.configId) as any;
      langfuseConfigName = config?.name;
    }

    return {
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      lastRunStatus: lastRun?.status,
      alertsEnabled: alertCounts?.enabled || 0,
      alertsTotal: alertCounts?.total || 0,
      langfuseConfigId: this.configId,
      langfuseConfigName,
      monitoringEnabled: this.monitoringEnabled,
      lastMonitoringCycleAt: this.lastMonitoringCycleAt,
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
  // AUTO-RECOVERY: CACHE STALENESS
  // ============================================================================

  /**
   * Attempt to refresh the cache when staleness is detected.
   * Returns the subset of alerts that were resolved after refresh.
   */
  private async attemptCacheRecovery(staleAlerts: EvaluatedAlert[]): Promise<EvaluatedAlert[]> {
    console.log(`[HeartbeatService] Auto-recovery: attempting cache refresh for ${staleAlerts.length} cache_staleness alert(s)`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch(`${NODERED_CACHE_BASE_URL}/cache/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': NODERED_AUTH,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier: 'all' }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[HeartbeatService] Auto-recovery: cache refresh returned ${response.status}: ${errorText.substring(0, 200)}`);
        // Annotate alerts with recovery attempt info
        for (const alert of staleAlerts) {
          alert.additionalInfo = {
            ...alert.additionalInfo,
            autoRecoveryAttempted: true,
            autoRecoveryResult: 'failed',
            autoRecoveryError: `HTTP ${response.status}`,
          };
        }
        return [];
      }

      console.log('[HeartbeatService] Auto-recovery: cache refresh succeeded, re-evaluating staleness...');

      // Re-evaluate each cache_staleness alert to see if it's resolved
      const resolved: EvaluatedAlert[] = [];
      for (const evaluated of staleAlerts) {
        const freshMetric = await this.alertEngine.getMetricValue(
          evaluated.alert.metricType,
          evaluated.alert.lookbackMinutes,
          this.configId || 1
        );
        const stillTriggered = this.evaluateCondition(
          freshMetric.value,
          evaluated.alert.conditionOperator,
          evaluated.alert.thresholdValue
        );

        if (!stillTriggered) {
          resolved.push(evaluated);
        } else {
          // Still stale after refresh - annotate for Slack
          evaluated.additionalInfo = {
            ...evaluated.additionalInfo,
            autoRecoveryAttempted: true,
            autoRecoveryResult: 'still_stale',
            metricValueAfterRefresh: freshMetric.value,
          };
        }
      }

      return resolved;
    } catch (err: any) {
      console.error('[HeartbeatService] Auto-recovery: cache refresh failed:', err.message);
      for (const alert of staleAlerts) {
        alert.additionalInfo = {
          ...alert.additionalInfo,
          autoRecoveryAttempted: true,
          autoRecoveryResult: 'error',
          autoRecoveryError: err.message,
        };
      }
      return [];
    }
  }

  /**
   * Evaluate a condition (mirrors AlertEngine.evaluateCondition for re-check)
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
       slack_sent, suppressed, suppression_reason, sample_trace_ids, additional_info)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      evaluated.alert.id,
      evaluated.metricValue,
      evaluated.alert.thresholdValue,
      evaluated.alert.severity,
      suppressed ? 0 : 1,
      suppressed ? 1 : 0,
      suppressionReason || null,
      evaluated.sampleTraceIds ? JSON.stringify(evaluated.sampleTraceIds) : null,
      evaluated.additionalInfo ? JSON.stringify(evaluated.additionalInfo) : null
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

/**
 * Slack Notifier Service
 * Sends formatted alert notifications to Slack via webhooks
 */

import axios from 'axios';
import { AlertErrorDetail, AlertResolution } from '../types/alerts';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SlackConfig {
  webhookUrl?: string;
  defaultChannel?: string;
  criticalChannel?: string;
  enabled: boolean;
  langfuseHost?: string;
  langfuseProjectId?: string;
}

export interface TriggeredAlert {
  alertId: number;
  alertName: string;
  description?: string;
  metricType: string;
  metricValue: number;
  thresholdValue: number;
  thresholdUnit?: string;
  severity: 'critical' | 'warning' | 'info';
  lookbackMinutes: number;
  sampleTraceIds?: string[];
  additionalInfo?: Record<string, any>;
}

export interface SlackResponse {
  success: boolean;
  messageTs?: string;
  error?: string;
}

// Slack Block Kit types
interface SlackBlock {
  type: string;
  text?: any;
  elements?: any[];
  fields?: any[];
  accessory?: any;
}

// ============================================================================
// SLACK NOTIFIER SERVICE
// ============================================================================

export class SlackNotifier {
  private config: SlackConfig;
  private dashboardBaseUrl: string;

  constructor(config: SlackConfig, dashboardBaseUrl: string = 'http://localhost:3000') {
    this.config = config;
    this.dashboardBaseUrl = dashboardBaseUrl;
  }

  /**
   * Update the configuration
   */
  updateConfig(config: Partial<SlackConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Test the webhook connectivity
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.config.webhookUrl) {
      return { success: false, error: 'No webhook URL configured' };
    }

    try {
      const response = await axios.post(this.config.webhookUrl, {
        text: 'Dentix Ortho Alert System - Connection Test',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Dentix Ortho Alert System*\nConnection test successful! Alerts are now configured.',
            },
          },
        ],
      });

      return { success: response.status === 200 };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data || error.message || 'Unknown error',
      };
    }
  }

  /**
   * Send a batch of alerts as a single formatted message
   */
  async sendAlertBatch(alerts: TriggeredAlert[]): Promise<SlackResponse> {
    if (!this.config.enabled || !this.config.webhookUrl) {
      return { success: false, error: 'Slack notifications disabled or not configured' };
    }

    if (alerts.length === 0) {
      return { success: true };
    }

    // Determine the highest severity
    const highestSeverity = this.getHighestSeverity(alerts);

    // Build the message blocks
    const blocks = this.formatAlertBlocks(alerts, highestSeverity);

    // Determine which channel to use
    const channel = highestSeverity === 'critical' && this.config.criticalChannel
      ? this.config.criticalChannel
      : this.config.defaultChannel;

    try {
      const payload: any = {
        blocks,
        text: this.getPlainTextSummary(alerts), // Fallback for notifications
      };

      // Add channel override if specified
      if (channel) {
        payload.channel = channel;
      }

      const response = await axios.post(this.config.webhookUrl, payload);

      return { success: response.status === 200 };
    } catch (error: any) {
      console.error('[SlackNotifier] Failed to send alert batch:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message || 'Unknown error',
      };
    }
  }

  /**
   * Format alerts into Slack Block Kit blocks
   */
  private formatAlertBlocks(alerts: TriggeredAlert[], highestSeverity: string): SlackBlock[] {
    const blocks: SlackBlock[] = [];

    // Header
    const severityEmoji = this.getSeverityEmoji(highestSeverity);

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${severityEmoji} Dentix Ortho Alert Summary`,
        emoji: true,
      },
    });

    // Context with severity badge
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Severity:* ${highestSeverity.toUpperCase()} | *Alerts:* ${alerts.length} | *Time:* ${new Date().toLocaleString()}`,
        },
      ],
    });

    blocks.push({ type: 'divider' });

    // Individual alert sections
    for (const alert of alerts) {
      const alertEmoji = this.getSeverityEmoji(alert.severity);
      const valueDisplay = this.formatMetricValue(alert.metricValue, alert.thresholdUnit);
      const thresholdDisplay = this.formatMetricValue(alert.thresholdValue, alert.thresholdUnit);

      // Build alert-specific details
      let alertDetails = [
        `${alertEmoji} *${this.formatAlertName(alert.alertName)}*`,
        alert.description ? `_${alert.description}_` : '',
        '',
        `*Value:* ${valueDisplay} (threshold: ${thresholdDisplay})`,
        `*Window:* Last ${alert.lookbackMinutes} minutes`,
      ];

      // Special handling for goal_test_failures - include test details
      if (alert.metricType === 'goal_test_failures' && alert.additionalInfo?.failedTests) {
        const failedTests = alert.additionalInfo.failedTests as any[];
        if (failedTests.length > 0) {
          alertDetails.push('');
          alertDetails.push('*Failed Tests:*');
          for (const test of failedTests.slice(0, 3)) {
            let testLine = `• \`${test.testId}\``;
            // Add link to test run detail page if run_id available
            if (test.runId) {
              const runUrl = `${this.dashboardBaseUrl}/test-monitor/run/${encodeURIComponent(test.runId)}`;
              testLine += ` (<${runUrl}|View Run>)`;
            }
            // Add Langfuse trace link if available
            if (test.langfuseTraceId && this.config.langfuseHost && this.config.langfuseProjectId) {
              const traceUrl = `${this.config.langfuseHost}/project/${this.config.langfuseProjectId}/traces/${test.langfuseTraceId}`;
              testLine += ` (<${traceUrl}|Trace>)`;
            }
            alertDetails.push(testLine);
          }
        }
      } else if (alert.metricType.startsWith('langfuse_') && alert.additionalInfo?.errorDetails) {
        // Enhanced Langfuse alert formatting with error details
        const errorDetails = alert.additionalInfo.errorDetails as AlertErrorDetail[];
        if (errorDetails.length > 0) {
          alertDetails.push('');
          alertDetails.push('*Error Details:*');
          for (const err of errorDetails.slice(0, 3)) {
            const timestamp = err.timestamp ? new Date(err.timestamp).toLocaleTimeString() : '';
            let errLine = `• *${err.action || 'unknown'}*: ${err.errorMessage || 'No message'}`;
            if (timestamp) {
              errLine += ` _${timestamp}_`;
            }
            // Add trace link if available
            if (err.traceId && this.config.langfuseHost && this.config.langfuseProjectId) {
              const traceUrl = `${this.config.langfuseHost}/project/${this.config.langfuseProjectId}/traces/${err.traceId}`;
              errLine += ` (<${traceUrl}|Trace>)`;
            }
            alertDetails.push(errLine);
          }
        }
        // Add standard trace links as fallback
        alertDetails.push(this.formatTraceLinks(alert.sampleTraceIds));
      } else {
        // Standard trace links for other alert types
        alertDetails.push(this.formatTraceLinks(alert.sampleTraceIds));
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: alertDetails.filter(Boolean).join('\n'),
        },
      });

      // Add resolution suggestion for Langfuse alerts
      if (alert.metricType.startsWith('langfuse_') && alert.additionalInfo?.resolution) {
        const resolution = alert.additionalInfo.resolution as AlertResolution;
        const resolutionText = [
          `*Suggested Resolution:* ${resolution.suggestion}`,
          ...resolution.steps.map(s => `  • ${s}`),
        ].join('\n');

        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: resolutionText,
            },
          ],
        });
      }
    }

    blocks.push({ type: 'divider' });

    // Action buttons
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Dashboard',
            emoji: true,
          },
          url: `${this.dashboardBaseUrl}/test-monitor/alerts`,
          style: 'primary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Traces',
            emoji: true,
          },
          url: `${this.dashboardBaseUrl}/test-monitor/call-tracing`,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Manage Alerts',
            emoji: true,
          },
          url: `${this.dashboardBaseUrl}/test-monitor/alerts?tab=settings`,
        },
      ],
    });

    return blocks;
  }

  /**
   * Get plain text summary for notification fallback
   */
  private getPlainTextSummary(alerts: TriggeredAlert[]): string {
    const highestSeverity = this.getHighestSeverity(alerts);
    const alertNames = alerts.map(a => this.formatAlertName(a.alertName)).join(', ');
    return `[${highestSeverity.toUpperCase()}] Dentix Ortho Alerts: ${alertNames}`;
  }

  /**
   * Get the highest severity from a list of alerts
   */
  private getHighestSeverity(alerts: TriggeredAlert[]): string {
    const severityOrder = ['critical', 'warning', 'info'];
    for (const severity of severityOrder) {
      if (alerts.some(a => a.severity === severity)) {
        return severity;
      }
    }
    return 'info';
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical': return ':rotating_light:';
      case 'warning': return ':warning:';
      case 'info': return ':information_source:';
      default: return ':bell:';
    }
  }

  /**
   * Format alert name for display
   */
  private formatAlertName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Format trace IDs as clickable Langfuse links
   */
  private formatTraceLinks(traceIds?: string[]): string {
    if (!traceIds?.length) return '';

    const { langfuseHost, langfuseProjectId } = this.config;

    // If Langfuse is configured, create clickable links
    if (langfuseHost && langfuseProjectId) {
      const links = traceIds.slice(0, 3).map((id, idx) => {
        const url = `${langfuseHost}/project/${langfuseProjectId}/traces/${id}`;
        return `<${url}|Trace ${idx + 1}>`;
      });
      return `*Sample traces:* ${links.join(' | ')}`;
    }

    // Fallback: just show trace IDs
    return `*Sample traces:* ${traceIds.slice(0, 3).join(', ')}`;
  }

  /**
   * Format metric value with unit
   */
  private formatMetricValue(value: number, unit?: string): string {
    if (!unit) return value.toString();

    switch (unit) {
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'ms':
        return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
      case 'dollars':
        return `$${value.toFixed(2)}`;
      case 'count':
        return value.toString();
      default:
        return `${value} ${unit}`;
    }
  }

  /**
   * Send a resolution notification when an alert clears
   */
  async sendResolutionNotification(alertName: string, resolvedAt: string): Promise<SlackResponse> {
    if (!this.config.enabled || !this.config.webhookUrl) {
      return { success: false, error: 'Slack notifications disabled or not configured' };
    }

    try {
      const response = await axios.post(this.config.webhookUrl, {
        text: `Alert Resolved: ${this.formatAlertName(alertName)}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:white_check_mark: *Alert Resolved:* ${this.formatAlertName(alertName)}\n_Resolved at ${new Date(resolvedAt).toLocaleString()}_`,
            },
          },
        ],
      });

      return { success: response.status === 200 };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data || error.message || 'Unknown error',
      };
    }
  }
}

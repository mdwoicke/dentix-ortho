/**
 * AlertsPage - Heartbeat Alerting Dashboard
 * Manage alert rules, view trigger history, and configure Slack notifications
 */

import React, { useState, useEffect, useCallback } from 'react';
import { API_CONFIG } from '../../utils/constants';

// ============================================================================
// TIMEZONE CONSTANTS
// ============================================================================

interface TimezoneOption {
  value: string;
  label: string;
  abbrev: string;
}

const US_TIMEZONES: TimezoneOption[] = [
  { value: 'America/Chicago', label: 'Central Time', abbrev: 'CT' },
  { value: 'America/New_York', label: 'Eastern Time', abbrev: 'ET' },
  { value: 'America/Denver', label: 'Mountain Time', abbrev: 'MT' },
  { value: 'America/Los_Angeles', label: 'Pacific Time', abbrev: 'PT' },
  { value: 'America/Anchorage', label: 'Alaska Time', abbrev: 'AKT' },
  { value: 'America/Honolulu', label: 'Hawaii Time', abbrev: 'HT' },
  { value: 'UTC', label: 'UTC', abbrev: 'UTC' },
];

const ALERTS_TIMEZONE_STORAGE_KEY = 'alerts_timezone';

function getStoredTimezone(): string {
  try {
    const stored = localStorage.getItem(ALERTS_TIMEZONE_STORAGE_KEY);
    if (stored && US_TIMEZONES.some(tz => tz.value === stored)) {
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }
  // Default to Central Time
  return 'America/Chicago';
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface HeartbeatAlert {
  id: number;
  name: string;
  description?: string;
  metricType: string;
  conditionOperator: string;
  thresholdValue: number;
  thresholdUnit?: string;
  lookbackMinutes: number;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  slackChannel?: string;
  cooldownMinutes: number;
  createdAt?: string;
  updatedAt?: string;
}

interface AlertHistory {
  id: number;
  alertId: number;
  alertName: string;
  triggeredAt: string;
  metricValue: number;
  thresholdValue: number;
  severity: string;
  slackSent: boolean;
  suppressed: boolean;
  suppressionReason?: string;
  resolvedAt?: string;
  metricType: string;
}

interface HeartbeatStatus {
  isRunning: boolean;
  intervalMinutes: number;
  lastRunAt?: string;
  nextRunAt?: string;
  alertsEnabled: number;
  alertsTotal: number;
}

interface SlackStatus {
  configured: boolean;
  enabled: boolean;
  defaultChannel?: string;
  criticalChannel?: string;
  lastTestAt?: string;
  lastTestSuccess?: boolean;
}

interface MetricInfo {
  id: string;
  name: string;
  description: string;
  unit: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AlertsPage() {
  const [activeTab, setActiveTab] = useState<'rules' | 'history' | 'settings'>('rules');
  const [alerts, setAlerts] = useState<HeartbeatAlert[]>([]);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [status, setStatus] = useState<HeartbeatStatus | null>(null);
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
  const [metrics, setMetrics] = useState<MetricInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timezone state
  const [timezone, setTimezone] = useState<string>(getStoredTimezone);

  // Alert form state
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [editingAlert, setEditingAlert] = useState<HeartbeatAlert | null>(null);

  // Slack config form state
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [slackDefaultChannel, setSlackDefaultChannel] = useState('');
  const [slackCriticalChannel, setSlackCriticalChannel] = useState('');
  const [slackEnabled, setSlackEnabled] = useState(false);

  // Heartbeat interval state
  const [checkIntervalMinutes, setCheckIntervalMinutes] = useState(5);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [alertsRes, historyRes, statusRes, slackRes, metricsRes] = await Promise.all([
        fetch(`${API_CONFIG.BASE_URL}/heartbeat/alerts`),
        fetch(`${API_CONFIG.BASE_URL}/heartbeat/alerts/history?limit=100`),
        fetch(`${API_CONFIG.BASE_URL}/heartbeat/status`),
        fetch(`${API_CONFIG.BASE_URL}/heartbeat/slack/status`),
        fetch(`${API_CONFIG.BASE_URL}/heartbeat/metrics`),
      ]);

      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (historyRes.ok) setHistory(await historyRes.json());
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
        if (statusData.intervalMinutes) {
          setCheckIntervalMinutes(statusData.intervalMinutes);
        }
      }
      if (slackRes.ok) {
        const slack = await slackRes.json();
        setSlackStatus(slack);
        setSlackEnabled(slack.enabled);
        setSlackDefaultChannel(slack.defaultChannel || '');
        setSlackCriticalChannel(slack.criticalChannel || '');
      }
      if (metricsRes.ok) setMetrics(await metricsRes.json());

      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  // ============================================================================
  // HEARTBEAT SERVICE CONTROLS
  // ============================================================================

  const toggleService = async () => {
    try {
      const action = status?.isRunning ? 'stop' : 'start';
      const res = await fetch(`${API_CONFIG.BASE_URL}/heartbeat/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: checkIntervalMinutes }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to toggle service:', err);
    }
  };

  const updateInterval = async (minutes: number) => {
    setCheckIntervalMinutes(minutes);
    // If service is running, restart it with the new interval
    if (status?.isRunning) {
      try {
        await fetch(`${API_CONFIG.BASE_URL}/heartbeat/stop`, { method: 'POST' });
        await fetch(`${API_CONFIG.BASE_URL}/heartbeat/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intervalMinutes: minutes }),
        });
        fetchData();
      } catch (err) {
        console.error('Failed to update interval:', err);
      }
    }
  };

  const runManualCheck = async () => {
    try {
      await fetch(`${API_CONFIG.BASE_URL}/heartbeat/run`, { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error('Failed to run manual check:', err);
    }
  };

  // ============================================================================
  // ALERT CRUD
  // ============================================================================

  const toggleAlert = async (alert: HeartbeatAlert) => {
    try {
      await fetch(`${API_CONFIG.BASE_URL}/heartbeat/alerts/${alert.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !alert.enabled }),
      });
      fetchData();
    } catch (err) {
      console.error('Failed to toggle alert:', err);
    }
  };

  const deleteAlert = async (id: number) => {
    if (!confirm('Are you sure you want to delete this alert?')) return;
    try {
      await fetch(`${API_CONFIG.BASE_URL}/heartbeat/alerts/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('Failed to delete alert:', err);
    }
  };

  // ============================================================================
  // SLACK CONFIGURATION
  // ============================================================================

  const saveSlackConfig = async () => {
    try {
      await fetch(`${API_CONFIG.BASE_URL}/heartbeat/slack/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: slackWebhookUrl || undefined,
          defaultChannel: slackDefaultChannel || undefined,
          criticalChannel: slackCriticalChannel || undefined,
          enabled: slackEnabled,
        }),
      });
      fetchData();
    } catch (err) {
      console.error('Failed to save Slack config:', err);
    }
  };

  const testSlack = async () => {
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/heartbeat/slack/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('Test message sent successfully!');
      } else {
        alert(`Failed to send test message: ${data.error}`);
      }
      fetchData();
    } catch (err) {
      console.error('Failed to test Slack:', err);
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getSeverityBadge = (severity: string) => {
    const colors = {
      critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[severity as keyof typeof colors] || 'bg-gray-100'}`}>
        {severity.toUpperCase()}
      </span>
    );
  };

  const formatMetricValue = (value: number, unit?: string) => {
    if (!unit) return value.toString();
    switch (unit) {
      case 'percent': return `${value.toFixed(1)}%`;
      case 'ms': return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
      case 'dollars': return `$${value.toFixed(2)}`;
      default: return `${value} ${unit}`;
    }
  };

  // Handle timezone change
  const handleTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone);
    try {
      localStorage.setItem(ALERTS_TIMEZONE_STORAGE_KEY, newTimezone);
    } catch {
      // Ignore localStorage errors
    }
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get current timezone info
  const currentTimezoneInfo = US_TIMEZONES.find(tz => tz.value === timezone) || US_TIMEZONES[0];

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading && !alerts.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-auto">
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alerts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Monitor production traces and get notified of issues
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Heartbeat Status */}
          <div className="flex items-center space-x-2">
            <span className={`w-3 h-3 rounded-full ${status?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {status?.isRunning ? 'Active' : 'Stopped'}
            </span>
          </div>
          <button
            onClick={toggleService}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${
              status?.isRunning
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {status?.isRunning ? 'Stop' : 'Start'}
          </button>
          <button
            onClick={runManualCheck}
            className="px-4 py-2 text-sm font-medium text-primary-700 bg-primary-100 rounded-lg hover:bg-primary-200"
          >
            Run Now
          </button>

          {/* Timezone Selector */}
          <div className="flex items-center space-x-2 ml-4 pl-4 border-l border-gray-200 dark:border-gray-700">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <select
              value={timezone}
              onChange={(e) => handleTimezoneChange(e.target.value)}
              className="block px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {US_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>
                  {tz.label} ({tz.abbrev})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="text-sm text-gray-500 dark:text-gray-400">Enabled Alerts</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {status?.alertsEnabled || 0} / {status?.alertsTotal || 0}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="text-sm text-gray-500 dark:text-gray-400">Check Interval</div>
          <div className="text-lg font-medium text-gray-900 dark:text-white">
            {checkIntervalMinutes} min{checkIntervalMinutes !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="text-sm text-gray-500 dark:text-gray-400">Last Check</div>
          <div className="text-lg font-medium text-gray-900 dark:text-white">
            {status?.lastRunAt ? formatTime(status.lastRunAt) : 'Never'}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="text-sm text-gray-500 dark:text-gray-400">Next Check</div>
          <div className="text-lg font-medium text-gray-900 dark:text-white">
            {status?.nextRunAt ? formatTime(status.nextRunAt) : 'N/A'}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="text-sm text-gray-500 dark:text-gray-400">Slack Status</div>
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${slackStatus?.configured && slackStatus?.enabled ? 'bg-green-500' : 'bg-gray-400'}`}></span>
            <span className="text-lg font-medium text-gray-900 dark:text-white">
              {slackStatus?.configured ? (slackStatus.enabled ? 'Connected' : 'Disabled') : 'Not Configured'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {[
            { id: 'rules', label: 'Alert Rules' },
            { id: 'history', label: 'Alert History' },
            { id: 'settings', label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Alert Rules</h2>
            <button
              onClick={() => {
                setEditingAlert(null);
                setShowAlertForm(true);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              + Create Alert
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Threshold</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {alerts.map((alert) => {
                  const metric = metrics.find(m => m.id === alert.metricType);
                  return (
                    <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {alert.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </div>
                        {alert.description && (
                          <div className="text-sm text-gray-500">{alert.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                        {metric?.name || alert.metricType}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                        {alert.conditionOperator === 'gt' ? '>' : '<'}{' '}
                        {formatMetricValue(alert.thresholdValue, alert.thresholdUnit)}
                      </td>
                      <td className="px-6 py-4">
                        {getSeverityBadge(alert.severity)}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleAlert(alert)}
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            alert.enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {alert.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingAlert(alert);
                            setShowAlertForm(true);
                          }}
                          className="text-primary-600 hover:text-primary-800 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteAlert(alert.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Alert History</h2>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alert</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No alerts have been triggered yet
                      </td>
                    </tr>
                  ) : (
                    history.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                          {formatTime(item.triggeredAt)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {item.alertName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                          {item.metricValue} (threshold: {item.thresholdValue})
                        </td>
                        <td className="px-6 py-4">
                          {getSeverityBadge(item.severity)}
                        </td>
                        <td className="px-6 py-4">
                          {item.suppressed ? (
                            <span className="text-xs text-gray-500">Suppressed (cooldown)</span>
                          ) : item.slackSent ? (
                            <span className="text-xs text-green-600">Sent to Slack</span>
                          ) : (
                            <span className="text-xs text-yellow-600">Not sent</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-2xl">
          {/* Heartbeat Configuration */}
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Heartbeat Configuration</h2>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Check Interval
              </label>
              <div className="flex items-center space-x-4">
                <select
                  value={checkIntervalMinutes}
                  onChange={(e) => updateInterval(parseInt(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value={1}>1 minute</option>
                  <option value={2}>2 minutes</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  How often to check alert conditions
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Current interval: {checkIntervalMinutes} minute{checkIntervalMinutes !== 1 ? 's' : ''}
                {status?.isRunning && ' (service will restart with new interval)'}
              </p>
            </div>
          </div>

          {/* Slack Configuration */}
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Slack Configuration</h2>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Webhook URL
              </label>
              <input
                type="password"
                value={slackWebhookUrl}
                onChange={(e) => setSlackWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Default Channel
              </label>
              <input
                type="text"
                value={slackDefaultChannel}
                onChange={(e) => setSlackDefaultChannel(e.target.value)}
                placeholder="#alerts"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Critical Alerts Channel (optional)
              </label>
              <input
                type="text"
                value={slackCriticalChannel}
                onChange={(e) => setSlackCriticalChannel(e.target.value)}
                placeholder="#incidents"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                checked={slackEnabled}
                onChange={(e) => setSlackEnabled(e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Enable Slack notifications
              </label>
            </div>

            <div className="flex space-x-4 pt-4">
              <button
                onClick={saveSlackConfig}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
              >
                Save Configuration
              </button>
              <button
                onClick={testSlack}
                disabled={!slackStatus?.configured}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Send Test Message
              </button>
            </div>

            {slackStatus?.lastTestAt && (
              <div className="text-sm text-gray-500 pt-2">
                Last test: {formatTime(slackStatus.lastTestAt)} -{' '}
                {slackStatus.lastTestSuccess ? (
                  <span className="text-green-600">Success</span>
                ) : (
                  <span className="text-red-600">Failed</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alert Form Modal */}
      {showAlertForm && (
        <AlertFormModal
          alert={editingAlert}
          metrics={metrics}
          onClose={() => {
            setShowAlertForm(false);
            setEditingAlert(null);
          }}
          onSave={() => {
            setShowAlertForm(false);
            setEditingAlert(null);
            fetchData();
          }}
        />
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 text-red-800 px-4 py-2 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ALERT FORM MODAL
// ============================================================================

interface AlertFormModalProps {
  alert: HeartbeatAlert | null;
  metrics: MetricInfo[];
  onClose: () => void;
  onSave: () => void;
}

function AlertFormModal({ alert, metrics, onClose, onSave }: AlertFormModalProps) {
  const [name, setName] = useState(alert?.name || '');
  const [description, setDescription] = useState(alert?.description || '');
  const [metricType, setMetricType] = useState(alert?.metricType || metrics[0]?.id || '');
  const [conditionOperator, setConditionOperator] = useState(alert?.conditionOperator || 'gt');
  const [thresholdValue, setThresholdValue] = useState(alert?.thresholdValue?.toString() || '');
  const [severity, setSeverity] = useState<'critical' | 'warning' | 'info'>(alert?.severity || 'warning');
  const [lookbackMinutes, setLookbackMinutes] = useState(alert?.lookbackMinutes?.toString() || '15');
  const [cooldownMinutes, setCooldownMinutes] = useState(alert?.cooldownMinutes?.toString() || '30');
  const [enabled, setEnabled] = useState(alert?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const selectedMetric = metrics.find(m => m.id === metricType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        name,
        description,
        metricType,
        conditionOperator,
        thresholdValue: parseFloat(thresholdValue),
        thresholdUnit: selectedMetric?.unit,
        lookbackMinutes: parseInt(lookbackMinutes),
        severity,
        cooldownMinutes: parseInt(cooldownMinutes),
        enabled,
      };

      const url = alert
        ? `${API_CONFIG.BASE_URL}/heartbeat/alerts/${alert.id}`
        : `${API_CONFIG.BASE_URL}/heartbeat/alerts`;

      const res = await fetch(url, {
        method: alert ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSave();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save alert');
      }
    } catch (err) {
      console.error('Failed to save alert:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            {alert ? 'Edit Alert' : 'Create Alert'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="my_custom_alert"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this alert"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Metric
              </label>
              <select
                value={metricType}
                onChange={(e) => setMetricType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
              >
                {metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </select>
              {selectedMetric && (
                <p className="text-xs text-gray-500 mt-1">{selectedMetric.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Condition
                </label>
                <select
                  value={conditionOperator}
                  onChange={(e) => setConditionOperator(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="gt">Greater than (&gt;)</option>
                  <option value="lt">Less than (&lt;)</option>
                  <option value="gte">Greater or equal (&ge;)</option>
                  <option value="lte">Less or equal (&le;)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Threshold
                </label>
                <input
                  type="number"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(e.target.value)}
                  required
                  step="any"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Lookback (minutes)
                </label>
                <input
                  type="number"
                  value={lookbackMinutes}
                  onChange={(e) => setLookbackMinutes(e.target.value)}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cooldown (minutes)
                </label>
                <input
                  type="number"
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(e.target.value)}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Severity
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Enable this alert
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AlertsPage;

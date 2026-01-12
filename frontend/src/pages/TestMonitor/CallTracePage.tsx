/**
 * Call Tracing Page
 * View and import production conversation traces from Langfuse
 */

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../components/layout';
import { Button, Card, Spinner } from '../../components/ui';
import { TranscriptViewer } from '../../components/features/testMonitor/TranscriptViewer';
import { PerformanceWaterfall } from '../../components/features/testMonitor/PerformanceWaterfall';
import { LangfuseConnectionsManager } from '../../components/features/testMonitor/LangfuseConnectionsManager';
import { TraceInsights } from '../../components/features/testMonitor/TraceInsights';
import {
  getImportHistory,
  getLastImportDate,
  getProductionSession,
  getProductionSessions,
  getProductionTrace,
  getProductionTraces,
  importProductionTraces,
  rebuildProductionSessions,
} from '../../services/api/testMonitorApi';
import { getLangfuseConfigs, getAppSettings } from '../../services/api/appSettingsApi';
import type {
  ImportHistoryEntry,
  ProductionSession,
  ProductionSessionDetailResponse,
  ProductionTrace,
  ProductionTraceDetail,
  TraceInsightsResponse,
} from '../../types/testMonitor.types';
import type { LangfuseConfigProfile } from '../../types/appSettings.types';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Download: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Eye: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  ExternalLink: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
  X: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  AlertCircle: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Search: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Filter: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  ),
  XCircle: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  ExclamationCircle: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  Copy: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  CalendarCheck: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l2 2 4-4" />
    </svg>
  ),
};

// ============================================================================
// TIMEZONE CONSTANTS
// ============================================================================

interface TimezoneOption {
  value: string;
  label: string;
  abbrev: string;
}

const US_TIMEZONES: TimezoneOption[] = [
  { value: 'America/New_York', label: 'Eastern Time', abbrev: 'ET' },
  { value: 'America/Chicago', label: 'Central Time', abbrev: 'CT' },
  { value: 'America/Denver', label: 'Mountain Time', abbrev: 'MT' },
  { value: 'America/Los_Angeles', label: 'Pacific Time', abbrev: 'PT' },
  { value: 'America/Anchorage', label: 'Alaska Time', abbrev: 'AKT' },
  { value: 'America/Honolulu', label: 'Hawaii Time', abbrev: 'HT' },
  { value: 'UTC', label: 'UTC', abbrev: 'UTC' },
];

const TIMEZONE_STORAGE_KEY = 'productionCalls_timezone';

function getStoredTimezone(): string {
  try {
    const stored = localStorage.getItem(TIMEZONE_STORAGE_KEY);
    if (stored && US_TIMEZONES.some(tz => tz.value === stored)) {
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }
  // Default to user's local timezone if it matches a US timezone, otherwise Eastern
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (US_TIMEZONES.some(tz => tz.value === localTz)) {
    return localTz;
  }
  return 'America/New_York';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDateWithTimezone(dateString: string, timezone: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  const roundedMs = Math.ceil(ms);
  if (roundedMs < 1000) return `${roundedMs}ms`;
  return `${(roundedMs / 1000).toFixed(1)}s`;
}

function formatCost(cost: number | null): string {
  if (cost === null) return '-';
  return `$${cost.toFixed(4)}`;
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

function calculateSessionSpanSeconds(firstTraceAt: string, lastTraceAt: string): number | null {
  try {
    const first = new Date(firstTraceAt).getTime();
    const last = new Date(lastTraceAt).getTime();
    if (isNaN(first) || isNaN(last)) return null;
    return Math.round((last - first) / 1000);
  } catch {
    return null;
  }
}

function formatSpanDuration(seconds: number | null): string {
  if (seconds === null) return '-';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hrs}h ${remainingMins}m` : `${hrs}h`;
}

// ============================================================================
// TRACE MODAL COMPONENT
// ============================================================================

interface TraceModalProps {
  traceId: string;
  timezone: string;
  onClose: () => void;
}

type TraceModalTab = 'transcript' | 'performance';

function TraceModal({ traceId, timezone, onClose }: TraceModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [traceDetail, setTraceDetail] = useState<ProductionTraceDetail | null>(null);
  const [activeTab, setActiveTab] = useState<TraceModalTab>('transcript');

  useEffect(() => {
    async function fetchTrace() {
      try {
        setLoading(true);
        setError(null);
        const detail = await getProductionTrace(traceId);
        setTraceDetail(detail);
      } catch (err: any) {
        setError(err.message || 'Failed to load trace');
      } finally {
        setLoading(false);
      }
    }
    fetchTrace();
  }, [traceId]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[90vw] max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Production Call Details
            </h2>
            {traceDetail && (
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                <span>{formatDateWithTimezone(traceDetail.trace.startedAt, timezone)}</span>
                {traceDetail.trace.sessionId && (
                  <span className="font-mono text-xs">{traceDetail.trace.sessionId.slice(0, 8)}...</span>
                )}
                {traceDetail.trace.latencyMs && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                    {formatDuration(traceDetail.trace.latencyMs)}
                  </span>
                )}
                {traceDetail.trace.langfuseHost && (
                  <a
                    href={`${traceDetail.trace.langfuseHost}/trace/${traceDetail.trace.traceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <span>View in Langfuse</span>
                    <Icons.ExternalLink />
                  </a>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Icons.X />
          </button>
        </div>

        {/* Tab Navigation */}
        {traceDetail && (
          <div className="px-6 pt-2 border-b border-gray-200 dark:border-gray-700">
            <nav className="flex gap-4">
              <button
                onClick={() => setActiveTab('transcript')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'transcript'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Conversation
              </button>
              <button
                onClick={() => setActiveTab('performance')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
                  activeTab === 'performance'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Icons.Clock />
                Performance
              </button>
            </nav>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12 text-red-500">
              <Icons.AlertCircle />
              <span className="ml-2">{error}</span>
            </div>
          )}

          {traceDetail && activeTab === 'transcript' && (
            <TranscriptViewer
              transcript={traceDetail.transcript}
              apiCalls={traceDetail.apiCalls}
              loading={false}
            />
          )}

          {traceDetail && activeTab === 'performance' && (
            <PerformanceWaterfall
              transcript={traceDetail.transcript}
              apiCalls={traceDetail.apiCalls}
              testStartTime={traceDetail.trace.startedAt}
              testDurationMs={traceDetail.trace.latencyMs || undefined}
              bottleneckThresholdMs={2000}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SESSION MODAL COMPONENT
// ============================================================================

interface SessionModalProps {
  sessionId: string;
  configId?: number;
  timezone: string;
  langfuseProjectId?: string;
  onClose: () => void;
}

type SessionModalTab = 'transcript' | 'performance' | 'traces';

function SessionModal({ sessionId, configId, timezone, langfuseProjectId, onClose }: SessionModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<ProductionSessionDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<SessionModalTab>('transcript');
  const [copied, setCopied] = useState(false);

  // Copy all session data to clipboard
  const handleCopyAll = async () => {
    if (!sessionDetail) return;

    const { session, transcript, traces, apiCalls } = sessionDetail;
    const tzInfo = US_TIMEZONES.find(tz => tz.value === timezone) || US_TIMEZONES[0];

    // Build formatted text
    let text = `PRODUCTION CALL - SESSION DETAILS\n`;
    text += `${'='.repeat(60)}\n\n`;

    // Session info
    text += `Session ID: ${session.sessionId}\n`;
    text += `Messages: ${session.traceCount}\n`;
    text += `First Message: ${formatDateWithTimezone(session.firstTraceAt, timezone)} (${tzInfo.abbrev})\n`;
    text += `Last Message: ${formatDateWithTimezone(session.lastTraceAt, timezone)} (${tzInfo.abbrev})\n`;
    if (session.totalLatencyMs) {
      text += `Total Latency: ${formatDuration(session.totalLatencyMs)}\n`;
    }
    if (session.totalCost) {
      text += `Total Cost: ${formatCost(session.totalCost)}\n`;
    }

    text += `\n${'='.repeat(60)}\n`;
    text += `CONVERSATION TRANSCRIPT\n`;
    text += `${'='.repeat(60)}\n\n`;

    // Transcript
    for (const entry of transcript) {
      const role = entry.role.toUpperCase();
      text += `[${role}]\n`;
      text += `${entry.content}\n\n`;
    }

    // API Calls if any
    if (apiCalls && apiCalls.length > 0) {
      text += `${'='.repeat(60)}\n`;
      text += `API CALLS (${apiCalls.length})\n`;
      text += `${'='.repeat(60)}\n\n`;

      for (const call of apiCalls) {
        text += `${call.name || 'API Call'}\n`;
        text += `  Status: ${call.statusCode || '-'}\n`;
        text += `  Duration: ${formatDuration(call.durationMs)}\n`;
        if (call.input) {
          text += `  Input: ${typeof call.input === 'string' ? call.input : JSON.stringify(call.input, null, 2)}\n`;
        }
        if (call.output) {
          text += `  Output: ${typeof call.output === 'string' ? call.output : JSON.stringify(call.output, null, 2)}\n`;
        }
        text += '\n';
      }
    }

    // Individual traces
    text += `${'='.repeat(60)}\n`;
    text += `INDIVIDUAL TRACES (${traces.length})\n`;
    text += `${'='.repeat(60)}\n\n`;

    for (let i = 0; i < traces.length; i++) {
      const trace = traces[i];
      text += `#${i + 1} - ${trace.name || 'Trace'}\n`;
      text += `  Trace ID: ${trace.traceId}\n`;
      text += `  Timestamp: ${formatDateWithTimezone(trace.startedAt, timezone)} (${tzInfo.abbrev})\n`;
      text += `  Duration: ${formatDuration(trace.latencyMs)}\n`;
      text += `  Cost: ${formatCost(trace.totalCost)}\n\n`;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    async function fetchSession() {
      try {
        setLoading(true);
        setError(null);
        const detail = await getProductionSession(sessionId, configId);
        setSessionDetail(detail);
      } catch (err: any) {
        setError(err.message || 'Failed to load session');
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [sessionId, configId]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[90vw] max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Conversation Details
            </h2>
            {sessionDetail && (
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                <span className="font-mono text-xs">{sessionDetail.session.sessionId.slice(0, 12)}...</span>
                <span>{sessionDetail.session.traceCount} messages</span>
                {sessionDetail.session.totalLatencyMs && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                    {formatDuration(sessionDetail.session.totalLatencyMs)} total
                  </span>
                )}
                {sessionDetail.session.totalCost && (
                  <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                    {formatCost(sessionDetail.session.totalCost)}
                  </span>
                )}
                {sessionDetail.session.langfuseHost && langfuseProjectId && sessionDetail.traces.length > 0 && (
                  <a
                    href={`${sessionDetail.session.langfuseHost}/project/${langfuseProjectId}/traces/${sessionDetail.traces[0].traceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 border border-orange-200 dark:border-orange-700 rounded-lg font-mono text-sm text-orange-700 dark:text-orange-300 transition-colors"
                    title="View in Langfuse"
                  >
                    {/* Langfuse-style icon */}
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    <span className="text-orange-500 dark:text-orange-400">Langfuse:</span>
                    <span className="font-semibold">{sessionDetail.traces[0].traceId.slice(0, 8)}...</span>
                    {/* External link icon */}
                    <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Copy All Button */}
            {sessionDetail && (
              <button
                onClick={handleCopyAll}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  copied
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                title="Copy entire session to clipboard"
              >
                {copied ? <Icons.Check /> : <Icons.Copy />}
                {copied ? 'Copied!' : 'Copy All'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Icons.X />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {sessionDetail && (
          <div className="px-6 pt-2 border-b border-gray-200 dark:border-gray-700">
            <nav className="flex gap-4">
              <button
                onClick={() => setActiveTab('transcript')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'transcript'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Full Conversation ({sessionDetail.transcript.length} turns)
              </button>
              <button
                onClick={() => setActiveTab('performance')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
                  activeTab === 'performance'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Icons.Clock />
                Performance
              </button>
              <button
                onClick={() => setActiveTab('traces')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'traces'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Individual Traces ({sessionDetail.traces.length})
              </button>
            </nav>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12 text-red-500">
              <Icons.AlertCircle />
              <span className="ml-2">{error}</span>
            </div>
          )}

          {sessionDetail && activeTab === 'transcript' && (
            <TranscriptViewer
              transcript={sessionDetail.transcript}
              apiCalls={sessionDetail.apiCalls}
              loading={false}
            />
          )}

          {sessionDetail && activeTab === 'performance' && (
            <PerformanceWaterfall
              transcript={sessionDetail.transcript}
              apiCalls={sessionDetail.apiCalls}
              testStartTime={sessionDetail.session.firstTraceAt}
              testDurationMs={sessionDetail.session.totalLatencyMs || undefined}
              bottleneckThresholdMs={2000}
            />
          )}

          {sessionDetail && activeTab === 'traces' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This conversation consists of {sessionDetail.traces.length} individual trace(s), each representing a message exchange.
              </p>
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Timestamp</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Duration</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sessionDetail.traces.map((trace, idx) => (
                    <tr key={trace.traceId}>
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                        #{idx + 1} - {formatDateWithTimezone(trace.startedAt, timezone)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                        {trace.name || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                        {formatDuration(trace.latencyMs)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                        {formatCost(trace.totalCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

type ViewMode = 'sessions' | 'traces' | 'insights';

export default function CallTracePage() {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  const [timezone, setTimezone] = useState<string>(getStoredTimezone);
  const [configs, setConfigs] = useState<LangfuseConfigProfile[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState(getDateDaysAgo(7));
  const [traces, setTraces] = useState<ProductionTrace[]>([]);
  const [sessions, setSessions] = useState<ProductionSession[]>([]);
  const [total, setTotal] = useState(0);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([]);
  const [lastImportDate, setLastImportDate] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rebuildingSessions, setRebuildingessions] = useState(false);

  // Filter state
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [filterSessionId, setFilterSessionId] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showConnectionsManager, setShowConnectionsManager] = useState(false);

  // Insights filter state (for drill-down from insights view)
  const [filteredSessionIds, setFilteredSessionIds] = useState<string[] | null>(null);
  const [activeIssueFilter, setActiveIssueFilter] = useState<string | null>(null);
  const [activeIssueDescription, setActiveIssueDescription] = useState<string | null>(null);

  // Insights cache state (persists when switching tabs)
  const [cachedInsights, setCachedInsights] = useState<TraceInsightsResponse | null>(null);
  const [cachedInsightsLastDays, setCachedInsightsLastDays] = useState<number>(7);

  // Langfuse project ID (for URL linking)
  const [langfuseProjectId, setLangfuseProjectId] = useState<string | undefined>(undefined);

  // Check if any filters are active
  const hasActiveFilters = filterFromDate || filterToDate || filterSessionId;

  // Get current timezone info
  const currentTimezoneInfo = US_TIMEZONES.find(tz => tz.value === timezone) || US_TIMEZONES[0];

  // Helper function to format dates with current timezone
  const formatDate = useCallback((dateString: string): string => {
    return formatDateWithTimezone(dateString, timezone);
  }, [timezone]);

  // Handle timezone change
  const handleTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone);
    try {
      localStorage.setItem(TIMEZONE_STORAGE_KEY, newTimezone);
    } catch {
      // Ignore localStorage errors
    }
  };

  // Load Langfuse configs
  const reloadConfigs = useCallback(async (preserveSelection = true) => {
    try {
      const cfgs = await getLangfuseConfigs();
      setConfigs(cfgs);

      // If preserving selection, check if current selection still exists
      if (preserveSelection && selectedConfigId) {
        const stillExists = cfgs.find(c => c.id === selectedConfigId);
        if (stillExists) return; // Keep current selection
      }

      // Select default config if available
      const defaultConfig = cfgs.find(c => c.isDefault);
      if (defaultConfig) {
        setSelectedConfigId(defaultConfig.id);
      } else if (cfgs.length > 0) {
        setSelectedConfigId(cfgs[0].id);
      } else {
        setSelectedConfigId(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Langfuse configs');
    }
  }, [selectedConfigId]);

  // Initial load
  useEffect(() => {
    reloadConfigs(false);
  }, []);

  // Fetch Langfuse project ID from app settings (for URL linking)
  useEffect(() => {
    getAppSettings()
      .then(settings => {
        if (settings.langfuseProjectId?.value) {
          setLangfuseProjectId(settings.langfuseProjectId.value);
        }
      })
      .catch(err => console.warn('Failed to fetch app settings:', err));
  }, []);

  // Load last import date when config changes, and clear insights cache
  useEffect(() => {
    if (!selectedConfigId) return;

    // Clear insights cache when config changes
    setCachedInsights(null);

    async function loadLastImport() {
      try {
        const date = await getLastImportDate(selectedConfigId!);
        setLastImportDate(date);
      } catch {
        setLastImportDate(null);
      }
    }
    loadLastImport();
  }, [selectedConfigId]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    if (!selectedConfigId) return;

    try {
      setLoading(true);
      setError(null);
      const result = await getProductionSessions({
        configId: selectedConfigId,
        limit: filteredSessionIds ? 100 : pageSize, // Load more when filtering by issue
        offset: filteredSessionIds ? 0 : page * pageSize,
        fromDate: filterFromDate || undefined,
        toDate: filterToDate || undefined,
      });

      // Filter by specific session IDs if set (from insights drill-down)
      if (filteredSessionIds && filteredSessionIds.length > 0) {
        const filtered = result.sessions.filter(s =>
          filteredSessionIds.includes(s.sessionId)
        );
        setSessions(filtered);
        setSessionsTotal(filtered.length);
      } else {
        setSessions(result.sessions);
        setSessionsTotal(result.total);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [selectedConfigId, page, pageSize, filterFromDate, filterToDate, filteredSessionIds]);

  // Load traces with filters
  const loadTraces = useCallback(async () => {
    if (!selectedConfigId) return;

    try {
      setLoading(true);
      setError(null);
      const result = await getProductionTraces({
        configId: selectedConfigId,
        limit: pageSize,
        offset: page * pageSize,
        fromDate: filterFromDate || undefined,
        toDate: filterToDate || undefined,
        sessionId: filterSessionId || undefined,
      });
      setTraces(result.traces);
      setTotal(result.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load traces');
    } finally {
      setLoading(false);
    }
  }, [selectedConfigId, page, pageSize, filterFromDate, filterToDate, filterSessionId]);

  // Load data based on view mode
  const loadData = useCallback(() => {
    if (viewMode === 'sessions') {
      loadSessions();
    } else if (viewMode === 'traces') {
      loadTraces();
    }
    // insights view doesn't need to load data here - component handles its own loading
  }, [viewMode, loadSessions, loadTraces]);

  // Handler for drill-down from insights view
  const handleViewIssueSessions = useCallback((sessionIds: string[], issueType: string, description: string) => {
    setFilteredSessionIds(sessionIds);
    setActiveIssueFilter(issueType);
    setActiveIssueDescription(description);
    setViewMode('sessions'); // Switch to sessions view with filter
  }, []);

  // Handler for caching insights data
  const handleInsightsLoaded = useCallback((insights: TraceInsightsResponse, lastDays: number) => {
    setCachedInsights(insights);
    setCachedInsightsLastDays(lastDays);
  }, []);

  // Clear insights filter
  const clearIssueFilter = useCallback(() => {
    setFilteredSessionIds(null);
    setActiveIssueFilter(null);
    setActiveIssueDescription(null);
  }, []);

  // Rebuild sessions from existing traces
  const handleRebuildSessions = async () => {
    if (!selectedConfigId) return;

    try {
      setRebuildingessions(true);
      setError(null);
      const result = await rebuildProductionSessions(selectedConfigId);
      // Reload sessions
      await loadSessions();
      alert(`Rebuilt ${result.sessionsCreated} sessions`);
    } catch (err: any) {
      setError(err.message || 'Failed to rebuild sessions');
    } finally {
      setRebuildingessions(false);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setFilterFromDate('');
    setFilterToDate('');
    setFilterSessionId('');
    setFilteredSessionIds(null);
    setActiveIssueFilter(null);
    setActiveIssueDescription(null);
    setPage(0);
  };

  // Apply filters (reset to page 0)
  const applyFilters = () => {
    setPage(0);
    loadData();
  };

  // Load data when config, page, or view mode changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset page when view mode changes
  useEffect(() => {
    setPage(0);
  }, [viewMode]);

  // Load import history
  useEffect(() => {
    if (!selectedConfigId) return;

    async function loadHistory() {
      try {
        const history = await getImportHistory(selectedConfigId!, 5);
        setImportHistory(history);
      } catch {
        // Ignore errors for import history
      }
    }
    loadHistory();
  }, [selectedConfigId]);

  // Import traces
  const handleImport = async () => {
    if (!selectedConfigId) return;

    try {
      setImporting(true);
      setError(null);
      const result = await importProductionTraces({
        configId: selectedConfigId,
        fromDate,
      });

      if (result.status === 'completed') {
        // Reload data and history
        await loadData();
        const history = await getImportHistory(selectedConfigId, 5);
        setImportHistory(history);
        const date = await getLastImportDate(selectedConfigId);
        setLastImportDate(date);
      } else if (result.errorMessage) {
        setError(result.errorMessage);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import traces');
    } finally {
      setImporting(false);
    }
  };

  // Import since last import (also refreshes observations for existing traces to update error counts)
  const handleImportLatest = async () => {
    if (!selectedConfigId || !lastImportDate) return;

    try {
      setImporting(true);
      setError(null);
      const result = await importProductionTraces({
        configId: selectedConfigId,
        fromDate: lastImportDate,
        refreshObservations: true,  // Re-fetch observations to update error counts
      });

      if (result.status === 'completed') {
        await loadData();
        const history = await getImportHistory(selectedConfigId, 5);
        setImportHistory(history);
        const date = await getLastImportDate(selectedConfigId);
        setLastImportDate(date);
      } else if (result.errorMessage) {
        setError(result.errorMessage);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import traces');
    } finally {
      setImporting(false);
    }
  };

  const totalPages = viewMode === 'sessions'
    ? Math.ceil(sessionsTotal / pageSize)
    : Math.ceil(total / pageSize);

  const currentTotal = viewMode === 'sessions' ? sessionsTotal : total;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Call Tracing"
        subtitle="View and import production conversation traces from Langfuse"
      />

      {/* Import Controls */}
      <Card>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Config Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Langfuse Instance
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedConfigId || ''}
                  onChange={(e) => setSelectedConfigId(Number(e.target.value))}
                  className="block w-64 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select config...</option>
                  {configs.map(cfg => (
                    <option key={cfg.id} value={cfg.id}>
                      {cfg.name} {cfg.isDefault ? '(default)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowConnectionsManager(true)}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Manage Langfuse connections"
                >
                  <Icons.Settings />
                </button>
                {configs.length === 0 && (
                  <button
                    onClick={() => setShowConnectionsManager(true)}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    <Icons.Plus />
                    Add Connection
                  </button>
                )}
              </div>
            </div>

            {/* Date Picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Import From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="block w-48 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Import Button */}
            <Button
              onClick={handleImport}
              disabled={!selectedConfigId || importing}
              className="flex items-center gap-2"
            >
              {importing ? <Spinner size="sm" /> : <Icons.Download />}
              Import
            </Button>

            {/* Import Latest Button */}
            {lastImportDate && (
              <Button
                variant="secondary"
                onClick={handleImportLatest}
                disabled={!selectedConfigId || importing}
                className="flex items-center gap-2"
              >
                {importing ? <Spinner size="sm" /> : <Icons.Refresh />}
                Import Latest
              </Button>
            )}

            {/* Refresh Button */}
            <Button
              variant="secondary"
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2"
            >
              {loading ? <Spinner size="sm" /> : <Icons.Refresh />}
              Refresh
            </Button>

            {/* Rebuild Sessions (for existing data) */}
            {viewMode === 'sessions' && (
              <Button
                variant="secondary"
                onClick={handleRebuildSessions}
                disabled={rebuildingSessions || !selectedConfigId}
                className="flex items-center gap-2 text-xs"
                title="Rebuild session groups from existing traces"
              >
                {rebuildingSessions ? <Spinner size="sm" /> : null}
                Rebuild Sessions
              </Button>
            )}
          </div>

          {/* View Mode Toggle and Timezone */}
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">View:</span>
              <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                <button
                  onClick={() => setViewMode('sessions')}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'sessions'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  Conversations
                </button>
                <button
                  onClick={() => setViewMode('traces')}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-200 dark:border-gray-600 ${
                    viewMode === 'traces'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  Individual Traces
                </button>
                <button
                  onClick={() => setViewMode('insights')}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-200 dark:border-gray-600 ${
                    viewMode === 'insights'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  Insights
                </button>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {viewMode === 'sessions'
                  ? 'Grouped by session (full conversations)'
                  : viewMode === 'traces'
                  ? 'Individual API calls'
                  : 'Summary metrics and issue analysis'}
              </span>
            </div>

            {/* Timezone Selector */}
            <div className="flex items-center gap-2">
              <Icons.Clock />
              <span className="text-sm text-gray-600 dark:text-gray-400">Timezone:</span>
              <select
                value={timezone}
                onChange={(e) => handleTimezoneChange(e.target.value)}
                className="block px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {US_TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label} ({tz.abbrev})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Import Status */}
          {lastImportDate && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Last imported trace: {formatDate(lastImportDate)}
            </div>
          )}

          {/* Recent Import History */}
          {importHistory.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Recent Imports
              </div>
              <div className="space-y-1">
                {importHistory.slice(0, 3).map(h => (
                  <div key={h.id} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    {h.status === 'completed' ? (
                      <Icons.Check />
                    ) : h.status === 'failed' ? (
                      <span className="text-red-500"><Icons.AlertCircle /></span>
                    ) : (
                      <Spinner size="sm" />
                    )}
                    <span>{formatDate(h.import_started_at)}</span>
                    <span className="text-gray-400">|</span>
                    <span>{h.traces_imported} imported, {h.traces_skipped} skipped</span>
                    {h.error_message && (
                      <span className="text-red-500 text-xs">{h.error_message}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Filter Controls */}
      <Card>
        <div className="p-4">
          {/* Filter Header - Always visible */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              <Icons.Filter />
              <span>Filter Traces</span>
              {hasActiveFilters && (
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                  Active
                </span>
              )}
              <svg
                className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
              >
                <Icons.XCircle />
                Clear Filters
              </button>
            )}
          </div>

          {/* Expandable Filter Fields */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Date Range - From */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={filterFromDate}
                    onChange={(e) => setFilterFromDate(e.target.value)}
                    className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Date Range - To */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={filterToDate}
                    onChange={(e) => setFilterToDate(e.target.value)}
                    className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Session ID Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Session ID
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={filterSessionId}
                      onChange={(e) => setFilterSessionId(e.target.value)}
                      placeholder="Search by session ID..."
                      className="block w-full px-3 py-2 pl-9 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Icons.Search />
                    </div>
                  </div>
                </div>

                {/* Apply Button */}
                <div className="flex items-end">
                  <Button
                    onClick={applyFilters}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    {loading ? <Spinner size="sm" /> : <Icons.Search />}
                    Apply Filters
                  </Button>
                </div>
              </div>

              {/* Quick Date Presets */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 self-center">Quick:</span>
                <button
                  onClick={() => {
                    setFilterFromDate(getDateDaysAgo(1));
                    setFilterToDate('');
                  }}
                  className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Last 24h
                </button>
                <button
                  onClick={() => {
                    setFilterFromDate(getDateDaysAgo(7));
                    setFilterToDate('');
                  }}
                  className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Last 7 days
                </button>
                <button
                  onClick={() => {
                    setFilterFromDate(getDateDaysAgo(30));
                    setFilterToDate('');
                  }}
                  className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Last 30 days
                </button>
                <button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setFilterFromDate(today);
                    setFilterToDate(today);
                  }}
                  className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Today
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Data Table */}
      <Card>
        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <Icons.Filter />
            <span>Filtering by:</span>
            {filterFromDate && (
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 rounded text-xs">
                From: {filterFromDate}
              </span>
            )}
            {filterToDate && (
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 rounded text-xs">
                To: {filterToDate}
              </span>
            )}
            {filterSessionId && (
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 rounded text-xs font-mono">
                Session: {filterSessionId.slice(0, 12)}...
              </span>
            )}
            <span className="text-blue-500 dark:text-blue-400">({currentTotal} results)</span>
          </div>
        )}

        {/* Issue Filter Banner (from Insights drill-down) */}
        {activeIssueFilter && viewMode === 'sessions' && (
          <div className="px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
              <Icons.Filter />
              <span>Showing sessions with:</span>
              <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-800 rounded font-medium">
                {activeIssueDescription || activeIssueFilter}
              </span>
              <span className="text-purple-500 dark:text-purple-400">({sessionsTotal} sessions)</span>
            </div>
            <button
              onClick={clearIssueFilter}
              className="flex items-center gap-1 px-2 py-1 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-800 rounded transition-colors"
            >
              <Icons.XCircle />
              Clear Filter
            </button>
          </div>
        )}

        {/* Sessions Table View */}
        {viewMode === 'sessions' && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Session
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    First Message
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Messages
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Avg Latency
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tool Errors
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Booked
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Last Activity
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {loading && sessions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center">
                      <Spinner size="lg" />
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No conversations found. Import traces from Langfuse to get started.
                    </td>
                  </tr>
                ) : (
                  sessions.map(session => (
                    <tr
                      key={session.sessionId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => setSelectedSessionId(session.sessionId)}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                        {session.sessionId.slice(0, 12)}...
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={session.inputPreview || undefined}>
                        {session.inputPreview || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                          {session.traceCount} {session.traceCount === 1 ? 'message' : 'messages'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {formatSpanDuration(calculateSessionSpanSeconds(session.firstTraceAt, session.lastTraceAt))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {session.totalLatencyMs && session.traceCount > 0
                          ? formatDuration(session.totalLatencyMs / session.traceCount)
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {session.errorCount > 0 ? (
                          <span className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                            <Icons.ExclamationCircle />
                            {session.errorCount}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {session.hasSuccessfulBooking && (
                          <span
                            className="inline-flex items-center justify-center text-green-600 dark:text-green-400"
                            title="Appointment successfully booked"
                          >
                            <Icons.CalendarCheck />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(session.lastTraceAt)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSessionId(session.sessionId);
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                          title="View full conversation"
                        >
                          <Icons.Eye />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Traces Table View */}
        {viewMode === 'traces' && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Session
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tool Errors
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Environment
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {loading && traces.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center">
                      <Spinner size="lg" />
                    </td>
                  </tr>
                ) : traces.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No traces found. Import traces from Langfuse to get started.
                    </td>
                  </tr>
                ) : (
                  traces.map(trace => (
                    <tr
                      key={trace.traceId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => setSelectedTraceId(trace.traceId)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {formatDate(trace.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-500 dark:text-gray-400">
                        {trace.sessionId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilterSessionId(trace.sessionId!);
                              setShowFilters(true);
                              setPage(0);
                            }}
                            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                            title={`Filter by session: ${trace.sessionId}`}
                          >
                            {trace.sessionId.slice(0, 8)}...
                        </button>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {trace.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {formatDuration(trace.latencyMs)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {formatCost(trace.totalCost)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {trace.errorCount > 0 ? (
                        <span className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          <Icons.ExclamationCircle />
                          {trace.errorCount}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {trace.environment && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                          {trace.environment}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTraceId(trace.traceId);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                        title="View transcript"
                      >
                        <Icons.Eye />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Insights View */}
        {viewMode === 'insights' && selectedConfigId && (
          <div className="p-4">
            <TraceInsights
              configId={selectedConfigId}
              onViewSessions={handleViewIssueSessions}
              cachedInsights={cachedInsights}
              cachedLastDays={cachedInsightsLastDays}
              onInsightsLoaded={handleInsightsLoaded}
            />
          </div>
        )}

        {/* Pagination (only for sessions/traces views) */}
        {viewMode !== 'insights' && totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, currentTotal)} of {currentTotal} {viewMode === 'sessions' ? 'conversations' : 'traces'}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Trace Modal */}
      {selectedTraceId && (
        <TraceModal
          traceId={selectedTraceId}
          timezone={timezone}
          onClose={() => setSelectedTraceId(null)}
        />
      )}

      {/* Session Modal */}
      {selectedSessionId && (
        <SessionModal
          sessionId={selectedSessionId}
          configId={selectedConfigId || undefined}
          timezone={timezone}
          langfuseProjectId={langfuseProjectId}
          onClose={() => setSelectedSessionId(null)}
        />
      )}

      {/* Langfuse Connections Manager Modal */}
      <LangfuseConnectionsManager
        isOpen={showConnectionsManager}
        onClose={() => setShowConnectionsManager(false)}
        onConfigsChanged={() => reloadConfigs(true)}
      />
    </div>
  );
}

/**
 * Dominos Call Tracing Page
 * Session investigation UI matching the Ortho Call Trace "Conversation Details" modal.
 * Uses getProductionSession() for transcript + observations, reuses TranscriptViewer.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getProductionSessions,
  getProductionSession,
  importProductionTraces,
} from '../../services/api/testMonitorApi';
import { getLangfuseConfigs, getAppSettings } from '../../services/api/appSettingsApi';
import { getOrderTraceCorrelation, type OrderTraceMatch } from '../../services/api/dominosApi';
import { TranscriptViewer } from '../../components/features/testMonitor/TranscriptViewer';
import { PerformanceWaterfall } from '../../components/features/testMonitor/PerformanceWaterfall';
import type { LangfuseConfigProfile } from '../../types/appSettings.types';
import type { ProductionSession, ProductionSessionDetailResponse } from '../../types/testMonitor.types';

// ============================================================================
// AUTO-REFRESH CONSTANTS & HELPERS
// ============================================================================

const AUTO_REFRESH_ENABLED_KEY = 'dominosCallTracing_autoRefreshEnabled';
const AUTO_REFRESH_INTERVAL_KEY = 'dominosCallTracing_autoRefreshInterval';

const AUTO_REFRESH_INTERVALS = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 120, label: '2m' },
  { value: 300, label: '5m' },
  { value: 600, label: '10m' },
  { value: -1, label: 'Custom' },
];

function getStoredAutoRefreshEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_REFRESH_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

function getStoredAutoRefreshInterval(): number {
  try {
    const stored = localStorage.getItem(AUTO_REFRESH_INTERVAL_KEY);
    if (stored) {
      const num = parseInt(stored, 10);
      if (num > 0) return num;
    }
  } catch {}
  return 30;
}

function isCustomInterval(interval: number): boolean {
  return !AUTO_REFRESH_INTERVALS.some(i => i.value === interval && i.value !== -1);
}

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Search: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  AlertCircle: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  X: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Copy: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Chat: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  ),
  List: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  Eye: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  Order: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <g transform="rotate(20 12 12)">
        <path d="M12 2C8 2 4.5 4 3 7l9 15 9-15c-1.5-3-5-5-9-5z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="8" r="1.2" fill="#ef4444" stroke="none" />
        <circle cx="14" cy="10" r="1.2" fill="#ef4444" stroke="none" />
        <circle cx="11" cy="13" r="1.2" fill="#ef4444" stroke="none" />
      </g>
    </svg>
  ),
  PhoneForward: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3h6m0 0v6m0-6l-6 6" />
    </svg>
  ),
};

// ============================================================================
// HELPERS
// ============================================================================

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return ts; }
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ts; }
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-';
  const rounded = Math.round(ms);
  if (rounded < 1000) return `${rounded}ms`;
  const secs = rounded / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = Math.floor(secs % 60);
  return `${mins}m ${remainSecs}s`;
}

function formatCost(cost: number | null | undefined): string {
  if (!cost) return '-';
  return `$${cost.toFixed(4)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================================
// COPY BUTTON (inline clipboard icon with feedback)
// ============================================================================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-0.5 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
      title="Copy session ID"
    >
      {copied ? <Icons.Check /> : <Icons.Copy />}
    </button>
  );
}

// ============================================================================
// CONVERSATION DETAIL MODAL (matches Ortho Call Trace exactly)
// ============================================================================

type DetailTab = 'transcript' | 'performance' | 'traces' | 'orders';

function ConversationDetailModal({
  sessionId,
  configId,
  langfuseHost,
  langfuseProjectId,
  onClose,
}: {
  sessionId: string;
  configId: number;
  langfuseHost?: string;
  langfuseProjectId?: string;
  onClose: () => void;
}) {
  const [sessionDetail, setSessionDetail] = useState<ProductionSessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('transcript');
  const [copied, setCopied] = useState(false);

  // Correlated orders state
  const [correlatedOrders, setCorrelatedOrders] = useState<OrderTraceMatch[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  useEffect(() => {
    async function fetchSession() {
      setLoading(true);
      setError('');
      try {
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

  // Load correlated orders when the orders tab is selected
  useEffect(() => {
    if (activeTab !== 'orders' || ordersLoaded) return;
    (async () => {
      setOrdersLoading(true);
      try {
        const result = await getOrderTraceCorrelation({ sessionId, direction: 'trace-to-order' });
        setCorrelatedOrders(result.matches || []);
      } catch { /* silent */ }
      finally {
        setOrdersLoading(false);
        setOrdersLoaded(true);
      }
    })();
  }, [activeTab, sessionId, ordersLoaded]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Copy all
  const handleCopyAll = async () => {
    if (!sessionDetail) return;
    let text = `Session: ${sessionDetail.session.sessionId}\n`;
    text += `Messages: ${sessionDetail.session.traceCount}\n`;
    text += `Start: ${formatTimestamp(sessionDetail.session.firstTraceAt)}\n`;
    text += `End: ${formatTimestamp(sessionDetail.session.lastTraceAt)}\n\n`;
    text += `${'='.repeat(60)}\nCONVERSATION TRANSCRIPT\n${'='.repeat(60)}\n\n`;
    for (const entry of sessionDetail.transcript) {
      text += `[${entry.role.toUpperCase()}]\n${entry.content}\n\n`;
    }
    if (sessionDetail.apiCalls?.length > 0) {
      text += `${'='.repeat(60)}\nAPI CALLS (${sessionDetail.apiCalls.length})\n${'='.repeat(60)}\n\n`;
      for (const call of sessionDetail.apiCalls) {
        text += `${call.name || 'API Call'}\n`;
        text += `  Duration: ${formatDuration(call.durationMs)}\n`;
        if (call.input) text += `  Input: ${typeof call.input === 'string' ? call.input : JSON.stringify(call.input, null, 2)}\n`;
        if (call.output) text += `  Output: ${typeof call.output === 'string' ? call.output : JSON.stringify(call.output, null, 2)}\n`;
        text += '\n';
      }
    }
    text += `${'='.repeat(60)}\nINDIVIDUAL TRACES (${sessionDetail.traces.length})\n${'='.repeat(60)}\n\n`;
    for (let i = 0; i < sessionDetail.traces.length; i++) {
      const trace = sessionDetail.traces[i];
      text += `#${i + 1} - ${trace.name || 'Trace'}\n`;
      text += `  Trace ID: ${trace.traceId}\n`;
      text += `  Timestamp: ${formatTimestamp(trace.startedAt)}\n`;
      text += `  Duration: ${formatDuration(trace.latencyMs)}\n`;
      text += `  Cost: ${formatCost(trace.totalCost)}\n\n`;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[90vw] max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Conversation Details
            </h2>
            {sessionDetail && (
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                <span className="font-mono text-xs">{sessionDetail.session.sessionId}</span>
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
                {/* Langfuse link */}
                {langfuseHost && langfuseProjectId && sessionDetail.traces.length > 0 && (
                  <a
                    href={`${langfuseHost}/project/${langfuseProjectId}/traces/${sessionDetail.traces[0].traceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 border border-orange-200 dark:border-orange-700 rounded-lg font-mono text-sm text-orange-700 dark:text-orange-300 transition-colors"
                    title="View in Langfuse"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    <span className="text-orange-500 dark:text-orange-400">Langfuse:</span>
                    <span className="font-semibold">{sessionDetail.traces[0].traceId.slice(0, 8)}...</span>
                    <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
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
          <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <nav className="flex gap-2">
              <button
                onClick={() => setActiveTab('transcript')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                  activeTab === 'transcript'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                }`}
              >
                <Icons.Chat />
                Full Conversation
                <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === 'transcript' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                }`}>
                  {sessionDetail.transcript.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('performance')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                  activeTab === 'performance'
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                }`}
              >
                <Icons.Clock />
                Performance
              </button>
              <button
                onClick={() => setActiveTab('traces')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                  activeTab === 'traces'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                }`}
              >
                <Icons.List />
                Individual Traces
                <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === 'traces' ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                }`}>
                  {sessionDetail.traces.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                  activeTab === 'orders'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                }`}
              >
                <Icons.Order />
                Related Orders
                {ordersLoaded && correlatedOrders.length > 0 && (
                  <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                    activeTab === 'orders' ? 'bg-purple-500 text-white' : 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                  }`}>
                    {correlatedOrders.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12 text-red-500">
              <Icons.AlertCircle />
              <span className="ml-2">{error}</span>
            </div>
          )}

          {sessionDetail && activeTab === 'transcript' && (
            <>
              <TranscriptViewer
                transcript={sessionDetail.transcript}
                apiCalls={sessionDetail.apiCalls}
                loading={false}
                langfuseHost={langfuseHost}
                langfuseProjectId={langfuseProjectId}
                flowiseSessionId={sessionDetail.session.sessionId}
              />
            </>
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
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                Individual Traces ({sessionDetail.traces.length})
              </h3>
              {sessionDetail.traces.map((trace, idx) => (
                <div key={trace.traceId} className="p-4 rounded-lg bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 w-6">#{idx + 1}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{trace.name || 'Trace'}</span>
                      {trace.statusMessage && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          trace.statusMessage === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        }`}>
                          {trace.statusMessage}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {trace.latencyMs && <span>{formatDuration(trace.latencyMs)}</span>}
                      {trace.totalCost && <span className="text-green-600 dark:text-green-400">{formatCost(trace.totalCost)}</span>}
                      {langfuseHost && langfuseProjectId && (
                        <a
                          href={`${langfuseHost}/project/${langfuseProjectId}/traces/${trace.traceId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-500 hover:text-orange-600 dark:text-orange-400"
                          title="View in Langfuse"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-mono">{trace.traceId}</span>
                    <span className="ml-3">{formatTimestamp(trace.startedAt)}</span>
                  </div>
                  {trace.input && (
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 truncate">
                      Input: {typeof trace.input === 'string' ? trace.input : JSON.stringify(trace.input).substring(0, 200)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {sessionDetail && activeTab === 'orders' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                Related Order Logs
              </h3>
              {ordersLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
                </div>
              )}
              {ordersLoaded && correlatedOrders.length === 0 && (
                <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400 space-y-2">
                  <p className="font-medium">No matching orders found</p>
                  <p className="text-xs">Correlation uses phone number + time window matching between this call trace and order API logs.</p>
                  <p className="text-xs text-gray-400">This can happen when: the datasets don't overlap in time, phone numbers don't match, or recent orders lack customer data.</p>
                </div>
              )}
              {correlatedOrders.map((order, idx) => (
                <div key={order.id || idx} className="p-4 rounded-lg bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 w-6">#{idx + 1}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {order.customer_name || 'Unknown Customer'}
                      </span>
                      {order.order_confirmed ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          Confirmed
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          Not Confirmed
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        order.matchConfidence === 'high'
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                      }`}>
                        {order.matchMethod} ({order.matchConfidence})
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {order.order_total != null && order.order_total > 0 && (
                        <span className="text-green-600 dark:text-green-400 font-medium">${order.order_total.toFixed(2)}</span>
                      )}
                      {order.store_id && <span>Store #{order.store_id}</span>}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    {order.customer_phone && <span>{order.customer_phone}</span>}
                    {order.timestamp && <span>{formatTimestamp(order.timestamp)}</span>}
                    {order.endpoint && <span className="font-mono">{order.endpoint}</span>}
                    {order.items_count != null && order.items_count > 0 && <span>{order.items_count} items</span>}
                  </div>
                  {order.order_summary && (
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 truncate">
                      {order.order_summary}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DominosCallTracing() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Config state
  const [configs, setConfigs] = useState<LangfuseConfigProfile[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const [configError, setConfigError] = useState('');
  const [langfuseProjectId, setLangfuseProjectId] = useState<string | undefined>();

  // Session list state
  const [sessions, setSessions] = useState<ProductionSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsTotal, setSessionsTotal] = useState(0);

  // Search / import
  const [searchId, setSearchId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importFromDate, setImportFromDate] = useState(todayISO());

  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(getStoredAutoRefreshEnabled);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(getStoredAutoRefreshInterval);
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState<number>(0);
  const [autoRefreshing, setAutoRefreshing] = useState<boolean>(false);
  const [customIntervalInput, setCustomIntervalInput] = useState<string>(() => {
    const stored = getStoredAutoRefreshInterval();
    return isCustomInterval(stored) ? String(stored) : '180';
  });
  const [showCustomInput, setShowCustomInput] = useState<boolean>(() => isCustomInterval(getStoredAutoRefreshInterval()));

  // Modal state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Load configs on mount, auto-select Dominos
  useEffect(() => {
    (async () => {
      try {
        const cfgs = await getLangfuseConfigs();
        setConfigs(cfgs);
        setConfigsLoaded(true);
        const dominos = cfgs.find(c => c.name.toLowerCase().includes('dominos'));
        if (dominos) {
          setSelectedConfigId(dominos.id);
        } else if (cfgs.length > 0) {
          setSelectedConfigId(cfgs[0].id);
        } else {
          setConfigError('No Langfuse configs found for this tenant. Make sure the Dominos tenant is selected and a Langfuse config exists in Settings.');
        }
      } catch (err: any) {
        console.error('Failed to load Langfuse configs', err);
        setConfigsLoaded(true);
        setConfigError(`Failed to load configs: ${err.message || 'Unknown error'}`);
      }
    })();
  }, []);

  // Load Langfuse project ID from settings
  useEffect(() => {
    (async () => {
      try {
        const settings = await getAppSettings();
        if ((settings as any).langfuseProjectId) {
          setLangfuseProjectId((settings as any).langfuseProjectId);
        }
      } catch { /* optional */ }
    })();
  }, []);

  // Load sessions when config changes
  const loadSessions = useCallback(async () => {
    if (!selectedConfigId) return;
    setSessionsLoading(true);
    try {
      const res = await getProductionSessions({ configId: selectedConfigId, limit: 50 });
      setSessions(res.sessions);
      setSessionsTotal(res.total);
    } catch (err) {
      console.error('Failed to load sessions', err);
    } finally {
      setSessionsLoading(false);
    }
  }, [selectedConfigId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Import traces
  const handleImport = async () => {
    if (!selectedConfigId) return;
    setImporting(true);
    setImportMessage('');
    try {
      const result = await importProductionTraces({ configId: selectedConfigId, fromDate: importFromDate });
      const imported = (result as any).tracesImported ?? (result as any).imported ?? 0;
      const skipped = (result as any).tracesSkipped ?? 0;
      setImportMessage(imported > 0
        ? `Imported ${imported} traces${skipped > 0 ? ` (${skipped} skipped)` : ''}`
        : `No new traces found since ${importFromDate}${skipped > 0 ? ` (${skipped} already imported)` : ''}`
      );
      await loadSessions();
    } catch (err: any) {
      setImportMessage(`Import failed: ${err.message || 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  // Open session detail
  const openSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
  };

  // Deep link: open session from ?sessionId= URL param
  useEffect(() => {
    const sessionIdParam = searchParams.get('sessionId');
    if (sessionIdParam) {
      openSession(sessionIdParam);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Search by session ID
  const handleSearch = () => {
    const id = searchId.trim();
    if (id) openSession(id);
  };

  // Silent auto-refresh: import traces then reload sessions
  const handleAutoRefreshImport = useCallback(async () => {
    if (!selectedConfigId || importing || autoRefreshing) return;
    try {
      setAutoRefreshing(true);
      const result = await importProductionTraces({ configId: selectedConfigId, fromDate: importFromDate });
      const imported = (result as any).tracesImported ?? (result as any).imported ?? 0;
      if (imported > 0) {
        await loadSessions();
      }
    } catch {
      // Silent fail for auto-refresh
    } finally {
      setAutoRefreshing(false);
    }
  }, [selectedConfigId, importing, autoRefreshing, importFromDate, loadSessions]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefreshEnabled || !selectedConfigId) {
      setAutoRefreshCountdown(0);
      return;
    }
    setAutoRefreshCountdown(autoRefreshInterval);

    const countdownId = setInterval(() => {
      setAutoRefreshCountdown(prev => prev <= 1 ? autoRefreshInterval : prev - 1);
    }, 1000);

    const refreshId = setInterval(() => {
      handleAutoRefreshImport();
    }, autoRefreshInterval * 1000);

    return () => {
      clearInterval(countdownId);
      clearInterval(refreshId);
    };
  }, [autoRefreshEnabled, autoRefreshInterval, handleAutoRefreshImport, selectedConfigId]);

  // Persist auto-refresh preferences
  useEffect(() => {
    try {
      localStorage.setItem(AUTO_REFRESH_ENABLED_KEY, String(autoRefreshEnabled));
      localStorage.setItem(AUTO_REFRESH_INTERVAL_KEY, String(autoRefreshInterval));
    } catch {}
  }, [autoRefreshEnabled, autoRefreshInterval]);

  // Get langfuse host for current config
  const selectedConfig = configs.find(c => c.id === selectedConfigId);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* No-config warning */}
      {configsLoaded && configError && (
        <div className="flex-shrink-0 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-6 py-3">
          <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-200">
            <Icons.AlertCircle />
            <span>{configError}</span>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={selectedConfigId ?? ''}
            onChange={(e) => setSelectedConfigId(Number(e.target.value))}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {configs.length === 0 && <option value="">No configs available</option>}
            {configs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <input
            type="date"
            value={importFromDate}
            onChange={(e) => setImportFromDate(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <button
            onClick={handleImport}
            disabled={importing || !selectedConfigId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icons.Refresh />
            {importing ? 'Importing...' : 'Import Traces'}
          </button>
          {importMessage && (
            <span className={`text-xs ${importMessage.startsWith('Import failed') ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {importMessage}
            </span>
          )}

          {/* Auto-Refresh Controls */}
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-300 dark:border-gray-600">
            <span className="text-xs text-gray-500 dark:text-gray-400">Auto</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoRefreshEnabled}
              onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
              className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                autoRefreshEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoRefreshEnabled ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </button>

            {autoRefreshEnabled && (
              <>
                <select
                  value={showCustomInput ? -1 : autoRefreshInterval}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val === -1) {
                      setShowCustomInput(true);
                      const customVal = parseInt(customIntervalInput, 10);
                      if (customVal > 0) setAutoRefreshInterval(customVal);
                    } else {
                      setShowCustomInput(false);
                      setAutoRefreshInterval(val);
                    }
                  }}
                  className="text-xs px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {AUTO_REFRESH_INTERVALS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                {showCustomInput && (
                  <>
                    <input
                      type="number"
                      min="10"
                      max="3600"
                      value={customIntervalInput}
                      onChange={(e) => setCustomIntervalInput(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(customIntervalInput, 10);
                        if (val >= 10 && val <= 3600) {
                          setAutoRefreshInterval(val);
                        } else {
                          setCustomIntervalInput(String(autoRefreshInterval));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseInt(customIntervalInput, 10);
                          if (val >= 10 && val <= 3600) setAutoRefreshInterval(val);
                        }
                      }}
                      className="w-14 text-xs px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="sec"
                    />
                    <span className="text-xs text-gray-400">s</span>
                  </>
                )}

                {autoRefreshing ? (
                  <div className="flex items-center gap-1 text-xs text-blue-500">
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>importing</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                    </span>
                    <span>
                      {autoRefreshCountdown >= 60
                        ? `${Math.floor(autoRefreshCountdown / 60)}:${String(autoRefreshCountdown % 60).padStart(2, '0')}`
                        : `${autoRefreshCountdown}s`
                      }
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <input
              type="text"
              placeholder="Session ID..."
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-64"
            />
            <button
              onClick={handleSearch}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Icons.Search />
            </button>
          </div>
        </div>
      </div>

      {/* Session Table */}
      <div className="flex-1 overflow-auto">
        {sessionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 px-4 text-sm text-gray-500 dark:text-gray-400 space-y-2">
            <p className="font-medium">No sessions found</p>
            <p>Select a date range and click "Import Traces" to pull call data from Langfuse.</p>
            {configs.length > 0 && selectedConfigId && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Config: {configs.find(c => c.id === selectedConfigId)?.name} (ID {selectedConfigId})
              </p>
            )}
          </div>
        ) : (
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Session</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Preview</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Traces</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Errors</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Order</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Transfer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Latency</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">View</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {sessions.map((s) => (
                <tr
                  key={s.sessionId}
                  onClick={() => openSession(s.sessionId)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span>{s.sessionId}</span>
                      <CopyButton text={s.sessionId} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={s.inputPreview || undefined}>
                    {s.inputPreview || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatTimestamp(s.firstTraceAt)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 whitespace-nowrap">
                      {s.traceCount} {s.traceCount === 1 ? 'msg' : 'msgs'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.errorCount > 0 ? (
                      <span className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                        {s.errorCount}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.hasOrder && (
                      <span className="inline-flex items-center justify-center text-green-600 dark:text-green-400" title="Order confirmed">
                        <Icons.Order />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.hasTransfer && (
                      <span className="inline-flex items-center justify-center text-orange-600 dark:text-orange-400" title="Call transferred">
                        <Icons.PhoneForward />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatDuration(s.totalLatencyMs)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); openSession(s.sessionId); }}
                      className="p-1 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="View conversation"
                    >
                      <Icons.Eye />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Session Detail Modal */}
      {selectedSessionId && selectedConfigId && (
        <ConversationDetailModal
          sessionId={selectedSessionId}
          configId={selectedConfigId}
          langfuseHost={selectedConfig?.host}
          langfuseProjectId={langfuseProjectId}
          onClose={() => setSelectedSessionId(null)}
        />
      )}
    </div>
  );
}

/**
 * Dominos Sessions Page
 * Session list from logs, expandable rows showing individual API calls
 */

import { useState, useEffect, useCallback } from 'react';
import * as dominosApi from '../../services/api/dominosApi';
import type { OrderTraceMatch } from '../../services/api/dominosApi';
import type { DominosOrderLog, DominosSessionDetail } from '../../types/dominos.types';

// ============================================================================
// AUTO-REFRESH CONSTANTS & HELPERS
// ============================================================================

const AUTO_REFRESH_ENABLED_KEY = 'dominosSessions_autoRefreshEnabled';
const AUTO_REFRESH_INTERVAL_KEY = 'dominosSessions_autoRefreshInterval';

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

const InlineSpinner = () => (
  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

interface SessionGroup {
  session_id: string;
  count: number;
  firstTime: string;
  lastTime: string;
  statuses: string[];
}

export default function DominosSessions() {
  const [logs, setLogs] = useState<DominosOrderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<DominosSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Correlated call traces
  const [correlatedTraces, setCorrelatedTraces] = useState<OrderTraceMatch[]>([]);
  const [tracesLoading, setTracesLoading] = useState(false);

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

  const fetchLogs = useCallback(async () => {
    try {
      setError(null);
      const res = await dominosApi.getDashboardLogs({ limit: 200 });
      setLogs(res.logs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Group logs by session_id
  const sessions: SessionGroup[] = (() => {
    const map = new Map<string, any[]>();
    for (const log of logs as any[]) {
      const sid = log.session_id;
      if (!sid) continue;
      const arr = map.get(sid) || [];
      arr.push(log);
      map.set(sid, arr);
    }
    return Array.from(map.entries()).map(([session_id, items]) => ({
      session_id,
      count: items.length,
      firstTime: items[items.length - 1]?.timestamp || '',
      lastTime: items[0]?.timestamp || '',
      statuses: [...new Set(items.map((i: any) => String(i.status_code)))],
    })).sort((a, b) => b.count - a.count);
  })();

  const handleExpand = async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      setSessionDetail(null);
      setCorrelatedTraces([]);
      return;
    }
    setExpandedSession(sessionId);
    setDetailLoading(true);
    setCorrelatedTraces([]);
    try {
      const detail = await dominosApi.getSessionDetail(sessionId);
      // Build summary from returned logs if not present
      const detailLogs = detail.logs || [];
      if (!detail.summary) {
        detail.summary = {
          totalCalls: detailLogs.length,
          successCount: detailLogs.filter((l: any) => l.status_code >= 200 && l.status_code < 300).length,
          failCount: detailLogs.filter((l: any) => l.status_code >= 400).length,
          totalResponseTime: detailLogs.reduce((s: number, l: any) => s + (l.response_time_ms || 0), 0),
          startTime: detailLogs[detailLogs.length - 1]?.timestamp || '',
          endTime: detailLogs[0]?.timestamp || '',
        };
      }
      setSessionDetail(detail);
    } catch {
      // Fall back to local data
      const sessionLogs = (logs as any[]).filter(l => l.session_id === sessionId);
      setSessionDetail({
        session_id: sessionId,
        logs: sessionLogs,
        summary: {
          totalCalls: sessionLogs.length,
          successCount: sessionLogs.filter(l => l.status_code >= 200 && l.status_code < 300).length,
          failCount: sessionLogs.filter(l => l.status_code >= 400).length,
          totalResponseTime: sessionLogs.reduce((s, l) => s + (l.response_time_ms || 0), 0),
          startTime: sessionLogs[sessionLogs.length - 1]?.timestamp || '',
          endTime: sessionLogs[0]?.timestamp || '',
        },
      });
    } finally {
      setDetailLoading(false);
    }

    // Fetch correlated call traces in background
    setTracesLoading(true);
    try {
      const result = await dominosApi.getOrderTraceCorrelation({ sessionId, direction: 'order-to-trace' });
      setCorrelatedTraces(result.matches || []);
    } catch { /* silent */ }
    finally { setTracesLoading(false); }
  };

  // Silent auto-refresh: re-fetch logs
  const handleAutoRefresh = useCallback(async () => {
    if (loading || autoRefreshing) return;
    try {
      setAutoRefreshing(true);
      const res = await dominosApi.getDashboardLogs({ limit: 200 });
      setLogs(res.logs || []);
    } catch {
      // Silent fail for auto-refresh
    } finally {
      setAutoRefreshing(false);
    }
  }, [loading, autoRefreshing]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefreshEnabled) {
      setAutoRefreshCountdown(0);
      return;
    }
    setAutoRefreshCountdown(autoRefreshInterval);

    const countdownId = setInterval(() => {
      setAutoRefreshCountdown(prev => prev <= 1 ? autoRefreshInterval : prev - 1);
    }, 1000);

    const refreshId = setInterval(() => {
      handleAutoRefresh();
    }, autoRefreshInterval * 1000);

    return () => {
      clearInterval(countdownId);
      clearInterval(refreshId);
    };
  }, [autoRefreshEnabled, autoRefreshInterval, handleAutoRefresh]);

  // Persist auto-refresh preferences
  useEffect(() => {
    try {
      localStorage.setItem(AUTO_REFRESH_ENABLED_KEY, String(autoRefreshEnabled));
      localStorage.setItem(AUTO_REFRESH_INTERVAL_KEY, String(autoRefreshInterval));
    } catch {}
  }, [autoRefreshEnabled, autoRefreshInterval]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sessions</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">{sessions.length} sessions</span>

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
                    <InlineSpinner />
                    <span>refreshing</span>
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
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No sessions found</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {sessions.map((session) => (
              <div key={session.session_id}>
                <button
                  onClick={() => handleExpand(session.session_id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${expandedSession === session.session_id ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{session.session_id.substring(0, 12)}...</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{session.count} calls</span>
                    <div className="flex gap-1">
                      {session.statuses.map(s => {
                        const code = parseInt(s, 10);
                        return (
                          <span key={s} className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                            code >= 200 && code < 300
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400'
                              : code >= 400
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400'
                          }`}>{s}</span>
                        );
                      })}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(session.lastTime).toLocaleString()}
                  </span>
                </button>

                {/* Expanded detail */}
                {expandedSession === session.session_id && (
                  <div className="px-4 pb-4 pl-12">
                    {detailLoading ? (
                      <div className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">Loading details...</div>
                    ) : sessionDetail ? (
                      <div className="space-y-3">
                        {/* Summary */}
                        <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                          <span>Total: {sessionDetail.summary?.totalCalls ?? 0}</span>
                          <span className="text-green-600">Success: {sessionDetail.summary?.successCount ?? 0}</span>
                          <span className="text-red-600">Failed: {sessionDetail.summary?.failCount ?? 0}</span>
                          <span>Total response: {sessionDetail.summary?.totalResponseTime ?? 0}ms</span>
                        </div>
                        {/* Correlated Call Traces */}
                        {tracesLoading && (
                          <div className="flex items-center gap-2 text-xs text-purple-500">
                            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>Looking for related call traces...</span>
                          </div>
                        )}
                        {!tracesLoading && correlatedTraces.length > 0 && (
                          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                            <div className="flex items-center gap-2 mb-2">
                              <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                              <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                                Related Call Traces ({correlatedTraces.length})
                              </span>
                            </div>
                            {correlatedTraces.map((trace, i) => (
                              <div key={trace.session_id || i} className="flex items-center gap-3 text-xs py-1">
                                <span className="font-mono text-purple-600 dark:text-purple-400 truncate max-w-[200px]" title={trace.session_id}>
                                  {trace.session_id}
                                </span>
                                <span className="text-gray-500">{trace.trace_count} msgs</span>
                                {trace.has_order ? (
                                  <span className="text-green-600 dark:text-green-400">order placed</span>
                                ) : null}
                                {trace.has_transfer ? (
                                  <span className="text-orange-600 dark:text-orange-400">transferred</span>
                                ) : null}
                                {trace.first_trace_at && (
                                  <span className="text-gray-400">{new Date(trace.first_trace_at).toLocaleString()}</span>
                                )}
                                <span className={`px-1.5 py-0.5 rounded text-xs ${
                                  trace.matchConfidence === 'high'
                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                }`}>
                                  {trace.matchMethod}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Timeline */}
                        <div className="space-y-2">
                          {(sessionDetail.logs || []).map((log: any, i: number) => (
                            <div key={log.id || i} className="flex items-center gap-3 text-xs">
                              <span className="text-gray-400 w-24">{log.timestamp || ''}</span>
                              <span className={`w-2 h-2 rounded-full ${
                                log.status_code >= 200 && log.status_code < 300 ? 'bg-green-500' :
                                log.status_code >= 400 ? 'bg-red-500' : 'bg-yellow-500'
                              }`} />
                              <span className="font-mono text-gray-700 dark:text-gray-300">{log.method} {log.endpoint}</span>
                              <span className="text-gray-400">{log.response_time_ms}ms</span>
                              {log.error_message && (
                                <span className="text-red-500 truncate max-w-xs">{log.error_message}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

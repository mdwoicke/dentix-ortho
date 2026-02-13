/**
 * Dominos Dashboard
 * Stats overview, performance chart, recent orders table
 */

import { useState, useEffect, useCallback } from 'react';
import * as dominosApi from '../../services/api/dominosApi';
import type { DominosDashboardStats, DominosOrderLog, DominosPerformanceData } from '../../types/dominos.types';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

export default function DominosDashboard() {
  const [stats, setStats] = useState<DominosDashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<DominosOrderLog[]>([]);
  const [performance, setPerformance] = useState<DominosPerformanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statsRes, logsRes, perfRes] = await Promise.all([
        dominosApi.getDashboardStats(),
        dominosApi.getDashboardLogs({ limit: 10 }),
        dominosApi.getPerformance({ period: '24h', interval: '1h' }),
      ]);
      setStats(statsRes);
      setRecentLogs(logsRes.logs || []);
      setPerformance(Array.isArray(perfRes) ? perfRes : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

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

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={fetchData} className="mt-2 text-sm text-blue-600 hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Dashboard</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Orders" value={stats.totalOrders} sub={stats.period} />
          <StatCard label="Success Rate" value={`${(stats.successRate * 100).toFixed(1)}%`} sub={`${stats.successfulOrders} successful`} />
          <StatCard label="Revenue" value={`$${(stats.totalRevenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub={`Avg $${(stats.averageOrderValue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          <StatCard label="Avg Response" value={`${stats.averageResponseTime?.toFixed(0) || 0}ms`} sub={`${stats.uniqueSessions || 0} sessions`} />
        </div>
      )}

      {/* Performance chart placeholder */}
      {performance.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Performance (24h)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {performance.slice(-6).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-gray-900 dark:text-gray-100">{p.requestCount} reqs</span>
                <span className={p.successRate >= 0.95 ? 'text-green-600' : 'text-yellow-600'}>
                  {(p.successRate * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent API logs table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent API Requests</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Method</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Endpoint</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Response</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No requests found
                  </td>
                </tr>
              ) : (
                recentLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        log.method === 'GET'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-400'
                      }`}>
                        {log.method}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm font-mono text-gray-600 dark:text-gray-400 truncate max-w-[300px]">
                      {log.endpoint}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        log.status_code >= 200 && log.status_code < 300
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400'
                          : log.status_code >= 400
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400'
                      }`}>
                        {log.status_code}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                      {log.response_time_ms}ms
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                      {log.timestamp}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

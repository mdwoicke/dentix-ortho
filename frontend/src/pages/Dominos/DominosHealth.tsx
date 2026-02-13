/**
 * Dominos Health Page
 * Health status cards per component, color-coded, 30s auto-refresh
 */

import { useState, useEffect, useCallback } from 'react';
import * as dominosApi from '../../services/api/dominosApi';
import type { DominosHealthStatus, DominosHealthComponent } from '../../types/dominos.types';

function statusColor(status: string) {
  switch (status) {
    case 'healthy': return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400 border-green-300 dark:border-green-700';
    case 'degraded': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700';
    case 'unhealthy': return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400 border-red-300 dark:border-red-700';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-400 border-gray-300 dark:border-gray-700';
  }
}

function statusDot(status: string) {
  switch (status) {
    case 'healthy': return 'bg-green-500';
    case 'degraded': return 'bg-yellow-500';
    case 'unhealthy': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
}

function HealthCard({ component }: { component: DominosHealthComponent }) {
  return (
    <div className={`rounded-lg border p-4 ${statusColor(component.status)}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold capitalize">{component.name}</h4>
        <span className={`w-3 h-3 rounded-full ${statusDot(component.status)}`} />
      </div>
      <p className="text-xs font-medium uppercase">{component.status}</p>
      {component.responseTime !== undefined && (
        <p className="text-xs mt-1 opacity-75">{component.responseTime}ms response</p>
      )}
      {component.details && (
        <p className="text-xs mt-1 opacity-75">{component.details}</p>
      )}
    </div>
  );
}

export default function DominosHealth() {
  const [health, setHealth] = useState<DominosHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setError(null);
      const data = await dominosApi.getHealthDetailed();
      setHealth(data);
      setLastChecked(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to reach Dominos service');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchHealth, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchHealth]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Health</h2>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Last checked: {lastChecked.toLocaleTimeString()}
            </span>
          )}
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
            onClick={fetchHealth}
            className="px-3 py-1.5 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Check Now
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-sm font-semibold text-red-800 dark:text-red-400">Service Unreachable</span>
          </div>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {health && (
        <>
          {/* Overall status */}
          <div className={`rounded-lg border p-4 ${statusColor(health.status)}`}>
            <div className="flex items-center gap-3">
              <span className={`w-4 h-4 rounded-full ${statusDot(health.status)}`} />
              <div>
                <p className="text-sm font-semibold">Overall: {health.status}</p>
                <p className="text-xs opacity-75">
                  Uptime: {health.uptime ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m` : 'N/A'}
                  {health.version && ` | Version: ${health.version}`}
                </p>
              </div>
            </div>
          </div>

          {/* Component cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(health.components || []).map((c) => (
              <HealthCard key={c.name} component={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

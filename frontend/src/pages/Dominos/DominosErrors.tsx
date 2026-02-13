/**
 * Dominos Errors Page
 * Error type distribution, error trends, detail table, timeframe selector
 */

import { useState, useEffect, useCallback } from 'react';
import * as dominosApi from '../../services/api/dominosApi';
import type { DominosErrorBreakdown, DominosErrorByType } from '../../types/dominos.types';

const PERIODS = [
  { label: '1h', value: '1h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
];

export default function DominosErrors() {
  const [breakdown, setBreakdown] = useState<DominosErrorBreakdown[]>([]);
  const [errorsByType, setErrorsByType] = useState<DominosErrorByType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('24h');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const [breakdownRes, byTypeRes] = await Promise.all([
        dominosApi.getErrorBreakdown({ period }),
        dominosApi.getErrorsByType({ period }),
      ]);
      setBreakdown(Array.isArray(breakdownRes) ? breakdownRes : []);
      setErrorsByType(Array.isArray(byTypeRes) ? byTypeRes : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load error data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalErrors = breakdown.reduce((sum, e) => sum + e.count, 0);

  // Simple bar chart width calculator
  const maxCount = Math.max(1, ...breakdown.map(e => e.count));

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Errors</h2>
        <div className="flex items-center gap-2">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                period === p.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Errors</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{totalErrors}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Error Types</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{breakdown.length}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Period</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{period}</p>
              </div>
            </div>
          </div>

          {/* Error Distribution (bar chart) */}
          {breakdown.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Error Distribution</h3>
              <div className="space-y-3">
                {breakdown.map((e, i) => (
                  <div key={`${e.error_type}-${i}`} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-40 truncate" title={e.error_type}>
                      {e.error_type}
                    </span>
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-red-500 h-full rounded-full transition-all"
                        style={{ width: `${(e.count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-12 text-right">{e.count}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-14 text-right">
                      {totalErrors > 0 ? ((e.count / totalErrors) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors by Type detail table */}
          {errorsByType.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Error Details</h3>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {errorsByType.map((et) => (
                  <div key={et.type} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{et.type}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{et.count} occurrences</span>
                    </div>
                    {et.examples && et.examples.length > 0 && (
                      <div className="space-y-1">
                        {et.examples.slice(0, 3).map((ex, i) => (
                          <p key={i} className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{ex}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {breakdown.length === 0 && errorsByType.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No errors found for the selected period
            </div>
          )}
        </>
      )}
    </div>
  );
}

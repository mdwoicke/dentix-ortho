/**
 * CacheHealthPage - Redis Slot Cache Health Dashboard
 * Monitor Redis slot cache status, view tier details, and perform manual operations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  getCacheHealth,
  forceCacheRefresh,
  clearCache,
  purgeAndRefreshCache,
} from '../../services/api/testMonitorApi';
import type {
  CacheHealthResponse,
  CacheTierStatus,
  CacheRefreshHistoryEntry,
  SlotsByDate,
} from '../../types/testMonitor.types';
import { CacheSlotsModal } from '../../components/features/cacheHealth/CacheSlotsModal';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatTimeShort(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isBusinessHours(): boolean {
  const now = new Date();
  const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const day = cst.getDay();
  const hour = cst.getHours();
  // Mon-Fri (1-5), 7am-5pm CST
  return day >= 1 && day <= 5 && hour >= 7 && hour < 17;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CacheHealthPage() {
  const [activeTab, setActiveTab] = useState<'tiers' | 'slots' | 'history' | 'operations'>('tiers');
  const [data, setData] = useState<CacheHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Operation states
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [purging, setPurging] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number | 'all'>('all');

  // Modal state for viewing tier slots
  const [viewSlotsModal, setViewSlotsModal] = useState<{ isOpen: boolean; tier: number; tierDays: number } | null>(null);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCacheHealth();
      setData(response);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch cache health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // ============================================================================
  // OPERATIONS
  // ============================================================================

  const handleForceRefresh = async () => {
    if (!confirm(`Force refresh ${selectedTier === 'all' ? 'all tiers (sequentially)' : `Tier ${selectedTier}`}?\n\nThis bypasses business hours check.`)) {
      return;
    }

    try {
      setRefreshing(true);
      setError(null);

      if (selectedTier === 'all') {
        // Refresh tiers sequentially to avoid gateway timeout
        // Each tier is refreshed separately with a delay between them
        for (const tier of ['1', '2', '3']) {
          try {
            await forceCacheRefresh(tier);
            await fetchData(); // Update UI after each tier
            // Small delay between tiers to avoid rate limiting
            if (tier !== '3') {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (tierErr: any) {
            console.warn(`Tier ${tier} refresh failed:`, tierErr.message);
            // Continue with other tiers even if one fails
          }
        }
      } else {
        await forceCacheRefresh(selectedTier);
      }

      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to refresh cache');
    } finally {
      setRefreshing(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm(`Clear cache for ${selectedTier === 'all' ? 'all tiers' : `Tier ${selectedTier}`}?\n\nThis will force API fallback until next refresh.`)) {
      return;
    }

    try {
      setClearing(true);
      await clearCache(selectedTier);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to clear cache');
    } finally {
      setClearing(false);
    }
  };

  const handlePurgeAndRefresh = async () => {
    if (!confirm(`Purge ALL cache keys and refresh ALL tiers?\n\nThis will:\n1. Delete all 6 cache keys (3 tiers + 3 pre-grouped)\n2. Refresh all tiers with fresh Cloud9 data\n3. Reset cache age to 0\n\nThis may take 1-3 minutes.`)) {
      return;
    }

    try {
      setPurging(true);
      setError(null);
      const result = await purgeAndRefreshCache();
      if (!result) {
        setError('Purge and refresh failed - no response');
      }
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to purge and refresh cache');
    } finally {
      setPurging(false);
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      healthy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      degraded: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      unhealthy: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      fresh: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      stale: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      critical_stale: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      empty: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[status] || 'bg-gray-100'}`}>
        {status.toUpperCase().replace('_', ' ')}
      </span>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'fresh':
        return <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>;
      case 'degraded':
      case 'stale':
        return <span className="w-3 h-3 rounded-full bg-yellow-500"></span>;
      case 'unhealthy':
      case 'critical_stale':
      case 'error':
        return <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>;
      default:
        return <span className="w-3 h-3 rounded-full bg-gray-400"></span>;
    }
  };

  // Combine slots by date from all tiers
  const getSlotsByDateTable = (): Array<{ date: string; tier1: number; tier2: number; tier3: number; total: number }> => {
    if (!data?.tiers) return [];

    const dateMap = new Map<string, { tier1: number; tier2: number; tier3: number }>();

    data.tiers.forEach((tier) => {
      (tier.slotsByDate || []).forEach((slot: SlotsByDate) => {
        const existing = dateMap.get(slot.date) || { tier1: 0, tier2: 0, tier3: 0 };
        if (tier.tier === 1) existing.tier1 = slot.count;
        else if (tier.tier === 2) existing.tier2 = slot.count;
        else if (tier.tier === 3) existing.tier3 = slot.count;
        dateMap.set(slot.date, existing);
      });
    });

    return Array.from(dateMap.entries())
      .map(([date, counts]) => ({
        date,
        ...counts,
        total: counts.tier1 + counts.tier2 + counts.tier3,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cache Health</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Redis slot cache monitoring and operations
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Health Status */}
          <div className="flex items-center space-x-2">
            {data && getStatusIcon(data.status)}
            {data && getStatusBadge(data.status)}
          </div>

          {/* Auto-refresh toggle */}
          <div className="flex items-center space-x-2 border-l border-gray-200 dark:border-gray-700 pl-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">Auto-refresh</span>
            </label>
          </div>

          {/* Manual refresh button */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-primary-700 bg-primary-100 rounded-lg hover:bg-primary-200 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Last updated: {formatTime(lastUpdated.toISOString())}
        </div>
      )}

      {/* Summary Stats Cards */}
      {data && (
        <div className="grid grid-cols-5 gap-4">
          {/* Overall Health */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-sm text-gray-500 dark:text-gray-400">Overall Health</div>
            <div className="flex items-center space-x-2 mt-1">
              {getStatusIcon(data.status)}
              <span className="text-xl font-bold text-gray-900 dark:text-white capitalize">
                {data.status}
              </span>
            </div>
          </div>

          {/* Total Slots */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Slots</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {data.summary.totalSlots.toLocaleString()}
            </div>
          </div>

          {/* Tier Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-sm text-gray-500 dark:text-gray-400">Tier Status</div>
            <div className="text-lg font-medium text-gray-900 dark:text-white">
              {3 - data.summary.staleTiers - data.summary.failedTiers}/3 Fresh
            </div>
            {data.summary.staleTiers > 0 && (
              <div className="text-xs text-yellow-600">{data.summary.staleTiers} stale</div>
            )}
            {data.summary.failedTiers > 0 && (
              <div className="text-xs text-red-600">{data.summary.failedTiers} failed</div>
            )}
          </div>

          {/* Refresh Rate */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-sm text-gray-500 dark:text-gray-400">Refresh Rate</div>
            <div className="text-lg font-medium text-gray-900 dark:text-white">
              {data.refreshStats.last20Refreshes.successRate}
            </div>
            <div className="text-xs text-gray-500">
              {data.refreshStats.last20Refreshes.success}/{data.refreshStats.last20Refreshes.success + data.refreshStats.last20Refreshes.failure} last 20
            </div>
          </div>

          {/* Business Hours */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-sm text-gray-500 dark:text-gray-400">Business Hours</div>
            <div className="flex items-center space-x-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${isBusinessHours() ? 'bg-green-500' : 'bg-gray-400'}`}></span>
              <span className="text-lg font-medium text-gray-900 dark:text-white">
                {isBusinessHours() ? 'ON' : 'OFF'}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {data.config?.businessHours || 'Mon-Fri 7am-5pm CST'}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {[
            { id: 'tiers', label: 'Tier Details' },
            { id: 'slots', label: 'Slots by Date' },
            { id: 'history', label: 'Refresh History' },
            { id: 'operations', label: 'Operations' },
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
      {activeTab === 'tiers' && data && (
        <div className="grid grid-cols-3 gap-4">
          {data.tiers.map((tier) => (
            <TierCard
              key={tier.tier}
              tier={tier}
              onViewSlots={() => setViewSlotsModal({ isOpen: true, tier: tier.tier, tierDays: tier.tierDays })}
            />
          ))}
        </div>
      )}

      {activeTab === 'slots' && data && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Slots by Date</h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tier 1 (30d)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tier 2 (60d)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tier 3 (90d)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {getSlotsByDateTable().length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No slot data available
                      </td>
                    </tr>
                  ) : (
                    getSlotsByDateTable().map((row) => {
                      const isPast = new Date(row.date) < new Date();
                      return (
                        <tr key={row.date} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${isPast ? 'opacity-50' : ''}`}>
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                            {row.date}
                            {isPast && <span className="ml-2 text-xs text-gray-400">(past)</span>}
                          </td>
                          <td className={`px-6 py-3 text-sm text-center ${row.tier1 > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                            {row.tier1 || '-'}
                          </td>
                          <td className={`px-6 py-3 text-sm text-center ${row.tier2 > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                            {row.tier2 || '-'}
                          </td>
                          <td className={`px-6 py-3 text-sm text-center ${row.tier3 > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                            {row.tier3 || '-'}
                          </td>
                          <td className="px-6 py-3 text-sm text-center font-medium text-gray-900 dark:text-white">
                            {row.total}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && data && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Refresh History (Last 20)</h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tier</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Slots</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {(data.refreshHistory || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No refresh history available
                      </td>
                    </tr>
                  ) : (
                    (data.refreshHistory || []).map((entry, idx) => (
                      <tr key={idx} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${entry.success ? '' : 'bg-red-50 dark:bg-red-900/20'}`}>
                        <td className="px-6 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                          {formatTime(entry.timestamp)}
                        </td>
                        <td className="px-6 py-3 text-sm text-center text-gray-900 dark:text-white">
                          Tier {entry.tier}
                        </td>
                        <td className="px-6 py-3 text-center">
                          {entry.success ? (
                            <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              SUCCESS
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                              FAILED
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-sm text-center text-gray-900 dark:text-white">
                          {entry.slotCount.toLocaleString()}
                        </td>
                        <td className="px-6 py-3 text-sm text-red-600 dark:text-red-400 max-w-xs truncate">
                          {entry.error || '-'}
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

      {activeTab === 'operations' && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-6">
            {/* Tier Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Tier
              </label>
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="all">All Tiers</option>
                <option value="1">Tier 1 (30 days)</option>
                <option value="2">Tier 2 (60 days)</option>
                <option value="3">Tier 3 (90 days)</option>
              </select>
            </div>

            {/* Purge & Refresh All */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Purge & Refresh All Tiers</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Deletes all cache keys, then refreshes all tiers with fresh Cloud9 data. Resets cache age to 0.
              </p>
              <button
                onClick={handlePurgeAndRefresh}
                disabled={purging || refreshing}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {purging ? 'Purging & Refreshing...' : 'Purge & Refresh All Tiers'}
              </button>
            </div>

            {/* Force Refresh */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Force Refresh</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Triggers immediate cache refresh, bypassing business hours check.
              </p>
              <button
                onClick={handleForceRefresh}
                disabled={refreshing || purging}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {refreshing ? 'Refreshing...' : `Force Refresh ${selectedTier === 'all' ? 'All Tiers' : `Tier ${selectedTier}`}`}
              </button>
            </div>

            {/* Clear Cache */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Clear Cache</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Clears cache data, forcing API fallback until next refresh.
              </p>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
                <div className="flex">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700 dark:text-yellow-200">
                      This is a production operation. Callers will experience slower responses until cache is repopulated.
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={handleClearCache}
                disabled={clearing}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 disabled:opacity-50"
              >
                {clearing ? 'Clearing...' : `Clear ${selectedTier === 'all' ? 'All Caches' : `Tier ${selectedTier} Cache`}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 text-red-800 px-4 py-2 rounded-lg shadow-lg">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-4 text-red-600 hover:text-red-800"
          >
            &times;
          </button>
        </div>
      )}

      {/* Slots Modal */}
      {viewSlotsModal && (
        <CacheSlotsModal
          isOpen={viewSlotsModal.isOpen}
          onClose={() => setViewSlotsModal(null)}
          tier={viewSlotsModal.tier}
          tierDays={viewSlotsModal.tierDays}
        />
      )}
    </div>
  );
}

// ============================================================================
// TIER CARD COMPONENT
// ============================================================================

interface TierCardProps {
  tier: CacheTierStatus;
  onViewSlots: () => void;
}

function TierCard({ tier, onViewSlots }: TierCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [liveAgeSeconds, setLiveAgeSeconds] = useState(tier.ageSeconds || 0);

  // Update age in real-time based on fetchedAt timestamp
  useEffect(() => {
    // If no fetchedAt, use the backend-calculated ageSeconds
    if (!tier.fetchedAt) {
      setLiveAgeSeconds(tier.ageSeconds || 0);
      return;
    }

    const calculateAge = () => {
      try {
        const fetchedTime = new Date(tier.fetchedAt!).getTime();
        // Validate the parsed date
        if (isNaN(fetchedTime)) {
          console.warn('[TierCard] Invalid fetchedAt date:', tier.fetchedAt);
          setLiveAgeSeconds(tier.ageSeconds || 0);
          return;
        }
        const now = Date.now();
        const ageMs = now - fetchedTime;
        // Ensure non-negative age (in case of clock skew or future timestamps)
        const ageSeconds = Math.max(0, Math.floor(ageMs / 1000));
        setLiveAgeSeconds(ageSeconds);
      } catch (err) {
        console.warn('[TierCard] Error calculating age:', err);
        setLiveAgeSeconds(tier.ageSeconds || 0);
      }
    };

    // Calculate immediately
    calculateAge();

    // Update every second
    const interval = setInterval(calculateAge, 1000);
    return () => clearInterval(interval);
  }, [tier.fetchedAt, tier.ageSeconds]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'fresh': return 'border-green-500 bg-green-50 dark:bg-green-900/20';
      case 'stale': return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
      case 'critical_stale': return 'border-red-500 bg-red-50 dark:bg-red-900/20';
      case 'empty': return 'border-gray-400 bg-gray-50 dark:bg-gray-800';
      case 'error': return 'border-red-500 bg-red-50 dark:bg-red-900/20';
      default: return 'border-gray-300 bg-white dark:bg-gray-800';
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      fresh: 'bg-green-100 text-green-800',
      stale: 'bg-yellow-100 text-yellow-800',
      critical_stale: 'bg-red-100 text-red-800',
      empty: 'bg-gray-100 text-gray-800',
      error: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[status] || 'bg-gray-100'}`}>
        {status.toUpperCase().replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className={`rounded-lg border-l-4 shadow-sm ${getStatusColor(tier.status)}`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Tier {tier.tier} <span className="text-sm font-normal text-gray-500">({tier.tierDays} days)</span>
          </h3>
          {getStatusBadge(tier.status)}
        </div>

        {/* Main Stats */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Slots:</span>
            <span className="font-medium text-gray-900 dark:text-white">{tier.slotCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Age:</span>
            <span className={`font-medium ${liveAgeSeconds > 300 ? 'text-yellow-600' : 'text-gray-900 dark:text-white'}`}>
              {formatDuration(liveAgeSeconds)}
            </span>
          </div>
          {tier.dateRange && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Range:</span>
              <span className="font-medium text-gray-900 dark:text-white text-xs">
                {tier.dateRange.start} - {tier.dateRange.end}
              </span>
            </div>
          )}
          {tier.consecutiveFailures > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Failures:</span>
              <span className="font-medium text-red-600">{tier.consecutiveFailures} consecutive</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary-600 hover:text-primary-800 flex items-center"
          >
            {expanded ? 'Hide details' : 'Show details'}
            <svg className={`ml-1 w-3 h-3 transform transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <button
            onClick={onViewSlots}
            disabled={tier.slotCount === 0}
            className="text-xs px-2 py-1 bg-primary-100 text-primary-700 hover:bg-primary-200 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            View Slots
          </button>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2 text-xs">
            {tier.fetchedAt && (
              <div className="flex justify-between">
                <span className="text-gray-500">Last Fetch:</span>
                <span className="text-gray-700 dark:text-gray-300">{formatTime(tier.fetchedAt)}</span>
              </div>
            )}
            {tier.lastSuccess && (
              <div className="flex justify-between">
                <span className="text-gray-500">Last Success:</span>
                <span className="text-green-600">{formatTime(tier.lastSuccess)}</span>
              </div>
            )}
            {tier.lastError && (
              <div className="flex justify-between">
                <span className="text-gray-500">Last Error:</span>
                <span className="text-red-600 truncate max-w-[150px]" title={tier.lastError}>{tier.lastError}</span>
              </div>
            )}
            {tier.lastInvalidatedSlot && (
              <div className="flex justify-between">
                <span className="text-gray-500">Last Invalidation:</span>
                <span className="text-gray-700 dark:text-gray-300">{tier.lastInvalidatedSlot.startTime}</span>
              </div>
            )}
            {tier.lastRestoration && (
              <div className="flex justify-between">
                <span className="text-gray-500">Last Restoration:</span>
                <span className="text-gray-700 dark:text-gray-300">{formatTime(tier.lastRestoration)}</span>
              </div>
            )}
            {tier.error && (
              <div className="text-red-600 mt-2">{tier.error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CacheHealthPage;

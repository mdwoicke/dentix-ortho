import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getRecords } from '../../services/api/fabricWorkflowApi';
import type { FabricWorkflowRecord } from '../../types/fabricWorkflow.types';

type SortDir = 'asc' | 'desc';

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ago`;
}

export function ListManagementPage() {
  const [records, setRecords] = useState<FabricWorkflowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [source, setSource] = useState<'api' | 'csv' | null>(null);

  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [copiedCell, setCopiedCell] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getRecords();
      setRecords(res.data || []);
      setFetchedAt(res.fetchedAt);
      setSource(res.source || null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to fetch records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Discover all unique column keys across all records
  const columns = useMemo(() => {
    const keySet = new Set<string>();
    for (const rec of records) {
      for (const key of Object.keys(rec)) {
        keySet.add(key);
      }
    }
    return Array.from(keySet);
  }, [records]);

  // Filter by search term
  const filtered = useMemo(() => {
    if (!debouncedSearch) return records;
    const lower = debouncedSearch.toLowerCase();
    return records.filter((rec) =>
      columns.some((col) => formatCellValue(rec[col]).toLowerCase().includes(lower))
    );
  }, [records, columns, debouncedSearch]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = formatCellValue(a[sortCol]);
      const bVal = formatCellValue(b[sortCol]);
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCell(key);
      setTimeout(() => setCopiedCell(null), 1500);
    } catch {
      // Clipboard may not be available
    }
  };

  const handleExportCsv = () => {
    if (sorted.length === 0) return;
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = columns.map(escape).join(',');
    const rows = sorted.map((rec) =>
      columns.map((col) => escape(formatCellValue(rec[col]))).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `list-management-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Loading state
  if (loading && records.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading records...</span>
      </div>
    );
  }

  // Error state
  if (error && records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 max-w-md text-center">
          <svg className="w-8 h-8 text-red-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">List Management</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
            <span>{sorted.length} record{sorted.length !== 1 ? 's' : ''}</span>
            {debouncedSearch && sorted.length !== records.length && (
              <span className="text-blue-500">({records.length} total)</span>
            )}
            {fetchedAt && <span>Fetched {timeAgo(fetchedAt)}</span>}
            {source && (
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                source === 'api'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>
                {source === 'api' ? 'API' : 'CSV'}
              </span>
            )}
            {loading && (
              <svg className="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search all fields..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-56"
            />
          </div>
          {/* Refresh */}
          <button
            onClick={fetchData}
            disabled={loading}
            title="Refresh"
            className="p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            disabled={sorted.length === 0}
            title="Export CSV"
            className="p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {error && records.length > 0 && (
        <div className="mb-3 p-2 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-xs text-yellow-700 dark:text-yellow-400">
          Refresh failed: {error}. Showing previous data.
        </div>
      )}

      {/* Empty state */}
      {!loading && records.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500 dark:text-gray-400">
          <svg className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">No records found</p>
        </div>
      )}

      {/* Table */}
      {sorted.length > 0 && (
        <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>{col}</span>
                      {sortCol === col && (
                        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          {sortDir === 'asc' ? (
                            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                          ) : (
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          )}
                        </svg>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sorted.map((rec, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={`${
                    rowIdx % 2 === 0
                      ? 'bg-white dark:bg-slate-900'
                      : 'bg-gray-50/50 dark:bg-slate-800/50'
                  } hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors`}
                >
                  {columns.map((col) => {
                    const cellKey = `${rowIdx}-${col}`;
                    const value = formatCellValue(rec[col]);
                    return (
                      <td
                        key={col}
                        onClick={() => handleCopy(value, cellKey)}
                        title="Click to copy"
                        className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300 cursor-pointer max-w-xs truncate"
                      >
                        {copiedCell === cellKey ? (
                          <span className="text-green-600 dark:text-green-400 text-xs font-medium">Copied!</span>
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No results for search */}
      {debouncedSearch && sorted.length === 0 && records.length > 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <p className="text-sm">No records match "{debouncedSearch}"</p>
          <button
            onClick={() => setSearch('')}
            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}

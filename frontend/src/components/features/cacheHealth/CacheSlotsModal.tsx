/**
 * CacheSlotsModal - Display all cached slots for a tier with filtering and sorting
 * Based on the SlotsFormatter pattern from API Explorer
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getTierSlots } from '../../../services/api/testMonitorApi';
import type { CacheSlot, TierSlotsResponse } from '../../../types/testMonitor.types';

// ============================================================================
// GUID LOOKUP TABLE
// ============================================================================

const GUID_LOOKUPS = {
  scheduleColumns: {
    '07687884-7e37-49aa-8028-d43b751c9034': 'Chair 8',
    'f0fa4eda-0136-45d5-a5d8-91ad7d0b608a': 'Chair 8 (Alt)',
    'e062b81f-1fff-40fc-b4a4-1cf9ecc2f32b': 'Chair 1',
    '5a3b7c9d-4e6f-8a2b-1c3d-5e7f9a1b3c5d': 'Chair 2',
    '7b4c8d0e-5f7a-9b3c-2d4e-6f8a0b2c4d6e': 'Chair 3',
  } as Record<string, string>,
  scheduleViews: {
    '4c9e9333-4951-4eb0-8d97-e1ad83ef422d': 'CDH Allegheny 202',
  } as Record<string, string>,
  appointmentTypes: {
    'f6c20c35-9abb-47c2-981a-342996016705': 'New Patient Exam',
    '8fc9d063-ae46-4975-a5ae-734c6efe341a': 'Regular Adjustment',
  } as Record<string, string>,
};

const lookupGuid = (guid: string, category: keyof typeof GUID_LOOKUPS): string => {
  if (!guid) return '-';
  const lowerGuid = guid.toLowerCase();
  const lookup = GUID_LOOKUPS[category];
  // Try exact match, then lowercase match
  return lookup[guid] || lookup[lowerGuid] || guid.substring(0, 8) + '...';
};

// ============================================================================
// FILTER DROPDOWN COMPONENT
// ============================================================================

interface FilterDropdownProps {
  label: string;
  values: string[];
  selectedValues: Set<string>;
  onSelectionChange: (newSelection: Set<string>) => void;
}

function FilterDropdown({ label, values, selectedValues, onSelectionChange }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allSelected = selectedValues.size === 0 || selectedValues.size === values.length;
  const someSelected = selectedValues.size > 0 && selectedValues.size < values.length;

  const toggleAll = () => {
    onSelectionChange(new Set());
  };

  const toggleValue = (value: string) => {
    const newSelection = new Set(selectedValues);
    if (newSelection.has(value)) {
      newSelection.delete(value);
    } else {
      newSelection.add(value);
    }
    if (newSelection.size === values.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(newSelection);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-2 py-1 text-xs border rounded flex items-center justify-between gap-1
                   ${someSelected ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700'}
                   text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600`}
      >
        <span className="truncate">
          {someSelected ? `${selectedValues.size} selected` : 'All'}
        </span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-48 max-h-60 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs font-medium">(Select All)</span>
          </label>

          {values.map((value) => (
            <label key={value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedValues.size === 0 || selectedValues.has(value)}
                onChange={() => toggleValue(value)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs truncate" title={value}>{value || '(empty)'}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SORTABLE HEADER COMPONENT
// ============================================================================

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSort: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (key: string) => void;
}

function SortableHeader({ label, sortKey, currentSort, onSort }: SortableHeaderProps) {
  const isActive = currentSort?.key === sortKey;
  const direction = isActive ? currentSort.direction : null;

  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 font-medium mb-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
    >
      <span>{label}</span>
      <span className="text-xs">
        {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '○'}
      </span>
    </button>
  );
}

// ============================================================================
// MAIN MODAL COMPONENT
// ============================================================================

interface CacheSlotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: number;
  tierDays: number;
}

export function CacheSlotsModal({ isOpen, onClose, tier, tierDays }: CacheSlotsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TierSlotsResponse | null>(null);

  // Filter state
  const [filters, setFilters] = useState<Record<string, Set<string>>>({
    date: new Set(),
    time: new Set(),
    chair: new Set(),
    scheduleView: new Set(),
    duration: new Set(),
  });

  // Sort state
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Fetch slot data when modal opens
  const fetchSlots = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getTierSlots(tier);
      setData(response);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tier slots');
    } finally {
      setLoading(false);
    }
  }, [tier]);

  useEffect(() => {
    if (isOpen) {
      fetchSlots();
      // Reset filters and sort when modal opens
      setFilters({
        date: new Set(),
        time: new Set(),
        chair: new Set(),
        scheduleView: new Set(),
        duration: new Set(),
      });
      setSort(null);
    }
  }, [isOpen, fetchSlots]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Process slots for filtering
  const processedSlots = (data?.slots || []).map((slot) => {
    const [date, ...timeParts] = (slot.StartTime || '').split(' ');
    return {
      ...slot,
      _parsedDate: date,
      _parsedTime: timeParts.join(' '),
      _chair: slot.ScheduleColumnDescription || lookupGuid(slot.ScheduleColumnGUID, 'scheduleColumns'),
      _chairGuid: slot.ScheduleColumnGUID,
      _scheduleView: slot.ScheduleViewDescription || lookupGuid(slot.ScheduleViewGUID, 'scheduleViews'),
      _scheduleViewGuid: slot.ScheduleViewGUID,
      _duration: slot.Minutes || '45',
    };
  });

  // Get unique values for filters (sorted)
  const uniqueValues = {
    date: [...new Set(processedSlots.map(s => s._parsedDate))].sort(),
    time: [...new Set(processedSlots.map(s => s._parsedTime))].sort(),
    chair: [...new Set(processedSlots.map(s => s._chair))].sort(),
    scheduleView: [...new Set(processedSlots.map(s => s._scheduleView))].sort(),
    duration: [...new Set(processedSlots.map(s => s._duration))].sort((a, b) => Number(a) - Number(b)),
  };

  // Apply filters
  const filteredSlots = processedSlots.filter((slot) => {
    const dateMatch = filters.date.size === 0 || filters.date.has(slot._parsedDate);
    const timeMatch = filters.time.size === 0 || filters.time.has(slot._parsedTime);
    const chairMatch = filters.chair.size === 0 || filters.chair.has(slot._chair);
    const scheduleViewMatch = filters.scheduleView.size === 0 || filters.scheduleView.has(slot._scheduleView);
    const durationMatch = filters.duration.size === 0 || filters.duration.has(slot._duration);
    return dateMatch && timeMatch && chairMatch && scheduleViewMatch && durationMatch;
  });

  // Apply sorting
  const sortedSlots = [...filteredSlots].sort((a, b) => {
    if (!sort) return 0;
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (sort.key) {
      case 'date':
        aVal = a._parsedDate;
        bVal = b._parsedDate;
        break;
      case 'time':
        aVal = a._parsedTime;
        bVal = b._parsedTime;
        break;
      case 'chair':
        aVal = a._chair;
        bVal = b._chair;
        break;
      case 'scheduleView':
        aVal = a._scheduleView;
        bVal = b._scheduleView;
        break;
      case 'duration':
        aVal = parseInt(a._duration) || 0;
        bVal = parseInt(b._duration) || 0;
        break;
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const comparison = String(aVal).localeCompare(String(bVal));
    return sort.direction === 'asc' ? comparison : -comparison;
  });

  const hasFilters = Object.values(filters).some(f => f.size > 0);

  const clearFilters = () => {
    setFilters({
      date: new Set(),
      time: new Set(),
      chair: new Set(),
      scheduleView: new Set(),
      duration: new Set(),
    });
  };

  const updateFilter = (key: string, newSelection: Set<string>) => {
    setFilters(prev => ({ ...prev, [key]: newSelection }));
  };

  const handleSort = (key: string) => {
    setSort(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const formatCacheAge = (seconds: number | null) => {
    if (seconds === null) return 'Unknown';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[90vw] max-w-6xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Tier {tier} Cached Slots ({tierDays} days)
            </h2>
            {data && (
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <span>
                  Cache Age: <span className={data.cacheAgeSeconds && data.cacheAgeSeconds > 300 ? 'text-yellow-600' : ''}>{formatCacheAge(data.cacheAgeSeconds)}</span>
                </span>
                <span>
                  Date Range: {data.dateRange?.start} - {data.dateRange?.end}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  data.cacheStatus === 'fresh' ? 'bg-green-100 text-green-800' :
                  data.cacheStatus === 'stale' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {data.cacheStatus.toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              <span className="ml-3 text-gray-500">Loading cached slots...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-600 mb-2">{error}</div>
              <button
                onClick={fetchSlots}
                className="text-sm text-primary-600 hover:text-primary-800"
              >
                Try again
              </button>
            </div>
          ) : (data?.slots || []).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No slots found in cache for this tier.
              {data?.message && <div className="text-sm mt-2">{data.message}</div>}
            </div>
          ) : (
            <div>
              {/* Filter summary bar */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-500">
                  {hasFilters ? (
                    <span>Showing {sortedSlots.length} of {data?.slotCount} slots</span>
                  ) : (
                    <span>{data?.slotCount?.toLocaleString()} slots found</span>
                  )}
                  {sort && (
                    <span className="ml-2 text-xs text-gray-400">
                      (sorted by {sort.key} {sort.direction})
                    </span>
                  )}
                </div>
                {hasFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs px-2 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-left min-w-[120px]">
                        <SortableHeader label="Date" sortKey="date" currentSort={sort} onSort={handleSort} />
                        <FilterDropdown
                          label="Date"
                          values={uniqueValues.date}
                          selectedValues={filters.date}
                          onSelectionChange={(v) => updateFilter('date', v)}
                        />
                      </th>
                      <th className="px-3 py-2 text-left min-w-[100px]">
                        <SortableHeader label="Time" sortKey="time" currentSort={sort} onSort={handleSort} />
                        <FilterDropdown
                          label="Time"
                          values={uniqueValues.time}
                          selectedValues={filters.time}
                          onSelectionChange={(v) => updateFilter('time', v)}
                        />
                      </th>
                      <th className="px-3 py-2 text-left min-w-[100px]">
                        <SortableHeader label="Chair" sortKey="chair" currentSort={sort} onSort={handleSort} />
                        <FilterDropdown
                          label="Chair"
                          values={uniqueValues.chair}
                          selectedValues={filters.chair}
                          onSelectionChange={(v) => updateFilter('chair', v)}
                        />
                      </th>
                      <th className="px-3 py-2 text-left min-w-[150px]">
                        <SortableHeader label="Schedule View" sortKey="scheduleView" currentSort={sort} onSort={handleSort} />
                        <FilterDropdown
                          label="Schedule View"
                          values={uniqueValues.scheduleView}
                          selectedValues={filters.scheduleView}
                          onSelectionChange={(v) => updateFilter('scheduleView', v)}
                        />
                      </th>
                      <th className="px-3 py-2 text-left min-w-[80px]">
                        <SortableHeader label="Duration" sortKey="duration" currentSort={sort} onSort={handleSort} />
                        <FilterDropdown
                          label="Duration"
                          values={uniqueValues.duration}
                          selectedValues={filters.duration}
                          onSelectionChange={(v) => updateFilter('duration', v)}
                        />
                      </th>
                      <th className="px-3 py-2 text-left min-w-[100px]">End Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {sortedSlots.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-gray-500 italic">
                          No slots match the current filters
                        </td>
                      </tr>
                    ) : (
                      sortedSlots.map((slot, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-3 py-2">{slot._parsedDate}</td>
                          <td className="px-3 py-2">{slot._parsedTime}</td>
                          <td className="px-3 py-2" title={slot._chairGuid}>
                            {slot._chair}
                          </td>
                          <td className="px-3 py-2" title={slot._scheduleViewGuid}>
                            {slot._scheduleView}
                          </td>
                          <td className="px-3 py-2">{slot._duration} min</td>
                          <td className="px-3 py-2 text-gray-500">{slot.EndTime?.split(' ').slice(1).join(' ') || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer stats */}
              <div className="mt-4 text-xs text-gray-500 flex items-center justify-between">
                <span>
                  {hasFilters || sort ? (
                    <>
                      {hasFilters ? `Filtered: ${sortedSlots.length} of ${data?.slotCount} slots` : `Showing ${data?.slotCount} slots`}
                      {sort && ` (sorted by ${sort.key} ${sort.direction})`}
                    </>
                  ) : (
                    `Showing ${data?.slotCount?.toLocaleString()} slots`
                  )}
                </span>
                {data?.fetchedAt && (
                  <span>
                    Fetched: {new Date(data.fetchedAt).toLocaleString('en-US', {
                      timeZone: 'America/Chicago',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })} CST
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default CacheSlotsModal;

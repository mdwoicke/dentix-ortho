/**
 * Goal Test Dashboard Component
 * Displays stats cards and quick actions for goal test cases
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { clsx } from 'clsx';
import { StatsCard } from './StatsCard';
import { selectDashboardStats, selectSelectionState, selectFilters } from '../../../store/slices/goalTestCasesSlice';
import type { GoalTestFilters } from '../../../types/testMonitor.types';

// Icons
const TotalIcon = () => (
  <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const HappyPathIcon = () => (
  <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const EdgeCaseIcon = () => (
  <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const ErrorIcon = () => (
  <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SyncIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

interface GoalTestDashboardProps {
  testCases?: any[];
  filters?: GoalTestFilters;
  onFilterChange?: (filters: Partial<GoalTestFilters>) => void;
  onRunAll?: () => void;
  onRunSelected?: () => void;
  onSync?: () => void;
  onCreate?: () => void;
  isSyncing?: boolean;
  isRunning?: boolean;
}

const defaultFilters: GoalTestFilters = {
  search: '',
  categories: ['happy-path', 'edge-case', 'error-handling'],
  tags: [],
  personas: [],
  goalTypes: [],
  includeArchived: false,
};

export function GoalTestDashboard({
  filters: propFilters,
  onFilterChange,
  onRunAll,
  onRunSelected,
  onSync,
  onCreate,
  isSyncing = false,
  isRunning = false,
}: GoalTestDashboardProps) {
  const rawStats = useSelector(selectDashboardStats);
  const rawSelection = useSelector(selectSelectionState);
  const reduxFilters = useSelector(selectFilters);

  // Use prop filters if provided, otherwise use Redux state, with defaults as fallback
  const filters = propFilters || reduxFilters || defaultFilters;

  // Provide safe defaults for stats and selection
  const stats = rawStats || {
    total: 0,
    byCategory: {},
    byStatus: { active: 0, archived: 0 },
  };
  const selection = rawSelection || { hasSelection: false, selectedCount: 0 };

  const handleCategoryClick = (category: string) => {
    if (!onFilterChange) return;
    const categories = filters.categories || [];
    const newCategories = categories.includes(category)
      ? categories.filter(c => c !== category)
      : [...categories, category];
    onFilterChange({ categories: newCategories });
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatsCard
          label="Total"
          value={stats.total}
          icon={<TotalIcon />}
          color="blue"
          size="sm"
        />
        <StatsCard
          label="Happy Path"
          value={stats.byCategory['happy-path'] || 0}
          icon={<HappyPathIcon />}
          color="green"
          size="sm"
          onClick={() => handleCategoryClick('happy-path')}
          isActive={(filters.categories || []).includes('happy-path') && (filters.categories || []).length === 1}
        />
        <StatsCard
          label="Edge Cases"
          value={stats.byCategory['edge-case'] || 0}
          icon={<EdgeCaseIcon />}
          color="yellow"
          size="sm"
          onClick={() => handleCategoryClick('edge-case')}
          isActive={(filters.categories || []).includes('edge-case') && (filters.categories || []).length === 1}
        />
        <StatsCard
          label="Error Handling"
          value={stats.byCategory['error-handling'] || 0}
          icon={<ErrorIcon />}
          color="red"
          size="sm"
          onClick={() => handleCategoryClick('error-handling')}
          isActive={(filters.categories || []).includes('error-handling') && (filters.categories || []).length === 1}
        />
      </div>

      {/* Quick Actions Row */}
      <div className="flex items-center justify-between gap-4 py-2 px-1">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          {selection.hasSelection ? (
            <span>{selection.selectedCount} test{selection.selectedCount !== 1 ? 's' : ''} selected</span>
          ) : (
            <span>{stats.byStatus.active} active, {stats.byStatus.archived} archived</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Run buttons */}
          {selection.hasSelection ? (
            <button
              onClick={onRunSelected}
              disabled={isRunning}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
                'bg-green-600 text-white hover:bg-green-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors'
              )}
            >
              <PlayIcon />
              Run Selected ({selection.selectedCount})
            </button>
          ) : (
            <button
              onClick={onRunAll}
              disabled={isRunning}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
                'bg-green-600 text-white hover:bg-green-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors'
              )}
            >
              <PlayIcon />
              Run All
            </button>
          )}

          {/* Sync button */}
          <button
            onClick={onSync}
            disabled={isSyncing}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
              'bg-gray-100 text-gray-700 hover:bg-gray-200',
              'dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors'
            )}
          >
            <SyncIcon />
            {isSyncing ? 'Syncing...' : 'Sync to TS'}
          </button>

          {/* New button */}
          <button
            onClick={onCreate}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
              'bg-blue-600 text-white hover:bg-blue-700',
              'transition-colors'
            )}
          >
            <PlusIcon />
            New Test
          </button>
        </div>
      </div>
    </div>
  );
}

export default GoalTestDashboard;

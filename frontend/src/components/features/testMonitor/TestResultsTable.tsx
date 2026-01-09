/**
 * TestResultsTable Component
 * Displays test results in a table format with status indicators
 * Memoized to prevent unnecessary re-renders during auto-refresh
 */

import { memo, useCallback } from 'react';
import { Spinner } from '../../ui';
import type { TestResult } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';

interface TestResultsTableProps {
  results: TestResult[];
  selectedTestId?: string;
  onSelectTest: (test: TestResult) => void;
  loading?: boolean;
}

const statusIcons: Record<string, { icon: string; color: string }> = {
  passed: { icon: 'check', color: 'text-green-600 dark:text-green-400' },
  failed: { icon: 'x', color: 'text-red-600 dark:text-red-400' },
  error: { icon: '!', color: 'text-orange-600 dark:text-orange-400' },
  skipped: { icon: '-', color: 'text-gray-500 dark:text-gray-400' },
  running: { icon: '⟳', color: 'text-blue-600 dark:text-blue-400' },
};

const statusBadgeColors: Record<string, string> = {
  passed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  error: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  skipped: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

/**
 * Memoized table row component to prevent re-renders of unchanged rows
 */
interface TestResultRowProps {
  result: TestResult;
  isSelected: boolean;
  onSelect: (result: TestResult) => void;
}

const TestResultRow = memo(function TestResultRow({
  result,
  isSelected,
  onSelect,
}: TestResultRowProps) {
  const handleClick = useCallback(() => {
    onSelect(result);
  }, [onSelect, result]);

  return (
    <tr
      onClick={handleClick}
      className={cn(
        'cursor-pointer transition-colors',
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
      )}
    >
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
          statusBadgeColors[result.status] || statusBadgeColors.running
        )}>
          {result.status === 'running' && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          )}
          {(result.status || 'running').toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {result.testName}
        </div>
        {result.errorMessage && (
          <div className="text-xs text-red-600 dark:text-red-400 mt-1 truncate max-w-xs">
            {result.errorMessage}
          </div>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {result.category}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {result.status === 'running' ? (
            <span className="italic text-blue-600 dark:text-blue-400">In progress...</span>
          ) : (
            `${(result.durationMs / 1000).toFixed(2)}s`
          )}
        </span>
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return (
    prevProps.result.testId === nextProps.result.testId &&
    prevProps.result.status === nextProps.result.status &&
    prevProps.result.durationMs === nextProps.result.durationMs &&
    prevProps.result.errorMessage === nextProps.result.errorMessage &&
    prevProps.isSelected === nextProps.isSelected
  );
});

/**
 * Main table component - memoized to prevent re-renders when parent updates
 */
export const TestResultsTable = memo(function TestResultsTable({
  results,
  selectedTestId,
  onSelectTest,
  loading,
}: TestResultsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No test results. Select a test run to view results.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Test Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Category
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Duration
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
          {results.map((result) => (
            <TestResultRow
              key={result.testId}
              result={result}
              isSelected={result.testId === selectedTestId}
              onSelect={onSelectTest}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

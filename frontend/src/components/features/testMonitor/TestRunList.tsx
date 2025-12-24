/**
 * TestRunList Component
 * Displays a list of test runs with status and statistics
 */

import React from 'react';
import { Card, Spinner } from '../../ui';
import type { TestRun } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';

interface TestRunListProps {
  runs: TestRun[];
  selectedRunId?: string;
  onSelectRun: (runId: string) => void;
  loading?: boolean;
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  aborted: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

export function TestRunList({ runs, selectedRunId, onSelectRun, loading }: TestRunListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No test runs found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const isSelected = run.runId === selectedRunId;
        const passRate = run.totalTests > 0
          ? Math.round((run.passed / run.totalTests) * 100)
          : 0;

        return (
          <div
            key={run.runId}
            onClick={() => onSelectRun(run.runId)}
            className={cn(
              'p-3 rounded-lg cursor-pointer transition-colors border',
              isSelected
                ? 'bg-blue-50 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700'
                : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
                {run.runId}
              </span>
              <span className={cn(
                'px-2 py-0.5 text-xs font-medium rounded-full',
                statusColors[run.status]
              )}>
                {run.status}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="text-green-600 dark:text-green-400">
                  {run.passed} passed
                </span>
                <span className="text-red-600 dark:text-red-400">
                  {run.failed} failed
                </span>
                {run.skipped > 0 && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {run.skipped} skipped
                  </span>
                )}
              </div>
              <span className={cn(
                'text-xs font-medium',
                passRate >= 80 ? 'text-green-600 dark:text-green-400' :
                passRate >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              )}>
                {passRate}%
              </span>
            </div>

            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {new Date(run.startedAt).toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * TestRunList Component
 * Displays a list of test runs with status and statistics
 */

import { Spinner } from '../../ui';
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
                'px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1.5',
                statusColors[run.status]
              )}>
                {run.status === 'running' && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                )}
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

            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(run.startedAt).toLocaleString()}
              </span>
              {run.environmentPresetName && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                  </svg>
                  {run.environmentPresetName}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

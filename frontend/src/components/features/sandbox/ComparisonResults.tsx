/**
 * ComparisonResults Component
 * Displays three-way comparison results (Production vs Sandbox A vs Sandbox B)
 */

import { useState } from 'react';
import { cn } from '../../../utils/cn';
import type { ComparisonResult, ComparisonRun, TestComparisonResult } from '../../../types/sandbox.types';

interface ComparisonResultsProps {
  result: ComparisonResult | null;
  history?: ComparisonRun[];
  onViewDetails?: (testId: string) => void;
  onLoadHistoricalRun?: (comparisonId: string) => void;
}

function getWinner(test: TestComparisonResult): string {
  const results: { name: string; passed: boolean | null }[] = [
    { name: 'Production', passed: test.production?.passed ?? null },
    { name: 'Sandbox A', passed: test.sandboxA?.passed ?? null },
    { name: 'Sandbox B', passed: test.sandboxB?.passed ?? null },
  ];

  const tested = results.filter(r => r.passed !== null);
  const passed = results.filter(r => r.passed === true);

  // Only one endpoint was tested - not a real comparison
  if (tested.length <= 1) {
    return passed.length === 1 ? passed[0].name : 'Failed';
  }

  // Multiple endpoints tested
  if (passed.length === 0) return 'All Failed';
  if (passed.length === tested.length) return 'Tie';
  if (passed.length === 1) return passed[0].name;

  // Multiple winners (some passed, some failed)
  return passed.map(p => p.name.split(' ')[1] || p.name).join(' & ');
}

function SummaryCard({
  title,
  passRate,
  color,
  improvements,
  regressions,
}: {
  title: string;
  passRate: number;
  color: 'green' | 'blue' | 'purple';
  improvements: number;
  regressions: number;
}) {
  const colorClasses = {
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-800',
      text: 'text-green-700 dark:text-green-400',
      progress: 'bg-green-500',
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-700 dark:text-blue-400',
      progress: 'bg-blue-500',
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'border-purple-200 dark:border-purple-800',
      text: 'text-purple-700 dark:text-purple-400',
      progress: 'bg-purple-500',
    },
  };

  const classes = colorClasses[color];

  return (
    <div className={cn('p-4 rounded-lg border', classes.bg, classes.border)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-900 dark:text-white">{title}</span>
        <span className={cn('text-lg font-bold', classes.text)}>
          {passRate.toFixed(0)}%
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
        <div
          className={cn('h-full rounded-full', classes.progress)}
          style={{ width: `${passRate}%` }}
        />
      </div>
      <div className="flex items-center gap-4 text-xs">
        {improvements > 0 && (
          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {improvements} improved
          </span>
        )}
        {regressions > 0 && (
          <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {regressions} regressed
          </span>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(isoString?: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  // Show date if not today
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function StatusBadge({ passed, turnCount, durationMs, ranAt }: { passed: boolean; turnCount: number; durationMs: number; ranAt?: string }) {
  return (
    <div className={cn(
      'flex flex-col items-center p-2 rounded',
      passed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
    )}>
      <span className={cn(
        'text-sm font-medium',
        passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
      )}>
        {passed ? 'PASS' : 'FAIL'}
      </span>
      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{turnCount} turns</span>
        <span>{(durationMs / 1000).toFixed(1)}s</span>
      </div>
      {ranAt && (
        <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {formatTimestamp(ranAt)}
        </div>
      )}
    </div>
  );
}

function formatHistoryTimestamp(isoString: string | null): string {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (isToday) return `Today ${timeStr}`;
  if (isYesterday) return `Yesterday ${timeStr}`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function HistoryItem({
  run,
  isSelected,
  onSelect,
}: {
  run: ComparisonRun;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const passRate = run.summary?.productionPassRate ?? 0;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full p-3 text-left rounded-lg border transition-colors',
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
          {run.comparisonId}
        </span>
        <span className={cn(
          'px-1.5 py-0.5 text-xs rounded font-medium',
          run.status === 'completed' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' :
          run.status === 'running' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400' :
          run.status === 'failed' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400' :
          'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
        )}>
          {run.status}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 dark:text-gray-400">
          {formatHistoryTimestamp(run.completedAt || run.startedAt)}
        </span>
        {run.status === 'completed' && run.summary && (
          <span className="text-gray-600 dark:text-gray-300">
            {run.summary.totalTests} tests, {passRate.toFixed(0)}% pass
          </span>
        )}
      </div>
    </button>
  );
}

export function ComparisonResults({
  result,
  history = [],
  onViewDetails,
  onLoadHistoricalRun,
}: ComparisonResultsProps) {
  const [showHistory, setShowHistory] = useState(false);

  // Show history panel if no results yet or user toggled it
  if (!result && history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p>No comparison results yet.</p>
        <p className="text-sm mt-1">Run a comparison to see results.</p>
      </div>
    );
  }

  // Show history if no result but we have history
  if (!result && history.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Previous Comparison Runs
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {history.length} runs
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {history.slice(0, 6).map(run => (
            <HistoryItem
              key={run.comparisonId}
              run={run}
              isSelected={false}
              onSelect={() => onLoadHistoricalRun?.(run.comparisonId)}
            />
          ))}
        </div>
        {history.length === 0 && (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
            No previous runs found
          </div>
        )}
      </div>
    );
  }

  // Handle pending comparison that doesn't have results yet
  if (!result.summary || !result.testResults) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-3 text-blue-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p>Comparison created: {result.comparisonId}</p>
        <p className="text-sm mt-1">Status: {result.status || 'pending'}</p>
        {result.message && (
          <p className="text-xs mt-2 text-yellow-600 dark:text-yellow-400">{result.message}</p>
        )}
      </div>
    );
  }

  const { summary, testResults } = result;

  // Ensure improvements and regressions arrays exist
  const improvements = summary?.improvements || [];
  const regressions = summary?.regressions || [];

  // Count improvements and regressions for each sandbox
  const sandboxAImprovements = improvements.filter(i => i.to === 'Sandbox A').length;
  const sandboxARegressions = regressions.filter(r => r.from === 'Sandbox A').length;
  const sandboxBImprovements = improvements.filter(i => i.to === 'Sandbox B').length;
  const sandboxBRegressions = regressions.filter(r => r.from === 'Sandbox B').length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Production"
          passRate={summary?.productionPassRate ?? 0}
          color="green"
          improvements={0}
          regressions={0}
        />
        <SummaryCard
          title="Sandbox A"
          passRate={summary?.sandboxAPassRate ?? 0}
          color="blue"
          improvements={sandboxAImprovements}
          regressions={sandboxARegressions}
        />
        <SummaryCard
          title="Sandbox B"
          passRate={summary?.sandboxBPassRate ?? 0}
          color="purple"
          improvements={sandboxBImprovements}
          regressions={sandboxBRegressions}
        />
      </div>

      {/* Improvements & Regressions */}
      {(improvements.length > 0 || regressions.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {improvements.length > 0 && (
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
              <h4 className="text-sm font-medium text-green-700 dark:text-green-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Improvements
              </h4>
              <ul className="space-y-1">
                {improvements.map((imp, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-mono text-xs">{imp.testId}</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2">
                      {imp.to} fixed
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {regressions.length > 0 && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
              <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Regressions
              </h4>
              <ul className="space-y-1">
                {regressions.map((reg, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-mono text-xs">{reg.testId}</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2">
                      {reg.from} broke
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Detailed Results Table */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Test Results ({testResults.length} tests)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
                <th className="w-[20%] text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Test ID
                </th>
                <th className="w-[20%] text-center px-4 py-2 text-xs font-medium text-green-600 dark:text-green-400 uppercase">
                  Production
                </th>
                <th className="w-[20%] text-center px-4 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">
                  Sandbox A
                </th>
                <th className="w-[20%] text-center px-4 py-2 text-xs font-medium text-purple-600 dark:text-purple-400 uppercase">
                  Sandbox B
                </th>
                <th className="w-[20%] text-center px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Winner
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {testResults.map(test => {
                const winner = getWinner(test);

                return (
                  <tr
                    key={test.testId}
                    onClick={() => onViewDetails?.(test.testId)}
                    className={cn(
                      'transition-colors',
                      onViewDetails && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                        {test.testId}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-center">
                        {test.production ? (
                          <StatusBadge
                            passed={test.production.passed}
                            turnCount={test.production.turnCount}
                            durationMs={test.production.durationMs}
                            ranAt={test.production.ranAt || (result as any).completedAt}
                          />
                        ) : (
                          <span className="text-xs text-gray-400 italic">Not run</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-center">
                        {test.sandboxA ? (
                          <StatusBadge
                            passed={test.sandboxA.passed}
                            turnCount={test.sandboxA.turnCount}
                            durationMs={test.sandboxA.durationMs}
                            ranAt={test.sandboxA.ranAt || (result as any).completedAt}
                          />
                        ) : (
                          <span className="text-xs text-gray-400 italic">Not run</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-center">
                        {test.sandboxB ? (
                          <StatusBadge
                            passed={test.sandboxB.passed}
                            turnCount={test.sandboxB.turnCount}
                            durationMs={test.sandboxB.durationMs}
                            ranAt={test.sandboxB.ranAt || (result as any).completedAt}
                          />
                        ) : (
                          <span className="text-xs text-gray-400 italic">Not run</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={cn(
                        'px-2 py-1 text-xs font-medium rounded',
                        winner === 'Tie' ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' :
                        winner === 'All Failed' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400' :
                        winner === 'Production' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' :
                        winner.includes('A') ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400' :
                        'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400'
                      )}>
                        {winner}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Section (collapsible) */}
      {history.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full py-2 px-3 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Previous Runs ({history.length})
            </span>
            <svg
              className={cn('w-5 h-5 transition-transform', showHistory && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showHistory && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {history.slice(0, 6).map(run => (
                <HistoryItem
                  key={run.comparisonId}
                  run={run}
                  isSelected={result?.comparisonId === run.comparisonId}
                  onSelect={() => onLoadHistoricalRun?.(run.comparisonId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

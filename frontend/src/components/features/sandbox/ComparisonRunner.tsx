/**
 * ComparisonRunner Component
 * Controls for starting and monitoring comparison runs
 */

import { useState, useEffect, useRef } from 'react';
import { Spinner } from '../../ui';
import { cn } from '../../../utils/cn';
import type { ComparisonProgress, Sandbox, ComparisonResult } from '../../../types/sandbox.types';

interface ComparisonRunnerProps {
  selectedTestIds: string[];
  sandboxes: Sandbox[];
  isRunning: boolean;
  progress: ComparisonProgress | null;
  lastResult?: ComparisonResult | null;
  onStartComparison: (config: {
    runProduction: boolean;
    runSandboxA: boolean;
    runSandboxB: boolean;
  }) => void;
}

export function ComparisonRunner({
  selectedTestIds,
  sandboxes,
  isRunning,
  progress,
  lastResult,
  onStartComparison,
}: ComparisonRunnerProps) {
  const [runProduction, setRunProduction] = useState(true);
  const [runSandboxA, setRunSandboxA] = useState(true);
  const [runSandboxB, setRunSandboxB] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const sandboxA = sandboxes.find(s => s.sandboxId === 'sandbox_a');
  const sandboxB = sandboxes.find(s => s.sandboxId === 'sandbox_b');

  const canRunSandboxA = Boolean(sandboxA?.flowiseEndpoint);
  const canRunSandboxB = Boolean(sandboxB?.flowiseEndpoint);
  const canRun = selectedTestIds.length > 0 && (runProduction || (runSandboxA && canRunSandboxA) || (runSandboxB && canRunSandboxB));

  // Track elapsed time when running
  useEffect(() => {
    if (isRunning) {
      setIsStarting(false);
      if (!startTimeRef.current) {
        // Use startedAt from lastResult if available, otherwise use now
        if (lastResult?.startedAt) {
          startTimeRef.current = new Date(lastResult.startedAt).getTime();
        } else {
          startTimeRef.current = Date.now();
        }
      }

      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      startTimeRef.current = null;
      setElapsedTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, lastResult?.startedAt]);

  const handleStart = () => {
    setIsStarting(true);
    onStartComparison({
      runProduction,
      runSandboxA: runSandboxA && canRunSandboxA,
      runSandboxB: runSandboxB && canRunSandboxB,
    });
  };

  const getProgressLabel = () => {
    if (!progress) return '';

    const stage = progress.stage === 'production' ? 'Production' :
                  progress.stage === 'sandboxA' ? 'Sandbox A' : 'Sandbox B';
    return `${stage}: Test ${progress.testIndex + 1}/${progress.totalTests}`;
  };

  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Calculate completed tests from lastResult
  const getCompletedTestsCount = (): number => {
    if (!lastResult?.testResults) return 0;
    return lastResult.testResults.filter(t =>
      t.production !== null || t.sandboxA !== null || t.sandboxB !== null
    ).length;
  };

  const showRunningUI = isRunning || isStarting;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
        Run Comparison
      </h3>

      {/* Endpoint Selection */}
      <div className="space-y-3 mb-4">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Endpoints to Test
        </div>

        {/* Production */}
        <label className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 cursor-pointer">
          <input
            type="checkbox"
            checked={runProduction}
            onChange={(e) => setRunProduction(e.target.checked)}
            disabled={isRunning}
            className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white">Production</span>
              <span className="px-1.5 py-0.5 text-xs rounded bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400">
                Baseline
              </span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Current Flowise deployment
            </span>
          </div>
        </label>

        {/* Sandbox A */}
        <label className={cn(
          'flex items-center gap-3 p-2 rounded-lg cursor-pointer',
          canRunSandboxA
            ? 'bg-blue-50 dark:bg-blue-900/20'
            : 'bg-gray-50 dark:bg-gray-700/50 opacity-60'
        )}>
          <input
            type="checkbox"
            checked={runSandboxA && canRunSandboxA}
            onChange={(e) => setRunSandboxA(e.target.checked)}
            disabled={isRunning || !canRunSandboxA}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {sandboxA?.name || 'Sandbox A'}
              </span>
              {!canRunSandboxA && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400">
                  No endpoint
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate block max-w-[200px]">
              {sandboxA?.flowiseEndpoint || 'Configure endpoint to enable'}
            </span>
          </div>
        </label>

        {/* Sandbox B */}
        <label className={cn(
          'flex items-center gap-3 p-2 rounded-lg cursor-pointer',
          canRunSandboxB
            ? 'bg-purple-50 dark:bg-purple-900/20'
            : 'bg-gray-50 dark:bg-gray-700/50 opacity-60'
        )}>
          <input
            type="checkbox"
            checked={runSandboxB && canRunSandboxB}
            onChange={(e) => setRunSandboxB(e.target.checked)}
            disabled={isRunning || !canRunSandboxB}
            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {sandboxB?.name || 'Sandbox B'}
              </span>
              {!canRunSandboxB && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400">
                  No endpoint
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate block max-w-[200px]">
              {sandboxB?.flowiseEndpoint || 'Configure endpoint to enable'}
            </span>
          </div>
        </label>
      </div>

      {/* Run Button */}
      <button
        onClick={handleStart}
        disabled={!canRun || showRunningUI}
        className={cn(
          'w-full py-2.5 px-4 text-sm font-medium rounded-lg transition-colors',
          'flex items-center justify-center gap-2',
          canRun && !showRunningUI
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : showRunningUI
              ? 'bg-blue-600/80 text-white cursor-wait'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
        )}
      >
        {showRunningUI ? (
          <>
            <Spinner size="sm" />
            <span>{isStarting ? 'Starting...' : (getProgressLabel() || 'Running...')}</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Run Comparison ({selectedTestIds.length} test{selectedTestIds.length !== 1 ? 's' : ''})
            </span>
          </>
        )}
      </button>

      {/* Running Status Panel */}
      {showRunningUI && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3">
          {/* Status Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                <div className="absolute inset-0 w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping opacity-75" />
              </div>
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                {isStarting ? 'Initializing comparison...' : 'Comparison running'}
              </span>
            </div>
            <span className="text-xs font-mono text-blue-600 dark:text-blue-500">
              {formatElapsedTime(elapsedTime)}
            </span>
          </div>

          {/* Progress Info - only show when we have actual progress */}
          {progress ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">
                  {progress.stage === 'production' ? 'Testing Production...' :
                   progress.stage === 'sandboxA' ? 'Testing Sandbox A...' : 'Testing Sandbox B...'}
                </span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {Math.round(((progress.testIndex + 1) / progress.totalTests) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-300 rounded-full',
                    progress.stage === 'production' ? 'bg-green-500' :
                    progress.stage === 'sandboxA' ? 'bg-blue-500' : 'bg-purple-500'
                  )}
                  style={{ width: `${((progress.testIndex + 1) / progress.totalTests) * 100}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Current: <span className="font-mono">{progress.testId}</span>
              </div>
            </>
          ) : (
            <>
              {/* Indeterminate progress bar when no granular progress */}
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-pulse w-full opacity-60" />
              </div>
              {lastResult?.comparisonId && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  ID: <span className="font-mono">{lastResult.comparisonId}</span>
                </div>
              )}
              {getCompletedTestsCount() > 0 && (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {getCompletedTestsCount()} of {selectedTestIds.length || '?'} tests completed
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Summary info */}
      {!isRunning && selectedTestIds.length === 0 && (
        <p className="mt-3 text-xs text-center text-gray-500 dark:text-gray-400">
          Select tests from the list to run a comparison
        </p>
      )}
    </div>
  );
}

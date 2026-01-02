/**
 * DiagnosisPanel Component
 * Allows users to run LLM-powered diagnosis on test failures and generate fixes
 */

import { useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { Card, Button } from '../../ui';
import {
  runDiagnosis,
  fetchFixes,
  selectDiagnosisState,
} from '../../../store/slices/testMonitorSlice';

interface DiagnosisPanelProps {
  runId: string;
  failedTestCount: number;
  onDiagnosisComplete?: () => void;
}

export function DiagnosisPanel({
  runId,
  failedTestCount,
  onDiagnosisComplete,
}: DiagnosisPanelProps) {
  const dispatch = useAppDispatch();
  const diagnosisState = useAppSelector(selectDiagnosisState);
  const [useLLM, setUseLLM] = useState(true);

  const handleRunDiagnosis = useCallback(async () => {
    console.log(`[Fixes:DiagnosisPanel] handleRunDiagnosis called with runId: ${runId}`);
    if (!runId || diagnosisState.isRunning) {
      console.log(`[Fixes:DiagnosisPanel] Early return - runId: ${runId}, isRunning: ${diagnosisState.isRunning}`);
      return;
    }

    try {
      console.log(`[Fixes:DiagnosisPanel] Dispatching runDiagnosis thunk...`);
      const result = await dispatch(runDiagnosis({ runId, useLLM })).unwrap();
      console.log(`[Fixes:DiagnosisPanel] runDiagnosis completed:`, result);
      // Refresh fixes after diagnosis
      console.log(`[Fixes:DiagnosisPanel] Dispatching fetchFixes(${runId})...`);
      dispatch(fetchFixes(runId));
      console.log(`[Fixes:DiagnosisPanel] Calling onDiagnosisComplete callback`);
      onDiagnosisComplete?.();
    } catch (error) {
      console.error('[Fixes:DiagnosisPanel] Diagnosis failed:', error);
    }
  }, [dispatch, runId, useLLM, diagnosisState.isRunning, onDiagnosisComplete]);

  const isDisabled = !runId || failedTestCount === 0 || diagnosisState.isRunning;

  // Determine reason for disabled state (for tooltip)
  const disabledReason = !runId
    ? 'No test run available. Run tests first.'
    : failedTestCount === 0
    ? 'No failed tests to diagnose. All tests passed!'
    : '';

  return (
    <Card className="h-full">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Diagnosis
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Analyze test failures and generate AI-powered fixes
            </p>
          </div>

          {/* Analysis Mode Toggle */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={useLLM}
                onChange={(e) => setUseLLM(e.target.checked)}
                disabled={diagnosisState.isRunning}
                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 dark:bg-gray-700 dark:border-gray-600"
              />
              <span>LLM Analysis</span>
              <span className="text-xs text-gray-400">
                {useLLM ? '(Deep)' : '(Rule-based)'}
              </span>
            </label>
          </div>
        </div>

        {/* Status Row */}
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div className="flex items-center gap-4">
            {/* Run ID */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Run:</span>
              <span className={`font-medium text-xs ${runId ? 'text-gray-600 dark:text-gray-300' : 'text-amber-600 dark:text-amber-400'}`}>
                {runId ? runId.slice(0, 8) + '...' : 'No run'}
              </span>
            </div>

            {/* Failed Tests Count */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Failed:</span>
              <span className={`font-medium ${failedTestCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {failedTestCount}
              </span>
            </div>

            {/* Progress Indicator */}
            {diagnosisState.isRunning && (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500"></div>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Analyzing {diagnosisState.progress.analyzed}/{diagnosisState.progress.total}...
                </span>
              </div>
            )}

            {/* Last Result */}
            {diagnosisState.lastResult && !diagnosisState.isRunning && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Generated {diagnosisState.lastResult.fixesGenerated} fix(es)
                </span>
              </div>
            )}

            {/* Error */}
            {diagnosisState.error && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm">{diagnosisState.error}</span>
              </div>
            )}
          </div>

          {/* Run Button */}
          <div className="relative group">
            <Button
              onClick={handleRunDiagnosis}
              disabled={isDisabled}
              variant={diagnosisState.isRunning ? 'secondary' : 'primary'}
              size="sm"
              className="flex items-center gap-2"
            >
              {diagnosisState.isRunning ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Running...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Run Diagnosis
                </>
              )}
            </Button>
            {/* Tooltip for disabled state */}
            {isDisabled && disabledReason && !diagnosisState.isRunning && (
              <div className="absolute bottom-full right-0 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {disabledReason}
                <div className="absolute top-full right-4 border-4 border-transparent border-t-gray-900"></div>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar (when running) */}
        {diagnosisState.isRunning && diagnosisState.progress.total > 0 && (
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
              <div
                className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(diagnosisState.progress.analyzed / diagnosisState.progress.total) * 100}%`,
                }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default DiagnosisPanel;

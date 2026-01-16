/**
 * Test Monitor Dashboard
 * Main execution control page with test configuration and real-time status
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { PageHeader } from '../../components/layout';
import { Button, Card } from '../../components/ui';
import { ExecutionMetricsPanel } from '../../components/features/test-monitor';
import {
  fetchScenarios,
  checkActiveExecution,
  startExecution,
  stopExecution,
  toggleCategory,
  updateConfig,
  updateProgress,
  updateWorkers,
  updateWorkerStatus,
  resetExecution,
  selectSelectedCategories,
  selectExecutionConfig,
  selectScenariosByCategory,
  selectScenariosLoading,
  selectIsExecuting,
  selectCurrentRunId,
  selectWorkers,
  selectProgress,
  selectExecutionError,
  selectSelectedTestCount,
  selectProgressPercentage,
} from '../../store/slices/testExecutionSlice';
import {
  fetchTestRuns,
  selectTestRuns,
} from '../../store/slices/testMonitorSlice';
import { subscribeToExecution } from '../../services/api/testMonitorApi';
import type { ExecutionStreamEvent } from '../../services/api/testMonitorApi';

const CATEGORY_LABELS: Record<string, { name: string; description: string }> = {
  'happy-path': { name: 'Happy Path', description: 'Standard user flows' },
  'edge-case': { name: 'Edge Cases', description: 'Boundary conditions and unusual inputs' },
  'error-handling': { name: 'Error Handling', description: 'Error recovery and validation' },
};

export function TestMonitorDashboard() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  // Selectors
  const selectedCategories = useAppSelector(selectSelectedCategories);
  const config = useAppSelector(selectExecutionConfig);
  const scenariosByCategory = useAppSelector(selectScenariosByCategory);
  const scenariosLoading = useAppSelector(selectScenariosLoading);
  const isExecuting = useAppSelector(selectIsExecuting);
  const currentRunId = useAppSelector(selectCurrentRunId);
  const workers = useAppSelector(selectWorkers);
  const progress = useAppSelector(selectProgress);
  const error = useAppSelector(selectExecutionError);
  const selectedTestCount = useAppSelector(selectSelectedTestCount);
  const progressPercentage = useAppSelector(selectProgressPercentage);
  const recentRuns = useAppSelector(selectTestRuns);

  // Reference to the SSE EventSource
  const eventSourceRef = useRef<EventSource | null>(null);

  // Track execution start time for metrics
  const [executionStartedAt, setExecutionStartedAt] = useState<string | null>(null);

  // One-time cleanup of corrupted layout data (versioned to only run once)
  useEffect(() => {
    const cleanupVersion = 'v2'; // Increment this to force another cleanup
    const cleanupKey = 'test-monitor-layout-cleanup';
    if (localStorage.getItem(cleanupKey) !== cleanupVersion) {
      localStorage.removeItem('test-monitor-dashboard-layout');
      localStorage.removeItem('react-resizable-panels:test-monitor-dashboard');
      localStorage.setItem(cleanupKey, cleanupVersion);
    }
  }, []);

  // Handle SSE events
  const handleExecutionEvent = useCallback((event: ExecutionStreamEvent) => {
    console.log('[SSE Event]', event.type, event.data);

    switch (event.type) {
      case 'progress-update':
        dispatch(updateProgress(event.data));
        break;
      case 'workers-update':
        dispatch(updateWorkers(event.data));
        break;
      case 'worker-status':
        dispatch(updateWorkerStatus(event.data));
        break;
      case 'execution-started':
        setExecutionStartedAt(new Date().toISOString());
        break;
      case 'execution-completed':
      case 'execution-stopped':
      case 'complete':
        dispatch(resetExecution());
        setExecutionStartedAt(null);
        // Refresh test runs to show the completed run
        dispatch(fetchTestRuns({}));
        break;
      case 'error':
      case 'execution-error':
        console.error('[SSE Error]', event.data);
        break;
    }
  }, [dispatch]);

  // Fetch scenarios and check for active execution on mount
  useEffect(() => {
    dispatch(fetchScenarios());
    dispatch(fetchTestRuns({}));
    // Check if there's an active execution to restore
    dispatch(checkActiveExecution());
  }, [dispatch]);

  // Subscribe to SSE when execution starts
  useEffect(() => {
    if (isExecuting && currentRunId && !eventSourceRef.current) {
      console.log('[SSE] Subscribing to execution stream:', currentRunId);
      eventSourceRef.current = subscribeToExecution(
        currentRunId,
        handleExecutionEvent,
        (error) => {
          console.error('[SSE] Connection error:', error);
        }
      );
    }

    // Cleanup on unmount or when execution stops
    return () => {
      if (eventSourceRef.current) {
        console.log('[SSE] Closing connection');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isExecuting, currentRunId, handleExecutionEvent]);

  // Handle starting test execution
  const handleStartExecution = async () => {
    try {
      // Set start time for metrics tracking
      setExecutionStartedAt(new Date().toISOString());

      const result = await dispatch(startExecution({
        categories: selectedCategories,
        scenarios: [],
        config,
      })).unwrap();

      // Subscribe to execution stream
      if (result.runId) {
        console.log('[SSE] Will subscribe after state update, runId:', result.runId);
      }
    } catch (err) {
      console.error('Failed to start execution:', err);
      setExecutionStartedAt(null); // Clear on error
    }
  };

  // Handle stopping test execution
  const handleStopExecution = async () => {
    if (currentRunId) {
      try {
        await dispatch(stopExecution(currentRunId)).unwrap();
        setExecutionStartedAt(null);
      } catch (err) {
        console.error('Failed to stop execution:', err);
      }
    }
  };

  // Handle viewing a run
  const handleViewRun = (runId: string) => {
    navigate(`/test-monitor/run/${runId}`);
  };

  return (
    <div className="h-full flex flex-col p-6">
      <PageHeader
        title="Test Monitor"
        subtitle="Configure and execute end-to-end tests for the Flowise agent"
      />

      <PanelGroup
        orientation="horizontal"
        id="test-monitor-dashboard"
        className="flex-1 min-h-0 mt-6"
      >
        {/* Left Column - Configuration */}
        <Panel
          id="config-panel"
          defaultSize={42}
          minSize={25}
          maxSize={60}
          className="flex flex-col gap-6 pr-3"
        >
          {/* Category Selection */}
          <Card>
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Test Categories
              </h3>
              <div className="space-y-3">
                {Object.entries(CATEGORY_LABELS).map(([category, { name, description }]) => {
                  const scenarios = scenariosByCategory[category as keyof typeof scenariosByCategory] || [];
                  const isSelected = selectedCategories.includes(category);

                  return (
                    <label
                      key={category}
                      className={`
                        flex items-start p-3 rounded-lg border cursor-pointer transition-all
                        ${isSelected
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => dispatch(toggleCategory(category))}
                        className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        disabled={isExecuting}
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900 dark:text-white">{name}</span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {scenariosLoading ? '...' : `${scenarios.length} tests`}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                          {description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Execution Config */}
          <Card>
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Execution Config
              </h3>
              <div className="space-y-4">
                {/* Concurrency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Concurrency (parallel workers)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={config.concurrency}
                      onChange={(e) => dispatch(updateConfig({ concurrency: parseInt(e.target.value) }))}
                      className="flex-1"
                      disabled={isExecuting}
                    />
                    <span className="w-8 text-center font-medium text-gray-900 dark:text-white">
                      {config.concurrency}
                    </span>
                  </div>
                  {config.concurrency > 3 && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      High concurrency may trigger API rate limits
                    </p>
                  )}
                </div>

                {/* Timeout */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Timeout (seconds)
                  </label>
                  <select
                    value={config.timeoutMs}
                    onChange={(e) => dispatch(updateConfig({ timeoutMs: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    disabled={isExecuting}
                  >
                    <option value={30000}>30 seconds</option>
                    <option value={60000}>60 seconds</option>
                    <option value={120000}>120 seconds</option>
                    <option value={180000}>180 seconds</option>
                  </select>
                </div>

                {/* Options */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.retryFailed}
                      onChange={(e) => dispatch(updateConfig({ retryFailed: e.target.checked }))}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      disabled={isExecuting}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Retry failed tests</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.enableSemanticEval}
                      onChange={(e) => dispatch(updateConfig({ enableSemanticEval: e.target.checked }))}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      disabled={isExecuting}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Enable semantic evaluation</span>
                  </label>
                </div>
              </div>

              {/* Start/Stop Button */}
              <div className="mt-6">
                {isExecuting ? (
                  <Button
                    onClick={handleStopExecution}
                    variant="danger"
                    className="w-full"
                  >
                    Stop Execution
                  </Button>
                ) : (
                  <Button
                    onClick={handleStartExecution}
                    variant="primary"
                    className="w-full"
                    disabled={selectedTestCount === 0}
                  >
                    Start Test Run ({selectedTestCount} tests)
                  </Button>
                )}
                {error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
                )}
              </div>
            </div>
          </Card>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-2 flex items-center justify-center group">
          <div className="w-1 h-8 rounded-full bg-gray-300 dark:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </PanelResizeHandle>

        {/* Right Column - Status & Recent Runs */}
        <Panel
          id="status-panel"
          defaultSize={58}
          minSize={40}
          className="flex flex-col gap-6 pl-3"
        >
          {/* Execution Status */}
          <Card>
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Execution Status
              </h3>

              {isExecuting ? (
                <div className="space-y-4">
                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Progress
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {progress.completed}/{progress.total} ({progressPercentage}%)
                      </span>
                    </div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 transition-all duration-300"
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Status Summary */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{progress.total}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">{progress.passed}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Passed</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">{progress.failed}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Failed</div>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{progress.skipped}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Skipped</div>
                    </div>
                  </div>

                  {/* Workers */}
                  {workers.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Workers</h4>
                      <div className="space-y-2">
                        {workers.map((worker) => (
                          <div
                            key={worker.workerId}
                            className={`flex items-center gap-3 p-2 rounded transition-all ${
                              worker.status === 'running'
                                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                                : 'bg-gray-50 dark:bg-gray-800'
                            }`}
                          >
                            {/* Status Icon */}
                            {worker.status === 'running' ? (
                              <svg className="w-5 h-5 text-green-500 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : worker.status === 'completed' ? (
                              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : worker.status === 'error' ? (
                              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                            <span className={`text-sm font-medium ${
                              worker.status === 'running'
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              Worker {worker.workerId}
                            </span>
                            <span className={`text-sm truncate flex-1 ${
                              worker.status === 'running'
                                ? 'text-green-600 dark:text-green-400 font-medium'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {worker.currentTestName || 'Idle'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2">No test run in progress</p>
                  <p className="text-sm">Select categories and start a test run</p>
                </div>
              )}
            </div>
          </Card>

          {/* Enhanced Execution Metrics - shows ETA, throughput, failure rate */}
          <ExecutionMetricsPanel
            progress={progress}
            workers={workers}
            startedAt={executionStartedAt ?? undefined}
            isExecuting={isExecuting}
          />

          {/* Recent Runs */}
          <Card className="flex-1 min-h-0">
            <div className="p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Recent Runs
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/test-monitor/history')}
                >
                  View All
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {recentRuns.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <p>No test runs yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentRuns.slice(0, 5).map((run) => {
                      const passRate = run.totalTests > 0
                        ? Math.round((run.passed / run.totalTests) * 100)
                        : 0;
                      const startedAt = new Date(run.startedAt).toLocaleString();

                      return (
                        <button
                          key={run.runId}
                          onClick={() => handleViewRun(run.runId)}
                          className="w-full flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                            passRate === 100 ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                            passRate >= 70 ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {passRate}%
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white truncate">
                                {run.runId.slice(0, 8)}...
                              </span>
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                run.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                run.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                run.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                              }`}>
                                {run.status}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {run.totalTests} tests | {startedAt}
                            </div>
                          </div>
                          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </Panel>
      </PanelGroup>
    </div>
  );
}

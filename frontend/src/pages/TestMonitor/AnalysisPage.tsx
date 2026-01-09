/**
 * Analysis Page (Sprint 3)
 * Unified workflow-driven view for test diagnosis, fix application, and deployment
 * Merges functionality from AgentTuning.tsx with cleaner UX
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { PageHeader } from '../../components/layout';
import { Card, Button } from '../../components/ui';
import { FixesPanel } from '../../components/features/testMonitor/FixesPanel';
import type { ClassificationFilter } from '../../components/features/testMonitor/FixesPanel';
import { DiagnosisPanel } from '../../components/features/testMonitor/DiagnosisPanel';
import { VerificationPanel } from '../../components/features/testMonitor/VerificationPanel';
import { SyncStatusIndicator } from '../../components/features/testMonitor/SyncStatusIndicator';
import { FixAnalytics } from '../../components/features/testMonitor/FixAnalytics';
import { EnvironmentSelector, EnvironmentBadge } from '../../components/features/testMonitor/EnvironmentSelector';
import { ErrorClusteringPanel } from '../../components/features/testMonitor/ErrorClusteringPanel';
import {
  fetchFixes,
  fetchPromptFiles,
  fetchPromptHistory,
  fetchTestRuns,
  applyFixToPrompt,
  applyBatchFixes,
  updateFixStatus,
  verifyFixes,
  fetchDeployedVersions,
  markPromptDeployed,
  fetchEnvironmentPromptFiles,
  fetchEnvironmentDeployedVersions,
  setSelectedEnvironment,
  selectFixes,
  selectPromptFiles,
  selectPromptHistory,
  selectPromptLoading,
  selectFixesLoading,
  selectTestRuns,
  selectAppliedFixes,
  selectVerificationRunning,
  selectVerificationResult,
  selectDeployedVersions,
  selectDeploymentLoading,
  selectSelectedEnvironment,
  selectCurrentEnvironmentPromptFiles,
  selectCurrentEnvironmentDeployedVersions,
  selectEnvironmentLoading,
} from '../../store/slices/testMonitorSlice';
import * as testMonitorApi from '../../services/api/testMonitorApi';
import type { GeneratedFix, VerificationSummary, PromptContext } from '../../types/testMonitor.types';

// Workflow phase types
type WorkflowPhase = 'diagnose' | 'apply' | 'verify' | 'deploy';

interface WorkflowPhaseConfig {
  id: WorkflowPhase;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const WORKFLOW_PHASES: WorkflowPhaseConfig[] = [
  {
    id: 'diagnose',
    label: 'Diagnose',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    description: 'Analyze test failures and generate fixes',
  },
  {
    id: 'apply',
    label: 'Apply Fixes',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    description: 'Review and apply suggested prompt changes',
  },
  {
    id: 'verify',
    label: 'Verify',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    description: 'Run tests to verify fixes work correctly',
  },
  {
    id: 'deploy',
    label: 'Deploy',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    description: 'Sync changes to Flowise production',
  },
];

export function AnalysisPage() {
  const dispatch = useAppDispatch();

  // Redux selectors
  const fixes = useAppSelector(selectFixes);
  const promptFiles = useAppSelector(selectCurrentEnvironmentPromptFiles);
  const promptHistory = useAppSelector(selectPromptHistory);
  const promptLoading = useAppSelector(selectPromptLoading);
  const fixesLoading = useAppSelector(selectFixesLoading);
  const testRuns = useAppSelector(selectTestRuns);
  const appliedFixesFromStore = useAppSelector(selectAppliedFixes);
  const verificationRunning = useAppSelector(selectVerificationRunning);
  const verificationResult = useAppSelector(selectVerificationResult);
  const deployedVersions = useAppSelector(selectCurrentEnvironmentDeployedVersions);
  const deploymentLoading = useAppSelector(selectDeploymentLoading);
  const selectedEnvironment = useAppSelector(selectSelectedEnvironment);
  const environmentLoading = useAppSelector(selectEnvironmentLoading);

  // Local state - persist selectedRunId to localStorage so it survives page refresh
  const [activePhase, setActivePhase] = useState<WorkflowPhase>('diagnose');
  const [selectedRunId, setSelectedRunId] = useState<string>(() => {
    // Initialize from localStorage if available
    const stored = localStorage.getItem('analysis_selectedRunId');
    return stored || '';
  });
  const [selectedFixIds, setSelectedFixIds] = useState<Set<string>>(new Set());
  const [applyingBatch, setApplyingBatch] = useState(false);
  const [classificationFilter, setClassificationFilter] = useState<ClassificationFilter>('all');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<{ version: number; description?: string } | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  // Computed values
  const latestRun = testRuns.length > 0 ? testRuns[0] : null;
  const latestRunId = latestRun?.runId ?? '';
  const runWithFailures = testRuns.find(r => r.failed > 0);
  // Validate that selectedRunId still exists in testRuns (it might have been deleted)
  const validSelectedRunId = selectedRunId && testRuns.some(r => r.runId === selectedRunId) ? selectedRunId : '';
  const activeRunId = validSelectedRunId || runWithFailures?.runId || latestRunId;
  const activeRun = testRuns.find(r => r.runId === activeRunId);
  const failedTestCount = activeRun?.failed ?? 0;

  const pendingFixes = fixes.filter((f) => f.status === 'pending');
  const appliedFixes = fixes.filter((f) => f.status === 'applied');
  const appliedBotFixes = appliedFixes.filter(f =>
    f.classification?.issueLocation === 'bot' || f.classification?.issueLocation === 'both'
  );

  // Check for pending Flowise changes
  const hasPendingFlowiseChanges = useMemo(() => {
    return promptFiles.some(file => {
      const deployedVersion = deployedVersions[file.fileKey];
      return deployedVersion === undefined || deployedVersion !== file.version;
    });
  }, [promptFiles, deployedVersions]);

  // Calculate phase completion status
  const phaseStatus = useMemo(() => {
    return {
      diagnose: fixes.length > 0 ? 'completed' : 'pending',
      apply: appliedFixes.length > 0 && pendingFixes.length === 0 ? 'completed' : pendingFixes.length > 0 ? 'in_progress' : 'pending',
      verify: verificationResult?.passed === true ? 'completed' : verificationRunning ? 'in_progress' : 'pending',
      deploy: !hasPendingFlowiseChanges && appliedBotFixes.length > 0 ? 'completed' : hasPendingFlowiseChanges ? 'in_progress' : 'pending',
    } as Record<WorkflowPhase, 'pending' | 'in_progress' | 'completed'>;
  }, [fixes.length, appliedFixes.length, pendingFixes.length, verificationResult, verificationRunning, hasPendingFlowiseChanges, appliedBotFixes.length]);

  // Fetch data on mount
  useEffect(() => {
    dispatch(fetchTestRuns({}));
  }, [dispatch]);

  // Fetch environment-specific data when environment changes
  useEffect(() => {
    dispatch(fetchEnvironmentPromptFiles(selectedEnvironment));
    dispatch(fetchEnvironmentDeployedVersions(selectedEnvironment));
  }, [dispatch, selectedEnvironment]);

  // Handle environment change
  const handleEnvironmentChange = useCallback((env: PromptContext) => {
    dispatch(setSelectedEnvironment(env));
    // Persist to localStorage
    localStorage.setItem('analysis_selectedEnvironment', env);
  }, [dispatch]);

  // Restore environment from localStorage on mount
  useEffect(() => {
    const storedEnv = localStorage.getItem('analysis_selectedEnvironment') as PromptContext | null;
    if (storedEnv && ['production', 'sandbox_a', 'sandbox_b'].includes(storedEnv)) {
      dispatch(setSelectedEnvironment(storedEnv));
    }
  }, [dispatch]);

  // Fetch fixes when activeRunId changes
  useEffect(() => {
    if (activeRunId) {
      dispatch(fetchFixes(activeRunId));
    }
  }, [dispatch, activeRunId]);

  // Handlers
  const handleDiagnosisComplete = useCallback(() => {
    if (activeRunId) {
      dispatch(fetchFixes(activeRunId));
      // Persist the run ID so fixes are shown after page refresh
      localStorage.setItem('analysis_selectedRunId', activeRunId);
      setSelectedRunId(activeRunId);
      // Auto-advance to apply phase if fixes were generated
      setTimeout(() => setActivePhase('apply'), 500);
    }
  }, [dispatch, activeRunId]);

  const handleRunChange = useCallback((runId: string) => {
    setSelectedRunId(runId);
    setSelectedFixIds(new Set());
    // Persist to localStorage so it survives page refresh
    if (runId) {
      localStorage.setItem('analysis_selectedRunId', runId);
    } else {
      localStorage.removeItem('analysis_selectedRunId');
    }
  }, []);

  const handleApplyFix = async (fixId: string, fileKey: string) => {
    await dispatch(applyFixToPrompt({ fixId, fileKey })).unwrap();
    dispatch(fetchPromptFiles());
  };

  const handleUpdateStatus = (fixId: string, status: 'applied' | 'rejected') => {
    dispatch(updateFixStatus({ fixId, status }));
  };

  const handleSelectionChange = useCallback((fixId: string, selected: boolean) => {
    setSelectedFixIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(fixId);
      else next.delete(fixId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((selected: boolean) => {
    if (selected) {
      setSelectedFixIds(new Set(pendingFixes.map(f => f.fixId)));
    } else {
      setSelectedFixIds(new Set());
    }
  }, [pendingFixes]);

  const handleApplySelectedFixes = useCallback(async () => {
    if (selectedFixIds.size === 0) return;
    setApplyingBatch(true);
    try {
      await dispatch(applyBatchFixes(Array.from(selectedFixIds))).unwrap();
      setSelectedFixIds(new Set());
      dispatch(fetchPromptFiles());
      // Auto-advance to verify phase
      setTimeout(() => setActivePhase('verify'), 500);
    } catch (error) {
      console.error('Failed to apply batch fixes:', error);
    } finally {
      setApplyingBatch(false);
    }
  }, [dispatch, selectedFixIds]);

  const handleVerifyFixes = useCallback(async (fixIds: string[]): Promise<VerificationSummary | null> => {
    try {
      const result = await dispatch(verifyFixes(fixIds)).unwrap();
      if (result.passed) {
        // Auto-advance to deploy phase
        setTimeout(() => setActivePhase('deploy'), 500);
      }
      return result;
    } catch (error) {
      console.error('Failed to verify fixes:', error);
      return null;
    }
  }, [dispatch]);

  const handleFixVerified = useCallback((fixId: string) => {
    dispatch(updateFixStatus({ fixId, status: 'verified' }));
  }, [dispatch]);

  const handleMarkDeployed = useCallback(async (fileKey: string, version: number) => {
    await dispatch(markPromptDeployed({ fileKey, version })).unwrap();
  }, [dispatch]);

  const handleCopyPrompt = useCallback(async (fileKey: string): Promise<string | null> => {
    try {
      const content = await testMonitorApi.getPromptForFlowise(fileKey);
      return content;
    } catch (error) {
      console.error('Failed to get prompt content:', error);
      return null;
    }
  }, []);

  const handleSelectFile = (fileKey: string) => {
    setSelectedFile(fileKey);
    dispatch(fetchPromptHistory(fileKey));
  };

  const handleRollback = useCallback(async () => {
    if (!selectedFile || !rollbackTarget) return;
    setRollingBack(true);
    try {
      await testMonitorApi.rollbackPromptVersion(selectedFile, rollbackTarget.version);
      dispatch(fetchPromptFiles());
      dispatch(fetchPromptHistory(selectedFile));
      setRollbackTarget(null);
    } catch (error) {
      console.error('Failed to rollback:', error);
    } finally {
      setRollingBack(false);
    }
  }, [dispatch, selectedFile, rollbackTarget]);

  const currentVersion = selectedFile
    ? promptFiles.find(f => f.fileKey === selectedFile)?.version ?? 0
    : 0;

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <PageHeader
        title="Analysis"
        subtitle="Diagnose failures, apply fixes, verify changes, and deploy to production"
      />

      {/* Environment Selector */}
      <div className="mt-6">
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Environment:
                </span>
                <EnvironmentSelector
                  selectedEnvironment={selectedEnvironment}
                  onSelect={handleEnvironmentChange}
                  disabled={environmentLoading}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                {environmentLoading && (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500"></div>
                    <span>Loading...</span>
                  </div>
                )}
                {!environmentLoading && promptFiles.length > 0 && (
                  <span>{promptFiles.length} files loaded</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Workflow Phase Navigation */}
      <div className="mt-4">
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              {WORKFLOW_PHASES.map((phase, index) => {
                const status = phaseStatus[phase.id];
                const isActive = activePhase === phase.id;
                const isCompleted = status === 'completed';
                const isInProgress = status === 'in_progress';

                return (
                  <div key={phase.id} className="flex items-center flex-1">
                    <button
                      onClick={() => setActivePhase(phase.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-all w-full ${
                        isActive
                          ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isCompleted
                            ? 'bg-green-500 text-white'
                            : isInProgress
                            ? 'bg-amber-500 text-white'
                            : isActive
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {isCompleted ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          phase.icon
                        )}
                      </div>
                      <div className="text-left">
                        <div className={`font-medium ${isActive ? 'text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-white'}`}>
                          {phase.label}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {phase.description}
                        </div>
                      </div>
                    </button>
                    {index < WORKFLOW_PHASES.length - 1 && (
                      <div className={`w-8 h-0.5 mx-2 ${
                        phaseStatus[WORKFLOW_PHASES[index + 1].id] !== 'pending'
                          ? 'bg-primary-500'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Run Selector */}
      <div className="mt-6 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Select Run:
        </label>
        <select
          value={activeRunId}
          onChange={(e) => handleRunChange(e.target.value)}
          className="flex-1 max-w-md px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          {testRuns.map((run) => (
            <option key={run.runId} value={run.runId}>
              {run.runId.substring(0, 20)}... | {run.passed}/{run.totalTests} passed
              {run.failed > 0 ? ` | ${run.failed} failed` : ' | All passed'}
            </option>
          ))}
        </select>
        {runWithFailures && activeRunId !== runWithFailures.runId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRunChange(runWithFailures.runId)}
            className="text-orange-600 border-orange-300 hover:bg-orange-50"
          >
            Jump to failures
          </Button>
        )}
      </div>

      {/* Phase Content */}
      <div className="mt-6 flex-1 min-h-0">
        {activePhase === 'diagnose' && (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-7">
              <DiagnosisPanel
                runId={activeRunId}
                failedTestCount={failedTestCount}
                onDiagnosisComplete={handleDiagnosisComplete}
              />
              {/* Error Clustering Panel - shows grouped error patterns */}
              {activeRunId && failedTestCount > 0 && (
                <Card className="mt-6">
                  <div className="p-4">
                    <ErrorClusteringPanel
                      runId={activeRunId}
                      onTestSelect={(testId) => {
                        // Navigate to test details or highlight the test
                        console.log('Selected test:', testId);
                      }}
                    />
                  </div>
                </Card>
              )}
            </div>
            <div className="col-span-5">
              <FixAnalytics
                fixes={fixes}
                verificationHistory={verificationResult ? [verificationResult] : undefined}
                loading={fixesLoading}
                onFilterByClassification={setClassificationFilter}
              />
            </div>
          </div>
        )}

        {activePhase === 'apply' && (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-7">
              <Card>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    Pending Fixes
                    {pendingFixes.length > 0 && (
                      <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
                        {pendingFixes.length}
                      </span>
                    )}
                  </h3>
                  <FixesPanel
                    fixes={pendingFixes}
                    loading={fixesLoading}
                    promptFiles={promptFiles}
                    onUpdateStatus={handleUpdateStatus}
                    onApplyFix={handleApplyFix}
                    selectedFixIds={selectedFixIds}
                    onSelectionChange={handleSelectionChange}
                    onSelectAll={handleSelectAll}
                    onApplySelectedFixes={handleApplySelectedFixes}
                    applyingBatch={applyingBatch}
                    classificationFilter={classificationFilter}
                    onClassificationFilterChange={setClassificationFilter}
                  />
                </div>
              </Card>

              {/* Applied Fixes */}
              <Card className="mt-6">
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Applied Fixes ({appliedFixes.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto">
                    {appliedFixes.length === 0 ? (
                      <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                        No applied fixes yet
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {appliedFixes.map((fix) => (
                          <div key={fix.fixId} className="p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900 dark:text-white truncate">
                                {fix.changeDescription.slice(0, 50)}...
                              </span>
                              <span className="text-xs text-green-600 dark:text-green-400">Applied</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            <div className="col-span-5">
              {/* Prompt Versions */}
              <Card>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Prompt Versions
                  </h3>
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {promptFiles.map((file) => (
                      <button
                        key={file.fileKey}
                        onClick={() => handleSelectFile(file.fileKey)}
                        className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                          selectedFile === file.fileKey
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {file.displayName} (v{file.version})
                      </button>
                    ))}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {promptLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                      </div>
                    ) : selectedFile && promptHistory.length > 0 ? (
                      <div className="space-y-2">
                        {promptHistory.slice(0, 5).map((version) => {
                          const isCurrent = version.version === currentVersion;
                          return (
                            <div
                              key={version.id}
                              className={`p-3 border rounded-lg ${
                                isCurrent
                                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                  : 'border-gray-200 dark:border-gray-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    v{version.version}
                                  </span>
                                  {isCurrent && (
                                    <span className="px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded">
                                      Current
                                    </span>
                                  )}
                                </div>
                                {!isCurrent && (
                                  <button
                                    onClick={() => setRollbackTarget({ version: version.version, description: version.changeDescription })}
                                    className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                                  >
                                    Rollback
                                  </button>
                                )}
                              </div>
                              {version.changeDescription && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">
                                  {version.changeDescription}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        Select a prompt file
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activePhase === 'verify' && (
          <div className="max-w-4xl">
            <VerificationPanel
              appliedFixes={appliedFixesFromStore}
              onVerify={handleVerifyFixes}
              verifying={verificationRunning}
              lastVerification={verificationResult}
              onFixVerified={handleFixVerified}
            />
            {verificationResult && (
              <Card className="mt-6">
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Verification Results
                  </h3>
                  <div className={`p-4 rounded-lg ${
                    verificationResult.passed
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                  }`}>
                    <div className="flex items-center gap-3">
                      {verificationResult.passed ? (
                        <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                      <div>
                        <div className={`font-semibold ${
                          verificationResult.passed ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                        }`}>
                          {verificationResult.passed ? 'All Tests Passed!' : 'Some Tests Failed'}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {verificationResult.passedCount}/{verificationResult.totalTests} tests passed
                        </div>
                      </div>
                    </div>
                    {verificationResult.passed && (
                      <Button
                        variant="primary"
                        className="mt-4"
                        onClick={() => setActivePhase('deploy')}
                      >
                        Continue to Deploy
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {activePhase === 'deploy' && (
          <div className="max-w-4xl">
            <SyncStatusIndicator
              promptFiles={promptFiles}
              deployedVersions={deployedVersions}
              onMarkDeployed={handleMarkDeployed}
              onCopyPrompt={handleCopyPrompt}
              loading={deploymentLoading}
              hasRecentlyAppliedFixes={appliedBotFixes.length > 0}
              appliedBotFixesCount={appliedBotFixes.length}
              environment={selectedEnvironment}
            />
            {!hasPendingFlowiseChanges && appliedBotFixes.length > 0 && (
              <Card className="mt-6">
                <div className="p-6 text-center">
                  <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Workflow Complete!
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    All fixes have been applied, verified, and deployed to Flowise.
                  </p>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Rollback Modal */}
      {rollbackTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Confirm Rollback
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Rollback to <span className="font-semibold">Version {rollbackTarget.version}</span>?
            </p>
            {rollbackTarget.description && (
              <div className="bg-gray-100 dark:bg-gray-700 rounded p-3 mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">{rollbackTarget.description}</p>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRollbackTarget(null)} disabled={rollingBack}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleRollback} loading={rollingBack}>
                Rollback
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

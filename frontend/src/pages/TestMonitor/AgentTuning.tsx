/**
 * Agent Tuning Page
 * Manage AI-generated fixes and prompt versions
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { PageHeader } from '../../components/layout';
import { Card } from '../../components/ui';
import { FixesPanel } from '../../components/features/testMonitor/FixesPanel';
import type { ClassificationFilter } from '../../components/features/testMonitor/FixesPanel';
import { DiagnosisPanel } from '../../components/features/testMonitor/DiagnosisPanel';
import { VerificationPanel } from '../../components/features/testMonitor/VerificationPanel';
import { SyncStatusIndicator } from '../../components/features/testMonitor/SyncStatusIndicator';
import { FixAnalytics } from '../../components/features/testMonitor/FixAnalytics';
import { WorkflowIndicator, type WorkflowStep } from '../../components/features/testMonitor/WorkflowIndicator';
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
} from '../../store/slices/testMonitorSlice';
import * as testMonitorApi from '../../services/api/testMonitorApi';
import type { GeneratedFix, VerificationSummary } from '../../types/testMonitor.types';

export function AgentTuning() {
  const dispatch = useAppDispatch();

  const fixes = useAppSelector(selectFixes);
  const promptFiles = useAppSelector(selectPromptFiles);
  const promptHistory = useAppSelector(selectPromptHistory);
  const promptLoading = useAppSelector(selectPromptLoading);
  const fixesLoading = useAppSelector(selectFixesLoading);
  const testRuns = useAppSelector(selectTestRuns);
  const appliedFixesFromStore = useAppSelector(selectAppliedFixes);
  const verificationRunning = useAppSelector(selectVerificationRunning);
  const verificationResult = useAppSelector(selectVerificationResult);
  const deployedVersions = useAppSelector(selectDeployedVersions);
  const deploymentLoading = useAppSelector(selectDeploymentLoading);

  const [selectedFix, setSelectedFix] = useState<GeneratedFix | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  // Batch selection state
  const [selectedFixIds, setSelectedFixIds] = useState<Set<string>>(new Set());
  const [applyingBatch, setApplyingBatch] = useState(false);
  // Rollback state (Phase 8)
  const [rollbackTarget, setRollbackTarget] = useState<{ version: number; description?: string } | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  // Run selector state
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  // Phase 5: Classification filter state (shared between FixesPanel and FixAnalytics)
  const [classificationFilter, setClassificationFilter] = useState<ClassificationFilter>('all');
  // Phase 6: Track if diagnosis has run (for workflow indicator)
  const [diagnosisRan, setDiagnosisRan] = useState(false);

  // Get latest run info for diagnosis
  const latestRun = testRuns.length > 0 ? testRuns[0] : null;
  const latestRunId = latestRun?.runId ?? '';

  // Find first run with failures for default selection
  const runWithFailures = testRuns.find(r => r.failed > 0);
  const activeRunId = selectedRunId || runWithFailures?.runId || latestRunId;
  const activeRun = testRuns.find(r => r.runId === activeRunId);
  const failedTestCount = activeRun?.failed ?? 0;

  // Fetch data on mount
  useEffect(() => {
    dispatch(fetchPromptFiles());
    dispatch(fetchTestRuns({}));
    dispatch(fetchDeployedVersions());
  }, [dispatch]);

  // Fetch fixes when activeRunId changes
  useEffect(() => {
    if (activeRunId) {
      dispatch(fetchFixes(activeRunId));
    }
  }, [dispatch, activeRunId]);

  // Handle diagnosis complete - refresh fixes
  const handleDiagnosisComplete = useCallback(() => {
    if (activeRunId) {
      dispatch(fetchFixes(activeRunId));
      setDiagnosisRan(true); // Phase 6: Track diagnosis completion
    }
  }, [dispatch, activeRunId]);

  // Handle run selection change
  const handleRunChange = useCallback((runId: string) => {
    setSelectedRunId(runId);
    setSelectedFix(null);
    setSelectedFixIds(new Set());
  }, []);

  // Debug logging for fixes from Redux store
  useEffect(() => {
    console.log(`[Fixes:AgentTuning] fixes from Redux store:`, {
      totalFixes: fixes.length,
      fixesLoading,
      activeRunId,
      fixIds: fixes.map(f => f.fixId),
      fixStatuses: fixes.reduce((acc, f) => {
        acc[f.status] = (acc[f.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    });
  }, [fixes, fixesLoading, activeRunId]);

  // Filter pending fixes
  const pendingFixes = fixes.filter((f) => f.status === 'pending');
  const appliedFixes = fixes.filter((f) => f.status === 'applied');

  // Log filtered pending fixes
  useEffect(() => {
    console.log(`[Fixes:AgentTuning] pendingFixes to pass to FixesPanel:`, {
      count: pendingFixes.length,
      ids: pendingFixes.map(f => f.fixId),
    });
  }, [pendingFixes]);

  // Phase 6: Calculate bot fixes count for Flowise sync prominence
  const appliedBotFixes = appliedFixes.filter(f =>
    f.classification?.issueLocation === 'bot' || f.classification?.issueLocation === 'both'
  );
  const pendingBotFixes = pendingFixes.filter(f =>
    f.classification?.issueLocation === 'bot' || f.classification?.issueLocation === 'both'
  );

  // Phase 6: Check if there are pending Flowise changes
  const hasPendingFlowiseChanges = useMemo(() => {
    return promptFiles.some(file => {
      const deployedVersion = deployedVersions[file.fileKey];
      return deployedVersion === undefined || deployedVersion !== file.version;
    });
  }, [promptFiles, deployedVersions]);

  // Phase 6: Workflow steps calculation
  const workflowSteps: WorkflowStep[] = useMemo(() => {
    // Step 1: Run Diagnosis
    const hasDiagnosis = diagnosisRan || fixes.length > 0;

    // Step 2: Apply Bot Fixes
    const hasPendingBot = pendingBotFixes.length > 0;
    const hasAppliedBot = appliedBotFixes.length > 0;
    const botFixesComplete = hasAppliedBot && !hasPendingBot;

    // Step 3: Verify Fixes
    const hasVerifiedFixes = appliedFixes.some(f => f.status === 'verified');
    const verifyComplete = verificationResult?.passed === true;

    // Step 4: Deploy to Flowise
    const deployComplete = !hasPendingFlowiseChanges && hasAppliedBot;

    return [
      {
        id: 'diagnosis',
        label: 'Run Diagnosis',
        status: hasDiagnosis ? 'completed' : 'pending',
        count: fixes.length,
      },
      {
        id: 'apply-bot',
        label: 'Apply Bot Fixes',
        status: botFixesComplete
          ? 'completed'
          : hasPendingBot
          ? 'in_progress'
          : hasAppliedBot
          ? 'completed'
          : 'pending',
        count: pendingBotFixes.length + appliedBotFixes.length,
      },
      {
        id: 'verify',
        label: 'Verify Fixes',
        status: verifyComplete
          ? 'completed'
          : verificationRunning
          ? 'in_progress'
          : botFixesComplete || hasAppliedBot
          ? 'pending'
          : 'pending',
        count: hasVerifiedFixes ? 1 : 0,
      },
      {
        id: 'deploy',
        label: 'Deploy to Flowise',
        status: deployComplete
          ? 'completed'
          : hasPendingFlowiseChanges && hasAppliedBot
          ? 'in_progress'
          : 'pending',
        count: hasPendingFlowiseChanges ? 1 : 0,
      },
    ];
  }, [
    diagnosisRan,
    fixes.length,
    pendingBotFixes.length,
    appliedBotFixes.length,
    appliedFixes,
    verificationResult,
    verificationRunning,
    hasPendingFlowiseChanges,
  ]);

  // Handle apply fix (single)
  const handleApplyFix = async (fixId: string, fileKey: string) => {
    await dispatch(applyFixToPrompt({ fixId, fileKey })).unwrap();
    dispatch(fetchPromptFiles());
  };

  // Handle reject fix
  const handleUpdateStatus = (fixId: string, status: 'applied' | 'rejected') => {
    dispatch(updateFixStatus({ fixId, status }));
  };

  // Handle select prompt file
  const handleSelectFile = (fileKey: string) => {
    setSelectedFile(fileKey);
    dispatch(fetchPromptHistory(fileKey));
  };

  // Batch selection handlers
  const handleSelectionChange = useCallback((fixId: string, selected: boolean) => {
    setSelectedFixIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(fixId);
      } else {
        next.delete(fixId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((selected: boolean) => {
    if (selected) {
      // Select all pending fixes
      const pendingIds = pendingFixes.map(f => f.fixId);
      setSelectedFixIds(new Set(pendingIds));
    } else {
      // Deselect all
      setSelectedFixIds(new Set());
    }
  }, [pendingFixes]);

  const handleApplySelectedFixes = useCallback(async () => {
    if (selectedFixIds.size === 0) return;

    setApplyingBatch(true);
    try {
      const fixIds = Array.from(selectedFixIds);
      await dispatch(applyBatchFixes(fixIds)).unwrap();
      // Clear selection after successful application
      setSelectedFixIds(new Set());
      // Refresh prompt files to get updated versions
      dispatch(fetchPromptFiles());
    } catch (error) {
      console.error('Failed to apply batch fixes:', error);
    } finally {
      setApplyingBatch(false);
    }
  }, [dispatch, selectedFixIds]);

  // Verification handlers
  const handleVerifyFixes = useCallback(async (fixIds: string[]): Promise<VerificationSummary | null> => {
    try {
      const result = await dispatch(verifyFixes(fixIds)).unwrap();
      return result;
    } catch (error) {
      console.error('Failed to verify fixes:', error);
      return null;
    }
  }, [dispatch]);

  const handleFixVerified = useCallback((fixId: string) => {
    dispatch(updateFixStatus({ fixId, status: 'verified' }));
  }, [dispatch]);

  // Deployment tracking handlers (Phase 5: Flowise Sync)
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

  // Rollback handler (Phase 8)
  const handleRollback = useCallback(async () => {
    if (!selectedFile || !rollbackTarget) return;

    setRollingBack(true);
    try {
      const result = await testMonitorApi.rollbackPromptVersion(selectedFile, rollbackTarget.version);
      // Refresh data after rollback
      dispatch(fetchPromptFiles());
      dispatch(fetchPromptHistory(selectedFile));
      setRollbackTarget(null);
      console.log(`Rolled back to version ${rollbackTarget.version}, created new version ${result.newVersion}`);
    } catch (error) {
      console.error('Failed to rollback:', error);
    } finally {
      setRollingBack(false);
    }
  }, [dispatch, selectedFile, rollbackTarget]);

  // Get current version number for selected file
  const currentVersion = selectedFile
    ? promptFiles.find(f => f.fileKey === selectedFile)?.version ?? 0
    : 0;

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <PageHeader
        title="Agent Tuning"
        subtitle="Review AI-generated fixes and manage prompt versions"
      />

      {/* Phase 6: Workflow Progress Indicator */}
      <div className="mt-6">
        <Card>
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Tuning Workflow
            </h3>
            <WorkflowIndicator steps={workflowSteps} />
          </div>
        </Card>
      </div>

      {/* Run Selector - Above the panels */}
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
          <button
            onClick={() => handleRunChange(runWithFailures.runId)}
            className="px-3 py-2 text-sm bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50"
          >
            Jump to run with failures
          </button>
        )}
      </div>

      {/* Header Panels Row - Diagnosis & Sync Status aligned with bottom row */}
      <div className="mt-4 grid grid-cols-12 gap-6 items-stretch">
        {/* Diagnosis Panel - matches Pending Fixes width below */}
        <div className="col-span-7">
          <DiagnosisPanel
            runId={activeRunId}
            failedTestCount={failedTestCount}
            onDiagnosisComplete={handleDiagnosisComplete}
          />
        </div>

        {/* Sync Status Indicator - matches Fix Analytics width below */}
        <div className="col-span-5 flex">
          <SyncStatusIndicator
            promptFiles={promptFiles}
            deployedVersions={deployedVersions}
            onMarkDeployed={handleMarkDeployed}
            onCopyPrompt={handleCopyPrompt}
            loading={deploymentLoading}
            hasRecentlyAppliedFixes={appliedBotFixes.length > 0}
            appliedBotFixesCount={appliedBotFixes.length}
          />
        </div>
      </div>

      {/* Verification Panel - Collapsible */}
      <VerificationPanel
        appliedFixes={appliedFixesFromStore}
        onVerify={handleVerifyFixes}
        verifying={verificationRunning}
        lastVerification={verificationResult}
        onFixVerified={handleFixVerified}
      />

      <div className="grid grid-cols-12 gap-6 mt-2 flex-1 min-h-0">
        {/* Left Column - Fixes (wider) */}
        <div className="col-span-7 flex flex-col gap-6">
          {/* Pending Fixes - Using FixesPanel with batch selection */}
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
                // Batch selection props
                selectedFixIds={selectedFixIds}
                onSelectionChange={handleSelectionChange}
                onSelectAll={handleSelectAll}
                onApplySelectedFixes={handleApplySelectedFixes}
                applyingBatch={applyingBatch}
                // Phase 5: Classification filter props
                classificationFilter={classificationFilter}
                onClassificationFilterChange={setClassificationFilter}
              />
            </div>
          </Card>

          {/* Applied Fixes History */}
          <Card className="flex-1 min-h-0">
            <div className="p-4 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Applied Fixes
              </h3>
              <div className="flex-1 overflow-y-auto">
                {appliedFixes.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No applied fixes yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {appliedFixes.map((fix) => (
                      <div
                        key={fix.fixId}
                        className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900 dark:text-white truncate">
                            {fix.changeDescription.slice(0, 40)}...
                          </span>
                          <span className="text-xs text-green-600 dark:text-green-400">Applied</span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(fix.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Fix Details, Analytics & Prompt Versions (narrower) */}
        <div className="col-span-5 flex flex-col gap-6">
          {/* Fix Analytics (Phase 6) */}
          <FixAnalytics
            fixes={fixes}
            verificationHistory={verificationResult ? [verificationResult] : undefined}
            loading={fixesLoading}
            onFilterByClassification={setClassificationFilter}
          />

          {/* Fix Details */}
          <Card>
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Fix Details
              </h3>
              {selectedFix ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Type</span>
                      <p className="font-medium text-gray-900 dark:text-white capitalize">{selectedFix.type}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Priority</span>
                      <p className={`inline-block px-2 py-0.5 text-xs rounded ${getPriorityColor(selectedFix.priority)}`}>
                        {selectedFix.priority}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Confidence</span>
                      <p className="font-medium text-gray-900 dark:text-white">{selectedFix.confidence}%</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Target File</span>
                      <p className="font-medium text-gray-900 dark:text-white truncate">{selectedFix.targetFile}</p>
                    </div>
                  </div>

                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Description</span>
                    <p className="text-gray-900 dark:text-white">{selectedFix.changeDescription}</p>
                  </div>

                  {selectedFix.rootCause && (
                    <div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Root Cause</span>
                      <p className="text-gray-900 dark:text-white">{selectedFix.rootCause.type}</p>
                      <div className="mt-1 space-y-1">
                        {selectedFix.rootCause.evidence.map((e, i) => (
                          <p key={i} className="text-sm text-gray-600 dark:text-gray-400">- {e}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Affected Tests</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedFix.affectedTests.map((test) => (
                        <span key={test} className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded">
                          {test}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Change Code</span>
                    <pre className="mt-1 p-3 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto">
                      {selectedFix.changeCode}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Select a fix to view details
                </div>
              )}
            </div>
          </Card>

          {/* Prompt Versions */}
          <Card className="flex-1 min-h-0">
            <div className="p-4 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Prompt Versions
              </h3>

              {/* File List */}
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {promptFiles.map((file) => (
                  <button
                    key={file.fileKey}
                    onClick={() => handleSelectFile(file.fileKey)}
                    className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors ${
                      selectedFile === file.fileKey
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {file.displayName} (v{file.version})
                  </button>
                ))}
              </div>

              {/* Version History */}
              <div className="flex-1 overflow-y-auto">
                {promptLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                  </div>
                ) : selectedFile && promptHistory.length > 0 ? (
                  <div className="space-y-2">
                    {promptHistory.map((version) => {
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
                                Version {version.version}
                              </span>
                              {isCurrent && (
                                <span className="px-2 py-0.5 text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded">
                                  Current
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(version.createdAt).toLocaleString()}
                              </span>
                              {!isCurrent && (
                                <button
                                  onClick={() => setRollbackTarget({ version: version.version, description: version.changeDescription })}
                                  className="px-2 py-1 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                                  title="Rollback to this version"
                                >
                                  Rollback
                                </button>
                              )}
                            </div>
                          </div>
                          {version.changeDescription && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {version.changeDescription}
                            </p>
                          )}
                          {version.fixId && (
                            <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                              Fix: {version.fixId.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    Select a prompt file to view version history
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Rollback Confirmation Modal (Phase 8) */}
      {rollbackTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Confirm Rollback
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to rollback to <span className="font-semibold">Version {rollbackTarget.version}</span>?
            </p>
            {rollbackTarget.description && (
              <div className="bg-gray-100 dark:bg-gray-700 rounded p-3 mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Description:</span> {rollbackTarget.description}
                </p>
              </div>
            )}
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-6">
              This will create a new version with the content from Version {rollbackTarget.version}. The current version will be preserved in history.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRollbackTarget(null)}
                disabled={rollingBack}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRollback}
                disabled={rollingBack}
                className="px-4 py-2 text-sm text-white bg-amber-600 rounded hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {rollingBack ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Rolling back...
                  </>
                ) : (
                  'Rollback'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

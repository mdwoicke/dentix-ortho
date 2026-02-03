/**
 * Analysis Page (Sprint 3)
 * Unified workflow-driven view for test diagnosis, fix application, and deployment
 * Merges functionality from AgentTuning.tsx with cleaner UX
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import * as appSettingsApi from '../../services/api/appSettingsApi';
import type { GeneratedFix, VerificationSummary, PromptContext, ProductionTraceDetail, ProductionSessionDetailResponse } from '../../types/testMonitor.types';
import type { LangfuseConfigProfile } from '../../types/appSettings.types';

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
  const [traceIdSearch, setTraceIdSearch] = useState('');
  const [traceSearchLoading, setTraceSearchLoading] = useState(false);
  const [traceSearchResult, setTraceSearchResult] = useState<ProductionTraceDetail | null>(null);
  const [sessionSearchResult, setSessionSearchResult] = useState<ProductionSessionDetailResponse | null>(null);
  const [previousSessionResult, setPreviousSessionResult] = useState<ProductionSessionDetailResponse | null>(null); // For "Back to Session" navigation
  const [traceSearchError, setTraceSearchError] = useState<string | null>(null);
  const [traceSearchStatus, setTraceSearchStatus] = useState<string | null>(null);
  const [traceAnalysisResult, setTraceAnalysisResult] = useState<testMonitorApi.TraceAnalysisResult | null>(null);
  const [traceAnalysisLoading, setTraceAnalysisLoading] = useState(false);
  const [traceDiagnosisLoading, setTraceDiagnosisLoading] = useState(false);
  const [traceDiagnosisResult, setTraceDiagnosisResult] = useState<testMonitorApi.DiagnosisResult | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTraceIdHandled = useRef(false);
  const [langfuseConfigs, setLangfuseConfigs] = useState<LangfuseConfigProfile[]>([]);
  const [selectedLangfuseConfigId, setSelectedLangfuseConfigId] = useState<number | undefined>(undefined);

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
    appSettingsApi.getLangfuseConfigs()
      .then(configs => setLangfuseConfigs(configs))
      .catch(err => console.error('Failed to fetch Langfuse configs:', err));
  }, [dispatch]);

  // Handle traceId or sessionId from URL params (e.g., from Call Tracing page link)
  useEffect(() => {
    if (initialTraceIdHandled.current) return;

    const traceIdParam = searchParams.get('traceId');
    const sessionIdParam = searchParams.get('sessionId');
    const configIdParam = searchParams.get('configId');
    const configId = configIdParam ? parseInt(configIdParam, 10) : undefined;

    if (traceIdParam) {
      initialTraceIdHandled.current = true;
      setTraceIdSearch(traceIdParam);
      // Clear the URL param after reading
      setSearchParams({}, { replace: true });
      // Auto-trigger search with on-demand import support
      (async () => {
        setTraceSearchLoading(true);
        setTraceSearchError(null);
        try {
          const result = await testMonitorApi.getProductionTrace(traceIdParam, { configId });
          setTraceSearchResult(result);
        } catch (error: any) {
          setTraceSearchError(error?.message || 'Trace not found');
        } finally {
          setTraceSearchLoading(false);
        }
      })();
    } else if (sessionIdParam) {
      initialTraceIdHandled.current = true;
      setTraceIdSearch(sessionIdParam);
      // Clear the URL param after reading
      setSearchParams({}, { replace: true });
      // Auto-trigger session search
      (async () => {
        setTraceSearchLoading(true);
        setTraceSearchError(null);
        try {
          const result = await testMonitorApi.getProductionSession(sessionIdParam, configId);
          setSessionSearchResult(result);
        } catch (error: any) {
          setTraceSearchError(error?.message || 'Session not found');
        } finally {
          setTraceSearchLoading(false);
        }
      })();
    }
  }, [searchParams, setSearchParams]);

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
    dispatch(fetchPromptHistory({ fileKey, context: selectedEnvironment }));
  };

  const handleRollback = useCallback(async () => {
    if (!selectedFile || !rollbackTarget) return;
    setRollingBack(true);
    try {
      await testMonitorApi.rollbackPromptVersion(selectedFile, rollbackTarget.version);
      dispatch(fetchPromptFiles());
      dispatch(fetchPromptHistory({ fileKey: selectedFile, context: selectedEnvironment }));
      setRollbackTarget(null);
    } catch (error) {
      console.error('Failed to rollback:', error);
    } finally {
      setRollingBack(false);
    }
  }, [dispatch, selectedFile, rollbackTarget, selectedEnvironment]);

  const handleTraceSearch = useCallback(async () => {
    const trimmedId = traceIdSearch.trim();
    if (!trimmedId) return;

    setTraceSearchLoading(true);
    setTraceSearchError(null);
    setTraceSearchStatus(null);
    setTraceSearchResult(null);
    setSessionSearchResult(null);

    try {
      // Detect input type:
      // - "conv_..." prefix → session ID
      // - UUID format (8-4-4-4-12 hex) → session ID (Flowise session IDs are UUIDs)
      // - "run-..." prefix → trace ID (test run trace)
      // - anything else → try as trace first, fall back to session
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isSessionId = trimmedId.startsWith('conv_') || uuidPattern.test(trimmedId);
      const isTraceId = trimmedId.startsWith('run-');

      if (isSessionId && !isTraceId) {
        setTraceSearchStatus('Searching locally... importing from Langfuse if needed');
        const result = await testMonitorApi.getProductionSession(trimmedId, selectedLangfuseConfigId);
        setSessionSearchResult(result);
      } else if (isTraceId) {
        setTraceSearchStatus('Searching locally... importing from Langfuse if needed');
        const result = await testMonitorApi.getProductionTrace(trimmedId, { configId: selectedLangfuseConfigId });
        setTraceSearchResult(result);
      } else {
        // Unknown format: try trace first, then session
        setTraceSearchStatus('Searching as trace...');
        try {
          const result = await testMonitorApi.getProductionTrace(trimmedId, { configId: selectedLangfuseConfigId });
          setTraceSearchResult(result);
        } catch {
          setTraceSearchStatus('Not found as trace, trying as session...');
          const result = await testMonitorApi.getProductionSession(trimmedId, selectedLangfuseConfigId);
          setSessionSearchResult(result);
        }
      }
    } catch (error: any) {
      setTraceSearchError(error?.message || 'Not found');
    } finally {
      setTraceSearchLoading(false);
      setTraceSearchStatus(null);
    }
  }, [traceIdSearch, selectedLangfuseConfigId]);

  const handleRunAnalysis = useCallback(async (traceId: string) => {
    setTraceAnalysisLoading(true);
    setTraceAnalysisResult(null);

    try {
      const result = await testMonitorApi.analyzeProductionTrace(traceId);
      setTraceAnalysisResult(result);
    } catch (error: any) {
      setTraceSearchError(error?.message || 'Analysis failed');
    } finally {
      setTraceAnalysisLoading(false);
    }
  }, []);

  const handleTraceDiagnosis = useCallback(async (traceId: string) => {
    setTraceDiagnosisLoading(true);
    setTraceDiagnosisResult(null);

    try {
      const result = await testMonitorApi.diagnoseProductionTrace(traceId, { useLLM: true });
      setTraceDiagnosisResult(result);

      // If fixes were generated, refetch fixes to show them in the panel
      if (result.fixesGenerated > 0 && result.runId) {
        // Store the diagnosis run ID so we can filter fixes
        localStorage.setItem('analysis_selectedRunId', result.runId);
        setSelectedRunId(result.runId);
        dispatch(fetchFixes(result.runId));
      }
    } catch (error: any) {
      setTraceSearchError(error?.message || 'Diagnosis failed');
    } finally {
      setTraceDiagnosisLoading(false);
    }
  }, [dispatch]);

  const [sessionDiagnosisLoading, setSessionDiagnosisLoading] = useState(false);
  const [sessionDiagnosisResult, setSessionDiagnosisResult] = useState<testMonitorApi.DiagnosisResult | null>(null);
  const [sessionGoalStatus, setSessionGoalStatus] = useState<testMonitorApi.SessionGoalStatus | null>(null);
  const [sessionGoalStatusLoading, setSessionGoalStatusLoading] = useState(false);
  const [sessionExistingFixes, setSessionExistingFixes] = useState<testMonitorApi.SessionExistingFixes | null>(null);
  const [sessionExistingFixesLoading, setSessionExistingFixesLoading] = useState(false);

  const handleSessionDiagnosis = useCallback(async (sessionId: string) => {
    setSessionDiagnosisLoading(true);
    setSessionDiagnosisResult(null);

    try {
      const result = await testMonitorApi.diagnoseProductionSession(sessionId, { useLLM: true });
      setSessionDiagnosisResult(result);

      // If fixes were generated, refetch fixes to show them in the panel
      if (result.fixesGenerated > 0 && result.runId) {
        localStorage.setItem('analysis_selectedRunId', result.runId);
        setSelectedRunId(result.runId);
        dispatch(fetchFixes(result.runId));
        // Also update existing fixes state
        setSessionExistingFixes({
          hasExistingFixes: true,
          runId: result.runId,
          fixesCount: result.fixesGenerated,
          summary: result.summary,
          fixes: [],
        });
      }
    } catch (error: any) {
      setTraceSearchError(error?.message || 'Session diagnosis failed');
    } finally {
      setSessionDiagnosisLoading(false);
    }
  }, [dispatch]);

  // Fetch goal status and existing fixes when session modal opens
  useEffect(() => {
    if (sessionSearchResult?.session?.sessionId) {
      // Reset states
      setSessionGoalStatus(null);
      setSessionGoalStatusLoading(true);
      setSessionExistingFixes(null);
      setSessionExistingFixesLoading(true);
      setSessionDiagnosisResult(null);

      const sessionId = sessionSearchResult.session.sessionId;

      // Fetch goal status
      testMonitorApi.getSessionGoalStatus(sessionId)
        .then(status => setSessionGoalStatus(status))
        .catch(err => {
          console.error('Failed to fetch goal status:', err);
          setSessionGoalStatus(null);
        })
        .finally(() => setSessionGoalStatusLoading(false));

      // Fetch existing fixes
      testMonitorApi.getSessionExistingFixes(sessionId)
        .then(result => {
          setSessionExistingFixes(result);
          // If fixes exist, also select the run in the main panel
          if (result.hasExistingFixes && result.runId) {
            localStorage.setItem('analysis_selectedRunId', result.runId);
            setSelectedRunId(result.runId);
            dispatch(fetchFixes(result.runId));
          }
        })
        .catch(err => {
          console.error('Failed to fetch existing fixes:', err);
          setSessionExistingFixes(null);
        })
        .finally(() => setSessionExistingFixesLoading(false));
    } else {
      setSessionGoalStatus(null);
      setSessionExistingFixes(null);
    }
  }, [sessionSearchResult?.session?.sessionId, dispatch]);

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

      {/* Run Selector and Trace Search */}
      <div className="mt-6 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Select Run:
          </label>
          <select
            value={activeRunId}
            onChange={(e) => handleRunChange(e.target.value)}
            className="w-80 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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

        <div className="h-8 w-px bg-gray-300 dark:bg-gray-600" />

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Trace/Session ID:
          </label>
          <div className="flex items-center gap-2">
            <select
              value={selectedLangfuseConfigId ?? ''}
              onChange={(e) => setSelectedLangfuseConfigId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              className="w-44 px-2 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All Sources</option>
              {langfuseConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={traceIdSearch}
              onChange={(e) => setTraceIdSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTraceSearch()}
              placeholder="Enter trace ID (run-...) or session ID (UUID / conv_...)..."
              className="w-72 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleTraceSearch}
              disabled={traceSearchLoading || !traceIdSearch.trim()}
            >
              {traceSearchLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </Button>
          </div>
          {traceSearchStatus && (
            <span className="text-sm text-blue-400 flex items-center gap-1">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400" />
              {traceSearchStatus}
            </span>
          )}
          {traceSearchError && (
            <span className="text-sm text-red-500">{traceSearchError}</span>
          )}
        </div>
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
              {/* Project Artifacts */}
              <Card>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Project Artifacts
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
                        Select an artifact
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

      {/* Trace Search Result Modal */}
      {traceSearchResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Trace Details
              </h3>
              <button
                onClick={() => setTraceSearchResult(null)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Trace ID</span>
                  <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
                    {traceSearchResult.trace.traceId}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Session ID</span>
                  <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
                    {traceSearchResult.trace.sessionId || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Timestamp</span>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {new Date(traceSearchResult.trace.startedAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
                  <p className={`text-sm font-medium ${
                    traceSearchResult.trace.errorCount > 0 ? 'text-red-500' : 'text-green-500'
                  }`}>
                    {traceSearchResult.trace.errorCount > 0 ? `${traceSearchResult.trace.errorCount} errors` : 'Success'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Duration</span>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {traceSearchResult.trace.latencyMs ? `${(traceSearchResult.trace.latencyMs / 1000).toFixed(2)}s` : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Environment</span>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {traceSearchResult.trace.environment || 'N/A'}
                  </p>
                </div>
              </div>

              {traceSearchResult.trace.input && (
                <div className="mb-4">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Input</span>
                  <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-900 dark:text-white max-h-32 overflow-y-auto">
                    {typeof traceSearchResult.trace.input === 'object'
                      ? JSON.stringify(traceSearchResult.trace.input, null, 2)
                      : String(traceSearchResult.trace.input)}
                  </div>
                </div>
              )}

              {traceSearchResult.trace.output && (
                <div className="mb-4">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Output</span>
                  <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-900 dark:text-white max-h-32 overflow-y-auto">
                    {typeof traceSearchResult.trace.output === 'object'
                      ? JSON.stringify(traceSearchResult.trace.output, null, 2)
                      : String(traceSearchResult.trace.output)}
                  </div>
                </div>
              )}

              {traceSearchResult.transcript && traceSearchResult.transcript.length > 0 && (
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">
                    Transcript ({traceSearchResult.transcript.length} messages)
                  </span>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {traceSearchResult.transcript.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded text-sm ${
                          msg.role === 'user'
                            ? 'bg-blue-50 dark:bg-blue-900/20 ml-4'
                            : 'bg-gray-50 dark:bg-gray-900 mr-4'
                        }`}
                      >
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                          {msg.role}
                        </span>
                        <span className="text-gray-900 dark:text-white">{msg.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analysis Results */}
              {traceAnalysisResult && (
                <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    LLM Analysis Results
                  </h4>

                  <div className="space-y-3">
                    {/* Summary */}
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Summary</span>
                      <p className="text-sm text-gray-900 dark:text-white">{traceAnalysisResult.analysis.summary}</p>
                    </div>

                    {/* Outcome */}
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        traceAnalysisResult.analysis.outcome === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        traceAnalysisResult.analysis.outcome === 'partial_success' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        traceAnalysisResult.analysis.outcome === 'failure' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {traceAnalysisResult.analysis.outcome}
                      </span>
                      {traceAnalysisResult.analysis.outcomeDescription && (
                        <span className="text-sm text-gray-600 dark:text-gray-400">{traceAnalysisResult.analysis.outcomeDescription}</span>
                      )}
                    </div>

                    {/* Issues */}
                    {traceAnalysisResult.analysis.issues && traceAnalysisResult.analysis.issues.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Issues Found ({traceAnalysisResult.analysis.issues.length})</span>
                        <div className="space-y-2">
                          {traceAnalysisResult.analysis.issues.map((issue, idx) => (
                            <div key={idx} className="p-2 bg-red-50 dark:bg-red-900/20 rounded border-l-2 border-red-500">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                  issue.severity === 'critical' ? 'bg-red-600 text-white' :
                                  issue.severity === 'high' ? 'bg-red-500 text-white' :
                                  issue.severity === 'medium' ? 'bg-yellow-500 text-white' :
                                  'bg-gray-400 text-white'
                                }`}>
                                  {issue.severity}
                                </span>
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{issue.type}</span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{issue.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Root Cause */}
                    {traceAnalysisResult.analysis.rootCause && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400 block mb-1">Root Cause</span>
                        <p className="text-sm text-gray-900 dark:text-white">{traceAnalysisResult.analysis.rootCause}</p>
                      </div>
                    )}

                    {/* Recommendations */}
                    {traceAnalysisResult.analysis.recommendations && traceAnalysisResult.analysis.recommendations.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Recommendations ({traceAnalysisResult.analysis.recommendations.length})</span>
                        <div className="space-y-2">
                          {traceAnalysisResult.analysis.recommendations.map((rec, idx) => (
                            <div key={idx} className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded border-l-2 border-blue-500">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-500 text-white rounded">{rec.target}</span>
                                <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                  rec.priority === 'high' ? 'bg-red-500 text-white' :
                                  rec.priority === 'medium' ? 'bg-yellow-500 text-white' :
                                  'bg-gray-400 text-white'
                                }`}>
                                  {rec.priority}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{rec.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Analysis metadata */}
                    <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-3">
                      <span>Provider: {traceAnalysisResult.provider}</span>
                      {traceAnalysisResult.durationMs && <span>Duration: {(traceAnalysisResult.durationMs / 1000).toFixed(1)}s</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleRunAnalysis(traceSearchResult.trace.traceId)}
                  disabled={traceAnalysisLoading || traceDiagnosisLoading}
                  className="flex items-center gap-2"
                >
                  {traceAnalysisLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      {traceAnalysisResult ? 'Re-analyze' : 'Analyze'}
                    </>
                  )}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleTraceDiagnosis(traceSearchResult.trace.traceId)}
                  disabled={traceDiagnosisLoading || traceAnalysisLoading}
                  className="flex items-center gap-2"
                >
                  {traceDiagnosisLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Diagnosing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                      {traceDiagnosisResult ? 'Re-diagnose' : 'Diagnose & Generate Fixes'}
                    </>
                  )}
                </Button>
              </div>
              <div className="flex gap-3">
                {/* Back to Session button - shown when navigating from session */}
                {previousSessionResult && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Go back to session modal
                      setTraceSearchResult(null);
                      setTraceAnalysisResult(null);
                      setTraceDiagnosisResult(null);
                      setSessionSearchResult(previousSessionResult);
                      setPreviousSessionResult(null);
                    }}
                    className="flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Session
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    // Open in Call Tracing page
                    window.open(`/test-monitor/call-trace?traceId=${traceSearchResult.trace.traceId}`, '_blank');
                  }}
                >
                  Open in Call Tracing
                </Button>
                <Button variant="secondary" onClick={() => {
                  setTraceSearchResult(null);
                  setTraceAnalysisResult(null);
                  setTraceDiagnosisResult(null);
                  setPreviousSessionResult(null); // Also clear the previous session
                }}>
                  Close
                </Button>
              </div>
            </div>

            {/* Diagnosis Result Panel */}
            {traceDiagnosisResult && (
              <div className={`p-4 border-t-2 ${
                traceDiagnosisResult.fixesGenerated > 0
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {traceDiagnosisResult.fixesGenerated > 0 ? (
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    )}
                    <div>
                      <p className={`text-base font-semibold ${
                        traceDiagnosisResult.fixesGenerated > 0
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-blue-700 dark:text-blue-400'
                      }`}>
                        {traceDiagnosisResult.fixesGenerated > 0
                          ? `${traceDiagnosisResult.fixesGenerated} Fix${traceDiagnosisResult.fixesGenerated > 1 ? 'es' : ''} Generated!`
                          : 'Analysis Complete'}
                      </p>
                      {traceDiagnosisResult.fixesGenerated > 0 && (
                        <div className="mt-1 space-y-1">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {traceDiagnosisResult.summary?.promptFixes || 0} prompt fix{(traceDiagnosisResult.summary?.promptFixes || 0) !== 1 ? 'es' : ''} •{' '}
                            {traceDiagnosisResult.summary?.toolFixes || 0} tool fix{(traceDiagnosisResult.summary?.toolFixes || 0) !== 1 ? 'es' : ''}
                          </p>
                          {traceDiagnosisResult.analysis?.rootCause && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                              Root cause: {traceDiagnosisResult.analysis.rootCause}
                            </p>
                          )}
                        </div>
                      )}
                      {traceDiagnosisResult.fixesGenerated === 0 && traceDiagnosisResult.analysis?.summary && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {traceDiagnosisResult.analysis.summary}
                        </p>
                      )}
                    </div>
                  </div>
                  {traceDiagnosisResult.fixesGenerated > 0 && (
                    <Button
                      variant="primary"
                      onClick={() => {
                        // Close modal and navigate to Apply phase
                        setTraceSearchResult(null);
                        setTraceAnalysisResult(null);
                        setTraceDiagnosisResult(null);
                        setPreviousSessionResult(null);
                        setActivePhase('apply');
                      }}
                      className="flex items-center gap-2 flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      View & Apply Fixes
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Session Search Result Modal */}
      {sessionSearchResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Session Details
              </h3>
              <button
                onClick={() => {
                  setSessionSearchResult(null);
                  setSessionGoalStatus(null);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Session ID</span>
                  <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
                    {sessionSearchResult.session.sessionId}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Messages</span>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {sessionSearchResult.session.traceCount} messages
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">First Message</span>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {new Date(sessionSearchResult.session.firstTraceAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Last Message</span>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {new Date(sessionSearchResult.session.lastTraceAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Total Latency</span>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {sessionSearchResult.session.totalLatencyMs
                      ? `${(sessionSearchResult.session.totalLatencyMs / 1000).toFixed(2)}s`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
                  {sessionGoalStatusLoading ? (
                    <div className="flex items-center gap-1 mt-1">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-500" />
                      <span className="text-xs text-gray-500">Loading...</span>
                    </div>
                  ) : sessionGoalStatus?.hasGoalTest ? (
                    <div>
                      <p className={`text-sm font-medium ${
                        sessionGoalStatus.passed ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {sessionGoalStatus.passed ? 'Goal Test Passed' : 'Goal Test Failed'}
                      </p>
                      {sessionGoalStatus.testName && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={sessionGoalStatus.testName}>
                          {sessionGoalStatus.testName}
                        </p>
                      )}
                      {sessionGoalStatus.errorMessage && !sessionGoalStatus.passed && (
                        <p className="text-xs text-red-400 dark:text-red-500 truncate mt-0.5" title={sessionGoalStatus.errorMessage}>
                          {sessionGoalStatus.errorMessage}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className={`text-sm font-medium ${
                      sessionSearchResult.session.errorCount > 0 ? 'text-red-500' : 'text-green-500'
                    }`}>
                      {sessionSearchResult.session.errorCount > 0
                        ? `${sessionSearchResult.session.errorCount} API errors`
                        : 'No API errors'}
                      {!sessionGoalStatus?.hasGoalTest && (
                        <span className="text-xs text-gray-400 ml-1">(no goal test)</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Individual Traces in Session */}
              {sessionSearchResult.traces && sessionSearchResult.traces.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">
                    Traces in Session ({sessionSearchResult.traces.length})
                  </span>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {sessionSearchResult.traces.map((trace, idx) => (
                      <button
                        key={trace.traceId}
                        onClick={async () => {
                          // Load full trace details into the trace modal
                          try {
                            const result = await testMonitorApi.getProductionTrace(trace.traceId);
                            // Save session so we can navigate back
                            setPreviousSessionResult(sessionSearchResult);
                            setSessionSearchResult(null);
                            setTraceSearchResult(result);
                          } catch (error: any) {
                            setTraceSearchError(error?.message || 'Failed to load trace');
                          }
                        }}
                        className="w-full text-left p-2 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">#{idx + 1}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            trace.errorCount > 0
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {trace.errorCount > 0 ? `${trace.errorCount} errors` : 'Success'}
                          </span>
                        </div>
                        <p className="text-sm font-mono text-gray-900 dark:text-white truncate mt-1">
                          {trace.traceId}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(trace.startedAt).toLocaleString()}
                          {trace.latencyMs && ` • ${(trace.latencyMs / 1000).toFixed(2)}s`}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {sessionSearchResult.transcript && sessionSearchResult.transcript.length > 0 && (
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">
                    Transcript ({sessionSearchResult.transcript.length} turns)
                  </span>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {sessionSearchResult.transcript.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded text-sm ${
                          msg.role === 'user'
                            ? 'bg-blue-50 dark:bg-blue-900/20 ml-4'
                            : 'bg-gray-50 dark:bg-gray-900 mr-4'
                        }`}
                      >
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                          {msg.role}
                        </span>
                        <span className="text-gray-900 dark:text-white">{msg.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Existing Fixes Panel - shown when fixes already exist for this session */}
            {sessionExistingFixes?.hasExistingFixes && !sessionDiagnosisResult && (
              <div className="p-4 border-t-2 bg-purple-50 dark:bg-purple-900/20 border-purple-500">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-base font-semibold text-purple-700 dark:text-purple-400">
                        {sessionExistingFixes.fixesCount} Existing Fix{sessionExistingFixes.fixesCount !== 1 ? 'es' : ''} Found
                      </p>
                      <div className="mt-1 space-y-1">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {sessionExistingFixes.summary?.promptFixes || 0} prompt fix{(sessionExistingFixes.summary?.promptFixes || 0) !== 1 ? 'es' : ''} •{' '}
                          {sessionExistingFixes.summary?.toolFixes || 0} tool fix{(sessionExistingFixes.summary?.toolFixes || 0) !== 1 ? 'es' : ''}
                          {sessionExistingFixes.summary?.highConfidenceFixes ? ` • ${sessionExistingFixes.summary.highConfidenceFixes} high confidence` : ''}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Previously generated fixes are ready to review and apply.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => {
                      // Close modal and navigate to Apply phase
                      setSessionSearchResult(null);
                      setSessionDiagnosisResult(null);
                      setSessionGoalStatus(null);
                      setActivePhase('apply');
                    }}
                    className="flex items-center gap-2 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    View & Apply Fixes
                  </Button>
                </div>
              </div>
            )}

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
              <Button
                variant={sessionExistingFixes?.hasExistingFixes ? 'outline' : 'primary'}
                onClick={() => handleSessionDiagnosis(sessionSearchResult.session.sessionId)}
                disabled={sessionDiagnosisLoading || sessionExistingFixesLoading}
                className="flex items-center gap-2"
              >
                {sessionDiagnosisLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Diagnosing Session...
                  </>
                ) : sessionExistingFixesLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                    Checking for existing fixes...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                    {sessionDiagnosisResult || sessionExistingFixes?.hasExistingFixes ? 'Re-diagnose Session' : 'Diagnose Session & Generate Fixes'}
                  </>
                )}
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    // Open in Call Tracing page
                    window.open(`/test-monitor/call-trace?sessionId=${sessionSearchResult.session.sessionId}`, '_blank');
                  }}
                >
                  Open in Call Tracing
                </Button>
                <Button variant="secondary" onClick={() => {
                  setSessionSearchResult(null);
                  setSessionDiagnosisResult(null);
                  setSessionGoalStatus(null);
                  setSessionExistingFixes(null);
                }}>
                  Close
                </Button>
              </div>
            </div>

            {/* Session Diagnosis Result Panel */}
            {sessionDiagnosisResult && (
              <div className={`p-4 border-t-2 ${
                sessionDiagnosisResult.fixesGenerated > 0
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {sessionDiagnosisResult.fixesGenerated > 0 ? (
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    )}
                    <div>
                      <p className={`text-base font-semibold ${
                        sessionDiagnosisResult.fixesGenerated > 0
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-blue-700 dark:text-blue-400'
                      }`}>
                        {sessionDiagnosisResult.fixesGenerated > 0
                          ? `${sessionDiagnosisResult.fixesGenerated} Fix${sessionDiagnosisResult.fixesGenerated > 1 ? 'es' : ''} Generated!`
                          : 'Analysis Complete'}
                      </p>
                      {sessionDiagnosisResult.fixesGenerated > 0 && (
                        <div className="mt-1 space-y-1">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {sessionDiagnosisResult.summary?.promptFixes || 0} prompt fix{(sessionDiagnosisResult.summary?.promptFixes || 0) !== 1 ? 'es' : ''} •{' '}
                            {sessionDiagnosisResult.summary?.toolFixes || 0} tool fix{(sessionDiagnosisResult.summary?.toolFixes || 0) !== 1 ? 'es' : ''}
                          </p>
                          {sessionDiagnosisResult.analysis?.rootCause && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                              Root cause: {sessionDiagnosisResult.analysis.rootCause}
                            </p>
                          )}
                        </div>
                      )}
                      {sessionDiagnosisResult.summary?.sessionSummary && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
                          "{sessionDiagnosisResult.summary.sessionSummary}"
                        </p>
                      )}
                      {sessionDiagnosisResult.fixesGenerated === 0 && sessionDiagnosisResult.analysis?.summary && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {sessionDiagnosisResult.analysis.summary}
                        </p>
                      )}
                    </div>
                  </div>
                  {sessionDiagnosisResult.fixesGenerated > 0 && (
                    <Button
                      variant="primary"
                      onClick={() => {
                        // Close modal and navigate to Apply phase
                        setSessionSearchResult(null);
                        setSessionDiagnosisResult(null);
                        setSessionGoalStatus(null);
                        setActivePhase('apply');
                      }}
                      className="flex items-center gap-2 flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      View & Apply Fixes
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

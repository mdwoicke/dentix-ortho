/**
 * Test Run Detail Page
 * View individual test run results, conversations, and API calls
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { PageHeader } from '../../components/layout';
import { Button, Modal, Spinner } from '../../components/ui';
import {
  TestRunList,
  TestResultsTable,
  TranscriptViewer,
  ApiCallsPanel,
  FindingsPanel,
  FixesPanel,
  ExpandablePanel,
  PromptVersionPanel,
  ErrorClusteringPanel,
  PerformanceWaterfall,
  ConversationDiffViewer,
} from '../../components/features/testMonitor';
import {
  fetchTestRuns,
  fetchTestRun,
  fetchTranscript,
  fetchApiCalls,
  fetchFindings,
  fetchFixes,
  updateFixStatus,
  setSelectedTest,
  selectTestRuns,
  selectSelectedRun,
  selectSelectedTest,
  selectTranscript,
  selectApiCalls,
  selectFindings,
  selectFixes,
  selectTestMonitorLoading,
  selectTranscriptLoading,
  selectApiCallsLoading,
  selectFixesLoading,
  // Streaming actions and selectors
  startStreaming,
  stopStreaming,
  setStreamError,
  streamRunUpdate,
  streamResultsUpdate,
  streamFindingsUpdate,
  streamTranscriptUpdate,
  streamApiCallsUpdate,
  selectIsStreaming,
  // Live conversation streaming actions and selectors
  addLiveConversationTurn,
  addLiveApiCall,
  initializeLiveConversation,
  setSelectedLiveTestId,
  clearAllLiveConversations,
  markConversationComplete,
  markAllConversationsComplete,
  selectLiveConversations,
  selectSelectedLiveTestId,
  // Running tests tracking actions and selectors
  addRunningTest,
  removeRunningTest,
  clearAllRunningTests,
  selectRunningTests,
  // Prompt version management
  fetchPromptFiles,
  fetchPromptContent,
  fetchPromptHistory,
  applyFixToPrompt,
  applyBatchFixes,
  selectPromptFiles,
  selectPromptContent,
  selectPromptHistory,
  selectPromptLoading,
} from '../../store/slices/testMonitorSlice';
import { subscribeToTestRun, subscribeToExecution, type TestRunStreamEvent, type ExecutionStreamEvent } from '../../services/api/testMonitorApi';
import * as testMonitorApi from '../../services/api/testMonitorApi';
import { getAppSettings, getTestEnvironmentPresets } from '../../services/api/appSettingsApi';
import type { TestResult } from '../../types/testMonitor.types';
import type { TestEnvironmentPresetWithNames } from '../../types/appSettings.types';

export function TestRunDetail() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { runId } = useParams<{ runId: string }>();

  const runs = useAppSelector(selectTestRuns);
  const selectedRun = useAppSelector(selectSelectedRun);
  const selectedTest = useAppSelector(selectSelectedTest);
  const transcript = useAppSelector(selectTranscript);
  const apiCalls = useAppSelector(selectApiCalls);
  const findings = useAppSelector(selectFindings);
  const fixes = useAppSelector(selectFixes);
  const loading = useAppSelector(selectTestMonitorLoading);
  const transcriptLoading = useAppSelector(selectTranscriptLoading);
  const apiCallsLoading = useAppSelector(selectApiCallsLoading);
  const fixesLoading = useAppSelector(selectFixesLoading);
  const isStreaming = useAppSelector(selectIsStreaming);

  // Live conversation streaming state
  const liveConversations = useAppSelector(selectLiveConversations);
  const selectedLiveTestId = useAppSelector(selectSelectedLiveTestId);
  // Running tests tracking state
  const runningTests = useAppSelector(selectRunningTests);

  // Prompt version management state
  const promptFiles = useAppSelector(selectPromptFiles);
  const promptContent = useAppSelector(selectPromptContent);
  const promptHistory = useAppSelector(selectPromptHistory);
  const promptLoading = useAppSelector(selectPromptLoading);

  // Diagnosis state
  const [diagnosisRunning, setDiagnosisRunning] = useState(false);

  // Batch fix selection state
  const [selectedFixIds, setSelectedFixIds] = useState<Set<string>>(new Set());
  const [applyingBatch, setApplyingBatch] = useState(false);

  // Langfuse configuration
  const [langfuseProjectId, setLangfuseProjectId] = useState<string | undefined>(undefined);

  // Environment filter state
  const [environmentPresets, setEnvironmentPresets] = useState<TestEnvironmentPresetWithNames[]>([]);
  const [environmentFilter, setEnvironmentFilter] = useState<string>('');

  // Conversation diff comparison state
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [compareRunId, setCompareRunId] = useState<string | null>(null);

  // Clear old layout key on mount (migration to library's built-in persistence)
  useEffect(() => {
    localStorage.removeItem('test-run-detail-layout');
  }, []);

  // Code viewer modal state (for Navigate to Code links in Findings)
  const [codeViewerModal, setCodeViewerModal] = useState<{
    isOpen: boolean;
    title: string;
    filePath: string;
    content: string;
    loading: boolean;
    searchPattern?: string;
  }>({
    isOpen: false,
    title: '',
    filePath: '',
    content: '',
    loading: false,
  });

  // Keep track of the EventSource connections
  const eventSourceRef = useRef<EventSource | null>(null);
  const executionEventSourceRef = useRef<EventSource | null>(null);

  // Determine if we should show live or completed transcript
  // Check test indicators first, so we show live data even before selectedRun is fully loaded
  const testIndicatesRunning = selectedTest && (
    liveConversations[selectedTest.testId]?.isLive ||
    runningTests[selectedTest.testId] !== undefined ||
    selectedTest.status === 'running'
  );
  const isViewingLiveTest = selectedTest && testIndicatesRunning && (
    selectedRun?.status === 'running' || !selectedRun
  );

  // Use live data if available (even after session ends), otherwise use fetched data
  // Priority: live conversation data (if has content) > fetched transcript data
  const liveData = selectedTest ? liveConversations[selectedTest.testId] : null;
  const hasLiveContent = liveData && (liveData.transcript.length > 0 || liveData.apiCalls.length > 0);

  const displayTranscript = hasLiveContent
    ? liveData!.transcript
    : transcript;
  const displayApiCalls = hasLiveContent
    ? liveData!.apiCalls
    : apiCalls;

  // Merge running tests with completed results for display in the table
  const mergedResults = useMemo(() => {
    const completedResults = selectedRun?.results || [];
    const completedTestIds = new Set(completedResults.map(r => r.testId));

    // Use URL runId or selectedRun.runId (URL runId takes priority for new running tests)
    const currentRunId = runId || selectedRun?.runId;

    // Create synthetic TestResult objects for running tests not yet in results
    const runningTestsForThisRun = Object.values(runningTests).filter(
      rt => rt.runId === currentRunId && !completedTestIds.has(rt.testId)
    );

    // Debug: log running tests being added to table
    if (runningTestsForThisRun.length > 0) {
      console.log('[TestRunDetail] Adding running tests to table:', runningTestsForThisRun.map(rt => rt.testName));
    }

    const syntheticResults: TestResult[] = runningTestsForThisRun.map(rt => ({
      id: 0, // Synthetic, not from DB
      testId: rt.testId,
      runId: rt.runId,
      testName: rt.testName,
      category: 'In progress',
      status: 'running' as const,
      startedAt: new Date(rt.startedAt).toISOString(),
      completedAt: new Date(rt.startedAt).toISOString(), // Placeholder
      durationMs: 0,
      errorMessage: undefined,
    }));

    // Put running tests at the top, then completed tests
    return [...syntheticResults, ...completedResults];
  }, [selectedRun?.results, selectedRun?.runId, runId, runningTests]);

  // Filter test runs by environment
  const filteredRuns = useMemo(() => {
    if (!environmentFilter) return runs;
    return runs.filter(run => run.environmentPresetName === environmentFilter);
  }, [runs, environmentFilter]);

  // Handle SSE events
  const handleStreamEvent = useCallback((event: TestRunStreamEvent) => {
    switch (event.type) {
      case 'run-update':
        dispatch(streamRunUpdate(event.data));
        break;
      case 'results-update':
        dispatch(streamResultsUpdate(event.data));
        break;
      case 'findings-update':
        dispatch(streamFindingsUpdate(event.data));
        break;
      case 'transcript-update':
        dispatch(streamTranscriptUpdate(event.data));
        break;
      case 'api-calls-update':
        dispatch(streamApiCallsUpdate(event.data));
        break;
      case 'complete':
        dispatch(stopStreaming());
        // Refresh the runs list to get final state
        dispatch(fetchTestRuns({}));
        break;
      case 'error':
        dispatch(setStreamError(event.data.message));
        break;
    }
  }, [dispatch]);

  // Handle execution SSE events (for live conversation streaming)
  const handleExecutionStreamEvent = useCallback((event: ExecutionStreamEvent) => {
    // Use runId from URL params or selectedRun
    const currentRunId = runId || selectedRun?.runId;

    console.log('[TestRunDetail] SSE event received:', event.type, 'currentRunId:', currentRunId);

    switch (event.type) {
      case 'workers-update':
        // Handle initial workers state when SSE connects
        // This catches tests that were already running when we connected
        console.log('[TestRunDetail] workers-update data:', event.data);
        if (Array.isArray(event.data) && currentRunId) {
          for (const worker of event.data) {
            console.log('[TestRunDetail] Processing worker:', worker);
            if (worker.currentTestId && worker.currentTestName) {
              console.log('[TestRunDetail] Adding running test from workers-update:', worker.currentTestName);
              dispatch(addRunningTest({
                testId: worker.currentTestId,
                testName: worker.currentTestName,
                runId: currentRunId,
              }));
            }
          }
        }
        break;
      case 'worker-status':
        // Track running tests from worker status updates
        console.log('[TestRunDetail] worker-status data:', event.data);
        if (event.data.currentTestId && event.data.currentTestName && currentRunId) {
          console.log('[TestRunDetail] Adding running test from worker-status:', event.data.currentTestName);
          dispatch(addRunningTest({
            testId: event.data.currentTestId,
            testName: event.data.currentTestName,
            runId: currentRunId,
          }));
        }
        break;
      case 'conversation-update':
        // If we receive conversation data for a test, it must be running
        // Always dispatch addRunningTest - reducer handles duplicates safely
        if (currentRunId) {
          console.log('[TestRunDetail] Adding running test from conversation-update:', event.data.testId);
          dispatch(addRunningTest({
            testId: event.data.testId,
            testName: event.data.testName || event.data.testId, // Use testName if available, fallback to testId
            runId: currentRunId,
          }));
        }
        dispatch(addLiveConversationTurn({
          testId: event.data.testId,
          turn: event.data.turn,
        }));
        break;
      case 'api-call-update':
        dispatch(addLiveApiCall({
          testId: event.data.testId,
          apiCall: event.data.apiCall,
        }));
        break;
      case 'execution-completed':
      case 'execution-stopped':
        // Mark live conversations as complete (preserves data for viewing)
        // and clear running tests when execution ends
        dispatch(markAllConversationsComplete());
        dispatch(clearAllRunningTests());
        dispatch(fetchTestRuns({}));
        break;
    }
  }, [dispatch, runId, selectedRun?.runId]);

  // Fetch test runs and prompt files on mount
  useEffect(() => {
    dispatch(fetchTestRuns({}));
    dispatch(fetchPromptFiles());
  }, [dispatch]);

  // Fetch Langfuse project ID for session URLs and environment presets
  useEffect(() => {
    getAppSettings()
      .then(settings => {
        if (settings.langfuseProjectId?.value) {
          setLangfuseProjectId(settings.langfuseProjectId.value);
        }
      })
      .catch(err => console.warn('Failed to fetch app settings:', err));

    // Fetch environment presets for filter dropdown
    getTestEnvironmentPresets()
      .then(presets => setEnvironmentPresets(presets))
      .catch(err => console.warn('Failed to fetch environment presets:', err));
  }, []);

  // Auto-poll test runs list when any run is "running"
  // Smart merging in the reducer prevents flickering even with frequent polling
  useEffect(() => {
    const hasRunningRun = runs.some(run => run.status === 'running');
    const pollInterval = hasRunningRun ? 2000 : 30000; // 2s when running, 30s otherwise

    const intervalId = setInterval(() => {
      dispatch(fetchTestRuns({}));

      // Only refresh selected run data if SSE is NOT streaming
      // SSE handles real-time updates, polling is a fallback
      // Smart merging in reducer prevents flickering even if both update
      if (!isStreaming && selectedRun?.status === 'running') {
        dispatch(fetchTestRun(selectedRun.runId));
      }
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [dispatch, runs, selectedRun?.runId, selectedRun?.status, isStreaming]);

  // Track if this is the initial mount to force refetch
  const initialMountRef = useRef(true);

  // Auto-select run from URL parameter
  // Also handles navigation between different runs (when selectedRun is already set but for a different runId)
  // IMPORTANT: Always refetch on mount to ensure we have fresh data when navigating back to this page
  useEffect(() => {
    if (runId) {
      // Always refetch on initial mount (handles navigation back to page)
      // or when switching to a different run
      if (initialMountRef.current || !selectedRun || selectedRun.runId !== runId) {
        console.log('[TestRunDetail] Auto-selecting run from URL:', runId,
          initialMountRef.current ? '(initial mount)' : '(run changed)');
        handleSelectRun(runId);
        initialMountRef.current = false;
      }
    }
  }, [runId, selectedRun?.runId]);

  // Auto-fetch transcript when selectedTest exists but transcript is empty
  // This handles the case where selectedTest persists in Redux but transcript doesn't
  // (e.g., page reload, navigation back to this page)
  useEffect(() => {
    if (selectedTest && transcript.length === 0 && !transcriptLoading) {
      // Only fetch if this test belongs to the current run
      const currentRunId = runId || selectedRun?.runId;
      if (selectedTest.runId === currentRunId) {
        console.log('[TestRunDetail] Auto-fetching transcript for persisted selectedTest:', selectedTest.testId);
        dispatch(fetchTranscript({ testId: selectedTest.testId, runId: selectedTest.runId }));
        dispatch(fetchApiCalls({ testId: selectedTest.testId, runId: selectedTest.runId }));
      }
    }
  }, [selectedTest?.testId, selectedTest?.runId, transcript.length, transcriptLoading, runId, selectedRun?.runId, dispatch]);

  // Subscribe to real-time updates when viewing a running test run
  useEffect(() => {
    // Clean up previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      dispatch(stopStreaming());
    }

    // Only subscribe if viewing a running test run
    if (selectedRun && selectedRun.status === 'running') {
      dispatch(startStreaming());

      const eventSource = subscribeToTestRun(
        selectedRun.runId,
        selectedTest?.testId || null,
        handleStreamEvent,
        (error) => {
          console.error('SSE connection error:', error);
          dispatch(setStreamError('Connection lost. Click refresh to reconnect.'));
        }
      );

      eventSourceRef.current = eventSource;
    }

    // Cleanup on unmount or when run changes
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [selectedRun?.runId, selectedRun?.status, selectedTest?.testId, handleStreamEvent, dispatch]);

  // Subscribe to execution stream for live conversation updates
  useEffect(() => {
    // Clean up previous execution connection
    if (executionEventSourceRef.current) {
      console.log('[TestRunDetail] Closing previous execution SSE connection');
      executionEventSourceRef.current.close();
      executionEventSourceRef.current = null;
    }

    // Subscribe if we have a runId (from URL or selectedRun) and run is running
    // Also subscribe if selectedRun is null but we have a runId from URL (might be a new running test)
    const targetRunId = runId || selectedRun?.runId;
    const shouldSubscribe = targetRunId && (selectedRun?.status === 'running' || !selectedRun);

    console.log('[TestRunDetail] SSE subscription check:', {
      urlRunId: runId,
      selectedRunId: selectedRun?.runId,
      selectedRunStatus: selectedRun?.status,
      targetRunId,
      shouldSubscribe,
    });

    if (shouldSubscribe && targetRunId) {
      console.log('[TestRunDetail] Opening execution SSE connection for runId:', targetRunId);
      const executionEventSource = subscribeToExecution(
        targetRunId,
        handleExecutionStreamEvent,
        (error) => {
          console.error('Execution SSE connection error:', error);
        }
      );

      executionEventSourceRef.current = executionEventSource;
    } else {
      console.log('[TestRunDetail] NOT subscribing to execution SSE');
    }

    // Cleanup on unmount or when run changes
    return () => {
      if (executionEventSourceRef.current) {
        executionEventSourceRef.current.close();
        executionEventSourceRef.current = null;
      }
    };
  }, [runId, selectedRun?.runId, selectedRun?.status, handleExecutionStreamEvent]);

  // Handle selecting a test run
  const handleSelectRun = (selectedRunId: string) => {
    // Navigate to the new run URL if different from current URL
    // This ensures the URL stays in sync with the selection
    if (selectedRunId !== runId) {
      navigate(`/test-monitor/run/${selectedRunId}`);
    }
    dispatch(fetchTestRun(selectedRunId));
    dispatch(fetchFindings(selectedRunId));
    dispatch(fetchFixes(selectedRunId));
  };

  // Handle updating fix status
  const handleUpdateFixStatus = (fixId: string, status: 'applied' | 'rejected') => {
    dispatch(updateFixStatus({ fixId, status }));
  };

  // Handle applying a fix to a prompt
  const handleApplyFix = async (fixId: string, fileKey: string) => {
    await dispatch(applyFixToPrompt({ fixId, fileKey })).unwrap();
    // Refresh prompt files to get updated versions
    dispatch(fetchPromptFiles());
  };

  // Handle copying full prompt content
  const handleCopyFullPrompt = async (fileKey: string): Promise<string | null> => {
    try {
      // Check if we have the content cached
      if (promptContent[fileKey]) {
        return promptContent[fileKey];
      }
      // Fetch the content
      const result = await testMonitorApi.getPromptContent(fileKey);
      return result.content;
    } catch (error) {
      console.error('Failed to fetch prompt content:', error);
      return null;
    }
  };

  // Handle selecting a prompt file to view history
  const handleSelectPromptFile = (fileKey: string) => {
    dispatch(fetchPromptHistory({ fileKey }));
  };

  // Handle navigation to code files from Findings panel
  const handleNavigateToCode = async (filePath: string, searchPattern?: string) => {
    // Map file paths to prompt file keys for content fetching
    const fileKeyMap: Record<string, string> = {
      'docs/v1/Chord_Cloud9_SystemPrompt.md': 'system_prompt',
      'docs/v1/schedule_appointment_dso_Tool.json': 'scheduling_tool',
      'docs/v1/chord_dso_patient_Tool.json': 'patient_tool',
      'docs/v1/nodered_Cloud9_flows.json': 'nodered_flow',
    };

    // Get display title from path
    const titleMap: Record<string, string> = {
      'docs/v1/Chord_Cloud9_SystemPrompt.md': 'System Prompt',
      'docs/v1/schedule_appointment_dso_Tool.json': 'Scheduling Tool',
      'docs/v1/chord_dso_patient_Tool.json': 'Patient Tool',
      'docs/v1/nodered_Cloud9_flows.json': 'Node-RED Flow',
      'test-agent/src/tests/scenarios/': 'Test Scenarios',
    };

    const fileKey = fileKeyMap[filePath];
    const title = titleMap[filePath] || filePath.split('/').pop() || 'Code';

    // Open modal with loading state
    setCodeViewerModal({
      isOpen: true,
      title,
      filePath,
      content: '',
      loading: true,
      searchPattern,
    });

    try {
      if (fileKey) {
        // Fetch content from prompt API
        const result = await testMonitorApi.getPromptContent(fileKey);
        setCodeViewerModal(prev => ({
          ...prev,
          content: result.content,
          loading: false,
        }));
      } else if (filePath.startsWith('test-agent/src/tests/scenarios/')) {
        // For test scenarios, show a message that these are TypeScript files
        setCodeViewerModal(prev => ({
          ...prev,
          content: `Test scenario definitions are TypeScript files located in:\n\n${filePath}\n\nAvailable scenario files:\n- goal-happy-path.ts\n- edge-cases.ts\n- error-handling.ts\n- happy-path.ts\n\nThese files define the test cases using the Goal Test framework.`,
          loading: false,
        }));
      } else {
        // Unknown file - show path for manual navigation
        setCodeViewerModal(prev => ({
          ...prev,
          content: `File path: ${filePath}\n\nThis file content is not available through the API.\nPlease navigate to the file manually in your IDE.`,
          loading: false,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch file content:', error);
      setCodeViewerModal(prev => ({
        ...prev,
        content: `Failed to load file content.\n\nFile path: ${filePath}\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`,
        loading: false,
      }));
    }
  };

  // Handle copying prompt version content
  const handleCopyPromptVersion = async (fileKey: string, version?: number): Promise<string | null> => {
    try {
      if (version) {
        const result = await testMonitorApi.getPromptVersionContent(fileKey, version);
        return result.content;
      } else {
        const result = await testMonitorApi.getPromptContent(fileKey);
        return result.content;
      }
    } catch (error) {
      console.error('Failed to fetch prompt content:', error);
      return null;
    }
  };

  // Handle saving edited prompt content
  const handleSavePromptContent = async (fileKey: string, content: string, changeDescription: string): Promise<{ newVersion: number } | null> => {
    const result = await testMonitorApi.savePromptVersion(fileKey, content, changeDescription);
    // Refresh prompt files and history to reflect new version
    dispatch(fetchPromptFiles());
    dispatch(fetchPromptHistory({ fileKey }));
    return { newVersion: result.newVersion };
  };

  // Handle selecting a test
  const handleSelectTest = async (test: TestResult) => {
    dispatch(setSelectedTest(test));

    // Check if this is a running test (either has live data, is in runningTests, or has running status)
    // IMPORTANT: Check test.status and runningTests BEFORE checking selectedRun?.status
    // This handles the case where user clicks a test before the run is fully loaded
    const hasLiveData = liveConversations[test.testId]?.isLive;
    const isInRunningTests = runningTests[test.testId] !== undefined;
    const testHasRunningStatus = test.status === 'running';
    const testIsCurrentlyRunning = hasLiveData || isInRunningTests || testHasRunningStatus;

    // The run is considered running if either selectedRun says so, OR if we don't have
    // selectedRun yet but the test itself indicates it's running
    const isRunningRun = selectedRun?.status === 'running' || (!selectedRun && testIsCurrentlyRunning);

    // Use the runId from URL params if selectedRun isn't loaded yet
    const effectiveRunId = selectedRun?.runId || runId || test.runId;

    if (isRunningRun && testIsCurrentlyRunning) {
      // Use live data, set the selected live test ID
      dispatch(setSelectedLiveTestId(test.testId));

      // Fetch current live conversation state to catch up with any turns that happened
      // before we subscribed to SSE (or when page was refreshed)
      if (!hasLiveData && effectiveRunId) {
        try {
          console.log(`[TestRunDetail] Fetching live conversation for ${test.testId} (runId: ${effectiveRunId})`);
          const liveData = await testMonitorApi.getLiveConversation(effectiveRunId, test.testId);
          if (liveData.transcript.length > 0 || liveData.apiCalls.length > 0) {
            dispatch(initializeLiveConversation({
              testId: test.testId,
              transcript: liveData.transcript,
              apiCalls: liveData.apiCalls,
            }));
          }
        } catch (error) {
          console.error('[TestRunDetail] Failed to fetch live conversation:', error);
        }
      }
    } else {
      // Clear live test selection and fetch completed data from DB
      dispatch(setSelectedLiveTestId(null));
      dispatch(fetchTranscript({ testId: test.testId, runId: test.runId }));
      dispatch(fetchApiCalls({ testId: test.testId, runId: test.runId }));
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    dispatch(fetchTestRuns({}));
    dispatch(fetchPromptFiles());
    // If viewing a run, also refresh its data
    if (selectedRun) {
      dispatch(fetchTestRun(selectedRun.runId));
      dispatch(fetchFindings(selectedRun.runId));
      dispatch(fetchFixes(selectedRun.runId));
    }
  };

  // Handle running diagnosis on current run
  const handleRunDiagnosis = async () => {
    console.log(`[Fixes:TestRunDetail] handleRunDiagnosis called, selectedRun:`, selectedRun?.runId);
    if (!selectedRun) {
      console.log(`[Fixes:TestRunDetail] No selectedRun, returning early`);
      return;
    }

    setDiagnosisRunning(true);
    try {
      console.log(`[Fixes:TestRunDetail] Calling testMonitorApi.runDiagnosis(${selectedRun.runId})...`);
      const result = await testMonitorApi.runDiagnosis(selectedRun.runId);
      console.log('[Fixes:TestRunDetail] Diagnosis result:', result);

      // Refresh fixes after diagnosis completes
      if (result.success) {
        console.log(`[Fixes:TestRunDetail] Diagnosis successful, dispatching fetchFixes(${selectedRun.runId})`);
        dispatch(fetchFixes(selectedRun.runId));
      } else {
        console.warn(`[Fixes:TestRunDetail] Diagnosis result.success is falsy, NOT fetching fixes`);
      }
    } catch (error) {
      console.error('[Fixes:TestRunDetail] Diagnosis error:', error);
    } finally {
      setDiagnosisRunning(false);
    }
  };

  // Batch fix selection handlers
  const pendingFixes = fixes.filter(f => f.status === 'pending');

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
      const pendingIds = pendingFixes.map(f => f.fixId);
      setSelectedFixIds(new Set(pendingIds));
    } else {
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

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Test Run Detail"
        subtitle={selectedRun ? `Run ${selectedRun.runId.slice(0, 8)}... - ${selectedRun.passed}/${selectedRun.totalTests} passed` : 'Select a run to view details'}
        action={
          <div className="flex items-center gap-3">
            {/* Environment indicator pill */}
            {selectedRun?.environmentPresetName && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full">
                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{selectedRun.environmentPresetName}</span>
              </div>
            )}
            {isStreaming && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-full">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                <span className="text-xs font-medium text-red-600 dark:text-red-400">LIVE</span>
              </div>
            )}
            <Button onClick={handleRefresh} variant="secondary" size="sm">
              Refresh
            </Button>
          </div>
        }
      />

      <PanelGroup
        orientation="horizontal"
        autoSaveId="test-run-detail"
        className="flex-1 min-h-0"
      >
        {/* Left Panel - Test Runs */}
        <Panel
          id="test-runs-panel"
          defaultSize={20}
          minSize={15}
          maxSize={35}
          className="flex flex-col min-h-0"
        >
          <ExpandablePanel title="Test Runs" contentClassName="p-2" grow>
            {/* Environment Filter */}
            <div className="mb-2">
              <select
                value={environmentFilter}
                onChange={(e) => setEnvironmentFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All Environments</option>
                {environmentPresets.map(preset => (
                  <option key={preset.id} value={preset.name}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
            <TestRunList
              runs={filteredRuns}
              selectedRunId={selectedRun?.runId}
              onSelectRun={handleSelectRun}
              loading={loading && filteredRuns.length === 0}
            />
          </ExpandablePanel>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-2 flex items-center justify-center group mx-1">
          <div className="w-1 h-8 rounded-full bg-gray-300 dark:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </PanelResizeHandle>

        {/* Center Panel - Test Results */}
        <Panel
          id="test-results-panel"
          defaultSize={40}
          minSize={25}
          maxSize={60}
          className="flex flex-col min-h-0"
        >
          <ExpandablePanel
            title={
              <span className="flex items-center gap-2">
                Test Results
                {isStreaming && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-500/10 rounded">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                    </span>
                    LIVE
                  </span>
                )}
              </span>
            }
            subtitle={selectedRun ? `(${mergedResults.length} tests${Object.keys(runningTests).length > 0 ? `, ${Object.keys(runningTests).length} running` : ''})` : undefined}
            grow
          >
            <TestResultsTable
              results={mergedResults}
              selectedTestId={selectedTest?.testId}
              onSelectTest={handleSelectTest}
              loading={loading && !selectedRun}
              runStatus={selectedRun?.status}
              runningTestCount={Object.keys(runningTests).length}
            />
          </ExpandablePanel>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-2 flex items-center justify-center group mx-1">
          <div className="w-1 h-8 rounded-full bg-gray-300 dark:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </PanelResizeHandle>

        {/* Right Panel - Details */}
        <Panel
          id="details-panel"
          defaultSize={40}
          minSize={25}
          maxSize={55}
          className="flex flex-col gap-4 min-h-0 overflow-y-auto"
        >
          {/* Transcript */}
          <ExpandablePanel
            title={
              <span className="flex items-center gap-2">
                Conversation
                {isViewingLiveTest && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 rounded animate-pulse">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                    </span>
                    LIVE
                  </span>
                )}
              </span>
            }
            subtitle={selectedTest ? `- ${selectedTest.testName} (${Math.ceil(displayTranscript.length / 2)} turns)` : undefined}
            maxContentHeight="400px"
            headerActions={
              selectedTest && runs.length > 1 && !isViewingLiveTest && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDiffModal(true);
                  }}
                  className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  title="Compare this conversation with another run"
                >
                  Compare
                </button>
              )
            }
          >
            <TranscriptViewer
              transcript={displayTranscript}
              apiCalls={displayApiCalls}
              loading={!isViewingLiveTest && !hasLiveContent && transcriptLoading}
              testId={selectedTest?.testId}
              runId={selectedTest?.runId}
              dbId={selectedTest?.id}
              langfuseTraceId={selectedTest?.langfuseTraceId}
              langfuseProjectId={langfuseProjectId}
              flowiseSessionId={selectedTest?.flowiseSessionId}
              isLive={isViewingLiveTest || false}
            />
          </ExpandablePanel>

          {/* API Calls */}
          <ExpandablePanel
            title="API Tool Calls"
            subtitle={displayApiCalls.length > 0 ? `(${displayApiCalls.length})` : undefined}
            contentClassName="p-2"
            maxContentHeight="250px"
          >
            <ApiCallsPanel
              apiCalls={displayApiCalls}
              loading={!isViewingLiveTest && !hasLiveContent && apiCallsLoading}
            />
          </ExpandablePanel>

          {/* Performance Waterfall */}
          {selectedTest && (displayTranscript.length > 0 || displayApiCalls.length > 0) && (
            <ExpandablePanel
              title="Performance Waterfall"
              subtitle="Timing visualization"
              contentClassName="p-2"
              maxContentHeight="400px"
              defaultExpanded={false}
            >
              <PerformanceWaterfall
                transcript={displayTranscript}
                apiCalls={displayApiCalls}
                testStartTime={selectedTest.startedAt}
                testDurationMs={selectedTest.durationMs}
                bottleneckThresholdMs={2000}
              />
            </ExpandablePanel>
          )}

          {/* Findings */}
          <ExpandablePanel
            title="Findings"
            subtitle={findings.length > 0 ? `(${findings.length})` : undefined}
            contentClassName="p-2"
            maxContentHeight="250px"
          >
            <FindingsPanel
              findings={findings}
              loading={loading}
              onNavigate={handleNavigateToCode}
            />
          </ExpandablePanel>

          {/* Error Clusters - Group similar errors for efficient debugging */}
          {selectedRun && selectedRun.failed > 0 && (
            <ExpandablePanel
              title="Error Patterns"
              subtitle="Group similar failures"
              contentClassName="p-2"
              maxContentHeight="400px"
              defaultExpanded={false}
            >
              <ErrorClusteringPanel
                runId={selectedRun.runId}
                onTestSelect={(testId) => {
                  // Find and select the test in the results
                  const test = selectedRun.results?.find((r: TestResult) => r.testId === testId);
                  if (test) {
                    dispatch(setSelectedTest(test));
                  }
                }}
              />
            </ExpandablePanel>
          )}

          {/* Agent Tuning Fixes */}
          <ExpandablePanel
            title="Agent Tuning Fixes"
            subtitle={fixes.length > 0 ? `(${fixes.length})` : undefined}
            contentClassName="p-2"
            maxContentHeight="350px"
          >
            <FixesPanel
              fixes={fixes}
              loading={fixesLoading}
              promptFiles={promptFiles}
              onUpdateStatus={handleUpdateFixStatus}
              onApplyFix={handleApplyFix}
              onCopyFullPrompt={handleCopyFullPrompt}
              onRunDiagnosis={handleRunDiagnosis}
              diagnosisRunning={diagnosisRunning}
              hasFailedTests={(selectedRun?.failed || 0) > 0}
              // Batch selection props
              selectedFixIds={selectedFixIds}
              onSelectionChange={handleSelectionChange}
              onSelectAll={handleSelectAll}
              onApplySelectedFixes={handleApplySelectedFixes}
              applyingBatch={applyingBatch}
            />
          </ExpandablePanel>

          {/* Project Artifacts */}
          <ExpandablePanel
            title="Project Artifacts"
            subtitle={promptFiles.length > 0 ? `(${promptFiles.length} files)` : undefined}
            contentClassName="p-2"
            maxContentHeight="300px"
          >
            <PromptVersionPanel
              promptFiles={promptFiles}
              promptHistory={promptHistory}
              loading={promptLoading}
              onSelectFile={handleSelectPromptFile}
              onCopyContent={handleCopyPromptVersion}
              onSaveContent={handleSavePromptContent}
            />
          </ExpandablePanel>
        </Panel>
      </PanelGroup>

      {/* Conversation Diff Modal */}
      {showDiffModal && selectedTest && selectedRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowDiffModal(false);
              setCompareRunId(null);
            }}
          />

          {/* Modal */}
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[90vw] max-w-5xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Compare Conversations
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Test: {selectedTest.testName}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDiffModal(false);
                  setCompareRunId(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Run Selection */}
            {!compareRunId && (
              <div className="p-6">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Select a run to compare with the current run ({selectedRun.runId.slice(0, 8)}...):
                </p>
                <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
                  {runs
                    .filter(run => run.runId !== selectedRun.runId)
                    .map(run => {
                      const hasThisTest = run.results?.some((r: TestResult) => r.testId === selectedTest.testId);
                      return (
                        <button
                          key={run.runId}
                          onClick={() => hasThisTest && setCompareRunId(run.runId)}
                          disabled={!hasThisTest}
                          className={`p-3 text-left rounded-lg border transition-colors ${
                            hasThisTest
                              ? 'border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                              : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm text-gray-900 dark:text-white">
                              {run.runId.slice(0, 12)}...
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              run.status === 'completed'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : run.status === 'failed'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {run.status}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {run.passed}/{run.totalTests} passed
                            {!hasThisTest && ' • Test not in this run'}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Diff Viewer */}
            {compareRunId && (
              <div className="flex-1 overflow-hidden">
                <ConversationDiffViewer
                  testId={selectedTest.testId}
                  baseRunId={selectedRun.runId}
                  compareRunId={compareRunId}
                  onClose={() => {
                    setShowDiffModal(false);
                    setCompareRunId(null);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Code Viewer Modal (for Navigate to Code links in Findings) */}
      <Modal
        isOpen={codeViewerModal.isOpen}
        onClose={() => setCodeViewerModal(prev => ({ ...prev, isOpen: false }))}
        title={codeViewerModal.title}
        size="xl"
      >
        {codeViewerModal.loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* File path info */}
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded">
              <span className="font-mono">{codeViewerModal.filePath}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(codeViewerModal.filePath);
                }}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                title="Copy path"
              >
                Copy Path
              </button>
            </div>

            {/* Search pattern hint if present */}
            {codeViewerModal.searchPattern && (
              <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded">
                Related user input: "{codeViewerModal.searchPattern}"
              </div>
            )}

            {/* Code content */}
            <div className="relative">
              <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto scrollbar-thin">
                {codeViewerModal.content}
              </pre>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(codeViewerModal.content);
                }}
                className="absolute top-2 right-2 px-3 py-1.5 text-xs font-medium rounded transition-colors bg-gray-700 hover:bg-gray-600 text-gray-200"
              >
                Copy Content
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

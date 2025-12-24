/**
 * TestMonitor Page
 * Dashboard for viewing Flowise test results, conversations, and API calls
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { PageHeader } from '../../components/layout';
import { Button } from '../../components/ui';
import {
  TestRunList,
  TestResultsTable,
  TranscriptViewer,
  ApiCallsPanel,
  FindingsPanel,
  FixesPanel,
  ExpandablePanel,
  PromptVersionPanel,
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
  // Prompt version management
  fetchPromptFiles,
  fetchPromptContent,
  fetchPromptHistory,
  applyFixToPrompt,
  selectPromptFiles,
  selectPromptContent,
  selectPromptHistory,
  selectPromptLoading,
} from '../../store/slices/testMonitorSlice';
import { subscribeToTestRun, type TestRunStreamEvent } from '../../services/api/testMonitorApi';
import * as testMonitorApi from '../../services/api/testMonitorApi';
import type { TestResult } from '../../types/testMonitor.types';

export function TestMonitor() {
  const dispatch = useAppDispatch();

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

  // Prompt version management state
  const promptFiles = useAppSelector(selectPromptFiles);
  const promptContent = useAppSelector(selectPromptContent);
  const promptHistory = useAppSelector(selectPromptHistory);
  const promptLoading = useAppSelector(selectPromptLoading);

  // Keep track of the EventSource connection
  const eventSourceRef = useRef<EventSource | null>(null);

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

  // Fetch test runs and prompt files on mount
  useEffect(() => {
    dispatch(fetchTestRuns({}));
    dispatch(fetchPromptFiles());
  }, [dispatch]);

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

  // Handle selecting a test run
  const handleSelectRun = (runId: string) => {
    dispatch(fetchTestRun(runId));
    dispatch(fetchFindings(runId));
    dispatch(fetchFixes(runId));
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
    dispatch(fetchPromptHistory(fileKey));
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

  // Handle selecting a test
  const handleSelectTest = (test: TestResult) => {
    dispatch(setSelectedTest(test));
    // Only fetch transcript/api calls if not streaming (streaming will send updates)
    if (!isStreaming) {
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

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Test Monitor"
        subtitle="View Flowise test results, conversations, and API calls"
        action={
          <div className="flex items-center gap-3">
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

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left Panel - Test Runs */}
        <div className="col-span-3 flex flex-col min-h-0">
          <ExpandablePanel title="Test Runs" contentClassName="p-2" grow>
            <TestRunList
              runs={runs}
              selectedRunId={selectedRun?.runId}
              onSelectRun={handleSelectRun}
              loading={loading && runs.length === 0}
            />
          </ExpandablePanel>
        </div>

        {/* Center Panel - Test Results */}
        <div className="col-span-5 flex flex-col min-h-0">
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
            subtitle={selectedRun ? `(${selectedRun.results?.length || 0} tests)` : undefined}
            grow
          >
            <TestResultsTable
              results={selectedRun?.results || []}
              selectedTestId={selectedTest?.testId}
              onSelectTest={handleSelectTest}
              loading={loading && !selectedRun}
            />
          </ExpandablePanel>
        </div>

        {/* Right Panel - Details */}
        <div className="col-span-4 flex flex-col gap-4 min-h-0 overflow-y-auto">
          {/* Transcript */}
          <ExpandablePanel
            title="Conversation"
            subtitle={selectedTest ? `- ${selectedTest.testName}` : undefined}
            maxContentHeight="400px"
          >
            <TranscriptViewer
              transcript={transcript}
              apiCalls={apiCalls}
              loading={transcriptLoading}
            />
          </ExpandablePanel>

          {/* API Calls */}
          <ExpandablePanel
            title="API Tool Calls"
            subtitle={apiCalls.length > 0 ? `(${apiCalls.length})` : undefined}
            contentClassName="p-2"
            maxContentHeight="250px"
          >
            <ApiCallsPanel
              apiCalls={apiCalls}
              loading={apiCallsLoading}
            />
          </ExpandablePanel>

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
            />
          </ExpandablePanel>

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
            />
          </ExpandablePanel>

          {/* Prompt Versions */}
          <ExpandablePanel
            title="Prompt Versions"
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
            />
          </ExpandablePanel>
        </div>
      </div>
    </div>
  );
}

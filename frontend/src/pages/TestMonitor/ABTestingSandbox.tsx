/**
 * A/B Testing Sandbox Page
 * Two-sandbox system for testing Flowise file variants with three-way comparison
 */

import { useEffect, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { PageHeader } from '../../components/layout';
import { Card, Spinner } from '../../components/ui';
import {
  SandboxSelector,
  SandboxEndpointConfig,
  LangfuseConfig,
  SandboxFileList,
  SandboxFileEditor,
  ComparisonTestPicker,
  ComparisonRunner,
  ComparisonResults,
  TestResultDetailPanel,
} from '../../components/features/sandbox';
import type { AppDispatch } from '../../store/store';
import type { SandboxFileKey, SelectedSandbox } from '../../types/sandbox.types';
import {
  // Actions
  selectSandbox,
  selectFile,
  startEditing,
  cancelEditing,
  setEditedContent,
  toggleTestSelection,
  selectAllTests,
  deselectAllTests,
  clearError,
  selectDetailTest,
  clearDetailTest,
  // Thunks
  fetchSandboxes,
  updateSandbox,
  fetchSandboxFiles,
  fetchFileHistory,
  saveSandboxFile,
  copyFileFromProduction,
  copyAllFromProduction,
  rollbackFile,
  fetchAvailableTests,
  startComparison,
  fetchComparisonHistory,
  fetchComparisonRun,
  checkForRunningComparison,
  // Selectors
  selectSandboxes,
  selectSandboxesLoading,
  selectCurrentSandbox,
  selectCurrentSandboxConfig,
  selectSandboxFiles,
  selectFilesLoading,
  selectSelectedFileKey,
  selectSelectedFile,
  selectFileHistory,
  selectFileHistoryLoading,
  selectIsEditing,
  selectHasUnsavedChanges,
  selectEditedContent,
  selectComparisonState,
  selectComparisonHistory,
  selectAvailableTests,
  selectSelectedTestIds,
  selectSandboxError,
  selectDetailPanelData,
  selectSelectedDetailTestId,
} from '../../store/slices/sandboxSlice';

export function ABTestingSandbox() {
  const dispatch = useDispatch<AppDispatch>();
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // Selectors
  const sandboxes = useSelector(selectSandboxes);
  const sandboxesLoading = useSelector(selectSandboxesLoading);
  const selectedSandbox = useSelector(selectCurrentSandbox);
  const currentSandboxConfig = useSelector(selectCurrentSandboxConfig);
  const files = useSelector(selectSandboxFiles);
  const filesLoading = useSelector(selectFilesLoading);
  const selectedFileKey = useSelector(selectSelectedFileKey);
  const selectedFile = useSelector(selectSelectedFile);
  const fileHistory = useSelector(selectFileHistory);
  const fileHistoryLoading = useSelector(selectFileHistoryLoading);
  const isEditing = useSelector(selectIsEditing);
  const hasUnsavedChanges = useSelector(selectHasUnsavedChanges);
  const editedContent = useSelector(selectEditedContent);
  const comparisonState = useSelector(selectComparisonState);
  const comparisonHistory = useSelector(selectComparisonHistory);
  const availableTests = useSelector(selectAvailableTests);
  const selectedTestIds = useSelector(selectSelectedTestIds);
  const error = useSelector(selectSandboxError);
  const detailPanelData = useSelector(selectDetailPanelData);
  const selectedDetailTestId = useSelector(selectSelectedDetailTestId);

  // Load initial data
  useEffect(() => {
    dispatch(fetchSandboxes());
    dispatch(fetchAvailableTests());
    dispatch(fetchComparisonHistory(10));
    // Check for any running comparison (persisted from page refresh)
    dispatch(checkForRunningComparison());
  }, [dispatch]);

  // Load files when sandbox changes
  useEffect(() => {
    if (selectedSandbox) {
      dispatch(fetchSandboxFiles(selectedSandbox));
    }
  }, [dispatch, selectedSandbox]);

  // Handlers
  const handleSelectSandbox = useCallback((sandbox: SelectedSandbox) => {
    dispatch(selectSandbox(sandbox));
  }, [dispatch]);

  const handleSaveEndpoint = useCallback(async (endpoint: string, apiKey: string) => {
    await dispatch(updateSandbox({
      sandboxId: selectedSandbox,
      updates: { flowiseEndpoint: endpoint, flowiseApiKey: apiKey }
    })).unwrap();
  }, [dispatch, selectedSandbox]);

  const handleSaveLangfuse = useCallback(async (host: string, publicKey: string, secretKey: string) => {
    await dispatch(updateSandbox({
      sandboxId: selectedSandbox,
      updates: { langfuseHost: host, langfusePublicKey: publicKey, langfuseSecretKey: secretKey }
    })).unwrap();
  }, [dispatch, selectedSandbox]);

  const handleSelectFile = useCallback((fileKey: SandboxFileKey) => {
    dispatch(selectFile(fileKey));
  }, [dispatch]);

  const handleCopyFromProduction = useCallback((fileKey: SandboxFileKey) => {
    dispatch(copyFileFromProduction({ sandboxId: selectedSandbox, fileKey }));
  }, [dispatch, selectedSandbox]);

  const handleStartEditing = useCallback(() => {
    dispatch(startEditing());
  }, [dispatch]);

  const handleCancelEditing = useCallback(() => {
    dispatch(cancelEditing());
  }, [dispatch]);

  const handleContentChange = useCallback((content: string) => {
    dispatch(setEditedContent(content));
  }, [dispatch]);

  const handleSaveFile = useCallback(async (content: string, description: string) => {
    if (!selectedFileKey) return;
    await dispatch(saveSandboxFile({
      sandboxId: selectedSandbox,
      fileKey: selectedFileKey,
      content,
      changeDescription: description,
    })).unwrap();
  }, [dispatch, selectedSandbox, selectedFileKey]);

  const handleLoadHistory = useCallback(() => {
    if (selectedFileKey) {
      dispatch(fetchFileHistory({ sandboxId: selectedSandbox, fileKey: selectedFileKey }));
    }
  }, [dispatch, selectedSandbox, selectedFileKey]);

  const handleRollback = useCallback((version: number) => {
    if (selectedFileKey) {
      dispatch(rollbackFile({
        sandboxId: selectedSandbox,
        fileKey: selectedFileKey,
        targetVersion: version,
      }));
    }
  }, [dispatch, selectedSandbox, selectedFileKey]);

  const handleCopyAllFromProduction = useCallback(() => {
    dispatch(copyAllFromProduction(selectedSandbox));
  }, [dispatch, selectedSandbox]);

  const handleToggleTest = useCallback((testId: string) => {
    dispatch(toggleTestSelection(testId));
  }, [dispatch]);

  const handleSelectAllTests = useCallback(() => {
    dispatch(selectAllTests());
  }, [dispatch]);

  const handleDeselectAllTests = useCallback(() => {
    dispatch(deselectAllTests());
  }, [dispatch]);

  const handleStartComparison = useCallback((config: {
    runProduction: boolean;
    runSandboxA: boolean;
    runSandboxB: boolean;
  }) => {
    dispatch(startComparison({
      testIds: selectedTestIds,
      ...config,
    }));
  }, [dispatch, selectedTestIds]);

  const handleClearError = useCallback(() => {
    dispatch(clearError());
  }, [dispatch]);

  const handleViewDetails = useCallback((testId: string) => {
    dispatch(selectDetailTest(testId));
  }, [dispatch]);

  const handleCloseDetails = useCallback(() => {
    dispatch(clearDetailTest());
  }, [dispatch]);

  const handleLoadHistoricalRun = useCallback((comparisonId: string) => {
    dispatch(fetchComparisonRun(comparisonId));
  }, [dispatch]);

  if (sandboxesLoading && sandboxes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="A/B Testing Sandbox"
        description="Test Flowise file variants with two sandboxes and three-way comparison"
      />

      {/* Error display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center justify-between">
          <span className="text-red-700 dark:text-red-400">{error}</span>
          <button
            onClick={handleClearError}
            className="text-red-500 hover:text-red-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Sandbox Selection & Files */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* Sandbox Selector */}
          <Card className="p-4">
            <SandboxSelector
              selectedSandbox={selectedSandbox}
              sandboxes={sandboxes}
              onSelect={handleSelectSandbox}
              disabled={comparisonState.isRunning}
            />

            {/* Collapsible Settings Section */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setSettingsExpanded(!settingsExpanded)}
                className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </span>
                <svg
                  className={`w-5 h-5 transform transition-transform ${settingsExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {settingsExpanded && (
                <div className="mt-3 space-y-4">
                  <SandboxEndpointConfig
                    sandbox={currentSandboxConfig}
                    selectedSandbox={selectedSandbox}
                    onSave={handleSaveEndpoint}
                    loading={sandboxesLoading}
                  />

                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <LangfuseConfig
                      sandbox={currentSandboxConfig}
                      selectedSandbox={selectedSandbox}
                      onSave={handleSaveLangfuse}
                      loading={sandboxesLoading}
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* File List */}
          <Card className="p-4">
            <SandboxFileList
              files={files}
              selectedFileKey={selectedFileKey}
              selectedSandbox={selectedSandbox}
              loading={filesLoading}
              onSelectFile={handleSelectFile}
              onCopyFromProduction={handleCopyFromProduction}
            />

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleCopyAllFromProduction}
                disabled={filesLoading}
                className="w-full py-2 px-4 text-sm font-medium rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Reset All to Production
              </button>
            </div>
          </Card>
        </div>

        {/* Middle Column: File Editor */}
        <div className="col-span-12 lg:col-span-5">
          {selectedFileKey ? (
            <SandboxFileEditor
              file={selectedFile}
              fileKey={selectedFileKey}
              history={fileHistory}
              editedContent={editedContent}
              isEditing={isEditing}
              hasUnsavedChanges={hasUnsavedChanges}
              selectedSandbox={selectedSandbox}
              loading={filesLoading}
              historyLoading={fileHistoryLoading}
              onStartEditing={handleStartEditing}
              onCancelEditing={handleCancelEditing}
              onContentChange={handleContentChange}
              onSave={handleSaveFile}
              onCopyFromProduction={() => handleCopyFromProduction(selectedFileKey)}
              onRollback={handleRollback}
              onLoadHistory={handleLoadHistory}
            />
          ) : (
            <Card className="p-8">
              <div className="text-center text-gray-500 dark:text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>Select a file to view or edit</p>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Comparison */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          {/* Test Picker */}
          <Card className="p-4">
            <ComparisonTestPicker
              availableTests={availableTests}
              selectedTestIds={selectedTestIds}
              onToggleTest={handleToggleTest}
              onSelectAll={handleSelectAllTests}
              onDeselectAll={handleDeselectAllTests}
            />
          </Card>

          {/* Comparison Runner */}
          <ComparisonRunner
            selectedTestIds={selectedTestIds}
            sandboxes={sandboxes}
            isRunning={comparisonState.isRunning}
            progress={comparisonState.progress}
            lastResult={comparisonState.lastResult}
            onStartComparison={handleStartComparison}
          />
        </div>
      </div>

      {/* Comparison Results */}
      <Card className="p-6">
        <ComparisonResults
          result={comparisonState.lastResult}
          history={comparisonHistory}
          onViewDetails={handleViewDetails}
          onLoadHistoricalRun={handleLoadHistoricalRun}
        />
      </Card>

      {/* Detail Panel */}
      {selectedDetailTestId && detailPanelData && (
        <TestResultDetailPanel
          key={detailPanelData.testId}
          testId={detailPanelData.testId}
          production={detailPanelData.production}
          sandboxA={detailPanelData.sandboxA}
          sandboxB={detailPanelData.sandboxB}
          onClose={handleCloseDetails}
        />
      )}

      {/* Detail Panel Loading/Not Found State */}
      {selectedDetailTestId && !detailPanelData && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Test Details: {selectedDetailTestId}
            </h3>
            <button
              onClick={handleCloseDetails}
              className="p-1 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>Detailed results not available.</p>
            <p className="text-sm mt-1">
              {comparisonState.isRunning
                ? 'Comparison is still running. Please wait...'
                : 'Run a new comparison to see detailed results.'}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

export default ABTestingSandbox;

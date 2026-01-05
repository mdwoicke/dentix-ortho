/**
 * A/B Testing Page (Sprint 3)
 * Unified sandbox environment merging A/B Testing Sandbox + AI Prompting
 * Features: File editing, AI enhancement inline, sandbox comparison
 */

import { useEffect, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { PageHeader } from '../../components/layout';
import { Card, Button, Spinner } from '../../components/ui';
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
  selectAvailableTests,
  selectSelectedTestIds,
  selectSandboxError,
  selectDetailPanelData,
  selectSelectedDetailTestId,
} from '../../store/slices/sandboxSlice';
import * as testMonitorApi from '../../services/api/testMonitorApi';
import type { EnhanceResult } from '../../types/aiPrompting.types';

// View modes
type ViewMode = 'edit' | 'compare';

export function SandboxLabPage() {
  const dispatch = useDispatch<AppDispatch>();

  // Local state
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [aiEnhancing, setAiEnhancing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastEnhancement, setLastEnhancement] = useState<EnhanceResult | null>(null);

  // Redux selectors
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
  }, [dispatch]);

  // Load files when sandbox changes
  useEffect(() => {
    if (selectedSandbox) {
      dispatch(fetchSandboxFiles(selectedSandbox));
    }
  }, [dispatch, selectedSandbox]);

  // Sandbox handlers
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

  // File handlers
  const handleSelectFile = useCallback((fileKey: SandboxFileKey) => {
    dispatch(selectFile(fileKey));
    setLastEnhancement(null);
    setAiError(null);
  }, [dispatch]);

  const handleCopyFromProduction = useCallback((fileKey: SandboxFileKey) => {
    dispatch(copyFileFromProduction({ sandboxId: selectedSandbox, fileKey }));
  }, [dispatch, selectedSandbox]);

  const handleStartEditing = useCallback(() => {
    dispatch(startEditing());
  }, [dispatch]);

  const handleCancelEditing = useCallback(() => {
    dispatch(cancelEditing());
    setLastEnhancement(null);
    setAiError(null);
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
    setLastEnhancement(null);
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

  // AI Enhancement handler
  const handleAIEnhance = useCallback(async (template?: string) => {
    if (!selectedFileKey || !editedContent) return;

    setAiEnhancing(true);
    setAiError(null);

    try {
      const result = await testMonitorApi.enhancePrompt({
        fileKey: selectedFileKey,
        content: editedContent,
        template: template || 'improve_clarity',
        context: selectedSandbox,
      });

      setLastEnhancement(result);

      // Apply the enhanced content to the editor
      if (result.enhancedContent) {
        dispatch(setEditedContent(result.enhancedContent));
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI enhancement failed');
    } finally {
      setAiEnhancing(false);
    }
  }, [selectedFileKey, editedContent, selectedSandbox, dispatch]);

  // Comparison handlers
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
    setAiError(null);
  }, [dispatch]);

  const handleViewDetails = useCallback((testId: string) => {
    dispatch(selectDetailTest(testId));
  }, [dispatch]);

  const handleCloseDetails = useCallback(() => {
    dispatch(clearDetailTest());
  }, [dispatch]);

  if (sandboxesLoading && sandboxes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <PageHeader
        title="A/B Testing"
        subtitle="Edit prompts, enhance with AI, and compare sandbox variants"
      />

      {/* View Mode Toggle */}
      <div className="mt-4 flex items-center gap-4">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-100 dark:bg-gray-800">
          <button
            onClick={() => setViewMode('edit')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'edit'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Mode
            </span>
          </button>
          <button
            onClick={() => setViewMode('compare')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'compare'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Compare Mode
            </span>
          </button>
        </div>

        {/* Sandbox Selector */}
        <div className="flex-1 max-w-xs">
          <SandboxSelector
            selectedSandbox={selectedSandbox}
            sandboxes={sandboxes}
            onSelect={handleSelectSandbox}
            disabled={comparisonState.isRunning}
          />
        </div>
      </div>

      {/* Error display */}
      {(error || aiError) && (
        <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center justify-between">
          <span className="text-red-700 dark:text-red-400">{error || aiError}</span>
          <button onClick={handleClearError} className="text-red-500 hover:text-red-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="mt-6 grid grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left Column: Files & Settings */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAllFromProduction}
                disabled={filesLoading}
                className="w-full"
              >
                Reset All to Production
              </Button>
            </div>
          </Card>

          {/* Settings */}
          <Card className="p-4">
            <button
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Sandbox Settings
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
              <div className="mt-4 space-y-4">
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
          </Card>
        </div>

        {/* Center Column: Editor with AI Tools */}
        <div className="col-span-12 lg:col-span-6">
          {selectedFileKey ? (
            <Card className="h-full flex flex-col">
              {/* AI Enhancement Toolbar */}
              {isEditing && (
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                        AI Enhancement
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAIEnhance('improve_clarity')}
                        disabled={aiEnhancing}
                        className="text-purple-600 border-purple-300 hover:bg-purple-50"
                      >
                        {aiEnhancing ? (
                          <span className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-600"></div>
                            Enhancing...
                          </span>
                        ) : (
                          'Improve Clarity'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAIEnhance('fix_errors')}
                        disabled={aiEnhancing}
                        className="text-blue-600 border-blue-300 hover:bg-blue-50"
                      >
                        Fix Errors
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAIEnhance('optimize_performance')}
                        disabled={aiEnhancing}
                        className="text-green-600 border-green-300 hover:bg-green-50"
                      >
                        Optimize
                      </Button>
                    </div>
                  </div>

                  {/* Enhancement Result Indicator */}
                  {lastEnhancement && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Last enhancement:</span>
                      {lastEnhancement.qualityScore && (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          lastEnhancement.qualityScore.overall >= 80
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : lastEnhancement.qualityScore.overall >= 60
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          Quality: {lastEnhancement.qualityScore.overall}/100
                        </span>
                      )}
                      {lastEnhancement.improvements && lastEnhancement.improvements.length > 0 && (
                        <span className="text-gray-500 dark:text-gray-400">
                          {lastEnhancement.improvements.length} improvements applied
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 min-h-0">
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
              </div>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center text-gray-500 dark:text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-lg font-medium">Select a file to edit</p>
                <p className="text-sm mt-1">Choose a prompt file from the list on the left</p>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Comparison */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          {viewMode === 'compare' ? (
            <>
              <Card className="p-4">
                <ComparisonTestPicker
                  availableTests={availableTests}
                  selectedTestIds={selectedTestIds}
                  onToggleTest={handleToggleTest}
                  onSelectAll={handleSelectAllTests}
                  onDeselectAll={handleDeselectAllTests}
                />
              </Card>
              <ComparisonRunner
                selectedTestIds={selectedTestIds}
                sandboxes={sandboxes}
                isRunning={comparisonState.isRunning}
                progress={comparisonState.progress}
                onStartComparison={handleStartComparison}
              />
            </>
          ) : (
            <Card className="p-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Quick Actions
              </h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setViewMode('compare')}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Run Comparison
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleCopyAllFromProduction}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset All Files
                </Button>
              </div>

              {/* Recent Comparison Results Preview */}
              {comparisonState.lastResult && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Last Comparison
                  </h4>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex justify-between">
                      <span>Tests:</span>
                      <span className="font-medium">{comparisonState.lastResult.testIds?.length || 0}</span>
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => setViewMode('compare')}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Comparison Results (shown when in compare mode) */}
      {viewMode === 'compare' && comparisonState.lastResult && (
        <Card className="mt-6 p-6">
          <ComparisonResults
            result={comparisonState.lastResult}
            onViewDetails={handleViewDetails}
          />
        </Card>
      )}

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
    </div>
  );
}

export default SandboxLabPage;

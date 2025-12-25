/**
 * Agent Tuning Page
 * Manage AI-generated fixes and prompt versions
 */

import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { PageHeader } from '../../components/layout';
import { Button, Card } from '../../components/ui';
import {
  fetchFixes,
  fetchPromptFiles,
  fetchPromptHistory,
  applyFixToPrompt,
  updateFixStatus,
  selectFixes,
  selectPromptFiles,
  selectPromptHistory,
  selectPromptLoading,
  selectFixesLoading,
} from '../../store/slices/testMonitorSlice';
import type { GeneratedFix, PromptFile } from '../../types/testMonitor.types';

export function AgentTuning() {
  const dispatch = useAppDispatch();

  const fixes = useAppSelector(selectFixes);
  const promptFiles = useAppSelector(selectPromptFiles);
  const promptHistory = useAppSelector(selectPromptHistory);
  const promptLoading = useAppSelector(selectPromptLoading);
  const fixesLoading = useAppSelector(selectFixesLoading);

  const [selectedFix, setSelectedFix] = useState<GeneratedFix | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Fetch data on mount
  useEffect(() => {
    dispatch(fetchPromptFiles());
    // Fetch fixes from latest run
    dispatch(fetchFixes('latest'));
  }, [dispatch]);

  // Filter pending fixes
  const pendingFixes = fixes.filter((f) => f.status === 'pending');
  const appliedFixes = fixes.filter((f) => f.status === 'applied');

  // Handle apply fix
  const handleApplyFix = async (fix: GeneratedFix) => {
    const targetFile = promptFiles.find((f) => f.filePath.includes(fix.targetFile));
    if (targetFile) {
      await dispatch(applyFixToPrompt({ fixId: fix.fixId, fileKey: targetFile.fileKey })).unwrap();
      dispatch(fetchPromptFiles());
    }
  };

  // Handle reject fix
  const handleRejectFix = (fix: GeneratedFix) => {
    dispatch(updateFixStatus({ fixId: fix.fixId, status: 'rejected' }));
  };

  // Handle select prompt file
  const handleSelectFile = (fileKey: string) => {
    setSelectedFile(fileKey);
    dispatch(fetchPromptHistory(fileKey));
  };

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

      <div className="grid grid-cols-12 gap-6 mt-6 flex-1 min-h-0">
        {/* Left Column - Fixes */}
        <div className="col-span-5 flex flex-col gap-6">
          {/* Pending Fixes */}
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

              {fixesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                </div>
              ) : pendingFixes.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-2">No pending fixes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingFixes.map((fix) => (
                    <div
                      key={fix.fixId}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        selectedFix?.fixId === fix.fixId
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedFix(fix)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs rounded uppercase ${getPriorityColor(fix.priority)}`}>
                              {fix.priority}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                              {fix.type}
                            </span>
                          </div>
                          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white truncate">
                            {fix.changeDescription}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Target: {fix.targetFile}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            <div className={`w-16 h-2 rounded-full overflow-hidden ${
                              fix.confidence >= 80 ? 'bg-green-200 dark:bg-green-900/30' :
                              fix.confidence >= 60 ? 'bg-yellow-200 dark:bg-yellow-900/30' :
                              'bg-red-200 dark:bg-red-900/30'
                            }`}>
                              <div
                                className={`h-full ${
                                  fix.confidence >= 80 ? 'bg-green-500' :
                                  fix.confidence >= 60 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${fix.confidence}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{fix.confidence}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={(e) => { e.stopPropagation(); handleApplyFix(fix); }}
                        >
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleRejectFix(fix); }}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

        {/* Right Column - Fix Details & Prompt Versions */}
        <div className="col-span-7 flex flex-col gap-6">
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
                    {promptHistory.map((version) => (
                      <div
                        key={version.id}
                        className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900 dark:text-white">
                            Version {version.version}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(version.createdAt).toLocaleString()}
                          </span>
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
                    ))}
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
    </div>
  );
}

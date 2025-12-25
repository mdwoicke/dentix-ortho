/**
 * FixesPanel Component
 * Displays generated fixes with copy-to-clipboard functionality
 * Includes "Copy Full Prompt" dropdown and fix application flow
 */

import React, { useState, useRef, useEffect } from 'react';
import { Spinner } from '../../ui';
import type { GeneratedFix, PromptFile } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';

interface FixesPanelProps {
  fixes: GeneratedFix[];
  loading?: boolean;
  promptFiles?: PromptFile[];
  onUpdateStatus?: (fixId: string, status: 'applied' | 'rejected') => void;
  onApplyFix?: (fixId: string, fileKey: string) => Promise<void>;
  onCopyFullPrompt?: (fileKey: string) => Promise<string | null>;
  onRunDiagnosis?: () => Promise<void>;
  diagnosisRunning?: boolean;
  hasFailedTests?: boolean;
}

const priorityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-200 dark:border-red-700',
  high: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-200 dark:border-orange-700',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/50 dark:text-yellow-200 dark:border-yellow-700',
  low: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700',
};

const typeColors: Record<string, string> = {
  prompt: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
  tool: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200',
};

const statusColors: Record<string, string> = {
  pending: 'text-yellow-600 dark:text-yellow-400',
  applied: 'text-green-600 dark:text-green-400',
  rejected: 'text-gray-500 dark:text-gray-400',
  verified: 'text-blue-600 dark:text-blue-400',
};

export function FixesPanel({
  fixes,
  loading,
  promptFiles = [],
  onUpdateStatus,
  onApplyFix,
  onCopyFullPrompt,
  onRunDiagnosis,
  diagnosisRunning,
  hasFailedTests,
}: FixesPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedFullPromptId, setCopiedFullPromptId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [applyModalOpen, setApplyModalOpen] = useState<string | null>(null);
  const [selectedFileKey, setSelectedFileKey] = useState<string>('');
  const [applying, setApplying] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleExpand = (fixId: string) => {
    setExpanded(prev => ({ ...prev, [fixId]: !prev[fixId] }));
  };

  const handleCopy = async (fixId: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(fixId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyFullPrompt = async (fixId: string, fileKey: string) => {
    if (!onCopyFullPrompt) return;

    try {
      const content = await onCopyFullPrompt(fileKey);
      if (content) {
        await navigator.clipboard.writeText(content);
        setCopiedFullPromptId(`${fixId}-${fileKey}`);
        setTimeout(() => setCopiedFullPromptId(null), 2000);
      }
    } catch (err) {
      console.error('Failed to copy full prompt:', err);
    }
    setDropdownOpen(null);
  };

  const handleApplyFix = async (fixId: string) => {
    if (!onApplyFix || !selectedFileKey) return;

    setApplying(true);
    try {
      await onApplyFix(fixId, selectedFileKey);
      setApplyModalOpen(null);
      setSelectedFileKey('');
    } catch (err) {
      console.error('Failed to apply fix:', err);
    } finally {
      setApplying(false);
    }
  };

  const openApplyModal = (fixId: string, fix: GeneratedFix) => {
    // Smart file selection based on targetFile and fix type
    const targetLower = fix.targetFile?.toLowerCase() || '';

    // Find best matching file from available promptFiles
    let defaultFile = '';

    // 1. Try to match targetFile against promptFile fileKeys or displayNames
    if (promptFiles.length > 0) {
      // Check for scheduling-related files (schedule, scheduling, appointment)
      if (targetLower.includes('schedule') || targetLower.includes('appointment')) {
        const schedulingFile = promptFiles.find(f =>
          f.fileKey.includes('scheduling') ||
          f.fileKey.includes('schedule') ||
          f.displayName.toLowerCase().includes('scheduling')
        );
        if (schedulingFile) defaultFile = schedulingFile.fileKey;
      }
      // Check for patient-related files
      else if (targetLower.includes('patient')) {
        const patientFile = promptFiles.find(f =>
          f.fileKey.includes('patient') ||
          f.displayName.toLowerCase().includes('patient')
        );
        if (patientFile) defaultFile = patientFile.fileKey;
      }
    }

    // 2. If no match found, use fix type as fallback
    if (!defaultFile) {
      if (fix.type === 'tool') {
        // For tool fixes, try to find a tool file, not the system prompt
        const toolFile = promptFiles.find(f =>
          f.fileKey.includes('tool') ||
          f.displayName.toLowerCase().includes('tool')
        );
        defaultFile = toolFile?.fileKey || 'system_prompt';
      } else {
        defaultFile = 'system_prompt';
      }
    }

    // 3. Final fallback: use first available file
    if (!defaultFile && promptFiles.length > 0) {
      defaultFile = promptFiles[0].fileKey;
    }

    setSelectedFileKey(defaultFile);
    setApplyModalOpen(fixId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (fixes.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          No fixes generated.
          {hasFailedTests && ' Run diagnosis to analyze test failures.'}
          {!hasFailedTests && ' All tests passed - no failures to analyze.'}
        </p>
        {onRunDiagnosis && hasFailedTests && (
          <button
            onClick={onRunDiagnosis}
            disabled={diagnosisRunning}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              diagnosisRunning
                ? 'bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            )}
          >
            {diagnosisRunning ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" /> Running Diagnosis...
              </span>
            ) : (
              '🔍 Run Diagnosis'
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fixes.map((fix, index) => {
        const isExpanded = expanded[fix.fixId];
        const isCopied = copiedId === fix.fixId;
        const isDropdownOpen = dropdownOpen === fix.fixId;
        const isApplyModalOpen = applyModalOpen === fix.fixId;

        return (
          <div
            key={fix.fixId}
            className={cn(
              'border rounded-lg overflow-hidden transition-all',
              priorityColors[fix.priority]
            )}
          >
            {/* Header */}
            <div
              onClick={() => toggleExpand(fix.fixId)}
              className="flex items-start justify-between p-3 cursor-pointer hover:opacity-90 transition-opacity gap-3"
            >
              <div className="flex flex-col gap-1.5 min-w-0">
                {/* Row 1: Number, Type, Priority */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold shrink-0">#{index + 1}</span>
                  <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded shrink-0', typeColors[fix.type])}>
                    {fix.type.toUpperCase()}
                  </span>
                  <span className="text-xs font-medium uppercase px-1.5 py-0.5 rounded bg-white/50 dark:bg-black/20 shrink-0">
                    {fix.priority}
                  </span>
                </div>
                {/* Row 2: Confidence, Status */}
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/50 dark:bg-black/20 whitespace-nowrap">
                    {Math.round(fix.confidence * 100)}% confidence
                  </span>
                  <span className={cn('text-xs font-medium whitespace-nowrap', statusColors[fix.status])}>
                    [{fix.status}]
                  </span>
                </div>
              </div>
              {/* Right side: Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(fix.fixId, fix.changeCode);
                  }}
                  className={cn(
                    'px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap',
                    isCopied
                      ? 'bg-green-500 text-white'
                      : 'bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50'
                  )}
                  title="Copy code snippet to clipboard"
                >
                  {isCopied ? '✓' : '📋'} Snippet
                </button>

                {/* Copy Full Prompt dropdown */}
                {promptFiles.length > 0 && onCopyFullPrompt && (
                  <div className="relative" ref={isDropdownOpen ? dropdownRef : undefined}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdownOpen(isDropdownOpen ? null : fix.fixId);
                      }}
                      className="px-2 py-1 text-xs font-medium rounded transition-colors bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50 whitespace-nowrap"
                      title="Copy full prompt with fix applied"
                    >
                      📄 Full ▾
                    </button>
                    {isDropdownOpen && (
                      <div className="absolute right-0 top-full mt-1 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden min-w-[150px]">
                        {promptFiles.map(file => {
                          const isCopiedFull = copiedFullPromptId === `${fix.fixId}-${file.fileKey}`;
                          return (
                            <button
                              key={file.fileKey}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyFullPrompt(fix.fixId, file.fileKey);
                              }}
                              className={cn(
                                'w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between',
                                isCopiedFull && 'bg-green-50 dark:bg-green-900/30'
                              )}
                            >
                              <span>{file.displayName}</span>
                              <span className="text-gray-400 dark:text-gray-500">v{file.version}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <span className="text-gray-600 dark:text-gray-300">
                  {isExpanded ? '−' : '+'}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="px-3 pb-2 text-sm font-medium">
              {fix.changeDescription}
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="p-3 bg-white/50 dark:bg-black/20 border-t border-current/20 space-y-3">
                {/* Target & Location */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-xs font-medium uppercase opacity-70">Target File</span>
                    <p className="font-mono text-xs">{fix.targetFile}</p>
                  </div>
                  {fix.location && (
                    <div>
                      <span className="text-xs font-medium uppercase opacity-70">Location</span>
                      <p className="font-mono text-xs">
                        {fix.location.section || fix.location.function || 'N/A'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Root Cause */}
                {fix.rootCause && (
                  <div>
                    <span className="text-xs font-medium uppercase opacity-70">Root Cause</span>
                    <p className="text-sm">
                      <span className="font-medium">{fix.rootCause.type}</span>
                      {fix.rootCause.evidence.length > 0 && (
                        <span className="text-xs opacity-70 ml-2">
                          ({fix.rootCause.evidence.length} evidence)
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* Affected Tests */}
                {fix.affectedTests.length > 0 && (
                  <div>
                    <span className="text-xs font-medium uppercase opacity-70">Affected Tests</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {fix.affectedTests.map(test => (
                        <span
                          key={test}
                          className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded"
                        >
                          {test}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Code Block */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium uppercase opacity-70">Suggested Code</span>
                    <button
                      onClick={() => handleCopy(fix.fixId, fix.changeCode)}
                      className={cn(
                        'px-2 py-0.5 text-xs font-medium rounded transition-colors',
                        isCopied
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                      )}
                    >
                      {isCopied ? '✓ Copied!' : 'Copy Code'}
                    </button>
                  </div>
                  <pre className="p-3 bg-gray-900 text-gray-100 text-xs rounded overflow-x-auto max-h-64">
                    <code>{fix.changeCode}</code>
                  </pre>
                </div>

                {/* Action Buttons */}
                {fix.status === 'pending' && (onUpdateStatus || onApplyFix) && (
                  <div className="flex gap-2 pt-2 border-t border-current/20">
                    {onApplyFix && promptFiles.length > 0 ? (
                      <button
                        onClick={() => openApplyModal(fix.fixId, fix)}
                        className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors"
                      >
                        ✓ Apply Fix
                      </button>
                    ) : onUpdateStatus && (
                      <button
                        onClick={() => onUpdateStatus(fix.fixId, 'applied')}
                        className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors"
                      >
                        ✓ Mark Applied
                      </button>
                    )}
                    {onUpdateStatus && (
                      <button
                        onClick={() => onUpdateStatus(fix.fixId, 'rejected')}
                        className="flex-1 px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded transition-colors"
                      >
                        ✗ Reject
                      </button>
                    )}
                  </div>
                )}

                {/* Apply Fix Modal */}
                {isApplyModalOpen && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setApplyModalOpen(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                      <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Apply Fix</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                        Select which file to apply this fix to:
                      </p>
                      <select
                        value={selectedFileKey}
                        onChange={(e) => setSelectedFileKey(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg mb-4 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {promptFiles.map(file => (
                          <option key={file.fileKey} value={file.fileKey}>
                            {file.displayName} (v{file.version})
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApplyFix(fix.fixId)}
                          disabled={applying || !selectedFileKey}
                          className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
                        >
                          {applying ? 'Applying...' : 'Apply'}
                        </button>
                        <button
                          onClick={() => setApplyModalOpen(null)}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Already actioned */}
                {fix.status !== 'pending' && (
                  <div className={cn('text-center py-2 text-sm font-medium', statusColors[fix.status])}>
                    {fix.status === 'applied' && '✓ This fix has been applied'}
                    {fix.status === 'rejected' && '✗ This fix was rejected'}
                    {fix.status === 'verified' && '✓ This fix was verified to work'}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

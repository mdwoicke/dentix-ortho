/**
 * AI Prompting Page
 * AI-powered prompt enhancement with templates, web search, and quality scoring
 */

import React, { useState, useEffect } from 'react';
import type {
  EnhanceResult,
  EnhancementTemplate,
  EnhancementHistory,
  QualityScore,
  ReferenceDocument,
  PromptContext,
} from '../../types/aiPrompting.types';
import {
  FILE_KEY_DISPLAY_NAMES,
} from '../../types/aiPrompting.types';
import ReferenceDocuments from '../../components/features/aiPrompting/ReferenceDocuments';
import type { PromptFile, PromptVersionHistory, PromptContent } from '../../types/testMonitor.types';
import * as testMonitorApi from '../../services/api/testMonitorApi';

// Content viewer state type
interface ContentViewState {
  content: string;
  version: number;
  isLoading: boolean;
}

// File icons for each prompt type
const FILE_ICONS: Record<string, React.ReactNode> = {
  system_prompt: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  patient_tool: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
  scheduling_tool: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
};

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Format time ago utility
 */
const formatTimeAgo = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

/**
 * AI Loading Animation Component - Professional animated loader for AI operations
 */
const AILoadingAnimation: React.FC<{
  message?: string;
  subMessage?: string;
}> = ({ message = 'Analyzing and optimizing...', subMessage }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Animated AI Icon Container */}
      <div className="relative w-24 h-24 mb-6">
        {/* Outer rotating ring */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-purple-500 border-r-blue-500 animate-spin" style={{ animationDuration: '3s' }}></div>

        {/* Middle pulsing ring */}
        <div className="absolute inset-2 rounded-full border border-purple-300 dark:border-purple-700 animate-pulse"></div>

        {/* Inner gradient background */}
        <div className="absolute inset-4 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-indigo-600 opacity-20 animate-pulse"></div>

        {/* Center brain/AI icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-10 h-10 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>

        {/* Orbiting dots */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '4s' }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-purple-500 rounded-full"></div>
        </div>
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '4s', animationDelay: '1.33s' }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
        </div>
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '4s', animationDelay: '2.66s' }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-indigo-500 rounded-full"></div>
        </div>
      </div>

      {/* Text content */}
      <div className="text-center space-y-2">
        <p className="text-lg font-medium bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 dark:from-purple-400 dark:via-blue-400 dark:to-indigo-400 bg-clip-text text-transparent animate-pulse">
          {message}
        </p>
        {subMessage && (
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
            <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="inline-block w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
            <span className="inline-block w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            <span className="ml-1">{subMessage}</span>
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * Prompt File List Component - Shows all prompt files with versions
 */
const PromptFileList: React.FC<{
  files: PromptFile[];
  selectedFileKey: string;
  loading?: boolean;
  context?: PromptContext;
  copyingFile?: string | null;
  onSelectFile: (fileKey: string) => void;
  onCopyFromProduction?: (fileKey: string) => void;
}> = ({ files, selectedFileKey, loading = false, context = 'production', copyingFile, onSelectFile, onCopyFromProduction }) => {
  if (loading && files.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isSandbox = context !== 'production';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Prompt Files
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {files.length} files
        </span>
      </div>

      {files.map(file => {
        const isSelected = selectedFileKey === file.fileKey;
        const fileExists = file.exists !== false; // true for production (undefined) or sandbox files that exist
        const isCopying = copyingFile === file.fileKey;

        return (
          <div
            key={file.fileKey}
            onClick={() => fileExists && onSelectFile(file.fileKey)}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all border ${
              !fileExists
                ? 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 cursor-default'
                : isSelected
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 cursor-pointer'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded ${
                !fileExists
                  ? 'text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700'
                  : isSelected
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50'
                  : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700'
              }`}>
                {FILE_ICONS[file.fileKey] || FILE_ICONS.system_prompt}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${
                    !fileExists
                      ? 'text-gray-500 dark:text-gray-400'
                      : isSelected
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-gray-900 dark:text-white'
                  }`}>
                    {FILE_KEY_DISPLAY_NAMES[file.fileKey] || file.displayName}
                  </span>

                  {fileExists ? (
                    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                      isSelected
                        ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                    }`}>
                      v{file.version}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      Not in sandbox
                    </span>
                  )}
                </div>

                {fileExists && file.updatedAt && (
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <span>Updated {formatTimeAgo(file.updatedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {!fileExists && isSandbox && onCopyFromProduction ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyFromProduction(file.fileKey);
                }}
                disabled={isCopying}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
              >
                {isCopying ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                    <span>Copying...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy from Prod</span>
                  </>
                )}
              </button>
            ) : fileExists ? (
              <svg
                className={`w-4 h-4 transition-transform ${
                  isSelected ? 'rotate-90 text-blue-500' : 'text-gray-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

/**
 * AI Enhancements List Component - Shows pending and applied AI-generated enhancements
 */
const AIEnhancementsList: React.FC<{
  enhancements: EnhancementHistory[];
  selectedEnhancementId: string | null;
  currentPreview: EnhanceResult | null;
  loading?: boolean;
  onSelectEnhancement: (enhancementId: string) => void;
  onApplyEnhancement: (enhancementId: string) => void;
  onPromoteEnhancement: (enhancementId: string) => void;
  onDiscardEnhancement: (enhancementId: string) => void;
}> = ({
  enhancements,
  selectedEnhancementId,
  currentPreview,
  loading = false,
  onSelectEnhancement,
  onApplyEnhancement,
  onPromoteEnhancement,
  onDiscardEnhancement,
}) => {
  // Count enhancements by status
  const pendingCount = enhancements.filter(e => e.status === 'pending' || e.status === 'completed').length;
  const appliedCount = enhancements.filter(e => e.status === 'applied').length;
  const hasCurrentPreview = currentPreview !== null;

  // Get enhancements that are ready to apply (completed) or promote (applied)
  const completedEnhancements = enhancements.filter(e => e.status === 'completed' || e.status === 'pending');
  const appliedEnhancements = enhancements.filter(e => e.status === 'applied');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          AI Enhancements
        </h3>
        <div className="flex gap-2 text-xs">
          {(pendingCount > 0 || hasCurrentPreview) && (
            <span className="text-yellow-600 dark:text-yellow-400">
              {pendingCount + (hasCurrentPreview ? 1 : 0)} pending
            </span>
          )}
          {appliedCount > 0 && (
            <span className="text-green-600 dark:text-green-400">
              {appliedCount} ready
            </span>
          )}
        </div>
      </div>

      {loading && enhancements.length === 0 && !currentPreview && (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
        </div>
      )}

      {!loading && enhancements.length === 0 && !currentPreview && (
        <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
          No AI enhancements yet.
          <br />
          <span className="text-xs">Generate one using the command panel →</span>
        </div>
      )}

      {/* Current Preview (unsaved) */}
      {currentPreview && (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border-2 border-dashed border-purple-400 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/20">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                  Current Preview
                </span>
                <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200">
                  Unsaved
                </span>
              </div>
              <div className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">
                {FILE_KEY_DISPLAY_NAMES[currentPreview.fileKey] || currentPreview.fileKey}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Applied Enhancements - Ready to Promote */}
      {appliedEnhancements.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide px-1">
            Ready to Promote
          </div>
          {appliedEnhancements.map(enhancement => {
            const isSelected = selectedEnhancementId === enhancement.enhancementId;

            return (
              <div
                key={enhancement.enhancementId}
                onClick={() => onSelectEnhancement(enhancement.enhancementId)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                  isSelected
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 hover:bg-green-50 dark:hover:bg-green-900/20'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`p-1.5 rounded flex-shrink-0 ${
                    isSelected
                      ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50'
                      : 'text-green-500 dark:text-green-500 bg-green-100 dark:bg-green-900/30'
                  }`}>
                    {FILE_ICONS[enhancement.fileKey] || FILE_ICONS.system_prompt}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={`text-sm font-medium truncate ${
                        isSelected
                          ? 'text-green-700 dark:text-green-300'
                          : 'text-green-800 dark:text-green-300'
                      }`}>
                        {FILE_KEY_DISPLAY_NAMES[enhancement.fileKey] || enhancement.fileKey}
                      </span>
                      <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 flex-shrink-0">
                        Applied
                      </span>
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-500 mt-0.5 truncate">
                      {enhancement.command.substring(0, 20)}...
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPromoteEnhancement(enhancement.enhancementId);
                    }}
                    className="px-1.5 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
                    title="Promote to Production"
                  >
                    Promote
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDiscardEnhancement(enhancement.enhancementId);
                    }}
                    className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-colors"
                    title="Discard"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed Enhancements - Ready to Apply */}
      {completedEnhancements.length > 0 && (
        <div className="space-y-2">
          {appliedEnhancements.length > 0 && (
            <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wide px-1 mt-3">
              Pending Review
            </div>
          )}
          {completedEnhancements.map(enhancement => {
            const isSelected = selectedEnhancementId === enhancement.enhancementId;

            return (
              <div
                key={enhancement.enhancementId}
                onClick={() => onSelectEnhancement(enhancement.enhancementId)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                  isSelected
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`p-1.5 rounded flex-shrink-0 ${
                    isSelected
                      ? 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50'
                      : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700'
                  }`}>
                    {FILE_ICONS[enhancement.fileKey] || FILE_ICONS.system_prompt}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={`text-sm font-medium truncate ${
                        isSelected
                          ? 'text-purple-700 dark:text-purple-300'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {FILE_KEY_DISPLAY_NAMES[enhancement.fileKey] || enhancement.fileKey}
                      </span>
                      <span className={`px-1.5 py-0.5 text-xs font-medium rounded flex-shrink-0 ${
                        isSelected
                          ? 'bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200'
                          : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400'
                      }`}>
                        Pending
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {enhancement.command.substring(0, 20)}...
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onApplyEnhancement(enhancement.enhancementId);
                    }}
                    className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 rounded transition-colors"
                    title="Apply"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDiscardEnhancement(enhancement.enhancementId);
                    }}
                    className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-colors"
                    title="Discard"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Apply Description Modal - Gets user description when applying enhancement
 */
const ApplyDescriptionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (description: string) => void;
  isLoading: boolean;
  defaultDescription: string;
}> = ({ isOpen, onClose, onConfirm, isLoading, defaultDescription }) => {
  const [description, setDescription] = useState(defaultDescription);

  useEffect(() => {
    setDescription(defaultDescription);
  }, [defaultDescription]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6 mx-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Apply Enhancement
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Add a description for this version change (optional). A default description will be used if left empty.
        </p>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Version Description
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Enter a description for this change..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Default: {defaultDescription}
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(description)}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {isLoading ? 'Applying...' : 'Apply Enhancement'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Quality Score Card Component
 */
const QualityScoreCard: React.FC<{
  score: QualityScore;
  label: string;
  comparison?: { before: number; after: number };
}> = ({ score, label, comparison }) => {
  const getColorClass = (value: number) => {
    if (value >= 80) return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
    if (value >= 60) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
      <h4 className="font-medium text-gray-700 dark:text-gray-200 mb-2">{label}</h4>
      <div className="flex items-center gap-4 mb-4">
        <div className={`text-3xl font-bold px-4 py-2 rounded-lg ${getColorClass(score.overall)}`}>
          {Math.round(score.overall)}
        </div>
        {comparison && (
          <div className="text-sm">
            <span className={comparison.after > comparison.before ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {comparison.after > comparison.before ? '+' : ''}{Math.round(comparison.after - comparison.before)} pts
            </span>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {Object.entries(score.dimensions).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 w-24 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${value}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-300 w-8">{value}</span>
          </div>
        ))}
      </div>
      {/* Content Metrics - Token, Char, Line Count */}
      {(score.tokenCount !== undefined || score.charCount !== undefined || score.lineCount !== undefined) && (
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Content Metrics</h5>
          <div className="grid grid-cols-3 gap-2 text-center">
            {score.tokenCount !== undefined && (
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded p-2">
                <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  {score.tokenCount.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Tokens</div>
              </div>
            )}
            {score.charCount !== undefined && (
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded p-2">
                <div className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                  {score.charCount.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Characters</div>
              </div>
            )}
            {score.lineCount !== undefined && (
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded p-2">
                <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                  {score.lineCount.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Lines</div>
              </div>
            )}
          </div>
        </div>
      )}
      {score.suggestions.length > 0 && (
        <div className="mt-4">
          <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Suggestions</h5>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
            {score.suggestions.slice(0, 3).map((s, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-blue-500">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * Template Button Component
 */
const TemplateButton: React.FC<{
  template: EnhancementTemplate;
  onClick: () => void;
  isSelected: boolean;
}> = ({ template, onClick, isSelected }) => {
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      examples: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      clarity: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
      'edge-cases': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
      format: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
      validation: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
      custom: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    };
    return colors[category] || colors.custom;
  };

  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border-2 text-left transition-all bg-white dark:bg-gray-800 ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs px-2 py-0.5 rounded ${getCategoryColor(template.category)}`}>
          {template.category}
        </span>
        {template.useWebSearch && (
          <span className="text-xs text-gray-400" title="Uses web search">
            🔍
          </span>
        )}
      </div>
      <h4 className="font-medium text-gray-800 dark:text-white">{template.name}</h4>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{template.description}</p>
    </button>
  );
};

/**
 * Diff View Component - Shows changes in traditional patch format
 */
const DiffView: React.FC<{ diff: EnhanceResult['diff'] }> = ({ diff }) => {
  if (diff.hunks.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm italic p-4">
        No changes detected
      </div>
    );
  }

  return (
    <div className="font-mono text-sm bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex gap-4 p-2 bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400">
        <span className="text-green-600 dark:text-green-400">+{diff.additions} additions</span>
        <span className="text-red-600 dark:text-red-400">-{diff.deletions} deletions</span>
      </div>
      <div className="max-h-96 overflow-auto">
        {diff.hunks.map((hunk, i) => (
          <div key={i} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
            {hunk.lines.map((line, j) => (
              <div
                key={j}
                className={`px-4 py-0.5 ${
                  line.type === 'add'
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    : line.type === 'remove'
                    ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                <span className="select-none mr-2">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                <span className="whitespace-pre-wrap break-all">{line.content}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * View Mode for content display
 */
type ContentViewMode = 'highlighted' | 'diff' | 'clean';

/**
 * Highlighted Content View Component
 * Shows the full enhanced content with inline diff highlighting:
 * - Added lines: green background
 * - Removed lines: red background with strikethrough
 * - Unchanged lines: normal background
 *
 * This creates a unified view of the document showing all changes in context.
 */
const HighlightedContentView: React.FC<{
  originalContent: string;
  enhancedContent: string;
  diff: EnhanceResult['diff'];
}> = ({ originalContent, enhancedContent, diff }) => {
  // Build a unified view by merging original and enhanced content
  // showing additions in green and removals in red

  const originalLines = originalContent.split('\n');
  const enhancedLines = enhancedContent.split('\n');

  // Create a map of line changes from the diff
  interface UnifiedLine {
    content: string;
    type: 'add' | 'remove' | 'context';
    lineNumber: number;
  }

  const unifiedLines: UnifiedLine[] = [];

  // Track positions in both original and enhanced
  let origIdx = 0;
  let enhIdx = 0;
  let displayLineNum = 1;

  // Process each hunk
  for (const hunk of diff.hunks) {
    // Add context lines before this hunk (from enhanced content)
    while (enhIdx < hunk.newStart - 1 && enhIdx < enhancedLines.length) {
      unifiedLines.push({
        content: enhancedLines[enhIdx],
        type: 'context',
        lineNumber: displayLineNum++,
      });
      enhIdx++;
      origIdx++;
    }

    // Process lines in this hunk
    for (const line of hunk.lines) {
      if (line.type === 'remove') {
        unifiedLines.push({
          content: line.content,
          type: 'remove',
          lineNumber: displayLineNum, // Don't increment for removed lines
        });
        origIdx++;
      } else if (line.type === 'add') {
        unifiedLines.push({
          content: line.content,
          type: 'add',
          lineNumber: displayLineNum++,
        });
        enhIdx++;
      } else {
        unifiedLines.push({
          content: line.content,
          type: 'context',
          lineNumber: displayLineNum++,
        });
        origIdx++;
        enhIdx++;
      }
    }
  }

  // Add remaining context lines after the last hunk
  while (enhIdx < enhancedLines.length) {
    unifiedLines.push({
      content: enhancedLines[enhIdx],
      type: 'context',
      lineNumber: displayLineNum++,
    });
    enhIdx++;
  }

  // If no hunks (no changes), just show enhanced content as context
  if (diff.hunks.length === 0) {
    return (
      <div className="font-mono text-sm bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
        <div className="flex gap-4 p-2 bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400">
          <span>No changes - content unchanged</span>
        </div>
        <div className="max-h-[600px] overflow-auto">
          {enhancedLines.map((line, i) => (
            <div key={i} className="flex">
              <span className="select-none w-12 px-2 py-0.5 text-right text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
                {i + 1}
              </span>
              <span className="flex-1 px-4 py-0.5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
                {line || ' '}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono text-sm bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex gap-4 p-2 bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400">
        <span className="text-green-600 dark:text-green-400">+{diff.additions} additions</span>
        <span className="text-red-600 dark:text-red-400">-{diff.deletions} deletions</span>
        <span className="ml-auto text-gray-500">Highlighted Preview</span>
      </div>
      <div className="max-h-[600px] overflow-auto">
        {unifiedLines.map((line, i) => (
          <div
            key={i}
            className={`flex ${
              line.type === 'add'
                ? 'bg-green-50 dark:bg-green-900/30'
                : line.type === 'remove'
                ? 'bg-red-50 dark:bg-red-900/30'
                : ''
            }`}
          >
            {/* Line number column */}
            <span className={`select-none w-12 px-2 py-0.5 text-right border-r ${
              line.type === 'add'
                ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50 border-green-200 dark:border-green-800'
                : line.type === 'remove'
                ? 'text-red-400 dark:text-red-500 bg-red-100 dark:bg-red-900/50 border-red-200 dark:border-red-800'
                : 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
            }`}>
              {line.type === 'remove' ? '' : line.lineNumber}
            </span>

            {/* Change indicator column */}
            <span className={`select-none w-6 px-1 py-0.5 text-center ${
              line.type === 'add'
                ? 'text-green-600 dark:text-green-400 font-bold'
                : line.type === 'remove'
                ? 'text-red-600 dark:text-red-400 font-bold'
                : 'text-gray-300 dark:text-gray-600'
            }`}>
              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
            </span>

            {/* Content column */}
            <span className={`flex-1 px-2 py-0.5 whitespace-pre-wrap break-all ${
              line.type === 'add'
                ? 'text-green-800 dark:text-green-300'
                : line.type === 'remove'
                ? 'text-red-700 dark:text-red-400 line-through opacity-75'
                : 'text-gray-800 dark:text-gray-200'
            }`}>
              {line.content || ' '}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * View Mode Toggle Component
 */
const ViewModeToggle: React.FC<{
  mode: ContentViewMode;
  onChange: (mode: ContentViewMode) => void;
}> = ({ mode, onChange }) => {
  return (
    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 text-sm">
      <button
        onClick={() => onChange('highlighted')}
        className={`px-3 py-1.5 rounded-md transition-colors ${
          mode === 'highlighted'
            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
        }`}
        title="Show full content with inline highlighting"
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Highlighted
        </span>
      </button>
      <button
        onClick={() => onChange('diff')}
        className={`px-3 py-1.5 rounded-md transition-colors ${
          mode === 'diff'
            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
        }`}
        title="Show only changed lines"
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          Diff
        </span>
      </button>
      <button
        onClick={() => onChange('clean')}
        className={`px-3 py-1.5 rounded-md transition-colors ${
          mode === 'clean'
            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
        }`}
        title="Show final content without highlighting"
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Clean
        </span>
      </button>
    </div>
  );
};

/**
 * Popout Button Component
 */
const PopoutButton: React.FC<{
  onClick: () => void;
  title?: string;
}> = ({ onClick, title = "Open in popout" }) => {
  return (
    <button
      onClick={onClick}
      className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
      title={title}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </button>
  );
};

/**
 * Popout Modal Component for viewing code in full screen
 */
const PopoutModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  viewMode: ContentViewMode;
  onViewModeChange: (mode: ContentViewMode) => void;
  stats?: { additions?: number; deletions?: number; lines?: number };
}> = ({ isOpen, onClose, title, subtitle, children, viewMode, onViewModeChange, stats }) => {
  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-[95vw] h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
              {subtitle && (
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md truncate">{subtitle}</p>
              )}
            </div>
            {stats && (
              <div className="flex gap-3 text-sm">
                {stats.additions !== undefined && (
                  <span className="text-green-600 dark:text-green-400">
                    +{stats.additions} additions
                  </span>
                )}
                {stats.deletions !== undefined && (
                  <span className="text-red-600 dark:text-red-400">
                    -{stats.deletions} deletions
                  </span>
                )}
                {stats.lines !== undefined && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {stats.lines} lines
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ViewModeToggle mode={viewMode} onChange={onViewModeChange} />
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Area - Scrollable */}
        <div className="flex-1 min-h-0 overflow-auto">
          {children}
        </div>

        {/* Footer with keyboard shortcut hint */}
        <div className="flex-shrink-0 px-6 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
          Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
};

/**
 * Content Popout Modal - Simple modal for viewing file content in full screen
 */
const ContentPopoutModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  content: string;
  onCopy?: () => void;
}> = ({ isOpen, onClose, title, subtitle, content, onCopy }) => {
  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const lineCount = content.split('\n').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-[95vw] h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
              {subtitle && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
              )}
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {lineCount} lines
            </span>
          </div>

          <div className="flex items-center gap-3">
            {onCopy && (
              <button
                onClick={onCopy}
                className="px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              >
                Copy to clipboard
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Area - Scrollable */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="font-mono text-sm bg-gray-50 dark:bg-gray-900 m-4 rounded-lg border border-gray-200 dark:border-gray-700">
            {content.split('\n').map((line, i) => (
              <div key={i} className="flex hover:bg-gray-100 dark:hover:bg-gray-800">
                <span className="select-none w-14 px-3 py-0.5 text-right text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
                  {i + 1}
                </span>
                <span className="flex-1 px-4 py-0.5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
                  {line || ' '}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer with keyboard shortcut hint */}
        <div className="flex-shrink-0 px-6 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
          Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
};

/**
 * Popout Diff View - Full height version without max-height constraints
 */
const PopoutDiffView: React.FC<{ diff: EnhanceResult['diff'] }> = ({ diff }) => {
  if (diff.hunks.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm italic p-4 m-4">
        No changes detected
      </div>
    );
  }

  return (
    <div className="font-mono text-sm bg-gray-50 dark:bg-gray-900 m-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      {diff.hunks.map((hunk, i) => (
        <div key={i} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
          {hunk.lines.map((line, j) => (
            <div
              key={j}
              className={`px-4 py-0.5 ${
                line.type === 'add'
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                  : line.type === 'remove'
                  ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <span className="select-none mr-2">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
              </span>
              <span className="whitespace-pre-wrap break-all">{line.content}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

/**
 * Popout Highlighted View - Full height version without max-height constraints
 */
const PopoutHighlightedView: React.FC<{
  originalContent: string;
  enhancedContent: string;
  diff: EnhanceResult['diff'];
}> = ({ originalContent, enhancedContent, diff }) => {
  const enhancedLines = enhancedContent.split('\n');

  interface UnifiedLine {
    content: string;
    type: 'add' | 'remove' | 'context';
    lineNumber: number;
  }

  const unifiedLines: UnifiedLine[] = [];
  let origIdx = 0;
  let enhIdx = 0;
  let displayLineNum = 1;

  for (const hunk of diff.hunks) {
    while (enhIdx < hunk.newStart - 1 && enhIdx < enhancedLines.length) {
      unifiedLines.push({
        content: enhancedLines[enhIdx],
        type: 'context',
        lineNumber: displayLineNum++,
      });
      enhIdx++;
      origIdx++;
    }

    for (const line of hunk.lines) {
      if (line.type === 'remove') {
        unifiedLines.push({
          content: line.content,
          type: 'remove',
          lineNumber: displayLineNum,
        });
        origIdx++;
      } else if (line.type === 'add') {
        unifiedLines.push({
          content: line.content,
          type: 'add',
          lineNumber: displayLineNum++,
        });
        enhIdx++;
      } else {
        unifiedLines.push({
          content: line.content,
          type: 'context',
          lineNumber: displayLineNum++,
        });
        origIdx++;
        enhIdx++;
      }
    }
  }

  while (enhIdx < enhancedLines.length) {
    unifiedLines.push({
      content: enhancedLines[enhIdx],
      type: 'context',
      lineNumber: displayLineNum++,
    });
    enhIdx++;
  }

  if (diff.hunks.length === 0) {
    return (
      <div className="font-mono text-sm bg-gray-50 dark:bg-gray-900 m-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="p-2 bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
          No changes - content unchanged
        </div>
        {enhancedLines.map((line, i) => (
          <div key={i} className="flex">
            <span className="select-none w-12 px-2 py-0.5 text-right text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
              {i + 1}
            </span>
            <span className="flex-1 px-4 py-0.5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
              {line || ' '}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="font-mono text-sm bg-gray-50 dark:bg-gray-900 m-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      {unifiedLines.map((line, i) => (
        <div
          key={i}
          className={`flex ${
            line.type === 'add'
              ? 'bg-green-50 dark:bg-green-900/30'
              : line.type === 'remove'
              ? 'bg-red-50 dark:bg-red-900/30'
              : ''
          }`}
        >
          <span className={`select-none w-12 px-2 py-0.5 text-right border-r ${
            line.type === 'add'
              ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50 border-green-200 dark:border-green-800'
              : line.type === 'remove'
              ? 'text-red-400 dark:text-red-500 bg-red-100 dark:bg-red-900/50 border-red-200 dark:border-red-800'
              : 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          }`}>
            {line.type === 'remove' ? '' : line.lineNumber}
          </span>
          <span className={`select-none w-6 px-1 py-0.5 text-center ${
            line.type === 'add'
              ? 'text-green-600 dark:text-green-400 font-bold'
              : line.type === 'remove'
              ? 'text-red-600 dark:text-red-400 font-bold'
              : 'text-gray-300 dark:text-gray-600'
          }`}>
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </span>
          <span className={`flex-1 px-2 py-0.5 whitespace-pre-wrap break-all ${
            line.type === 'add'
              ? 'text-green-800 dark:text-green-300'
              : line.type === 'remove'
              ? 'text-red-700 dark:text-red-400 line-through opacity-75'
              : 'text-gray-800 dark:text-gray-200'
          }`}>
            {line.content || ' '}
          </span>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

const AIPromptingPage: React.FC = () => {
  // State
  const [selectedContext, setSelectedContext] = useState<PromptContext>('production');
  const [promptFiles, setPromptFiles] = useState<PromptFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedFileKey, setSelectedFileKey] = useState<string>('');
  const [selectedVersion, setSelectedVersion] = useState<number | undefined>(undefined);
  const [versionHistory, setVersionHistory] = useState<PromptVersionHistory[]>([]);
  const [templates, setTemplates] = useState<EnhancementTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined);
  const [command, setCommand] = useState('');
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<EnhanceResult | null>(null);
  const [qualityScore, setQualityScore] = useState<QualityScore | null>(null);
  const [qualityScoreLoading, setQualityScoreLoading] = useState(false);
  const [enhancementHistory, setEnhancementHistory] = useState<EnhancementHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Apply modal state
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [pendingEnhancementId, setPendingEnhancementId] = useState<string | null>(null);
  // AI Enhancements list state
  const [selectedEnhancementId, setSelectedEnhancementId] = useState<string | null>(null);
  const [selectedEnhancementDetails, setSelectedEnhancementDetails] = useState<EnhancementHistory | null>(null);
  const [enhancementDetailsLoading, setEnhancementDetailsLoading] = useState(false);
  // Content viewing state
  const [contentView, setContentView] = useState<ContentViewState | null>(null);
  // Diff view mode state (for preview and enhancement details)
  const [previewViewMode, setPreviewViewMode] = useState<ContentViewMode>('highlighted');
  const [detailsViewMode, setDetailsViewMode] = useState<ContentViewMode>('highlighted');
  // Popout modal state
  const [isPreviewPopoutOpen, setIsPreviewPopoutOpen] = useState(false);
  const [isDetailsPopoutOpen, setIsDetailsPopoutOpen] = useState(false);
  const [isContentPopoutOpen, setIsContentPopoutOpen] = useState(false);
  // Reference documents state
  const [referenceDocs, setReferenceDocs] = useState<ReferenceDocument[]>([]);
  const [referenceDocsLoading, setReferenceDocsLoading] = useState(false);
  // Sandbox copy state
  const [copyingFile, setCopyingFile] = useState<string | null>(null);

  // Load initial data and when context changes
  useEffect(() => {
    loadPromptFiles();
    loadTemplates();
  }, [selectedContext]);

  // Context change handler - clears state before switching
  const handleContextChange = (newContext: PromptContext) => {
    if (newContext === selectedContext) return;

    // Clear all file-specific state
    setPreviewResult(null);
    setSelectedEnhancementId(null);
    setSelectedEnhancementDetails(null);
    setContentView(null);
    setVersionHistory([]);
    setEnhancementHistory([]);
    setQualityScore(null);
    setError(null);
    setSuccessMessage(null);

    // Update context (this triggers useEffect to reload files)
    setSelectedContext(newContext);
  };

  // Copy file from production to current sandbox
  const handleCopyFromProduction = async (fileKey: string) => {
    if (selectedContext === 'production') return;

    setCopyingFile(fileKey);
    setError(null);

    try {
      const result = await testMonitorApi.copyToSandbox(fileKey, selectedContext as 'sandbox_a' | 'sandbox_b');
      setSuccessMessage(result.message);

      // Reload files to show updated state
      await loadPromptFiles();

      // Select the newly copied file
      setSelectedFileKey(fileKey);
    } catch (err: any) {
      setError(err.message || 'Failed to copy file from production');
    } finally {
      setCopyingFile(null);
    }
  };

  // Load version history when file or context changes
  useEffect(() => {
    if (selectedFileKey) {
      loadVersionHistory();
      loadEnhancementHistory();
      loadPromptContent(); // Load content when file changes
      loadReferenceDocs(); // Load reference documents for file
      // Clear any stale enhancement selection when switching files
      setSelectedEnhancementId(null);
      setSelectedEnhancementDetails(null);
      setPreviewResult(null);
    }
  }, [selectedFileKey, selectedContext]);

  // Reload content when version selection changes
  useEffect(() => {
    if (selectedFileKey) {
      loadPromptContent();
    }
  }, [selectedVersion]);

  // Load quality score when file or version changes
  useEffect(() => {
    if (selectedFileKey) {
      loadQualityScore();
    }
  }, [selectedFileKey, selectedVersion]);

  const loadPromptFiles = async () => {
    setFilesLoading(true);
    try {
      const files = await testMonitorApi.getPromptFiles(selectedContext);
      setPromptFiles(files);
      if (files.length > 0 && !selectedFileKey) {
        setSelectedFileKey(files[0].fileKey);
      }
    } catch (err) {
      console.error('Failed to load prompt files:', err);
    } finally {
      setFilesLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const t = await testMonitorApi.getEnhancementTemplates();
      setTemplates(t);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const loadVersionHistory = async () => {
    try {
      const history = await testMonitorApi.getPromptHistory(selectedFileKey, 20, selectedContext);
      setVersionHistory(history);
    } catch (err) {
      console.error('Failed to load version history:', err);
    }
  };

  const loadEnhancementHistory = async () => {
    try {
      const history = await testMonitorApi.getEnhancementHistory(selectedFileKey, 10, selectedContext);
      setEnhancementHistory(history);
    } catch (err) {
      console.error('Failed to load enhancement history:', err);
    }
  };

  const loadPromptContent = async () => {
    if (!selectedFileKey) return;

    setContentView(prev => prev ? { ...prev, isLoading: true } : { content: '', version: 0, isLoading: true });

    try {
      let result: PromptContent;
      if (selectedVersion) {
        result = await testMonitorApi.getPromptVersionContent(selectedFileKey, selectedVersion, selectedContext);
      } else {
        result = await testMonitorApi.getPromptContent(selectedFileKey, selectedContext);
      }
      setContentView({
        content: result.content,
        version: result.version,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to load prompt content:', err);
      setContentView(prev => prev ? { ...prev, isLoading: false } : null);
    }
  };

  const loadQualityScore = async () => {
    setQualityScoreLoading(true);
    setQualityScore(null); // Clear old score immediately
    try {
      const score = await testMonitorApi.getQualityScore(selectedFileKey, selectedVersion, selectedContext);
      setQualityScore(score);
    } catch (err) {
      console.error('Failed to load quality score:', err);
    } finally {
      setQualityScoreLoading(false);
    }
  };

  // Reference documents handlers
  const loadReferenceDocs = async () => {
    if (!selectedFileKey) return;
    setReferenceDocsLoading(true);
    try {
      const docs = await testMonitorApi.getReferenceDocuments(selectedFileKey);
      setReferenceDocs(docs);
    } catch (err) {
      console.error('Failed to load reference documents:', err);
    } finally {
      setReferenceDocsLoading(false);
    }
  };

  const handleUploadReferenceDoc = async (file: File) => {
    if (!selectedFileKey) return;
    try {
      await testMonitorApi.uploadReferenceDocument(selectedFileKey, file);
      await loadReferenceDocs();
      setSuccessMessage(`Uploaded ${file.name}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to upload reference document:', err);
      setError(`Failed to upload ${file.name}`);
    }
  };

  const handleDeleteReferenceDoc = async (documentId: string) => {
    try {
      await testMonitorApi.deleteReferenceDocument(documentId);
      await loadReferenceDocs();
    } catch (err) {
      console.error('Failed to delete reference document:', err);
      setError('Failed to delete document');
    }
  };

  const handleToggleReferenceDocEnabled = async (documentId: string, isEnabled: boolean) => {
    try {
      await testMonitorApi.updateReferenceDocument(documentId, { isEnabled });
      await loadReferenceDocs();
    } catch (err) {
      console.error('Failed to toggle reference document:', err);
      setError('Failed to toggle document');
    }
  };

  const handleUpdateReferenceDocLabel = async (documentId: string, label: string) => {
    try {
      await testMonitorApi.updateReferenceDocument(documentId, { label });
      await loadReferenceDocs();
    } catch (err) {
      console.error('Failed to update reference document label:', err);
      setError('Failed to update document label');
    }
  };

  const handleTemplateSelect = (template: EnhancementTemplate) => {
    setSelectedTemplateId(template.templateId);
    setCommand(template.commandTemplate);
    setUseWebSearch(template.useWebSearch);
  };

  const handlePreview = async () => {
    if (!command && !selectedTemplateId) {
      setError('Please enter a command or select a template');
      return;
    }

    setIsPreviewLoading(true);
    setError(null);
    setPreviewResult(null);

    try {
      const result = await testMonitorApi.previewEnhancement(selectedFileKey, {
        command,
        templateId: selectedTemplateId,
        useWebSearch,
        sourceVersion: selectedVersion,
        context: selectedContext,
      });

      if (result.status === 'failed') {
        setError(result.errorMessage || 'Enhancement failed');
      } else {
        setPreviewResult(result);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to preview enhancement');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Open the apply modal to get description
  const handleApplyClick = async () => {
    if (!previewResult) return;

    setIsLoading(true);
    setError(null);

    try {
      // Save the previewed enhancement (fast - uses cached preview, no LLM call)
      // Pass the enhancementId from the preview so it just changes status to "completed"
      const enhanceResult = await testMonitorApi.enhancePrompt(selectedFileKey, {
        command,
        templateId: selectedTemplateId,
        useWebSearch,
        sourceVersion: selectedVersion,
        enhancementId: previewResult.enhancementId, // Use cached preview - no LLM call!
        context: selectedContext,
      });

      if (enhanceResult.status === 'failed') {
        setError(enhanceResult.errorMessage || 'Enhancement failed');
        setIsLoading(false);
        return;
      }

      // Store the enhancement ID and show the description modal
      setPendingEnhancementId(enhanceResult.enhancementId);
      setShowApplyModal(true);
      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create enhancement');
      setIsLoading(false);
    }
  };

  // Actually apply the enhancement with user description
  const handleApplyConfirm = async (description: string) => {
    if (!pendingEnhancementId) return;

    setIsLoading(true);
    setError(null);

    try {
      const applyResult = await testMonitorApi.applyEnhancement(
        selectedFileKey,
        pendingEnhancementId,
        description || undefined // Pass description, or undefined to use auto-generated
      );

      if (applyResult.success) {
        setSuccessMessage(`Created new version ${applyResult.newVersion} successfully!`);
        setPreviewResult(null);
        setCommand('');
        setSelectedTemplateId(undefined);
        setShowApplyModal(false);
        setPendingEnhancementId(null);
        loadVersionHistory();
        loadEnhancementHistory();
        loadQualityScore();
        loadPromptFiles(); // Refresh file list to show new version
      } else {
        setError(applyResult.error || 'Failed to apply enhancement');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to apply enhancement');
    } finally {
      setIsLoading(false);
    }
  };

  // Close apply modal without applying
  const handleApplyCancel = () => {
    setShowApplyModal(false);
    setPendingEnhancementId(null);
  };

  const handleDiscard = () => {
    setPreviewResult(null);
  };

  // Handle selecting an enhancement from the list
  const handleSelectEnhancement = async (enhancementId: string) => {
    // Toggle off if clicking the same one
    if (selectedEnhancementId === enhancementId) {
      setSelectedEnhancementId(null);
      setSelectedEnhancementDetails(null);
      return;
    }

    setSelectedEnhancementId(enhancementId);
    setEnhancementDetailsLoading(true);
    setPreviewResult(null); // Clear any current preview

    try {
      const details = await testMonitorApi.getEnhancement(enhancementId);
      setSelectedEnhancementDetails(details);
    } catch (err: any) {
      setError(err.message || 'Failed to load enhancement details');
      setSelectedEnhancementDetails(null);
    } finally {
      setEnhancementDetailsLoading(false);
    }
  };

  // Handle applying an enhancement from the list
  const handleApplyEnhancementFromList = async (enhancementId: string) => {
    setPendingEnhancementId(enhancementId);
    setShowApplyModal(true);
  };

  // Handle promoting an applied enhancement to production
  const handlePromoteEnhancement = async (enhancementId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const enhancement = enhancementHistory.find(e => e.enhancementId === enhancementId);
      if (!enhancement) {
        throw new Error('Enhancement not found');
      }

      const result = await testMonitorApi.promoteToProduction(
        enhancement.fileKey,
        enhancementId
      );

      if (result.success) {
        setSuccessMessage(`Promoted to production as version ${result.newVersion}!`);
        loadEnhancementHistory();
        loadPromptFiles(); // Refresh to show new version
        loadQualityScore();
      } else {
        setError(result.error || 'Failed to promote enhancement');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to promote enhancement');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle discarding an enhancement from the list
  const handleDiscardEnhancement = async (enhancementId: string) => {
    try {
      // Find the enhancement to get its fileKey
      const enhancement = enhancementHistory.find(e => e.enhancementId === enhancementId);
      if (!enhancement) {
        throw new Error('Enhancement not found');
      }

      // Call API to persist the discard
      await testMonitorApi.discardEnhancement(enhancement.fileKey, enhancementId);

      // Update local state
      setEnhancementHistory(prev =>
        prev.map(e => e.enhancementId === enhancementId
          ? { ...e, status: 'cancelled' as const }
          : e
        )
      );
      if (selectedEnhancementId === enhancementId) {
        setSelectedEnhancementId(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to discard enhancement');
    }
  };

  // Generate default description for the modal
  const getDefaultDescription = () => {
    const templateName = selectedTemplateId
      ? templates.find(t => t.templateId === selectedTemplateId)?.name
      : null;
    return templateName
      ? `AI Enhancement: ${templateName}`
      : `AI Enhancement: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`;
  };

  const currentFile = promptFiles.find(f => f.fileKey === selectedFileKey);

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Prompting</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Enhance prompts and tools with AI-powered improvements
          </p>
        </div>

        {/* Context Selector */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
          {(['production', 'sandbox_a', 'sandbox_b'] as const).map((ctx) => (
            <button
              key={ctx}
              onClick={() => handleContextChange(ctx)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                selectedContext === ctx
                  ? ctx === 'production'
                    ? 'bg-blue-600 text-white'
                    : ctx === 'sandbox_a'
                    ? 'bg-green-600 text-white'
                    : 'bg-purple-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {ctx === 'production' ? 'Production' : ctx === 'sandbox_a' ? 'Sandbox A' : 'Sandbox B'}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700 dark:hover:text-red-400">×</button>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm">
          {successMessage}
          <button onClick={() => setSuccessMessage(null)} className="ml-2 text-green-500 hover:text-green-700 dark:hover:text-green-400">×</button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex gap-6">
        {/* Left Panel - Prompt Files & AI Enhancements */}
        <div className="w-64 flex-shrink-0 overflow-y-auto p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
          <PromptFileList
            files={promptFiles}
            selectedFileKey={selectedFileKey}
            loading={filesLoading}
            context={selectedContext}
            copyingFile={copyingFile}
            onSelectFile={setSelectedFileKey}
            onCopyFromProduction={handleCopyFromProduction}
          />

          {/* Reference Documents for selected file */}
          {selectedFileKey && (
            <ReferenceDocuments
              fileKey={selectedFileKey}
              documents={referenceDocs}
              loading={referenceDocsLoading}
              onUpload={handleUploadReferenceDoc}
              onDelete={handleDeleteReferenceDoc}
              onToggleEnabled={handleToggleReferenceDocEnabled}
              onUpdateLabel={handleUpdateReferenceDocLabel}
            />
          )}

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <AIEnhancementsList
              enhancements={enhancementHistory}
              selectedEnhancementId={selectedEnhancementId}
              currentPreview={previewResult}
              loading={isPreviewLoading}
              onSelectEnhancement={handleSelectEnhancement}
              onApplyEnhancement={handleApplyEnhancementFromList}
              onPromoteEnhancement={handlePromoteEnhancement}
              onDiscardEnhancement={handleDiscardEnhancement}
            />
          </div>
        </div>

        {/* Middle Panel - Configuration */}
        <div className="w-96 flex-shrink-0 overflow-y-auto p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Currently Selected File - Prominent Indicator */}
          {selectedFileKey && (
            <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
                  {FILE_ICONS[selectedFileKey] || FILE_ICONS.system_prompt}
                </div>
                <div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">
                    Enhancing
                  </div>
                  <div className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                    {FILE_KEY_DISPLAY_NAMES[selectedFileKey] || selectedFileKey}
                  </div>
                </div>
                {currentFile && (
                  <div className="ml-auto">
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                      v{currentFile.version}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Version Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Source Version (optional)
            </label>
            <select
              value={selectedVersion || ''}
              onChange={e => setSelectedVersion(e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Current Version</option>
              {versionHistory.map(v => (
                <option key={v.version} value={v.version}>
                  v{v.version} - {v.changeDescription?.substring(0, 40)}...
                </option>
              ))}
            </select>
          </div>

          {/* Templates - Collapsible */}
          <details className="mb-6 border border-gray-200 dark:border-gray-700 rounded-lg">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg flex items-center justify-between">
              <span>Quick Templates ({templates.filter(t => t.isBuiltIn).length})</span>
              <svg className="w-4 h-4 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="px-3 pb-3 pt-2 grid grid-cols-2 gap-2">
              {templates.filter(t => t.isBuiltIn).map(template => (
                <TemplateButton
                  key={template.templateId}
                  template={template}
                  onClick={() => handleTemplateSelect(template)}
                  isSelected={selectedTemplateId === template.templateId}
                />
              ))}
            </div>
          </details>

          {/* Command Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Enhancement Command
            </label>
            <textarea
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="Enter your enhancement request, e.g., 'Add better examples for appointment scheduling'"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Web Search Toggle */}
          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useWebSearch}
                onChange={e => setUseWebSearch(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Search for best practices</span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
              Include prompt engineering best practices in the enhancement
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handlePreview}
              disabled={isPreviewLoading || (!command && !selectedTemplateId)}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPreviewLoading ? 'Generating...' : 'Preview Enhancement'}
            </button>
          </div>

          {/* Current Quality Score */}
          <div className="mt-6">
            {qualityScoreLoading ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
                <h4 className="font-medium text-gray-700 dark:text-gray-200 mb-3">Current Quality</h4>
                <div className="flex items-center justify-center py-6">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Analyzing prompt quality...</p>
                  </div>
                </div>
              </div>
            ) : qualityScore ? (
              <QualityScoreCard score={qualityScore} label="Current Quality" />
            ) : null}
          </div>
        </div>

        {/* Right Panel - Preview & Results */}
        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {isPreviewLoading ? (
            <div className="flex items-center justify-center h-full">
              <AILoadingAnimation
                message="Generating Optimizations..."
                subMessage={useWebSearch ? 'Searching for best practices' : undefined}
              />
            </div>
          ) : enhancementDetailsLoading ? (
            <div className="flex items-center justify-center h-full">
              <AILoadingAnimation message="Loading enhancement details..." />
            </div>
          ) : selectedEnhancementDetails ? (
            <div className="space-y-6">
              {/* Enhancement Header */}
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-purple-700 dark:text-purple-300">
                    {FILE_KEY_DISPLAY_NAMES[selectedEnhancementDetails.fileKey] || selectedEnhancementDetails.fileKey}
                  </h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    selectedEnhancementDetails.status === 'applied'
                      ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                      : selectedEnhancementDetails.status === 'promoted'
                      ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                      : 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200'
                  }`}>
                    {selectedEnhancementDetails.status.charAt(0).toUpperCase() + selectedEnhancementDetails.status.slice(1)}
                  </span>
                </div>
                <p className="text-sm text-purple-600 dark:text-purple-400 mb-2">
                  <strong>Command:</strong> {selectedEnhancementDetails.command}
                </p>
                <div className="flex gap-4 text-xs text-purple-500 dark:text-purple-400">
                  <span>Version: {selectedEnhancementDetails.sourceVersion}</span>
                  <span>Created: {new Date(selectedEnhancementDetails.createdAt).toLocaleString()}</span>
                  {selectedEnhancementDetails.webSearchUsed && <span>Web search used</span>}
                </div>
              </div>

              {/* Quality Scores */}
              {(selectedEnhancementDetails.qualityScoreBefore !== undefined || selectedEnhancementDetails.qualityScoreAfter !== undefined) && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
                    <h4 className="font-medium text-gray-700 dark:text-gray-200 mb-2">Before</h4>
                    <div className="text-3xl font-bold text-gray-600 dark:text-gray-300">
                      {Math.round(selectedEnhancementDetails.qualityScoreBefore || 0)}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
                    <h4 className="font-medium text-gray-700 dark:text-gray-200 mb-2">After</h4>
                    <div className="flex items-center gap-2">
                      <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {Math.round(selectedEnhancementDetails.qualityScoreAfter || 0)}
                      </div>
                      {selectedEnhancementDetails.qualityScoreBefore !== undefined && selectedEnhancementDetails.qualityScoreAfter !== undefined && (
                        <span className={`text-sm ${
                          selectedEnhancementDetails.qualityScoreAfter > selectedEnhancementDetails.qualityScoreBefore
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {selectedEnhancementDetails.qualityScoreAfter > selectedEnhancementDetails.qualityScoreBefore ? '+' : ''}
                          {Math.round(selectedEnhancementDetails.qualityScoreAfter - selectedEnhancementDetails.qualityScoreBefore)} pts
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* AI Reasoning */}
              {selectedEnhancementDetails.aiResponseJson && (() => {
                try {
                  const aiResponse = JSON.parse(selectedEnhancementDetails.aiResponseJson);
                  return aiResponse.reasoning ? (
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <h4 className="font-medium text-gray-700 dark:text-gray-200 mb-2">AI Reasoning</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{aiResponse.reasoning}</p>
                    </div>
                  ) : null;
                } catch { return null; }
              })()}

              {/* Web Search Results */}
              {selectedEnhancementDetails.webSearchResultsJson && (() => {
                try {
                  const webResults = JSON.parse(selectedEnhancementDetails.webSearchResultsJson);
                  return webResults.length > 0 ? (
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <h4 className="font-medium text-gray-700 dark:text-gray-200 mb-2">Sources Used</h4>
                      <div className="space-y-2">
                        {webResults.map((result: any, i: number) => (
                          <div key={i} className="text-sm p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                            <div className="font-medium text-gray-700 dark:text-gray-200">{result.title}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{result.source}</div>
                            {result.keyTakeaways && (
                              <ul className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                                {result.keyTakeaways.slice(0, 2).map((t: string, j: number) => (
                                  <li key={j}>• {t}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                } catch { return null; }
              })()}

              {/* Enhanced Content Preview with View Mode */}
              {(selectedEnhancementDetails.appliedContent || selectedEnhancementDetails.aiResponseJson) && (() => {
                // Parse the AI response to get original content, enhanced content, and pre-calculated diff
                let enhancedContent = selectedEnhancementDetails.appliedContent || '';
                let originalContent = '';
                let storedDiff: EnhanceResult['diff'] | null = null;

                if (selectedEnhancementDetails.aiResponseJson) {
                  try {
                    const aiResponse = JSON.parse(selectedEnhancementDetails.aiResponseJson);
                    if (!enhancedContent && aiResponse.enhancedContent) {
                      enhancedContent = aiResponse.enhancedContent;
                    }
                    if (aiResponse.originalContent) {
                      originalContent = aiResponse.originalContent;
                    }
                    // Use stored diff if available
                    if (aiResponse.diff) {
                      storedDiff = aiResponse.diff;
                    }
                  } catch { /* ignore */ }
                }

                // Use stored diff or calculate one if not available
                let diff: EnhanceResult['diff'];

                if (storedDiff) {
                  // Use the pre-calculated diff from storage
                  diff = storedDiff;
                } else if (originalContent) {
                  // Fallback: calculate diff for older enhancements
                  const originalLines = originalContent.split('\n');
                  const enhancedLines = enhancedContent.split('\n');

                  const calculateSimpleDiff = () => {
                    const hunks: EnhanceResult['diff']['hunks'] = [];
                    let additions = 0;
                    let deletions = 0;
                    let i = 0, j = 0;
                    let currentHunk: EnhanceResult['diff']['hunks'][0] | null = null;

                    while (i < originalLines.length || j < enhancedLines.length) {
                      if (i < originalLines.length && j < enhancedLines.length && originalLines[i] === enhancedLines[j]) {
                        if (currentHunk) {
                          hunks.push(currentHunk);
                          currentHunk = null;
                        }
                        i++;
                        j++;
                      } else {
                        if (!currentHunk) {
                          currentHunk = {
                            oldStart: i + 1,
                            oldLines: 0,
                            newStart: j + 1,
                            newLines: 0,
                            lines: [],
                          };
                        }
                        if (i < originalLines.length && (j >= enhancedLines.length || originalLines[i] !== enhancedLines[j])) {
                          currentHunk.lines.push({
                            type: 'remove',
                            content: originalLines[i],
                            oldLineNumber: i + 1,
                          });
                          currentHunk.oldLines++;
                          deletions++;
                          i++;
                        }
                        if (j < enhancedLines.length && (i >= originalLines.length || originalLines[i] !== enhancedLines[j])) {
                          currentHunk.lines.push({
                            type: 'add',
                            content: enhancedLines[j],
                            newLineNumber: j + 1,
                          });
                          currentHunk.newLines++;
                          additions++;
                          j++;
                        }
                      }
                    }
                    if (currentHunk) {
                      hunks.push(currentHunk);
                    }
                    return { additions, deletions, hunks };
                  };

                  diff = calculateSimpleDiff();
                } else {
                  // No original content - can't show diff
                  diff = { additions: 0, deletions: 0, hunks: [] };
                }

                return (
                  <>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-700 dark:text-gray-200">Enhanced Content</h4>
                          <PopoutButton
                            onClick={() => setIsDetailsPopoutOpen(true)}
                            title="Open in full screen"
                          />
                        </div>
                        {originalContent && (
                          <ViewModeToggle mode={detailsViewMode} onChange={setDetailsViewMode} />
                        )}
                      </div>

                      {detailsViewMode === 'highlighted' && originalContent ? (
                        <HighlightedContentView
                          originalContent={originalContent}
                          enhancedContent={enhancedContent}
                          diff={diff}
                        />
                      ) : detailsViewMode === 'diff' && originalContent ? (
                        <DiffView diff={diff} />
                      ) : (
                        <div className="font-mono text-sm bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {enhancedContent.split('\n').length} lines
                            </span>
                            <span className="text-xs text-green-600 dark:text-green-400">
                              Final Content
                            </span>
                          </div>
                          <div className="max-h-[600px] overflow-auto">
                            <pre className="p-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                              {enhancedContent || 'No content available'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Details Popout Modal */}
                    <PopoutModal
                      isOpen={isDetailsPopoutOpen}
                      onClose={() => setIsDetailsPopoutOpen(false)}
                      title={`Enhancement: ${FILE_KEY_DISPLAY_NAMES[selectedEnhancementDetails.fileKey] || selectedEnhancementDetails.fileKey}`}
                      subtitle={selectedEnhancementDetails.command}
                      viewMode={detailsViewMode}
                      onViewModeChange={setDetailsViewMode}
                      stats={{
                        additions: diff.additions,
                        deletions: diff.deletions,
                        lines: enhancedContent.split('\n').length,
                      }}
                    >
                      {detailsViewMode === 'highlighted' && originalContent ? (
                        <PopoutHighlightedView
                          originalContent={originalContent}
                          enhancedContent={enhancedContent}
                          diff={diff}
                        />
                      ) : detailsViewMode === 'diff' && originalContent ? (
                        <PopoutDiffView diff={diff} />
                      ) : (
                        <div className="font-mono text-sm bg-white dark:bg-gray-800 m-4 rounded-lg border border-gray-200 dark:border-gray-700">
                          <pre className="p-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                            {enhancedContent || 'No content available'}
                          </pre>
                        </div>
                      )}
                    </PopoutModal>
                  </>
                );
              })()}

              {/* Action Buttons */}
              <div className="flex gap-3 sticky bottom-0 bg-white dark:bg-gray-800 p-4 border-t border-gray-200 dark:border-gray-700 shadow-lg rounded-lg">
                {selectedEnhancementDetails.status === 'completed' && (
                  <button
                    onClick={() => handleApplyEnhancementFromList(selectedEnhancementDetails.enhancementId)}
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Apply Enhancement
                  </button>
                )}
                {selectedEnhancementDetails.status === 'applied' && (
                  <button
                    onClick={() => handlePromoteEnhancement(selectedEnhancementDetails.enhancementId)}
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Promote to Production
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedEnhancementId(null);
                    setSelectedEnhancementDetails(null);
                  }}
                  disabled={isLoading}
                  className="px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
          ) : previewResult ? (
            <div className="space-y-6">
              {/* File Confirmation Banner */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-green-800 dark:text-green-200">
                      Enhancement Generated for: {FILE_KEY_DISPLAY_NAMES[previewResult.fileKey] || previewResult.fileKey}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quality Comparison */}
              <div className="grid grid-cols-2 gap-4">
                <QualityScoreCard
                  score={{
                    overall: previewResult.qualityScores.before,
                    dimensions: qualityScore?.dimensions || { clarity: 0, completeness: 0, examples: 0, consistency: 0, edgeCases: 0 },
                    suggestions: [],
                  }}
                  label="Before"
                />
                <QualityScoreCard
                  score={{
                    overall: previewResult.qualityScores.after,
                    dimensions: qualityScore?.dimensions || { clarity: 0, completeness: 0, examples: 0, consistency: 0, edgeCases: 0 },
                    suggestions: [],
                  }}
                  label="After"
                  comparison={{
                    before: previewResult.qualityScores.before,
                    after: previewResult.qualityScores.after,
                  }}
                />
              </div>

              {/* Reasoning */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <h4 className="font-medium text-gray-700 dark:text-gray-200 mb-2">AI Reasoning</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">{previewResult.reasoning}</p>
              </div>

              {/* Web Search Results */}
              {previewResult.webSearchResults && previewResult.webSearchResults.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <h4 className="font-medium text-gray-700 dark:text-gray-200 mb-2">Sources Used</h4>
                  <div className="space-y-2">
                    {previewResult.webSearchResults.map((result, i) => (
                      <div key={i} className="text-sm p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                        <div className="font-medium text-gray-700 dark:text-gray-200">{result.title}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{result.source}</div>
                        <ul className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                          {result.keyTakeaways.slice(0, 2).map((t, j) => (
                            <li key={j}>• {t}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Changes View with Mode Toggle */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-700 dark:text-gray-200">Changes</h4>
                    <PopoutButton
                      onClick={() => setIsPreviewPopoutOpen(true)}
                      title="Open in full screen"
                    />
                  </div>
                  <ViewModeToggle mode={previewViewMode} onChange={setPreviewViewMode} />
                </div>

                {previewViewMode === 'highlighted' && (
                  <HighlightedContentView
                    originalContent={previewResult.originalContent}
                    enhancedContent={previewResult.enhancedContent}
                    diff={previewResult.diff}
                  />
                )}

                {previewViewMode === 'diff' && (
                  <DiffView diff={previewResult.diff} />
                )}

                {previewViewMode === 'clean' && (
                  <div className="font-mono text-sm bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {previewResult.enhancedContent.split('\n').length} lines
                      </span>
                      <span className="text-xs text-green-600 dark:text-green-400">
                        Final Content (will be saved when promoted)
                      </span>
                    </div>
                    <div className="max-h-[600px] overflow-auto">
                      <pre className="p-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                        {previewResult.enhancedContent}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Popout Modal */}
              <PopoutModal
                isOpen={isPreviewPopoutOpen}
                onClose={() => setIsPreviewPopoutOpen(false)}
                title={`Enhancement Preview: ${FILE_KEY_DISPLAY_NAMES[previewResult.fileKey] || previewResult.fileKey}`}
                subtitle={`Quality: ${Math.round(previewResult.qualityScores.before)} → ${Math.round(previewResult.qualityScores.after)} (+${Math.round(previewResult.qualityScores.improvement)} pts)`}
                viewMode={previewViewMode}
                onViewModeChange={setPreviewViewMode}
                stats={{
                  additions: previewResult.diff.additions,
                  deletions: previewResult.diff.deletions,
                  lines: previewResult.enhancedContent.split('\n').length,
                }}
              >
                {previewViewMode === 'highlighted' && (
                  <PopoutHighlightedView
                    originalContent={previewResult.originalContent}
                    enhancedContent={previewResult.enhancedContent}
                    diff={previewResult.diff}
                  />
                )}

                {previewViewMode === 'diff' && (
                  <PopoutDiffView diff={previewResult.diff} />
                )}

                {previewViewMode === 'clean' && (
                  <div className="font-mono text-sm bg-white dark:bg-gray-800 m-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <pre className="p-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                      {previewResult.enhancedContent}
                    </pre>
                  </div>
                )}
              </PopoutModal>

              {/* Apply/Discard Buttons */}
              <div className="flex gap-3 sticky bottom-0 bg-white dark:bg-gray-800 p-4 border-t border-gray-200 dark:border-gray-700 shadow-lg rounded-lg">
                <button
                  onClick={handleApplyClick}
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading ? 'Preparing...' : 'Apply Enhancement'}
                </button>
                <button
                  onClick={handleDiscard}
                  disabled={isLoading}
                  className="px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  Discard
                </button>
              </div>
            </div>
          ) : contentView ? (
            /* Content Viewer - Shows current or selected version content */
            <div className="space-y-4">
              {/* Content Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
                    {FILE_ICONS[selectedFileKey] || FILE_ICONS.system_prompt}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {FILE_KEY_DISPLAY_NAMES[selectedFileKey] || selectedFileKey}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Version {contentView.version}
                      {selectedVersion ? ' (selected)' : ' (current)'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <PopoutButton
                    onClick={() => setIsContentPopoutOpen(true)}
                    title="Open in full screen"
                  />
                  <button
                    onClick={loadPromptContent}
                    className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Refresh content"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content Display */}
              {contentView.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading content...</p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      {contentView.content.split('\n').length} lines
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(contentView.content);
                        setSuccessMessage('Content copied to clipboard!');
                        setTimeout(() => setSuccessMessage(null), 2000);
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Copy to clipboard
                    </button>
                  </div>
                  <div className="max-h-[600px] overflow-auto">
                    <pre className="p-4 text-sm text-gray-800 dark:text-gray-200 font-mono whitespace-pre-wrap break-words leading-relaxed">
                      {contentView.content}
                    </pre>
                  </div>
                </div>
              )}

              {/* Help Text */}
              <div className="text-center text-sm text-gray-500 dark:text-gray-400 pt-4">
                <p>Use the command panel to enhance this prompt with AI</p>
                <p className="text-xs mt-1">Select a different version from the dropdown to compare</p>
              </div>

              {/* Content Popout Modal */}
              <ContentPopoutModal
                isOpen={isContentPopoutOpen}
                onClose={() => setIsContentPopoutOpen(false)}
                title={FILE_KEY_DISPLAY_NAMES[selectedFileKey] || selectedFileKey}
                subtitle={`Version ${contentView.version}${selectedVersion ? ' (selected)' : ' (current)'}`}
                content={contentView.content}
                onCopy={() => {
                  navigator.clipboard.writeText(contentView.content);
                  setSuccessMessage('Content copied to clipboard!');
                  setTimeout(() => setSuccessMessage(null), 2000);
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
              <div className="text-center">
                <div className="text-6xl mb-4">✨</div>
                <p>Select an artifact to view its content</p>
                <p className="text-sm mt-2">Then use templates or commands to preview enhancements</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enhancement History Panel (Collapsible) */}
      {enhancementHistory.length > 0 && (
        <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <details className="group">
            <summary className="px-6 py-3 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">
              Enhancement History ({enhancementHistory.length})
            </summary>
            <div className="px-6 pb-4 max-h-48 overflow-y-auto border-t border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400">
                    <th className="pb-2 pt-3">Date</th>
                    <th className="pb-2 pt-3">Command</th>
                    <th className="pb-2 pt-3">Status</th>
                    <th className="pb-2 pt-3">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {enhancementHistory.map(h => (
                    <tr key={h.enhancementId} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="py-2 text-gray-600 dark:text-gray-400">
                        {new Date(h.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-gray-700 dark:text-gray-300 truncate max-w-xs">
                        {h.command}
                      </td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          h.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                          h.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                          {h.status}
                        </span>
                      </td>
                      <td className="py-2 text-gray-600 dark:text-gray-400">
                        {h.qualityScoreBefore && h.qualityScoreAfter && (
                          <span className={h.qualityScoreAfter > h.qualityScoreBefore ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {Math.round(h.qualityScoreBefore)} → {Math.round(h.qualityScoreAfter)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {/* Apply Description Modal */}
      <ApplyDescriptionModal
        isOpen={showApplyModal}
        onClose={handleApplyCancel}
        onConfirm={handleApplyConfirm}
        isLoading={isLoading}
        defaultDescription={getDefaultDescription()}
      />
    </div>
  );
};

export default AIPromptingPage;

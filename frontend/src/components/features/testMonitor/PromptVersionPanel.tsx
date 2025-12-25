/**
 * PromptVersionPanel Component
 * Displays prompt files with version history and copy/edit functionality
 */

import React, { useState } from 'react';
import { Spinner, Modal } from '../../ui';
import type { PromptFile, PromptVersionHistory } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';

interface PromptVersionPanelProps {
  promptFiles: PromptFile[];
  promptHistory: PromptVersionHistory[];
  loading?: boolean;
  onSelectFile?: (fileKey: string) => void;
  onCopyContent?: (fileKey: string, version?: number) => Promise<string | null>;
  onViewContent?: (fileKey: string, version?: number) => Promise<string | null>;
  onSaveContent?: (fileKey: string, content: string, changeDescription: string) => Promise<{ newVersion: number } | null>;
}

interface ViewModalState {
  isOpen: boolean;
  content: string;
  displayName: string;
  version: number;
  loading: boolean;
}

interface EditModalState {
  isOpen: boolean;
  content: string;
  originalContent: string;
  fileKey: string;
  displayName: string;
  version: number;
  loading: boolean;
  saving: boolean;
  changeDescription: string;
  validationErrors: string[];
}

// Characters that could cause issues in prompts
const ILLEGAL_CHAR_PATTERNS = [
  { pattern: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, name: 'control characters' },
  { pattern: /\uFEFF/g, name: 'BOM characters' },
  { pattern: /[\u2028\u2029]/g, name: 'line/paragraph separators' },
];

/**
 * Check for illegal characters that could cause issues
 */
function detectIllegalCharacters(content: string): string[] {
  const errors: string[] = [];
  for (const { pattern, name } of ILLEGAL_CHAR_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      errors.push(`Found ${matches.length} ${name}`);
    }
  }
  return errors;
}

/**
 * Escape curly braces for Flowise Mustache template compatibility.
 * Converts single { to {{ and single } to }} (unless already escaped)
 */
function escapeForFlowise(content: string): string {
  if (!content) return content;

  const replacements: { index: number; from: string; to: string }[] = [];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1] || '';
    const prevChar = content[i - 1] || '';

    if (char === '{') {
      if (nextChar !== '{' && prevChar !== '{') {
        replacements.push({ index: i, from: '{', to: '{{' });
      } else if (nextChar === '{') {
        i++;
      }
    } else if (char === '}') {
      if (nextChar !== '}' && prevChar !== '}') {
        replacements.push({ index: i, from: '}', to: '}}' });
      } else if (nextChar === '}') {
        i++;
      }
    }
  }

  let result = content;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { index, from, to } = replacements[i];
    result = result.substring(0, index) + to + result.substring(index + from.length);
  }

  return result;
}

/**
 * Detect unescaped braces that would cause Flowise errors
 */
function detectUnescapedBraces(content: string): { count: number; positions: { index: number; char: string }[] } {
  const positions: { index: number; char: string }[] = [];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1] || '';
    const prevChar = content[i - 1] || '';

    if (char === '{' && nextChar !== '{' && prevChar !== '{') {
      positions.push({ index: i, char: '{' });
    } else if (char === '}' && nextChar !== '}' && prevChar !== '}') {
      positions.push({ index: i, char: '}' });
    }
  }

  return { count: positions.length, positions };
}

export function PromptVersionPanel({
  promptFiles,
  promptHistory,
  loading,
  onSelectFile,
  onCopyContent,
  onViewContent,
  onSaveContent,
}: PromptVersionPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [viewModal, setViewModal] = useState<ViewModalState>({
    isOpen: false,
    content: '',
    displayName: '',
    version: 0,
    loading: false,
  });
  const [editModal, setEditModal] = useState<EditModalState>({
    isOpen: false,
    content: '',
    originalContent: '',
    fileKey: '',
    displayName: '',
    version: 0,
    loading: false,
    saving: false,
    changeDescription: '',
    validationErrors: [],
  });

  const toggleExpand = (fileKey: string) => {
    setExpanded(prev => ({ ...prev, [fileKey]: !prev[fileKey] }));
    if (onSelectFile && !expanded[fileKey]) {
      onSelectFile(fileKey);
    }
  };

  const handleCopy = async (fileKey: string, version?: number) => {
    if (!onCopyContent || copying) return;

    setCopying(true);
    try {
      const content = await onCopyContent(fileKey, version);
      if (content) {
        await navigator.clipboard.writeText(content);
        setCopiedId(version ? `${fileKey}-v${version}` : fileKey);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    } finally {
      setCopying(false);
    }
  };

  const handleView = async (fileKey: string, displayName: string, version: number) => {
    // First check if content is available in history
    const historyItem = promptHistory.find(h => h.fileKey === fileKey && h.version === version);

    if (historyItem?.content) {
      setViewModal({
        isOpen: true,
        content: historyItem.content,
        displayName,
        version,
        loading: false,
      });
      return;
    }

    // Otherwise fetch via callback
    if (!onViewContent && !onCopyContent) return;

    setViewModal({
      isOpen: true,
      content: '',
      displayName,
      version,
      loading: true,
    });

    try {
      const fetchContent = onViewContent || onCopyContent;
      const content = await fetchContent!(fileKey, version);
      setViewModal(prev => ({
        ...prev,
        content: content || 'No content available',
        loading: false,
      }));
    } catch (err) {
      console.error('Failed to fetch content:', err);
      setViewModal(prev => ({
        ...prev,
        content: 'Failed to load content',
        loading: false,
      }));
    }
  };

  const closeViewModal = () => {
    setViewModal({
      isOpen: false,
      content: '',
      displayName: '',
      version: 0,
      loading: false,
    });
  };

  const handleEdit = async (fileKey: string, displayName: string, version: number) => {
    // First fetch the current content
    const historyItem = promptHistory.find(h => h.fileKey === fileKey && h.version === version);

    if (historyItem?.content) {
      setEditModal({
        isOpen: true,
        content: historyItem.content,
        originalContent: historyItem.content,
        fileKey,
        displayName,
        version,
        loading: false,
        saving: false,
        changeDescription: '',
        validationErrors: [],
      });
      return;
    }

    // Otherwise fetch via callback
    if (!onViewContent && !onCopyContent) return;

    setEditModal({
      isOpen: true,
      content: '',
      originalContent: '',
      fileKey,
      displayName,
      version,
      loading: true,
      saving: false,
      changeDescription: '',
      validationErrors: [],
    });

    try {
      const fetchContent = onViewContent || onCopyContent;
      const content = await fetchContent!(fileKey, version);
      setEditModal(prev => ({
        ...prev,
        content: content || '',
        originalContent: content || '',
        loading: false,
      }));
    } catch (err) {
      console.error('Failed to fetch content:', err);
      setEditModal(prev => ({
        ...prev,
        content: '',
        loading: false,
        validationErrors: ['Failed to load content'],
      }));
    }
  };

  const closeEditModal = () => {
    setEditModal({
      isOpen: false,
      content: '',
      originalContent: '',
      fileKey: '',
      displayName: '',
      version: 0,
      loading: false,
      saving: false,
      changeDescription: '',
      validationErrors: [],
    });
  };

  const validateAndPrepareContent = (content: string, fileKey: string): { valid: boolean; errors: string[]; escapedContent: string } => {
    const errors: string[] = [];

    // Check for illegal characters
    const illegalChars = detectIllegalCharacters(content);
    errors.push(...illegalChars);

    // Only escape curly braces for non-JavaScript files (system prompts, markdown)
    // JavaScript tool files need their curly braces intact for valid syntax
    const isJavaScriptFile = fileKey.includes('tool') || fileKey.endsWith('_tool');
    let escapedContent = content;

    if (!isJavaScriptFile) {
      const unescapedBraces = detectUnescapedBraces(content);
      if (unescapedBraces.count > 0) {
        escapedContent = escapeForFlowise(content);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      escapedContent,
    };
  };

  const handleSaveEdit = async () => {
    if (!onSaveContent || editModal.saving) return;

    // Validate change description
    if (!editModal.changeDescription.trim()) {
      setEditModal(prev => ({
        ...prev,
        validationErrors: ['Please provide a change description'],
      }));
      return;
    }

    // Validate and escape content (pass fileKey to skip escaping for JS files)
    const { valid, errors, escapedContent } = validateAndPrepareContent(editModal.content, editModal.fileKey);

    if (!valid) {
      setEditModal(prev => ({
        ...prev,
        validationErrors: errors,
      }));
      return;
    }

    // Check if content actually changed
    if (escapedContent === editModal.originalContent) {
      setEditModal(prev => ({
        ...prev,
        validationErrors: ['No changes detected'],
      }));
      return;
    }

    setEditModal(prev => ({ ...prev, saving: true, validationErrors: [] }));

    try {
      const result = await onSaveContent(editModal.fileKey, escapedContent, editModal.changeDescription.trim());
      if (result) {
        closeEditModal();
      } else {
        // No result but no error - unexpected state
        setEditModal(prev => ({
          ...prev,
          saving: false,
          validationErrors: ['Save failed - no response received'],
        }));
      }
    } catch (err: any) {
      console.error('Failed to save:', JSON.stringify(err, null, 2));
      // Extract error message from various error formats (API errors, Error objects, strings)
      let errorMessage = 'Failed to save changes';
      if (typeof err === 'string') {
        errorMessage = err;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err?.message) {
        errorMessage = err.message;
      } else if (err?.error) {
        errorMessage = err.error;
      } else if (err?.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err?.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      console.error('Extracted error message:', errorMessage);
      setEditModal(prev => ({
        ...prev,
        saving: false,
        validationErrors: [errorMessage],
      }));
    }
  };

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

  const formatDateTimeCST = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' CST';
  };

  if (loading && promptFiles.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (promptFiles.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No prompt files available.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {promptFiles.map(file => {
        const isExpanded = expanded[file.fileKey];
        const isCopied = copiedId === file.fileKey;
        const fileHistory = promptHistory.filter(h => h.fileKey === file.fileKey);

        return (
          <div
            key={file.fileKey}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
          >
            {/* Header */}
            <div
              onClick={() => toggleExpand(file.fileKey)}
              className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg
                  className={cn(
                    'w-4 h-4 text-gray-400 transition-transform flex-shrink-0',
                    isExpanded && 'rotate-90'
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium text-gray-900 dark:text-white truncate">
                  {file.displayName}
                </span>
                <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded">
                  v{file.version}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(file.fileKey, file.displayName, file.version);
                  }}
                  disabled={!onSaveContent}
                  title="Edit prompt"
                  className="p-1.5 rounded transition-colors text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(file.fileKey);
                  }}
                  disabled={copying}
                  title={`Copy current version (updated ${formatDateTimeCST(file.updatedAt)})`}
                  className={cn(
                    'p-1.5 rounded transition-colors',
                    isCopied
                      ? 'text-green-500'
                      : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  )}
                >
                  {isCopied ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Expanded content - Version history */}
            {isExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="px-3 py-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Version History
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Spinner size="sm" />
                  </div>
                ) : fileHistory.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                    No version history available
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {fileHistory.map(version => {
                      const isVersionCopied = copiedId === `${file.fileKey}-v${version.version}`;
                      return (
                        <div
                          key={version.id}
                          className="flex items-center justify-between px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              v{version.version}
                            </span>
                            {version.changeDescription ? (
                              <span
                                className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]"
                                title={version.changeDescription}
                              >
                                - {version.changeDescription}
                              </span>
                            ) : version.fixId ? (
                              <span className="text-xs text-purple-600 dark:text-purple-400">
                                Fix applied
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                Initial version
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {formatTimeAgo(version.createdAt)}
                            </span>
                            <button
                              onClick={() => handleView(file.fileKey, file.displayName, version.version)}
                              className="px-2 py-0.5 text-xs font-medium rounded transition-colors bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-800/50 text-blue-700 dark:text-blue-300"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleCopy(file.fileKey, version.version)}
                              disabled={copying}
                              className={cn(
                                'px-2 py-0.5 text-xs font-medium rounded transition-colors',
                                isVersionCopied
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300'
                              )}
                            >
                              {isVersionCopied ? '✓' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* File info */}
                <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Last updated: {formatTimeAgo(file.updatedAt)}</span>
                    {file.lastFixId && (
                      <span className="text-purple-600 dark:text-purple-400">
                        Last fix: {file.lastFixId.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* View Content Modal */}
      <Modal
        isOpen={viewModal.isOpen}
        onClose={closeViewModal}
        title={`${viewModal.displayName} - v${viewModal.version}`}
        size="xl"
      >
        {viewModal.loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="relative">
            <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto scrollbar-thin">
              {viewModal.content}
            </pre>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(viewModal.content);
                setCopiedId('modal-content');
                setTimeout(() => setCopiedId(null), 2000);
              }}
              className={cn(
                'absolute top-2 right-2 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                copiedId === 'modal-content'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              )}
            >
              {copiedId === 'modal-content' ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        )}
      </Modal>

      {/* Edit Content Modal */}
      <Modal
        isOpen={editModal.isOpen}
        onClose={closeEditModal}
        title={`Edit ${editModal.displayName} - v${editModal.version}`}
        size="xl"
      >
        {editModal.loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Validation Errors */}
            {editModal.validationErrors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <div className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                  Validation Errors:
                </div>
                <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside">
                  {editModal.validationErrors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Info banner - different message for JS vs prompt files */}
            {editModal.fileKey.includes('tool') ? (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  <strong>JavaScript Tool:</strong> This is executable code. Changes will be validated for correct JavaScript syntax before saving.
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Note:</strong> Single curly braces <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{`{`}</code> and <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{`}`}</code> will be automatically escaped to <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{`{{`}</code> and <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{`}}`}</code> for Flowise compatibility.
                </div>
              </div>
            )}

            {/* Change Description Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Change Description <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editModal.changeDescription}
                onChange={(e) => setEditModal(prev => ({ ...prev, changeDescription: e.target.value }))}
                placeholder="Describe what you changed..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Content Editor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Content
              </label>
              <textarea
                value={editModal.content}
                onChange={(e) => setEditModal(prev => ({ ...prev, content: e.target.value, validationErrors: [] }))}
                className="w-full h-[50vh] px-3 py-2 font-mono text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-900 dark:bg-gray-950 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                spellCheck={false}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={closeEditModal}
                disabled={editModal.saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editModal.saving || !editModal.changeDescription.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {editModal.saving ? (
                  <>
                    <Spinner size="sm" />
                    Saving...
                  </>
                ) : (
                  'Save as New Version'
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

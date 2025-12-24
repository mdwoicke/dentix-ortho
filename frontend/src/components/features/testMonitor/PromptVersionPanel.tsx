/**
 * PromptVersionPanel Component
 * Displays prompt files with version history and copy functionality
 */

import React, { useState } from 'react';
import { Spinner } from '../../ui';
import type { PromptFile, PromptVersionHistory } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';

interface PromptVersionPanelProps {
  promptFiles: PromptFile[];
  promptHistory: PromptVersionHistory[];
  loading?: boolean;
  onSelectFile?: (fileKey: string) => void;
  onCopyContent?: (fileKey: string, version?: number) => Promise<string | null>;
}

export function PromptVersionPanel({
  promptFiles,
  promptHistory,
  loading,
  onSelectFile,
  onCopyContent,
}: PromptVersionPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

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
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400">
                  {isExpanded ? '▾' : '▸'}
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {file.displayName}
                </span>
                <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded">
                  v{file.version}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(file.fileKey);
                }}
                disabled={copying}
                className={cn(
                  'px-2 py-1 text-xs font-medium rounded transition-colors',
                  isCopied
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                )}
              >
                {isCopied ? '✓ Copied!' : '📋 Copy Current'}
              </button>
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
                              <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
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
    </div>
  );
}

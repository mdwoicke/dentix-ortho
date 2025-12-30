/**
 * SandboxFileEditor Component
 * Editor panel for viewing and editing sandbox file content with version history
 */

import { useState, useEffect } from 'react';
import { Spinner } from '../../ui';
import { cn } from '../../../utils/cn';
import type { SandboxFile, SandboxFileHistory, SandboxFileKey, SelectedSandbox } from '../../../types/sandbox.types';
import { SANDBOX_FILE_CONFIG } from '../../../types/sandbox.types';

interface SandboxFileEditorProps {
  file: SandboxFile | undefined;
  fileKey: SandboxFileKey;
  history: SandboxFileHistory[];
  editedContent: string;
  isEditing: boolean;
  hasUnsavedChanges: boolean;
  selectedSandbox: SelectedSandbox;
  loading?: boolean;
  historyLoading?: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onContentChange: (content: string) => void;
  onSave: (content: string, description: string) => Promise<void>;
  onCopyFromProduction: () => void;
  onRollback: (version: number) => void;
  onLoadHistory: () => void;
}

export function SandboxFileEditor({
  file,
  fileKey,
  history,
  editedContent,
  isEditing,
  hasUnsavedChanges,
  selectedSandbox,
  loading = false,
  historyLoading = false,
  onStartEditing,
  onCancelEditing,
  onContentChange,
  onSave,
  onCopyFromProduction,
  onRollback,
  onLoadHistory,
}: SandboxFileEditorProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changeDescription, setChangeDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [viewingVersion, setViewingVersion] = useState<SandboxFileHistory | null>(null);
  const [copiedContent, setCopiedContent] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const config = SANDBOX_FILE_CONFIG[fileKey];
  const sandboxColor = selectedSandbox === 'sandbox_a' ? 'blue' : 'purple';

  const handleSave = async () => {
    if (!changeDescription.trim()) {
      setError('Please provide a change description');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave(editedContent, changeDescription.trim());
      setChangeDescription('');
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleHistory = () => {
    if (!showHistory) {
      onLoadHistory();
    }
    setShowHistory(!showHistory);
  };

  const handleCopyContent = async () => {
    const contentToCopy = viewingVersion?.content || file?.content || editedContent;
    if (!contentToCopy) {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
      return;
    }

    try {
      await navigator.clipboard.writeText(contentToCopy);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    } catch (err) {
      console.error('Failed to copy content:', err);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Handle Escape key to close expanded view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isExpanded]);

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

  // No file selected or file doesn't exist yet
  if (!file) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
            {config.label} Not Configured
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Copy the current production version to start editing.
          </p>
          <button
            onClick={onCopyFromProduction}
            disabled={loading}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              sandboxColor === 'blue'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-purple-600 text-white hover:bg-purple-700',
              loading && 'opacity-50 cursor-not-allowed'
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                Copying...
              </span>
            ) : (
              'Copy from Production'
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            {config.label}
          </h3>
          <span className={cn(
            'px-1.5 py-0.5 text-xs font-medium rounded',
            sandboxColor === 'blue'
              ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
              : 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
          )}>
            v{file.version}
          </span>
          {file.baseVersion && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              (based on prod v{file.baseVersion})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={handleToggleHistory}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {showHistory ? 'Hide History' : 'History'}
              </button>
              <button
                onClick={handleCopyContent}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  copiedContent
                    ? 'bg-green-500 text-white'
                    : copyError
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                )}
              >
                {copiedContent ? 'Copied!' : copyError ? 'Failed!' : 'Copy'}
              </button>
              <button
                onClick={onCopyFromProduction}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Refresh from Prod
              </button>
              <button
                onClick={onStartEditing}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  sandboxColor === 'blue'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                )}
              >
                Edit
              </button>
              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
              <button
                onClick={handleToggleExpand}
                className="p-1.5 rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                title="Expand view"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onCancelEditing}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges || !changeDescription.trim()}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-2',
                  sandboxColor === 'blue'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-purple-600 text-white hover:bg-purple-700',
                  (saving || !hasUnsavedChanges || !changeDescription.trim()) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {saving ? (
                  <>
                    <Spinner size="sm" />
                    Saving...
                  </>
                ) : (
                  'Save as New Version'
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Change description (when editing) */}
      {isEditing && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={changeDescription}
            onChange={(e) => {
              setChangeDescription(e.target.value);
              setError(null);
            }}
            placeholder="Describe your changes..."
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Content area */}
      <div className="relative">
        {isEditing ? (
          <textarea
            value={editedContent}
            onChange={(e) => onContentChange(e.target.value)}
            className={cn(
              'w-full h-[400px] px-4 py-3 font-mono text-sm',
              'bg-gray-900 dark:bg-gray-950 text-gray-100',
              'border-0 focus:outline-none focus:ring-0 resize-none',
              'scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800'
            )}
            spellCheck={false}
          />
        ) : (
          <pre className={cn(
            'px-4 py-3 font-mono text-sm overflow-x-auto',
            'bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200',
            'max-h-[400px] overflow-y-auto',
            'scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600',
            'whitespace-pre-wrap break-words'
          )}>
            {viewingVersion?.content || file.content}
          </pre>
        )}

        {/* Unsaved changes indicator */}
        {hasUnsavedChanges && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-1 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 rounded-full">
              Unsaved changes
            </span>
          </div>
        )}
      </div>

      {/* Version History Panel */}
      {showHistory && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="px-4 py-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Version History
          </div>
          {historyLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : history.length === 0 ? (
            <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
              No version history available
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[200px] overflow-y-auto">
              {history.map(version => (
                <div
                  key={version.id}
                  className={cn(
                    'flex items-center justify-between px-4 py-2',
                    viewingVersion?.version === version.version
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      v{version.version}
                    </span>
                    {version.changeDescription ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                        - {version.changeDescription}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Initial version</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {formatTimeAgo(version.createdAt)}
                    </span>
                    <button
                      onClick={() => setViewingVersion(
                        viewingVersion?.version === version.version ? null : version
                      )}
                      className={cn(
                        'px-2 py-0.5 text-xs font-medium rounded transition-colors',
                        viewingVersion?.version === version.version
                          ? 'bg-blue-500 text-white'
                          : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50'
                      )}
                    >
                      {viewingVersion?.version === version.version ? 'Viewing' : 'View'}
                    </button>
                    {version.version !== file.version && (
                      <button
                        onClick={() => onRollback(version.version)}
                        className="px-2 py-0.5 text-xs font-medium rounded transition-colors bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/50"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer info */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
        <span>Last updated: {formatTimeAgo(file.updatedAt)}</span>
        <span className="text-gray-400">
          {config.type === 'json' ? 'JSON Tool Definition' : 'Markdown Prompt'}
        </span>
      </div>

      {/* Expanded View Overlay */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleToggleExpand}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Expanded Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  {config.label}
                </h3>
                <span className={cn(
                  'px-1.5 py-0.5 text-xs font-medium rounded',
                  sandboxColor === 'blue'
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                    : 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                )}>
                  v{file.version}
                </span>
                <span className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded',
                  sandboxColor === 'blue'
                    ? 'bg-blue-500 text-white'
                    : 'bg-purple-500 text-white'
                )}>
                  {selectedSandbox === 'sandbox_a' ? 'Sandbox A' : 'Sandbox B'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleHistory}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {showHistory ? 'Hide History' : 'History'}
                </button>
                <button
                  onClick={handleCopyContent}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                    copiedContent
                      ? 'bg-green-500 text-white'
                      : copyError
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  )}
                >
                  {copiedContent ? 'Copied!' : copyError ? 'Failed!' : 'Copy'}
                </button>
                <button
                  onClick={onCopyFromProduction}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  Refresh from Prod
                </button>
                <button
                  onClick={() => {
                    setIsExpanded(false);
                    onStartEditing();
                  }}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                    sandboxColor === 'blue'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  )}
                >
                  Edit
                </button>
                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
                <button
                  onClick={handleToggleExpand}
                  className="p-1.5 rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  title="Close expanded view"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Expanded Content */}
            <div className="flex-1 overflow-auto">
              <pre className={cn(
                'px-6 py-4 font-mono text-sm',
                'bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200',
                'whitespace-pre-wrap break-words min-h-full'
              )}>
                {viewingVersion?.content || file.content}
              </pre>
            </div>

            {/* Expanded Footer */}
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex justify-between flex-shrink-0">
              <span>Last updated: {formatTimeAgo(file.updatedAt)}</span>
              <span className="text-gray-400">
                {config.type === 'json' ? 'JSON Tool Definition' : 'Markdown Prompt'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SandboxFileList Component
 * Displays the 3 Flowise files with versions for a sandbox
 */

import type { ReactNode } from 'react';
import { Spinner } from '../../ui';
import { cn } from '../../../utils/cn';
import type { SandboxFile, SandboxFileKey, SelectedSandbox } from '../../../types/sandbox.types';
import { SANDBOX_FILE_CONFIG } from '../../../types/sandbox.types';

interface SandboxFileListProps {
  files: SandboxFile[];
  selectedFileKey: SandboxFileKey | null;
  selectedSandbox: SelectedSandbox;
  loading?: boolean;
  onSelectFile: (fileKey: SandboxFileKey) => void;
  onCopyFromProduction: (fileKey: SandboxFileKey) => void;
}

const FILE_ICONS: Record<SandboxFileKey, ReactNode> = {
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
  nodered_flow: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  ),
};

export function SandboxFileList({
  files,
  selectedFileKey,
  selectedSandbox,
  loading = false,
  onSelectFile,
  onCopyFromProduction,
}: SandboxFileListProps) {
  const sandboxColor = selectedSandbox === 'sandbox_a' ? 'blue' : 'purple';

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

  if (loading && files.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  // Create file entries for all expected files (even if not yet created)
  const fileKeys: SandboxFileKey[] = ['system_prompt', 'patient_tool', 'scheduling_tool', 'nodered_flow'];
  const fileMap = new Map(files.map(f => [f.fileKey as SandboxFileKey, f]));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <span className={cn(
            'inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-white',
            selectedSandbox === 'sandbox_a' ? 'bg-blue-500' : 'bg-purple-500'
          )}>
            {selectedSandbox === 'sandbox_a' ? 'A' : 'B'}
          </span>
          Sandbox {selectedSandbox === 'sandbox_a' ? 'A' : 'B'} Files
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {files.length}/4 configured
        </span>
      </div>

      {fileKeys.map(fileKey => {
        const file = fileMap.get(fileKey);
        const config = SANDBOX_FILE_CONFIG[fileKey];
        const isSelected = selectedFileKey === fileKey;

        return (
          <div
            key={fileKey}
            onClick={() => onSelectFile(fileKey)}
            className={cn(
              'flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all',
              'border',
              isSelected
                ? sandboxColor === 'blue'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-1.5 rounded',
                isSelected
                  ? sandboxColor === 'blue'
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50'
                    : 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50'
                  : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700'
              )}>
                {FILE_ICONS[fileKey]}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-sm font-medium',
                    isSelected
                      ? sandboxColor === 'blue'
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-purple-700 dark:text-purple-300'
                      : 'text-gray-900 dark:text-white'
                  )}>
                    {config.label}
                  </span>

                  {file ? (
                    <span className={cn(
                      'px-1.5 py-0.5 text-xs font-medium rounded',
                      isSelected
                        ? sandboxColor === 'blue'
                          ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                          : 'bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                    )}>
                      v{file.version}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400">
                      Not set
                    </span>
                  )}
                </div>

                {file && (
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <span>Updated {formatTimeAgo(file.updatedAt)}</span>
                    {file.baseVersion && (
                      <span className="text-gray-400 dark:text-gray-500">
                        (from prod v{file.baseVersion})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!file && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyFromProduction(fileKey);
                  }}
                  className="px-2 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
                >
                  Copy from Prod
                </button>
              )}

              <svg
                className={cn(
                  'w-4 h-4 transition-transform',
                  isSelected ? 'rotate-90' : '',
                  isSelected
                    ? sandboxColor === 'blue' ? 'text-blue-500' : 'text-purple-500'
                    : 'text-gray-400'
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

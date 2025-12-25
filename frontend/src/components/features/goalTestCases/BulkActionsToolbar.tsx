/**
 * Bulk Actions Toolbar Component
 * Displays when items are selected for bulk operations
 */

import React from 'react';
import { clsx } from 'clsx';

// Icons
const XIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
  </svg>
);

const ArchiveIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
  </svg>
);

const TagIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onRunSelected: () => void;
  onArchiveSelected: () => void;
  onTagSelected?: () => void;
  isRunning?: boolean;
}

export function BulkActionsToolbar({
  selectedCount,
  totalCount,
  onClearSelection,
  onSelectAll,
  onRunSelected,
  onArchiveSelected,
  onTagSelected,
  isRunning = false,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className={clsx(
      'fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50',
      'flex items-center gap-3 px-4 py-2',
      'bg-gray-900 dark:bg-gray-800',
      'rounded-lg shadow-lg',
      'border border-gray-700',
      'animate-in slide-in-from-bottom-5'
    )}>
      {/* Selection count */}
      <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
        <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-blue-500 rounded-full">
          {selectedCount}
        </span>
        <span className="text-sm text-gray-300">
          selected
        </span>
      </div>

      {/* Select all / clear */}
      <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
        {selectedCount < totalCount ? (
          <button
            onClick={onSelectAll}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded',
              'text-gray-300 hover:text-white',
              'hover:bg-gray-700',
              'transition-colors'
            )}
          >
            <CheckIcon />
            Select All
          </button>
        ) : (
          <span className="text-sm text-gray-400">All selected</span>
        )}
        <button
          onClick={onClearSelection}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded',
            'text-gray-300 hover:text-white',
            'hover:bg-gray-700',
            'transition-colors'
          )}
        >
          <XIcon />
          Clear
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onRunSelected}
          disabled={isRunning}
          className={clsx(
            'inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded',
            'bg-green-600 text-white',
            'hover:bg-green-700',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors'
          )}
        >
          <PlayIcon />
          Run Selected
        </button>

        {onTagSelected && (
          <button
            onClick={onTagSelected}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded',
              'text-gray-300 hover:text-white',
              'hover:bg-gray-700',
              'transition-colors'
            )}
          >
            <TagIcon />
            Tag
          </button>
        )}

        <button
          onClick={onArchiveSelected}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded',
            'text-red-400 hover:text-red-300',
            'hover:bg-red-900/30',
            'transition-colors'
          )}
        >
          <ArchiveIcon />
          Archive
        </button>
      </div>
    </div>
  );
}

export default BulkActionsToolbar;

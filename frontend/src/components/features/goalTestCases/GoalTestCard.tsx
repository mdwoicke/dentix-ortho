/**
 * Goal Test Card Component
 * Card displaying a goal test case with quick actions
 */

import React, { useState } from 'react';
import { clsx } from 'clsx';
import { CATEGORY_STYLES, type GoalTestCaseRecord, type TestCategory } from '../../../types/testMonitor.types';

// Icons
const GripIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
    <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const ArchiveIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
  </svg>
);

const MoreIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const TargetIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

interface GoalTestCardProps {
  testCase: GoalTestCaseRecord;
  isSelected: boolean;
  onSelect: () => void;
  onClick: () => void;
  onRun: () => void;
  onEdit: () => void;
  onClone: () => void;
  onArchive: () => void;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function GoalTestCard({
  testCase,
  isSelected,
  onSelect,
  onClick,
  onRun,
  onEdit,
  onClone,
  onArchive,
  isDragging = false,
  dragHandleProps,
}: GoalTestCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const styles = CATEGORY_STYLES[testCase.category as TestCategory];

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
    setShowMenu(false);
  };

  return (
    <div
      className={clsx(
        'relative group rounded-lg border transition-all duration-200',
        'bg-white dark:bg-gray-800',
        'border-gray-200 dark:border-gray-700',
        styles.border,
        'hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-gray-900/50',
        isSelected && 'ring-2 ring-blue-500',
        isDragging && 'opacity-50 shadow-lg',
        testCase.isArchived && 'opacity-60'
      )}
      onClick={onClick}
    >
      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            className={clsx(
              'flex-shrink-0 p-1 cursor-grab active:cursor-grabbing',
              'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
              'opacity-0 group-hover:opacity-100 transition-opacity'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <GripIcon />
          </div>

          {/* Checkbox */}
          <div className="flex-shrink-0 pt-0.5" onClick={handleCheckboxClick}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Case ID */}
            <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {testCase.caseId}
            </p>

            {/* Name */}
            <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate mt-0.5">
              {testCase.name}
            </h3>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1">
                <UserIcon />
                {testCase.persona.name}
              </span>
              <span className="inline-flex items-center gap-1">
                <TargetIcon />
                {testCase.goals.length} goal{testCase.goals.length !== 1 ? 's' : ''}
              </span>
              {testCase.constraints.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <ShieldIcon />
                  {testCase.constraints.length}
                </span>
              )}
            </div>

            {/* Tags */}
            {testCase.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {testCase.tags.slice(0, 3).map(tag => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                  >
                    {tag}
                  </span>
                ))}
                {testCase.tags.length > 3 && (
                  <span className="px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                    +{testCase.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => handleActionClick(e, onRun)}
              className={clsx(
                'p-1.5 rounded',
                'text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30',
                'transition-colors'
              )}
              title="Run test"
            >
              <PlayIcon />
            </button>
            <button
              onClick={(e) => handleActionClick(e, onEdit)}
              className={clsx(
                'p-1.5 rounded',
                'text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30',
                'transition-colors'
              )}
              title="Edit test"
            >
              <EditIcon />
            </button>

            {/* More menu */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className={clsx(
                  'p-1.5 rounded',
                  'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700',
                  'transition-colors'
                )}
              >
                <MoreIcon />
              </button>

              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className={clsx(
                    'absolute right-0 top-full mt-1 z-50 w-32 rounded-md shadow-lg',
                    'bg-white dark:bg-gray-800',
                    'border border-gray-200 dark:border-gray-700',
                    'py-1'
                  )}>
                    <button
                      onClick={(e) => handleActionClick(e, onClone)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm',
                        'text-gray-700 dark:text-gray-300',
                        'hover:bg-gray-100 dark:hover:bg-gray-700'
                      )}
                    >
                      <CopyIcon />
                      Clone
                    </button>
                    <button
                      onClick={(e) => handleActionClick(e, onArchive)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm',
                        'text-red-600 dark:text-red-400',
                        'hover:bg-red-50 dark:hover:bg-red-900/20'
                      )}
                    >
                      <ArchiveIcon />
                      Archive
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Archived indicator */}
      {testCase.isArchived && (
        <div className={clsx(
          'absolute top-2 right-2 px-2 py-0.5 text-xs font-medium rounded',
          'bg-gray-100 dark:bg-gray-700',
          'text-gray-500 dark:text-gray-400'
        )}>
          Archived
        </div>
      )}
    </div>
  );
}

export default GoalTestCard;

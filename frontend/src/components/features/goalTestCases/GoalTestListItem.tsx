/**
 * Goal Test List Item Component
 * Compact horizontal row for displaying test cases in a list
 */

import React from 'react';
import { clsx } from 'clsx';
import { CATEGORY_STYLES, type GoalTestCaseRecord, type TestCategory } from '../../../types/testMonitor.types';

// Icons
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

const UserIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const TargetIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

interface GoalTestListItemProps {
  testCase: GoalTestCaseRecord;
  isSelected: boolean;
  isActive: boolean;
  onSelect: () => void;
  onClick: () => void;
  onRun: () => void;
  onEdit: () => void;
}

export function GoalTestListItem({
  testCase,
  isSelected,
  isActive,
  onSelect,
  onClick,
  onRun,
  onEdit,
}: GoalTestListItemProps) {
  const styles = CATEGORY_STYLES[testCase.category as TestCategory];

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <div
      className={clsx(
        'group flex items-center gap-3 px-3 py-2 cursor-pointer',
        'border-l-3 transition-all duration-150',
        styles.border.replace('border-l-4', 'border-l-3'),
        isActive
          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
        isSelected && !isActive && 'bg-gray-100 dark:bg-gray-800',
        testCase.isArchived && 'opacity-60'
      )}
      onClick={onClick}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0" onClick={handleCheckboxClick}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: ID and Name */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 flex-shrink-0">
            {testCase.caseId}
          </span>
          {testCase.name && (
            <>
              <span className="text-gray-400 dark:text-gray-500">·</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {testCase.name}
              </span>
            </>
          )}
        </div>

        {/* Row 2: Meta info */}
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <UserIcon />
            <span className="truncate max-w-[100px]">{testCase.persona.name}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <TargetIcon />
            {testCase.goals.length}
          </span>
          {testCase.tags.length > 0 && (
            <span className="inline-flex items-center gap-1 truncate">
              <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                {testCase.tags[0]}
              </span>
              {testCase.tags.length > 1 && (
                <span className="text-gray-400">+{testCase.tags.length - 1}</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Quick actions - visible on hover */}
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => handleActionClick(e, onRun)}
          className={clsx(
            'p-1 rounded',
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
            'p-1 rounded',
            'text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30',
            'transition-colors'
          )}
          title="Edit test"
        >
          <EditIcon />
        </button>
      </div>

      {/* Archived badge */}
      {testCase.isArchived && (
        <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
          Archived
        </span>
      )}
    </div>
  );
}

export default GoalTestListItem;

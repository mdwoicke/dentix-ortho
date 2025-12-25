/**
 * Category Header Component
 * Simple collapsible header for grouping test cases by category
 */

import React from 'react';
import { clsx } from 'clsx';
import { CATEGORY_STYLES, type TestCategory } from '../../../types/testMonitor.types';

// Icons
const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
  </svg>
);

const categoryLabels: Record<TestCategory, string> = {
  'happy-path': 'Happy Path',
  'edge-case': 'Edge Cases',
  'error-handling': 'Error Handling',
};

const categoryIcons: Record<TestCategory, React.ReactNode> = {
  'happy-path': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  'edge-case': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  'error-handling': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

interface CategoryHeaderProps {
  category: TestCategory;
  count: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onRunCategory: () => void;
}

export function CategoryHeader({
  category,
  count,
  isCollapsed,
  onToggleCollapse,
  onRunCategory,
}: CategoryHeaderProps) {
  const styles = CATEGORY_STYLES[category];

  return (
    <div
      className={clsx(
        'sticky top-0 z-10 flex items-center justify-between px-3 py-2',
        'bg-gray-50 dark:bg-gray-800/80 backdrop-blur-sm',
        'border-b border-gray-200 dark:border-gray-700'
      )}
    >
      {/* Left side - clickable to toggle */}
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={onToggleCollapse}
      >
        {/* Chevron */}
        <span className="text-gray-400 dark:text-gray-500">
          {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
        </span>

        {/* Category icon */}
        <span className={styles.icon}>
          {categoryIcons[category]}
        </span>

        {/* Category name */}
        <span className={clsx('text-sm font-semibold', styles.text)}>
          {categoryLabels[category]}
        </span>

        {/* Count badge */}
        <span className={clsx(
          'px-1.5 py-0.5 text-xs font-medium rounded',
          styles.badge
        )}>
          {count}
        </span>
      </div>

      {/* Right side - actions */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRunCategory();
        }}
        className={clsx(
          'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded',
          'text-gray-600 dark:text-gray-400',
          'hover:bg-gray-200 dark:hover:bg-gray-700',
          'transition-colors'
        )}
        title={`Run all ${categoryLabels[category]} tests`}
      >
        <PlayIcon />
        Run
      </button>
    </div>
  );
}

export default CategoryHeader;

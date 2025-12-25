/**
 * Category Section Component
 * Collapsible section for grouping test cases by category
 */

import React from 'react';
import { clsx } from 'clsx';
import { CATEGORY_STYLES, type TestCategory } from '../../../types/testMonitor.types';

// Icons
const ChevronRightIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
  </svg>
);

const categoryLabels: Record<TestCategory, string> = {
  'happy-path': 'Happy Path',
  'edge-case': 'Edge Case',
  'error-handling': 'Error Handling',
};

const categoryIcons: Record<TestCategory, React.ReactNode> = {
  'happy-path': (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  'edge-case': (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  'error-handling': (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

interface CategorySectionProps {
  category: TestCategory;
  count: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  selectedCount: number;
  onSelectAll: () => void;
  onRunCategory: () => void;
  children: React.ReactNode;
  isDropTarget?: boolean;
}

export function CategorySection({
  category,
  count,
  isCollapsed,
  onToggleCollapse,
  selectedCount,
  onSelectAll,
  onRunCategory,
  children,
  isDropTarget = false,
}: CategorySectionProps) {
  const styles = CATEGORY_STYLES[category];

  return (
    <div
      className={clsx(
        'rounded-lg border overflow-hidden transition-all duration-200',
        styles.border,
        isDropTarget && 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900'
      )}
    >
      {/* Header */}
      <button
        onClick={onToggleCollapse}
        className={clsx(
          'w-full flex items-center justify-between px-4 py-3',
          styles.header,
          'hover:brightness-95 dark:hover:brightness-110',
          'transition-all'
        )}
      >
        <div className="flex items-center gap-3">
          {/* Collapse chevron */}
          <span
            className={clsx(
              'transition-transform duration-200',
              !isCollapsed && 'rotate-90'
            )}
          >
            <ChevronRightIcon />
          </span>

          {/* Category icon */}
          <span className={styles.icon}>
            {categoryIcons[category]}
          </span>

          {/* Category name */}
          <span className={clsx('font-semibold', styles.text)}>
            {categoryLabels[category]}
          </span>

          {/* Count badge */}
          <span className={clsx(
            'px-2 py-0.5 text-xs font-medium rounded-full',
            styles.badge
          )}>
            {count}
          </span>
        </div>

        {/* Quick actions */}
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Select all in category */}
          <button
            onClick={onSelectAll}
            className={clsx(
              'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded',
              'bg-white/50 dark:bg-gray-800/50',
              'hover:bg-white dark:hover:bg-gray-800',
              'text-gray-700 dark:text-gray-300',
              'transition-colors'
            )}
            title="Select all in category"
          >
            <CheckIcon />
            {selectedCount > 0 ? `${selectedCount} selected` : 'Select'}
          </button>

          {/* Run category */}
          <button
            onClick={onRunCategory}
            className={clsx(
              'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded',
              'bg-white/50 dark:bg-gray-800/50',
              'hover:bg-white dark:hover:bg-gray-800',
              'text-gray-700 dark:text-gray-300',
              'transition-colors'
            )}
            title="Run all tests in category"
          >
            <PlayIcon />
            Run
          </button>
        </div>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className={clsx(
          'p-3 bg-white dark:bg-gray-900',
          'border-t',
          styles.border.replace('border-l-4 ', '')
        )}>
          {count > 0 ? (
            <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {children}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              <p className="text-sm">No test cases in this category</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CategorySection;

/**
 * TestCaseList Component
 * Displays a sortable list of test cases with quick actions
 */

import React from 'react';
import type { TestCaseRecord } from '../../../types/testMonitor.types';

interface TestCaseListProps {
  testCases: TestCaseRecord[];
  selectedId: string | null;
  onSelect: (testCase: TestCaseRecord) => void;
  onClone: (testCase: TestCaseRecord) => void;
  onCreate: () => void;
  loading?: boolean;
}

const CATEGORY_COLORS: Record<string, { badge: string; border: string }> = {
  'happy-path': {
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    border: 'border-l-green-500',
  },
  'edge-case': {
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    border: 'border-l-yellow-500',
  },
  'error-handling': {
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    border: 'border-l-red-500',
  },
};

export function TestCaseList({
  testCases,
  selectedId,
  onSelect,
  onClone,
  onCreate,
  loading = false,
}: TestCaseListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
          >
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2">
        {testCases.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-sm">No test cases match your filters</p>
          </div>
        ) : (
          testCases.map((testCase) => {
            const colors = CATEGORY_COLORS[testCase.category] || CATEGORY_COLORS['happy-path'];
            const isSelected = selectedId === testCase.caseId;

            return (
              <button
                key={testCase.caseId}
                onClick={() => onSelect(testCase)}
                className={`
                  w-full text-left p-3 rounded-lg border-l-4 transition-all
                  ${colors.border}
                  ${isSelected
                    ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
                    : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent'
                  }
                  ${testCase.isArchived ? 'opacity-60' : ''}
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs font-mono rounded ${colors.badge}`}>
                        {testCase.caseId}
                      </span>
                      {testCase.isArchived && (
                        <span className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                          Archived
                        </span>
                      )}
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-white truncate">
                      {testCase.name}
                    </h4>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{testCase.steps.length} steps</span>
                      {testCase.tags.length > 0 && (
                        <span className="truncate">{testCase.tags.slice(0, 2).join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClone(testCase);
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                    title="Clone test case"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Create New Button */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
        <button
          onClick={onCreate}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Test Case
        </button>
      </div>
    </div>
  );
}

export default TestCaseList;

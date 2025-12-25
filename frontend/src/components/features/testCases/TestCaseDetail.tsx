/**
 * TestCaseDetail Component
 * Read-only detail view of a test case with collapsible steps
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { TestCaseRecord, TestCaseStepDTO } from '../../../types/testMonitor.types';

interface TestCaseDetailProps {
  testCase: TestCaseRecord;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}

const CATEGORY_LABELS: Record<string, { name: string; color: string }> = {
  'happy-path': { name: 'Happy Path', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  'edge-case': { name: 'Edge Case', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  'error-handling': { name: 'Error Handling', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

function StepAccordion({ step, index }: { step: TestCaseStepDTO; index: number }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 flex items-center justify-center bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full text-xs font-medium">
            {index + 1}
          </span>
          <span className="font-medium text-gray-900 dark:text-white">
            {step.description || `Step ${index + 1}`}
          </span>
          {step.optional && (
            <span className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
              Optional
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
          {/* User Message */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              User Message
            </label>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
              {step.userMessage}
            </div>
          </div>

          {/* Expected Patterns */}
          {step.expectedPatterns.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Expected Patterns
              </label>
              <div className="space-y-1">
                {step.expectedPatterns.map((pattern, i) => (
                  <code
                    key={i}
                    className="block px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs rounded font-mono"
                  >
                    {pattern}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* Unexpected Patterns */}
          {step.unexpectedPatterns.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Unexpected Patterns
              </label>
              <div className="space-y-1">
                {step.unexpectedPatterns.map((pattern, i) => (
                  <code
                    key={i}
                    className="block px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs rounded font-mono"
                  >
                    {pattern}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* Semantic Expectations */}
          {step.semanticExpectations.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Semantic Expectations
              </label>
              <div className="space-y-1">
                {step.semanticExpectations.map((exp, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded"
                  >
                    <span className="px-1.5 py-0.5 text-xs bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded">
                      {exp.type}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {exp.description}
                    </span>
                    {exp.required && (
                      <span className="ml-auto text-xs text-purple-600 dark:text-purple-400">Required</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Negative Expectations */}
          {step.negativeExpectations.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Negative Expectations
              </label>
              <div className="space-y-1">
                {step.negativeExpectations.map((exp, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded"
                  >
                    <span className={`px-1.5 py-0.5 text-xs rounded ${
                      exp.severity === 'critical' ? 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300' :
                      exp.severity === 'high' ? 'bg-orange-200 dark:bg-orange-800 text-orange-700 dark:text-orange-300' :
                      exp.severity === 'medium' ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300' :
                      'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}>
                      {exp.type}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {exp.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeout & Delay */}
          {(step.timeout || step.delay) && (
            <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
              {step.timeout && <span>Timeout: {step.timeout}ms</span>}
              {step.delay && <span>Delay: {step.delay}ms</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TestCaseDetail({
  testCase,
  onEdit,
  onClone,
  onDelete,
}: TestCaseDetailProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const categoryConfig = CATEGORY_LABELS[testCase.category] || CATEGORY_LABELS['happy-path'];

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Expand/Collapse icon button
  const ExpandIcon = () => (
    <button
      onClick={toggleExpand}
      className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      title={isExpanded ? 'Collapse' : 'Expand'}
    >
      {isExpanded ? (
        <svg
          className="w-4 h-4 text-gray-500 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 9L4 4m0 0v5m0-5h5M15 9l5-5m0 0v5m0-5h-5M9 15l-5 5m0 0v-5m0 5h5M15 15l5 5m0 0v-5m0 5h-5"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4 text-gray-500 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
          />
        </svg>
      )}
    </button>
  );

  // Header actions component (shared between normal and expanded views)
  const HeaderActions = () => (
    <div className="flex items-center gap-2">
      <button
        onClick={onEdit}
        className="px-3 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded transition-colors"
      >
        Edit
      </button>
      <button
        onClick={onClone}
        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded transition-colors"
      >
        Clone
      </button>
      <button
        onClick={() => setShowDeleteConfirm(true)}
        className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
      >
        Archive
      </button>
      <ExpandIcon />
    </div>
  );

  // Main content component (shared between normal and expanded views)
  const DetailContent = () => (
    <>
      {/* Description */}
      {testCase.description && (
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          {testCase.description}
        </p>
      )}

      {/* Tags */}
      {testCase.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {testCase.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Steps */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Steps ({testCase.steps.length})
        </h3>
        <div className="space-y-2">
          {testCase.steps.map((step, index) => (
            <StepAccordion key={step.id} step={step} index={index} />
          ))}
        </div>

        {/* Expectations */}
        {testCase.expectations.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Test Expectations
            </h3>
            <div className="space-y-2">
              {testCase.expectations.map((exp, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded mr-2">
                    {exp.type}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {exp.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center justify-between">
          <span>Version {testCase.version}</span>
          <span>Updated: {new Date(testCase.updatedAt).toLocaleString()}</span>
        </div>
      </div>
    </>
  );

  // Expanded modal view
  const expandedView = isExpanded
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsExpanded(false);
            }
          }}
        >
          <div
            className="w-[90vw] h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b dark:border-gray-700 flex items-start justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded">
                    {testCase.caseId}
                  </span>
                  <span className={`px-2 py-0.5 text-xs rounded ${categoryConfig.color}`}>
                    {categoryConfig.name}
                  </span>
                  {testCase.isArchived && (
                    <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                      Archived
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {testCase.name}
                </h2>
              </div>
              <HeaderActions />
            </div>
            {/* Content */}
            <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
              <DetailContent />
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded">
                {testCase.caseId}
              </span>
              <span className={`px-2 py-0.5 text-xs rounded ${categoryConfig.color}`}>
                {categoryConfig.name}
              </span>
              {testCase.isArchived && (
                <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                  Archived
                </span>
              )}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {testCase.name}
            </h2>
          </div>
          <HeaderActions />
        </div>
        <DetailContent />

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Archive Test Case
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Are you sure you want to archive "{testCase.name}"? This will archive the test case.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDelete();
                    setShowDeleteConfirm(false);
                  }}
                  className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {expandedView}
    </>
  );
}

export default TestCaseDetail;

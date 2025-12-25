/**
 * TestCaseEditor Component
 * Edit or create a test case with metadata form and step editor
 */

import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import {
  createTestCase,
  updateTestCase,
  validateTestCase,
  setEditingTestCase,
  selectTestCasesSaving,
  selectValidationErrors,
} from '../../../store/slices/testCasesSlice';
import { StepEditor } from './StepEditor';
import type {
  TestCaseRecord,
  TestCaseStepDTO,
  TestCasePresets,
} from '../../../types/testMonitor.types';

interface TestCaseEditorProps {
  testCase: TestCaseRecord;
  isNew: boolean;
  presets: TestCasePresets | null;
  onCancel: () => void;
}

const CATEGORIES = [
  { value: 'happy-path', label: 'Happy Path', color: 'text-green-600' },
  { value: 'edge-case', label: 'Edge Case', color: 'text-yellow-600' },
  { value: 'error-handling', label: 'Error Handling', color: 'text-red-600' },
];

export function TestCaseEditor({
  testCase,
  isNew,
  presets,
  onCancel,
}: TestCaseEditorProps) {
  const dispatch = useAppDispatch();
  const saving = useAppSelector(selectTestCasesSaving);
  const validationErrors = useAppSelector(selectValidationErrors);

  const [localTestCase, setLocalTestCase] = useState<TestCaseRecord>(testCase);
  const [tagInput, setTagInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  // Update local state
  const updateField = <K extends keyof TestCaseRecord>(field: K, value: TestCaseRecord[K]) => {
    setLocalTestCase(prev => ({ ...prev, [field]: value }));
  };

  // Handle tag input
  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !localTestCase.tags.includes(tag)) {
      updateField('tags', [...localTestCase.tags, tag]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    updateField('tags', localTestCase.tags.filter(t => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // Handle steps update
  const handleStepsChange = useCallback((steps: TestCaseStepDTO[]) => {
    setLocalTestCase(prev => ({ ...prev, steps }));
  }, []);

  // Validate
  const handleValidate = async () => {
    await dispatch(validateTestCase(localTestCase));
  };

  // Save
  const handleSave = async () => {
    // Update redux state
    dispatch(setEditingTestCase(localTestCase));

    if (isNew) {
      await dispatch(createTestCase(localTestCase));
    } else {
      await dispatch(updateTestCase({
        caseId: localTestCase.caseId,
        updates: localTestCase,
      }));
    }
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const getFieldError = (field: string) => {
    return validationErrors.find(e => e.field === field)?.message;
  };

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
        // Collapse icon (arrows pointing inward)
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
        // Expand icon (arrows pointing outward)
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
        onClick={handleValidate}
        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded transition-colors"
      >
        Validate
      </button>
      <button
        onClick={onCancel}
        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white rounded transition-colors"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      <ExpandIcon />
    </div>
  );

  // Form content component (shared between normal and expanded views)
  const FormContent = () => (
    <>
      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
            Validation Errors
          </h4>
          <ul className="text-sm text-red-600 dark:text-red-300 list-disc list-inside">
            {validationErrors.map((err, i) => (
              <li key={i}>{err.field}: {err.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto space-y-6">
        {/* Metadata Section */}
        <div className="space-y-4">
          {/* Case ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Case ID *
            </label>
            <input
              type="text"
              value={localTestCase.caseId}
              onChange={(e) => updateField('caseId', e.target.value.toUpperCase())}
              placeholder="e.g., HAPPY-001"
              className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500 ${
                getFieldError('caseId') ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
              disabled={!isNew}
            />
            {getFieldError('caseId') && (
              <p className="mt-1 text-xs text-red-600">{getFieldError('caseId')}</p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={localTestCase.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Test case name"
              className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500 ${
                getFieldError('name') ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {getFieldError('name') && (
              <p className="mt-1 text-xs text-red-600">{getFieldError('name')}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={localTestCase.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Describe what this test case validates..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category *
            </label>
            <div className="flex gap-3">
              {CATEGORIES.map((cat) => (
                <label
                  key={cat.value}
                  className={`
                    flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-all
                    ${localTestCase.category === cat.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.value}
                    checked={localTestCase.category === cat.value}
                    onChange={(e) => updateField('category', e.target.value as typeof localTestCase.category)}
                    className="sr-only"
                  />
                  <span className={`text-sm font-medium ${cat.color}`}>{cat.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {localTestCase.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-500"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add tag..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
              />
              <button
                onClick={handleAddTag}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md text-sm"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Steps Section */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Steps ({localTestCase.steps.length})
          </h3>
          <StepEditor
            steps={localTestCase.steps}
            onChange={handleStepsChange}
            presets={presets}
          />
        </div>
      </div>

      {/* Footer hint */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <span>Ctrl+S to save • Escape to cancel</span>
      </div>
    </>
  );

  // Expanded modal view
  const expandedView = isExpanded
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            // Close when clicking overlay background
            if (e.target === e.currentTarget) {
              setIsExpanded(false);
            }
          }}
        >
          <div
            className="w-[90vw] h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* Header */}
            <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isNew ? 'New Test Case' : `Edit: ${testCase.name}`}
              </h2>
              <HeaderActions />
            </div>
            {/* Content */}
            <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
              <FormContent />
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="h-full flex flex-col" onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isNew ? 'New Test Case' : `Edit: ${testCase.name}`}
          </h2>
          <HeaderActions />
        </div>
        <FormContent />
      </div>
      {expandedView}
    </>
  );
}

export default TestCaseEditor;

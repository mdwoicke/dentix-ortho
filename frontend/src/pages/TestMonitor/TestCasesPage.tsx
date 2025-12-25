/**
 * Test Cases Page
 * Main page for viewing, editing, and creating test cases
 * Uses a 3-panel layout: Filters | List | Detail/Editor
 */

import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { Card } from '../../components/ui';
import {
  CategoryFilter,
  TagCloud,
  TestCaseList,
  TestCaseDetail,
} from '../../components/features/testCases';
import { TestCaseEditor } from '../../components/features/testCases/TestCaseEditor';
import {
  fetchTestCases,
  fetchPresets,
  cloneTestCase,
  deleteTestCase,
  setSelectedTestCase,
  startEditing,
  startCreating,
  cancelEditing,
  toggleCategoryFilter,
  toggleTagFilter,
  setSearchQuery,
  selectFilteredTestCases,
  selectTestCaseStats,
  selectAvailableTags,
  selectSelectedTestCase,
  selectEditingTestCase,
  selectIsEditing,
  selectIsCreating,
  selectFilters,
  selectTestCasesLoading,
  selectPresets,
} from '../../store/slices/testCasesSlice';
import type { TestCaseRecord } from '../../types/testMonitor.types';

export function TestCasesPage() {
  const dispatch = useAppDispatch();

  // Selectors
  const filteredTestCases = useAppSelector(selectFilteredTestCases);
  const stats = useAppSelector(selectTestCaseStats);
  const availableTags = useAppSelector(selectAvailableTags);
  const selectedTestCase = useAppSelector(selectSelectedTestCase);
  const editingTestCase = useAppSelector(selectEditingTestCase);
  const isEditing = useAppSelector(selectIsEditing);
  const isCreating = useAppSelector(selectIsCreating);
  const filters = useAppSelector(selectFilters);
  const loading = useAppSelector(selectTestCasesLoading);
  const presets = useAppSelector(selectPresets);

  // Load test cases and presets on mount
  useEffect(() => {
    dispatch(fetchTestCases({}));
    dispatch(fetchPresets());
  }, [dispatch]);

  // Handlers
  const handleSelect = (testCase: TestCaseRecord) => {
    dispatch(setSelectedTestCase(testCase));
  };

  const handleEdit = () => {
    dispatch(startEditing());
  };

  const handleCreate = () => {
    dispatch(startCreating(undefined));
  };

  const handleClone = (testCase: TestCaseRecord) => {
    dispatch(cloneTestCase({ caseId: testCase.caseId }));
  };

  const handleDelete = () => {
    if (selectedTestCase) {
      dispatch(deleteTestCase({ caseId: selectedTestCase.caseId }));
    }
  };

  const handleCancelEdit = () => {
    dispatch(cancelEditing());
  };

  const handleCategoryToggle = (category: string) => {
    dispatch(toggleCategoryFilter(category));
  };

  const handleTagToggle = (tag: string) => {
    dispatch(toggleTagFilter(tag));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setSearchQuery(e.target.value));
  };

  // Determine what to show in the right panel
  const showEditor = isEditing || isCreating;
  const showDetail = !showEditor && selectedTestCase;
  const showEmpty = !showEditor && !selectedTestCase;

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Test Cases
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage test scenarios for the Flowise agent
        </p>
      </div>

      {/* 3-Panel Layout */}
      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
        {/* Left Panel - Filters */}
        <div className="col-span-3 flex flex-col gap-4">
          <Card className="p-4">
            {/* Search */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={handleSearchChange}
                placeholder="Search by name or ID..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Categories */}
            <CategoryFilter
              selectedCategories={filters.categories}
              categoryCounts={{
                'happy-path': stats.byCategory['happy-path'] || 0,
                'edge-case': stats.byCategory['edge-case'] || 0,
                'error-handling': stats.byCategory['error-handling'] || 0,
              }}
              onToggle={handleCategoryToggle}
            />
          </Card>

          <Card className="p-4 flex-1 min-h-0 overflow-y-auto">
            {/* Tags */}
            <TagCloud
              tags={availableTags}
              selectedTags={filters.tags}
              onToggle={handleTagToggle}
            />
          </Card>

          {/* Stats */}
          <Card className="p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <div className="flex justify-between">
                <span>Total:</span>
                <span className="font-medium text-gray-900 dark:text-white">{stats.total}</span>
              </div>
              <div className="flex justify-between">
                <span>Archived:</span>
                <span className="font-medium text-gray-900 dark:text-white">{stats.archived}</span>
              </div>
              <div className="flex justify-between">
                <span>Showing:</span>
                <span className="font-medium text-gray-900 dark:text-white">{filteredTestCases.length}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Center Panel - Test Case List */}
        <div className="col-span-4 flex flex-col">
          <Card className="flex-1 p-4 min-h-0 overflow-hidden flex flex-col">
            <TestCaseList
              testCases={filteredTestCases}
              selectedId={selectedTestCase?.caseId || null}
              onSelect={handleSelect}
              onClone={handleClone}
              onCreate={handleCreate}
              loading={loading}
            />
          </Card>
        </div>

        {/* Right Panel - Detail/Editor */}
        <div className="col-span-5 flex flex-col">
          <Card className="flex-1 p-4 min-h-0 overflow-hidden flex flex-col">
            {showEditor && editingTestCase && (
              <TestCaseEditor
                testCase={editingTestCase}
                isNew={isCreating}
                presets={presets}
                onCancel={handleCancelEdit}
              />
            )}

            {showDetail && selectedTestCase && (
              <TestCaseDetail
                testCase={selectedTestCase}
                onEdit={handleEdit}
                onClone={() => handleClone(selectedTestCase)}
                onDelete={handleDelete}
              />
            )}

            {showEmpty && (
              <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
                <div className="text-center">
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
                  <p className="text-sm">Select a test case to view details</p>
                  <p className="text-xs mt-1">or create a new one</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default TestCasesPage;

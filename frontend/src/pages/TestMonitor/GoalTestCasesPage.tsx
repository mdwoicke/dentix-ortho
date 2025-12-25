/**
 * Goal Test Cases Page
 * Professional, polished test case organizer
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { clsx } from 'clsx';

import { PersonaEditor } from '../../components/features/testCases/PersonaEditor';
import { GoalsEditor } from '../../components/features/testCases/GoalsEditor';
import { ConstraintsEditor } from '../../components/features/testCases/ConstraintsEditor';

import type { AppDispatch, RootState } from '../../store/store';
import {
  fetchGoalTestCases,
  createGoalTestCase,
  updateGoalTestCase,
  syncGoalTestCasesToTypeScript,
  runGoalTests,
  selectTestCase,
  toggleTestCaseSelection,
  startEditing,
  startCreating,
  cancelEditing,
  setFilters,
  toggleCategoryCollapse,
  selectFilteredGoalTestCases,
  selectTestCasesByCategory,
  selectSelectionState,
} from '../../store/slices/goalTestCasesSlice';

import type {
  GoalTestCaseRecord,
  UserPersonaDTO,
  ResponseConfigDTO,
  TestCategory,
} from '../../types/testMonitor.types';

// ============================================================================
// EXECUTION STATUS TYPES
// ============================================================================

type ExecutionStatus = 'idle' | 'running' | 'success' | 'error';

interface ExecutionState {
  status: ExecutionStatus;
  message: string;
  runId: string | null;
  startedAt: Date | null;
}

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Search: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Play: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  ChevronDown: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  User: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  Target: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Tag: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  XCircle: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Clipboard: () => (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Workers: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
};

// ============================================================================
// FLOATING STATUS INDICATOR
// ============================================================================

function ExecutionStatusIndicator({
  execution,
  onDismiss,
  onViewResults,
}: {
  execution: ExecutionState;
  onDismiss: () => void;
  onViewResults?: () => void;
}) {
  if (execution.status === 'idle') return null;

  const statusConfig = {
    running: {
      bg: 'bg-blue-500',
      icon: (
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ),
      text: 'Running tests...',
    },
    success: {
      bg: 'bg-emerald-500',
      icon: <Icons.CheckCircle />,
      text: 'Tests completed',
    },
    error: {
      bg: 'bg-red-500',
      icon: <Icons.XCircle />,
      text: 'Test failed',
    },
  };

  const config = statusConfig[execution.status as keyof typeof statusConfig];
  if (!config) return null;

  const elapsedTime = execution.startedAt
    ? Math.round((Date.now() - execution.startedAt.getTime()) / 1000)
    : 0;

  return (
    <div className={clsx(
      'fixed bottom-4 right-4 z-50',
      'flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg',
      config.bg,
      'text-white',
      'animate-in slide-in-from-bottom-4 duration-300'
    )}>
      {/* Status icon */}
      <div className="flex-shrink-0">
        {config.icon}
      </div>

      {/* Status text */}
      <div className="flex flex-col">
        <span className="font-semibold text-sm">{execution.message || config.text}</span>
        <div className="flex items-center gap-2 text-xs opacity-80">
          {execution.runId && (
            <span>Run: {execution.runId.slice(0, 8)}...</span>
          )}
          {execution.status === 'running' && elapsedTime > 0 && (
            <span>{elapsedTime}s</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 ml-2">
        {execution.status !== 'running' && onViewResults && execution.runId && (
          <button
            onClick={onViewResults}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            title="View results"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}
        <button
          onClick={onDismiss}
          className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// CATEGORY CONFIG
// ============================================================================

const categoryConfig: Record<TestCategory, {
  label: string;
  icon: React.ReactNode;
  colors: {
    text: string;
    bg: string;
    border: string;
    badge: string;
    accent: string;
  };
}> = {
  'happy-path': {
    label: 'Happy Path',
    icon: <Icons.CheckCircle />,
    colors: {
      text: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      border: 'border-emerald-200 dark:border-emerald-800',
      badge: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
      accent: 'bg-emerald-500',
    },
  },
  'edge-case': {
    label: 'Edge Cases',
    icon: <Icons.AlertTriangle />,
    colors: {
      text: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800',
      badge: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
      accent: 'bg-amber-500',
    },
  },
  'error-handling': {
    label: 'Error Handling',
    icon: <Icons.XCircle />,
    colors: {
      text: 'text-rose-700 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      border: 'border-rose-200 dark:border-rose-800',
      badge: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300',
      accent: 'bg-rose-500',
    },
  },
};

const categories: TestCategory[] = ['happy-path', 'edge-case', 'error-handling'];

// ============================================================================
// TEST CASE CARD COMPONENT
// ============================================================================

function TestCaseCard({
  testCase,
  isSelected,
  isActive,
  isRunning,
  onSelect,
  onClick,
  onRun,
}: {
  testCase: GoalTestCaseRecord;
  isSelected: boolean;
  isActive: boolean;
  isRunning: boolean;
  onSelect: () => void;
  onClick: () => void;
  onRun: () => void;
}) {
  const config = categoryConfig[testCase.category as TestCategory];

  return (
    <div
      onClick={onClick}
      className={clsx(
        'group relative rounded-xl border-2 p-4 cursor-pointer transition-all duration-200',
        'hover:shadow-md',
        isRunning
          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-md animate-pulse'
          : isActive
          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-md'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600',
        testCase.isArchived && 'opacity-60'
      )}
    >
      {/* Running indicator */}
      {isRunning && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full">
          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Running
        </div>
      )}

      {/* Category accent bar */}
      <div className={clsx('absolute left-0 top-4 bottom-4 w-1 rounded-r', config.colors.accent)} />

      {/* Header row */}
      <div className="flex items-start gap-3 pl-3">
        {/* Checkbox */}
        <div className="pt-0.5" onClick={(e) => { e.stopPropagation(); onSelect(); }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* ID Badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className={clsx(
              'inline-flex px-2 py-0.5 text-xs font-mono font-medium rounded',
              config.colors.badge
            )}>
              {testCase.caseId}
            </span>
            {testCase.isArchived && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-200 dark:bg-gray-700 text-gray-500">
                Archived
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 leading-tight">
            {testCase.name || 'Untitled Test'}
          </h3>

          {/* Meta info grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {/* Persona */}
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Icons.User />
              <span className="truncate">{testCase.persona?.name || 'No persona'}</span>
            </div>

            {/* Goals count */}
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Icons.Target />
              <span>{testCase.goals?.length || 0} goals</span>
            </div>
          </div>

          {/* Tags */}
          {(testCase.tags?.length || 0) > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <Icons.Tag />
              <div className="flex flex-wrap gap-1.5">
                {testCase.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                  >
                    {tag}
                  </span>
                ))}
                {testCase.tags.length > 3 && (
                  <span className="text-xs text-gray-400">+{testCase.tags.length - 3}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Run button */}
        <button
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          disabled={isRunning}
          className={clsx(
            'flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg',
            'bg-emerald-500 hover:bg-emerald-600 text-white',
            'shadow-sm hover:shadow transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isRunning && 'animate-pulse'
          )}
          title={isRunning ? 'Test is running...' : 'Run test'}
        >
          {isRunning ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icons.Play />
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// CATEGORY SECTION COMPONENT
// ============================================================================

function CategorySection({
  category,
  testCases,
  isCollapsed,
  selectedIds,
  activeId,
  runningCaseIds,
  onToggleCollapse,
  onSelectTestCase,
  onToggleSelection,
  onRunTest,
  onRunCategory,
}: {
  category: TestCategory;
  testCases: GoalTestCaseRecord[];
  isCollapsed: boolean;
  selectedIds: string[];
  activeId: string | null;
  runningCaseIds: string[];
  onToggleCollapse: () => void;
  onSelectTestCase: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRunTest: (id: string) => void;
  onRunCategory: () => void;
}) {
  const config = categoryConfig[category];

  if (testCases.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Category Header */}
      <div className={clsx(
        'flex items-center justify-between px-4 py-3 rounded-lg mb-3',
        config.colors.bg,
        'border',
        config.colors.border
      )}>
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <span className={config.colors.text}>
            {isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
          </span>
          <span className={config.colors.text}>{config.icon}</span>
          <span className={clsx('text-sm font-bold', config.colors.text)}>
            {config.label}
          </span>
          <span className={clsx(
            'px-2.5 py-0.5 text-xs font-bold rounded-full',
            config.colors.badge
          )}>
            {testCases.length}
          </span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onRunCategory(); }}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg',
            'bg-white dark:bg-gray-800 border shadow-sm',
            'hover:bg-gray-50 dark:hover:bg-gray-700',
            config.colors.border,
            config.colors.text,
            'transition-colors'
          )}
        >
          <Icons.Play />
          Run All
        </button>
      </div>

      {/* Test Cases Grid */}
      {!isCollapsed && (
        <div className="grid gap-3">
          {testCases.map((testCase) => (
            <TestCaseCard
              key={testCase.id}
              testCase={testCase}
              isSelected={selectedIds.includes(testCase.id)}
              isActive={activeId === testCase.id}
              isRunning={runningCaseIds.includes(testCase.caseId)}
              onSelect={() => onToggleSelection(testCase.id)}
              onClick={() => onSelectTestCase(testCase.id)}
              onRun={() => onRunTest(testCase.caseId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export function GoalTestCasesPage() {
  const dispatch = useDispatch<AppDispatch>();

  // Redux state with safe defaults
  const state = useSelector((state: RootState) => state.goalTestCases);
  const testCases = state?.testCases || [];
  const loading = state?.loading || false;
  const running = state?.running || false;
  const runningCaseIds = state?.runningCaseIds || [];
  const lastRunId = state?.lastRunId || null;
  const error = state?.error || null;
  const selectedTestCase = state?.selectedTestCase || null;
  const selectedTestCaseId = selectedTestCase?.id || null;
  const selectedTestCaseIds = state?.selectedTestCaseIds || [];
  const editingTestCase = state?.editingTestCase || null;
  const isCreating = state?.isCreating || false;
  const filters = state?.filters || { search: '', categories: [], tags: [], personas: [], goalTypes: [], includeArchived: false };
  const collapsedCategories = state?.collapsedCategories || [];

  const filteredTestCases = useSelector(selectFilteredGoalTestCases) || [];
  const testCasesByCategory = useSelector(selectTestCasesByCategory) || {};
  const selectionState = useSelector(selectSelectionState) || { hasSelection: false, selectedCount: 0 };

  // Local state
  const [activeTab, setActiveTab] = useState<'persona' | 'goals' | 'config'>('persona');
  const [searchQuery, setSearchQuery] = useState('');
  const [executionState, setExecutionState] = useState<ExecutionState>({
    status: 'idle',
    message: '',
    runId: null,
    startedAt: null,
  });
  const [concurrency, setConcurrency] = useState(1);
  const [showConfig, setShowConfig] = useState(false);
  const configDropdownRef = useRef<HTMLDivElement>(null);

  // Close config dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (configDropdownRef.current && !configDropdownRef.current.contains(event.target as Node)) {
        setShowConfig(false);
      }
    }
    if (showConfig) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showConfig]);

  // Fetch test cases on mount
  useEffect(() => {
    dispatch(fetchGoalTestCases());
  }, [dispatch]);

  // Handle search with debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      dispatch(setFilters({ ...filters, search: searchQuery }));
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Get currently selected test case
  const activeTestCase = useMemo(() => {
    if (editingTestCase) return editingTestCase;
    return selectedTestCase;
  }, [selectedTestCase, editingTestCase]);

  // Handlers
  const handleCreateNew = () => {
    dispatch(startCreating());
    setActiveTab('persona');
  };

  const handleRunAll = async () => {
    setExecutionState({
      status: 'running',
      message: `Running all tests with ${concurrency} worker${concurrency > 1 ? 's' : ''}...`,
      runId: null,
      startedAt: new Date(),
    });
    try {
      console.log('[GoalTestCases] Running all tests with concurrency:', concurrency);
      const result = await dispatch(runGoalTests({ config: { concurrency } })).unwrap();
      console.log('[GoalTestCases] All tests started successfully');
      setExecutionState({
        status: 'success',
        message: `Started ${result.caseIds.length} tests with ${concurrency} worker${concurrency > 1 ? 's' : ''}`,
        runId: result.runId,
        startedAt: new Date(),
      });
    } catch (err) {
      console.error('[GoalTestCases] Failed to run all tests:', err);
      setExecutionState({
        status: 'error',
        message: String(err),
        runId: null,
        startedAt: new Date(),
      });
    }
  };
  const handleSync = () => dispatch(syncGoalTestCasesToTypeScript());
  const handleSelectTestCase = (id: string) => { dispatch(selectTestCase(id)); setActiveTab('persona'); };
  const handleToggleSelection = (id: string) => dispatch(toggleTestCaseSelection(id));
  const handleEdit = (testCase: GoalTestCaseRecord) => { dispatch(startEditing(testCase)); setActiveTab('persona'); };
  const handleRunTest = async (caseId: string) => {
    setExecutionState({
      status: 'running',
      message: `Running ${caseId}...`,
      runId: null,
      startedAt: new Date(),
    });
    try {
      console.log('[GoalTestCases] Running test:', caseId);
      // Single test always uses concurrency 1
      const result = await dispatch(runGoalTests({ caseIds: [caseId], config: { concurrency: 1 } })).unwrap();
      console.log('[GoalTestCases] Test started successfully:', caseId);
      setExecutionState({
        status: 'success',
        message: `Test ${caseId} started`,
        runId: result.runId,
        startedAt: new Date(),
      });
    } catch (err) {
      console.error('[GoalTestCases] Failed to run test:', caseId, err);
      setExecutionState({
        status: 'error',
        message: `Failed: ${String(err)}`,
        runId: null,
        startedAt: new Date(),
      });
    }
  };
  const handleRunCategory = async (category: TestCategory) => {
    setExecutionState({
      status: 'running',
      message: `Running ${category} tests with ${concurrency} worker${concurrency > 1 ? 's' : ''}...`,
      runId: null,
      startedAt: new Date(),
    });
    try {
      console.log('[GoalTestCases] Running category:', category, 'with concurrency:', concurrency);
      const result = await dispatch(runGoalTests({ category, config: { concurrency } })).unwrap();
      console.log('[GoalTestCases] Category started successfully:', category);
      setExecutionState({
        status: 'success',
        message: `Started ${result.caseIds.length} ${category} tests`,
        runId: result.runId,
        startedAt: new Date(),
      });
    } catch (err) {
      console.error('[GoalTestCases] Failed to run category:', category, err);
      setExecutionState({
        status: 'error',
        message: `Failed: ${String(err)}`,
        runId: null,
        startedAt: new Date(),
      });
    }
  };

  const handleDismissExecution = () => {
    setExecutionState({
      status: 'idle',
      message: '',
      runId: null,
      startedAt: null,
    });
  };

  const handleViewResults = () => {
    if (executionState.runId) {
      // Navigate to test monitor with this run ID
      window.location.href = `/test-monitor?runId=${executionState.runId}`;
    }
  };
  const handleCancelEdit = () => dispatch(cancelEditing());

  const handleSaveTestCase = async () => {
    if (!editingTestCase) return;
    try {
      if (isCreating) {
        await dispatch(createGoalTestCase(editingTestCase)).unwrap();
      } else {
        await dispatch(updateGoalTestCase(editingTestCase)).unwrap();
      }
      dispatch(cancelEditing());
    } catch (err) {
      console.error('Failed to save test case:', err);
    }
  };

  const handlePersonaChange = (persona: UserPersonaDTO) => {
    if (editingTestCase) dispatch(startEditing({ ...editingTestCase, persona }));
  };

  const handleGoalsChange = (goals: GoalTestCaseRecord['goals']) => {
    if (editingTestCase) dispatch(startEditing({ ...editingTestCase, goals }));
  };

  const handleConstraintsChange = (responseConfig: ResponseConfigDTO) => {
    if (editingTestCase) dispatch(startEditing({ ...editingTestCase, responseConfig }));
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Running Banner */}
      {running && (
        <div className="flex-shrink-0 bg-emerald-500 text-white px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="font-medium">
              Running {runningCaseIds.length > 0 ? `${runningCaseIds.length} test(s)` : 'tests'}...
            </span>
          </div>
          {lastRunId && (
            <span className="text-sm opacity-80">Run ID: {lastRunId}</span>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex-shrink-0 bg-red-500 text-white px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icons.XCircle />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => dispatch({ type: 'goalTestCases/clearError' })}
            className="text-white hover:text-red-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex">
        {/* Left Panel - Test Case List */}
        <div className="w-[540px] flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          {/* Panel Header */}
          <div className="flex-shrink-0 px-5 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Goal Test Cases
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {filteredTestCases.length} tests
                  {selectionState.hasSelection && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {' '}· {selectionState.selectedCount} selected
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Concurrency Config Toggle */}
                <div className="relative" ref={configDropdownRef}>
                  <button
                    onClick={() => setShowConfig(!showConfig)}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg',
                      'border transition-colors',
                      showConfig
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    )}
                  >
                    <Icons.Workers />
                    <span>{concurrency}</span>
                  </button>

                  {/* Concurrency Dropdown */}
                  {showConfig && (
                    <div className={clsx(
                      'absolute right-0 mt-2 w-64 p-4 rounded-xl shadow-lg z-50',
                      'bg-white dark:bg-gray-800',
                      'border border-gray-200 dark:border-gray-700'
                    )}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Parallel Workers
                        </span>
                        <span className={clsx(
                          'px-2 py-0.5 text-xs font-bold rounded-full',
                          concurrency > 3
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        )}>
                          {concurrency}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={concurrency}
                        onChange={(e) => setConcurrency(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        disabled={running}
                      />
                      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <span>1</span>
                        <span>5</span>
                        <span>10</span>
                      </div>
                      {concurrency > 3 && (
                        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <Icons.AlertTriangle />
                          High concurrency may trigger API rate limits
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleRunAll}
                  disabled={running}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg',
                    'bg-emerald-500 hover:bg-emerald-600 text-white',
                    'shadow-sm transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {running ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Icons.Play />
                      Run All
                    </>
                  )}
                </button>
                <button
                  onClick={handleCreateNew}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg',
                    'bg-blue-500 hover:bg-blue-600 text-white',
                    'shadow-sm transition-colors'
                  )}
                >
                  <Icons.Plus />
                  New
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Icons.Search />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, persona, or tags..."
                className={clsx(
                  'block w-full pl-10 pr-4 py-2.5 text-sm rounded-lg',
                  'border border-gray-200 dark:border-gray-600',
                  'bg-gray-50 dark:bg-gray-900',
                  'text-gray-900 dark:text-gray-100',
                  'placeholder-gray-400',
                  'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                  'transition-all'
                )}
              />
            </div>
          </div>

          {/* Test Case List */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
              </div>
            ) : error ? (
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            ) : filteredTestCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <Icons.Clipboard />
                <p className="mt-3 text-gray-500 dark:text-gray-400 font-medium">No test cases found</p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-sm text-blue-600 hover:underline"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              categories.map((category) => (
                <CategorySection
                  key={category}
                  category={category}
                  testCases={testCasesByCategory[category] || []}
                  isCollapsed={collapsedCategories.includes(category)}
                  selectedIds={selectedTestCaseIds}
                  activeId={selectedTestCaseId}
                  runningCaseIds={runningCaseIds}
                  onToggleCollapse={() => dispatch(toggleCategoryCollapse(category))}
                  onSelectTestCase={handleSelectTestCase}
                  onToggleSelection={handleToggleSelection}
                  onRunTest={handleRunTest}
                  onRunCategory={() => handleRunCategory(category)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Detail View */}
        <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-gray-800">
          {activeTestCase ? (
            <>
              {/* Detail Header */}
              <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className={clsx(
                        'px-2.5 py-1 text-xs font-mono font-bold rounded',
                        categoryConfig[activeTestCase.category as TestCategory]?.colors.badge
                      )}>
                        {activeTestCase.caseId}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {activeTestCase.name || 'Untitled Test'}
                    </h2>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <Icons.User />
                        {activeTestCase.persona?.name || 'No persona'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Icons.Target />
                        {activeTestCase.goals?.length || 0} goals
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingTestCase ? (
                      <>
                        <button
                          onClick={handleCancelEdit}
                          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveTestCase}
                          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          {isCreating ? 'Create Test' : 'Save Changes'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleEdit(activeTestCase)}
                          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRunTest(activeTestCase.caseId)}
                          disabled={running}
                          className={clsx(
                            'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg',
                            'bg-emerald-500 hover:bg-emerald-600 text-white',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                        >
                          {running && runningCaseIds.includes(activeTestCase.caseId) ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Running...
                            </>
                          ) : (
                            <>
                              <Icons.Play />
                              Run Test
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex-shrink-0 flex gap-1 px-6 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                {(['persona', 'goals', 'config'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={clsx(
                      'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                      activeTab === tab
                        ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    )}
                  >
                    {tab === 'persona' && 'Persona'}
                    {tab === 'goals' && 'Goals'}
                    {tab === 'config' && 'Response Config'}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-6">
                {activeTab === 'persona' && (
                  <PersonaEditor
                    persona={activeTestCase.persona}
                    onChange={handlePersonaChange}
                    readOnly={!editingTestCase}
                  />
                )}
                {activeTab === 'goals' && (
                  <GoalsEditor
                    goals={activeTestCase.goals}
                    onChange={handleGoalsChange}
                    readOnly={!editingTestCase}
                  />
                )}
                {activeTab === 'config' && (
                  <ConstraintsEditor
                    constraints={activeTestCase.responseConfig}
                    onChange={handleConstraintsChange}
                    readOnly={!editingTestCase}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <Icons.Clipboard />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Select a Test Case
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Choose a test from the list to view details
                </p>
                <button
                  onClick={handleCreateNew}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white"
                >
                  <Icons.Plus />
                  Create New Test
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Execution Status Indicator */}
      <ExecutionStatusIndicator
        execution={executionState}
        onDismiss={handleDismissExecution}
        onViewResults={handleViewResults}
      />
    </div>
  );
}

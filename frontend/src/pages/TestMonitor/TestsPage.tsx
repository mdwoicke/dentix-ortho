/**
 * Tests Page (Unified)
 *
 * Combines:
 * - GoalTestsDashboard (test library/execution)
 * - CreateGoalTestPage (test creation wizard)
 * - TestRunHistory (execution history)
 *
 * Layout: 3-panel design
 * - Left: Test library (categories + search)
 * - Center: Test editor/details + Execution config
 * - Right: Execution history + Real-time status
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { clsx } from 'clsx';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { PersonaEditor } from '../../components/features/testCases/PersonaEditor';
import { GoalsEditor } from '../../components/features/testCases/GoalsEditor';
import { ResponseConfigEditor } from '../../components/features/testCases/ResponseConfigEditor';
import { PageHeader } from '../../components/layout';
import { Button, Card } from '../../components/ui';

import type { AppDispatch, RootState } from '../../store/store';
import {
  fetchGoalTestCases,
  createGoalTestCase,
  updateGoalTestCase,
  runGoalTests,
  selectTestCase,
  toggleTestCaseSelection,
  selectAllInCategory,
  deselectAllInCategory,
  selectAll,
  clearSelection,
  startEditing,
  startCreating,
  cancelEditing,
  setFilters,
  toggleCategoryCollapse,
  selectFilteredGoalTestCases,
  selectTestCasesByCategory,
  selectSelectionState,
} from '../../store/slices/goalTestCasesSlice';
import {
  fetchTestRuns,
  selectTestRuns,
} from '../../store/slices/testMonitorSlice';
import { subscribeToExecution } from '../../services/api/testMonitorApi';
import type { ExecutionStreamEvent } from '../../services/api/testMonitorApi';
import { getTestEnvironmentPresets, getFlowiseConfigs } from '../../services/api/appSettingsApi';
import type { TestEnvironmentPresetWithNames, FlowiseConfigProfile } from '../../types/appSettings.types';

import type {
  GoalTestCaseRecord,
  UserPersonaDTO,
  ResponseConfigDTO,
  TestCategory,
} from '../../types/testMonitor.types';

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
  Expand: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
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
  X: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

// ============================================================================
// CATEGORY CONFIG
// ============================================================================

const CATEGORY_CONFIG: Record<TestCategory, {
  label: string;
  description: string;
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
    description: 'Standard user flows',
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
    description: 'Boundary conditions',
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
    description: 'Error recovery',
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

const CATEGORIES: TestCategory[] = ['happy-path', 'edge-case', 'error-handling'];

// ============================================================================
// EXECUTION STATE
// ============================================================================

interface ExecutionState {
  isExecuting: boolean;
  runId: string | null;
  progress: {
    total: number;
    completed: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  workers: Array<{
    workerId: number;
    status: string;
    currentTestName: string | null;
  }>;
}

// ============================================================================
// TEST CASE LIST ITEM
// ============================================================================

function TestCaseListItem({
  testCase,
  isSelected,
  isActive,
  isRunning,
  onSelect,
  onClick,
  onOpenPopout,
}: {
  testCase: GoalTestCaseRecord;
  isSelected: boolean;
  isActive: boolean;
  isRunning: boolean;
  onSelect: () => void;
  onClick: () => void;
  onOpenPopout: () => void;
}) {
  const config = CATEGORY_CONFIG[testCase.category as TestCategory];

  return (
    <div
      onClick={onClick}
      className={clsx(
        'group relative rounded-lg border p-2 cursor-pointer transition-all duration-200',
        isRunning
          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 animate-pulse'
          : isActive
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        testCase.isArchived && 'opacity-60'
      )}
    >
      {/* Category accent bar */}
      <div className={clsx('absolute left-0 top-2 bottom-2 w-1 rounded-r', config.colors.accent)} />

      <div className="flex items-start gap-2 pl-2">
        {/* Checkbox */}
        <div className="pt-0.5" onClick={(e) => { e.stopPropagation(); onSelect(); }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={clsx(
              'inline-flex px-1 py-0.5 text-[10px] font-mono font-medium rounded',
              config.colors.badge
            )}>
              {testCase.caseId}
            </span>
            {isRunning && (
              <span className="flex items-center gap-0.5 px-1 py-0.5 text-[10px] font-bold bg-emerald-500 text-white rounded">
                <div className="w-1.5 h-1.5 border border-white border-t-transparent rounded-full animate-spin" />
              </span>
            )}
          </div>
          <h4 className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
            {testCase.name || 'Untitled Test'}
          </h4>
        </div>

        {/* Expand button - visible on hover */}
        <button
          onClick={(e) => { e.stopPropagation(); onOpenPopout(); }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
          title="Quick view"
        >
          <Icons.Expand />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// CATEGORY SECTION
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
  onSelectAllInCategory,
  onDeselectAllInCategory,
  onOpenPopout,
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
  onSelectAllInCategory: () => void;
  onDeselectAllInCategory: () => void;
  onOpenPopout: (testCase: GoalTestCaseRecord) => void;
}) {
  const config = CATEGORY_CONFIG[category];

  // Check if all tests in this category are selected
  const allSelected = testCases.length > 0 && testCases.every(tc => selectedIds.includes(String(tc.id)));
  const someSelected = testCases.some(tc => selectedIds.includes(String(tc.id)));

  const handleCategoryCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allSelected) {
      onDeselectAllInCategory();
    } else {
      onSelectAllInCategory();
    }
  };

  return (
    <div className="mb-3">
      <div
        className={clsx(
          'w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors',
          config.colors.bg,
          'border',
          config.colors.border,
          'hover:opacity-90'
        )}
      >
        {/* Checkbox for select all in category */}
        <div
          className="flex items-center gap-1.5 cursor-pointer"
          onClick={handleCategoryCheckbox}
        >
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={() => {}}
            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
          />
        </div>

        <button
          onClick={onToggleCollapse}
          className="flex-1 flex items-center justify-between"
        >
          <div className="flex items-center gap-1.5">
            <span className={config.colors.text}>
              {isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
            </span>
            <span className={clsx('text-xs font-semibold', config.colors.text)}>
              {config.label}
            </span>
          </div>
          <span className={clsx(
            'px-1.5 py-0.5 text-[10px] font-bold rounded-full',
            config.colors.badge
          )}>
            {testCases.length}
          </span>
        </button>
      </div>

      {!isCollapsed && testCases.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {testCases.map((testCase) => (
            <TestCaseListItem
              key={testCase.id}
              testCase={testCase}
              isSelected={selectedIds.includes(String(testCase.id))}
              isActive={activeId === String(testCase.id)}
              isRunning={runningCaseIds.includes(testCase.caseId)}
              onSelect={() => onToggleSelection(String(testCase.id))}
              onClick={() => onSelectTestCase(String(testCase.id))}
              onOpenPopout={() => onOpenPopout(testCase)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TEST DETAIL POPOUT
// ============================================================================

function TestDetailPopout({
  testCase,
  onClose,
  onEdit,
  onRun,
}: {
  testCase: GoalTestCaseRecord;
  onClose: () => void;
  onEdit: () => void;
  onRun: () => void;
}) {
  const config = CATEGORY_CONFIG[testCase.category as TestCategory];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={clsx(
                'px-2 py-0.5 text-xs font-mono font-bold rounded',
                config.colors.badge
              )}>
                {testCase.caseId}
              </span>
              <span className={clsx(
                'px-2 py-0.5 text-[10px] font-medium rounded',
                config.colors.badge
              )}>
                {config.label}
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {testCase.name || 'Untitled Test'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Icons.X />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-140px)]">
          {/* Persona Section */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Icons.User />
              Persona
            </h3>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
              {testCase.persona?.name && (
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Name:</span>
                  <span className="ml-2 text-sm text-gray-900 dark:text-gray-100">{testCase.persona.name}</span>
                </div>
              )}
              {testCase.persona?.dateOfBirth && (
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">DOB:</span>
                  <span className="ml-2 text-sm text-gray-900 dark:text-gray-100">{testCase.persona.dateOfBirth}</span>
                </div>
              )}
              {testCase.persona?.location && (
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Location:</span>
                  <span className="ml-2 text-sm text-gray-900 dark:text-gray-100">{testCase.persona.location}</span>
                </div>
              )}
              {testCase.persona?.existingPatient !== undefined && (
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Patient Status:</span>
                  <span className={clsx(
                    'ml-2 text-sm',
                    testCase.persona.existingPatient
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  )}>
                    {testCase.persona.existingPatient ? 'Existing Patient' : 'New Patient'}
                  </span>
                </div>
              )}
              {!testCase.persona?.name && (
                <span className="text-xs text-gray-400 italic">No persona configured</span>
              )}
            </div>
          </div>

          {/* Goals Section */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Icons.Target />
              Goals ({testCase.goals?.length || 0})
            </h3>
            <div className="space-y-2">
              {testCase.goals && testCase.goals.length > 0 ? (
                testCase.goals.map((goal, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border-l-3 border-primary-500"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-2">
                          #{index + 1}
                        </span>
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {goal.description || goal.goalType || 'No description'}
                        </span>
                      </div>
                      {goal.required && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 rounded">
                          Required
                        </span>
                      )}
                    </div>
                    {goal.successCriteria && (
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-medium">Success:</span> {goal.successCriteria}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <span className="text-xs text-gray-400 italic">No goals configured</span>
                </div>
              )}
            </div>
          </div>

          {/* Response Config Section */}
          {testCase.responseConfig && Object.keys(testCase.responseConfig).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <Icons.Settings />
                Response Config
              </h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(testCase.responseConfig, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <Button size="sm" variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" onClick={onRun}>
            <Icons.Play />
            Run Test
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EXECUTION CONFIG PANEL
// ============================================================================

function ExecutionConfigPanel({
  concurrency,
  setConcurrency,
  runCount,
  setRunCount,
  testTimeout,
  setTestTimeout,
  retryFailed,
  setRetryFailed,
  enableSemanticEval,
  setEnableSemanticEval,
  isExecuting,
  onStartExecution,
  onStopExecution,
  testCount,
  selectedCount,
  flowiseConfigs,
  selectedFlowiseConfigId,
  onFlowiseConfigChange,
}: {
  concurrency: number;
  setConcurrency: (v: number) => void;
  runCount: number;
  setRunCount: (v: number) => void;
  testTimeout: number;
  setTestTimeout: (v: number) => void;
  retryFailed: boolean;
  setRetryFailed: (v: boolean) => void;
  enableSemanticEval: boolean;
  setEnableSemanticEval: (v: boolean) => void;
  isExecuting: boolean;
  onStartExecution: () => void;
  onStopExecution: () => void;
  testCount: number;
  selectedCount: number;
  flowiseConfigs: FlowiseConfigProfile[];
  selectedFlowiseConfigId: number | null;
  onFlowiseConfigChange: (configId: number) => void;
}) {
  const effectiveCount = selectedCount > 0 ? selectedCount : testCount;
  const totalRuns = effectiveCount * runCount;
  const selectedConfig = flowiseConfigs.find(c => c.id === selectedFlowiseConfigId);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Icons.Settings />
        Execution Config
      </h4>

      {/* Flowise Config Selector */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Flowise Config
        </label>
        <select
          value={selectedFlowiseConfigId || ''}
          onChange={(e) => onFlowiseConfigChange(parseInt(e.target.value))}
          className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
          disabled={isExecuting}
        >
          {flowiseConfigs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.name}{config.isDefault ? ' (Default)' : ''}
            </option>
          ))}
        </select>
        {selectedConfig && (
          <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 truncate">
            {selectedConfig.url ? selectedConfig.url.replace(/^https?:\/\//, '').substring(0, 40) + '...' : 'No URL'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Concurrency */}
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Concurrency
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={10}
              value={concurrency}
              onChange={(e) => setConcurrency(parseInt(e.target.value))}
              className="flex-1 h-1"
              disabled={isExecuting}
            />
            <span className="w-6 text-center text-xs font-medium text-gray-900 dark:text-white">
              {concurrency}
            </span>
          </div>
        </div>

        {/* Run Count */}
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Runs/test
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={10}
              value={runCount}
              onChange={(e) => setRunCount(parseInt(e.target.value))}
              className="flex-1 h-1"
              disabled={isExecuting}
            />
            <span className="w-6 text-center text-xs font-medium text-gray-900 dark:text-white">
              {runCount}
            </span>
          </div>
        </div>
      </div>

      {/* Timeout */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Timeout
        </label>
        <select
          value={testTimeout}
          onChange={(e) => setTestTimeout(parseInt(e.target.value))}
          className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          disabled={isExecuting}
        >
          <option value={30000}>30s</option>
          <option value={60000}>60s</option>
          <option value={120000}>120s</option>
        </select>
      </div>

      {/* Options */}
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={retryFailed}
            onChange={(e) => setRetryFailed(e.target.checked)}
            className="h-3 w-3 text-primary-600 rounded"
            disabled={isExecuting}
          />
          Retry failed
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={enableSemanticEval}
            onChange={(e) => setEnableSemanticEval(e.target.checked)}
            className="h-3 w-3 text-primary-600 rounded"
            disabled={isExecuting}
          />
          Semantic eval
        </label>
      </div>

      {/* Start/Stop Button */}
      {isExecuting ? (
        <Button onClick={onStopExecution} variant="danger" className="w-full" size="sm">
          Stop Execution
        </Button>
      ) : (
        <Button
          onClick={onStartExecution}
          variant="primary"
          className="w-full"
          size="sm"
          disabled={testCount === 0}
        >
          <Icons.Play />
          Run {effectiveCount} tests{runCount > 1 ? ` (${totalRuns} total)` : ''}
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TestsPage() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  // Redux state
  const state = useSelector((state: RootState) => state.goalTestCases);
  const loading = state?.loading || false;
  const running = state?.running || false;
  const runningCaseIds = state?.runningCaseIds || [];
  const error = state?.error || null;
  const selectedTestCase = state?.selectedTestCase || null;
  const selectedTestCaseId = selectedTestCase?.id !== undefined ? String(selectedTestCase.id) : null;
  const selectedTestCaseIds = state?.selectedTestCaseIds || [];
  const editingTestCase = state?.editingTestCase || null;
  const isCreating = state?.isCreating || false;
  const collapsedCategories = state?.collapsedCategories || [];

  const filteredTestCases = useSelector(selectFilteredGoalTestCases) || [];
  const testCasesByCategory = useSelector(selectTestCasesByCategory) || {};
  const recentRuns = useSelector(selectTestRuns) || [];

  // Local state
  const [activeTab, setActiveTab] = useState<'persona' | 'goals' | 'config'>('persona');
  const [searchQuery, setSearchQuery] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  const [runCount, setRunCount] = useState(1);
  const [testTimeout, setTestTimeout] = useState(60000);
  const [retryFailed, setRetryFailed] = useState(false);
  const [enableSemanticEval, setEnableSemanticEval] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [popoutTestCase, setPopoutTestCase] = useState<GoalTestCaseRecord | null>(null);
  const [showLibraryPopout, setShowLibraryPopout] = useState(false);
  const [libraryPopoutMode, setLibraryPopoutMode] = useState<'browse' | 'create-choice' | 'create-manual'>('browse');
  const [popoutCreateTab, setPopoutCreateTab] = useState<'persona' | 'goals' | 'config'>('persona');
  const [popoutNewTest, setPopoutNewTest] = useState<Partial<GoalTestCaseRecord>>({
    category: 'happy-path',
    name: '',
    persona: {
      inventory: {
        parentFirstName: '',
        parentLastName: '',
        parentPhone: '',
        parentEmail: '',
        children: [],
      },
      traits: {},
    },
    goals: [],
    responseConfig: {},
  });
  const [popoutSaving, setPopoutSaving] = useState(false);

  // Environment presets state (kept for run history filtering)
  const [environmentPresets, setEnvironmentPresets] = useState<TestEnvironmentPresetWithNames[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [presetsLoading, setPresetsLoading] = useState(true);
  // Flowise configs state (for execution config dropdown)
  const [flowiseConfigs, setFlowiseConfigs] = useState<FlowiseConfigProfile[]>([]);
  const [selectedFlowiseConfigId, setSelectedFlowiseConfigId] = useState<number | null>(null);
  // Filter for runs by environment preset
  const [runFilterPresetId, setRunFilterPresetId] = useState<number | null | 'all'>(null);

  // Execution state
  const [executionState, setExecutionState] = useState<ExecutionState>({
    isExecuting: false,
    runId: null,
    progress: { total: 0, completed: 0, passed: 0, failed: 0, skipped: 0 },
    workers: [],
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  // Compute selected test count
  const selectedTestCount = useMemo(() => {
    return filteredTestCases.filter(tc => selectedTestCaseIds.includes(String(tc.id))).length;
  }, [filteredTestCases, selectedTestCaseIds]);

  // Handle SSE events
  const handleExecutionEvent = useCallback((event: ExecutionStreamEvent) => {
    switch (event.type) {
      case 'progress-update':
        setExecutionState(prev => ({ ...prev, progress: event.data }));
        break;
      case 'workers-update':
        setExecutionState(prev => ({ ...prev, workers: event.data }));
        break;
      case 'worker-status':
        setExecutionState(prev => ({
          ...prev,
          workers: prev.workers.map(w =>
            w.workerId === event.data.workerId ? { ...w, ...event.data } : w
          ),
        }));
        break;
      case 'execution-completed':
      case 'execution-stopped':
      case 'complete':
        setExecutionState(prev => ({ ...prev, isExecuting: false }));
        dispatch(fetchTestRuns({}));
        break;
    }
  }, [dispatch]);

  // Fetch data on mount
  useEffect(() => {
    dispatch(fetchGoalTestCases());
    dispatch(fetchTestRuns({}));
  }, [dispatch]);

  // Fetch environment presets on mount (for run history filtering)
  useEffect(() => {
    const fetchPresets = async () => {
      setPresetsLoading(true);
      try {
        const presets = await getTestEnvironmentPresets();
        setEnvironmentPresets(presets);
        const defaultPreset = presets.find(p => p.isDefault) || presets[0];
        if (defaultPreset) {
          setSelectedPresetId(defaultPreset.id);
        }
      } catch (error) {
        console.error('[TestsPage] Failed to fetch environment presets:', error);
      } finally {
        setPresetsLoading(false);
      }
    };
    fetchPresets();
  }, []);

  // Fetch Flowise configs on mount (for execution config dropdown)
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const configs = await getFlowiseConfigs();
        setFlowiseConfigs(configs);
        const defaultConfig = configs.find(c => c.isDefault) || configs[0];
        if (defaultConfig) {
          setSelectedFlowiseConfigId(defaultConfig.id);
          console.log('[TestsPage] Default Flowise config selected:', defaultConfig.name, '(id:', defaultConfig.id, ')');
        }
      } catch (error) {
        console.error('[TestsPage] Failed to fetch Flowise configs:', error);
      }
    };
    fetchConfigs();
  }, []);

  // Auto-poll test runs when any run is "running"
  useEffect(() => {
    const hasRunningRun = recentRuns.some(run => run.status === 'running');
    const pollInterval = hasRunningRun ? 3000 : 30000; // 3s when running, 30s otherwise

    const intervalId = setInterval(() => {
      dispatch(fetchTestRuns({}));
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [dispatch, recentRuns]);

  // Subscribe to SSE when execution starts
  useEffect(() => {
    if (executionState.isExecuting && executionState.runId && !eventSourceRef.current) {
      eventSourceRef.current = subscribeToExecution(
        executionState.runId,
        handleExecutionEvent,
        (error) => console.error('[SSE] Connection error:', error)
      );
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [executionState.isExecuting, executionState.runId, handleExecutionEvent]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch(setFilters({ search: searchQuery }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, dispatch]);

  // Get currently active test case
  const activeTestCase = useMemo(() => {
    return editingTestCase || selectedTestCase;
  }, [selectedTestCase, editingTestCase]);

  // Filter runs by environment preset
  const filteredRuns = useMemo(() => {
    if (runFilterPresetId === 'all' || runFilterPresetId === null) {
      return recentRuns;
    }
    return recentRuns.filter(run => run.environmentPresetId === runFilterPresetId);
  }, [recentRuns, runFilterPresetId]);

  // Prepare trend data for chart
  const trendData = useMemo(() => {
    return filteredRuns
      .slice(0, 10)
      .reverse()
      .map((run) => ({
        date: new Date(run.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        passRate: run.totalTests > 0 ? Math.round((run.passed / run.totalTests) * 100) : 0,
        runId: run.runId,
      }));
  }, [filteredRuns]);

  // Handlers
  const handleStartExecution = async () => {
    try {
      if (!selectedFlowiseConfigId) {
        console.error('[TestsPage] No Flowise config selected! Cannot run tests.');
        alert('Please select a Flowise config before running tests.');
        return;
      }

      const baseCaseIds = selectedTestCount > 0
        ? filteredTestCases.filter(tc => selectedTestCaseIds.includes(String(tc.id))).map(tc => tc.caseId)
        : filteredTestCases.map(tc => tc.caseId);

      const caseIds = runCount > 1
        ? Array.from({ length: runCount }, () => baseCaseIds).flat()
        : baseCaseIds;

      console.log('[TestsPage] Starting execution with:', {
        flowiseConfigId: selectedFlowiseConfigId,
        testCount: caseIds.length,
      });

      const result = await dispatch(runGoalTests({
        caseIds,
        config: {
          concurrency,
          timeout: testTimeout,
          retryFailedTests: retryFailed,
          flowiseConfigId: selectedFlowiseConfigId,
        },
      })).unwrap();

      setExecutionState({
        isExecuting: true,
        runId: result.runId,
        progress: { total: result.caseIds.length, completed: 0, passed: 0, failed: 0, skipped: 0 },
        workers: Array.from({ length: concurrency }, (_, i) => ({
          workerId: i + 1,
          status: 'idle',
          currentTestName: null,
        })),
      });

      // Navigate to the run detail page
      navigate(`/test-monitor/run/${result.runId}`);
    } catch (err) {
      console.error('Failed to start execution:', err);
    }
  };

  const handleStopExecution = () => {
    setExecutionState(prev => ({ ...prev, isExecuting: false }));
  };

  const handleViewRun = (runId: string) => {
    navigate(`/test-monitor/run/${runId}`);
  };

  const handleSelectTestCase = (id: string) => {
    dispatch(selectTestCase(id));
    setActiveTab('persona');
  };

  const handleToggleSelection = (id: string) => dispatch(toggleTestCaseSelection(id));

  const handleCancelSelection = () => {
    dispatch(selectTestCase(null));
    dispatch(cancelEditing());
  };

  const handleEdit = () => {
    if (selectedTestCase) {
      dispatch(startEditing(selectedTestCase));
    }
  };

  const handleRunSelectedTest = async () => {
    if (!selectedTestCase) return;
    if (!selectedFlowiseConfigId) {
      alert('Please select a Flowise config before running tests.');
      return;
    }
    try {
      console.log('[TestsPage] Running single test with:', {
        flowiseConfigId: selectedFlowiseConfigId,
        testId: selectedTestCase.caseId,
      });

      const result = await dispatch(runGoalTests({
        caseIds: [selectedTestCase.caseId],
        config: {
          concurrency: 1,
          flowiseConfigId: selectedFlowiseConfigId,
        },
      })).unwrap();

      setExecutionState({
        isExecuting: true,
        runId: result.runId,
        progress: { total: 1, completed: 0, passed: 0, failed: 0, skipped: 0 },
        workers: [{ workerId: 1, status: 'idle', currentTestName: null }],
      });

      // Navigate to the run detail page
      navigate(`/test-monitor/run/${result.runId}`);
    } catch (err) {
      console.error('Failed to run test:', err);
    }
  };

  const handleSaveTestCase = async () => {
    if (!editingTestCase) return;
    try {
      if (isCreating) {
        await dispatch(createGoalTestCase(editingTestCase)).unwrap();
      } else {
        await dispatch(updateGoalTestCase({
          caseId: editingTestCase.caseId,
          updates: editingTestCase,
        })).unwrap();
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

  const handleCreateNew = () => {
    navigate('/test-monitor/create');
  };

  const handleOpenCreateInPopout = () => {
    setLibraryPopoutMode('create-choice');
  };

  const handleChooseManualCreate = () => {
    setLibraryPopoutMode('create-manual');
    setPopoutCreateTab('persona');
    setPopoutNewTest({
      category: 'happy-path',
      name: '',
      persona: {
        inventory: {
          parentFirstName: '',
          parentLastName: '',
          parentPhone: '',
          parentEmail: '',
          children: [],
        },
        traits: {},
      },
      goals: [],
      responseConfig: {},
    });
  };

  const handleChooseWizardCreate = () => {
    setShowLibraryPopout(false);
    setLibraryPopoutMode('browse');
    navigate('/test-monitor/create');
  };

  const handleCancelCreateInPopout = () => {
    setLibraryPopoutMode('browse');
  };

  const handleSaveTestFromPopout = async () => {
    if (!popoutNewTest.name || !popoutNewTest.category) {
      alert('Please provide a name and category for the test.');
      return;
    }
    setPopoutSaving(true);
    try {
      await dispatch(createGoalTestCase(popoutNewTest as GoalTestCaseRecord)).unwrap();
      setLibraryPopoutMode('browse');
      setPopoutNewTest({
        category: 'happy-path',
        name: '',
        persona: {
          inventory: {
            parentFirstName: '',
            parentLastName: '',
            parentPhone: '',
            parentEmail: '',
            children: [],
          },
          traits: {},
        },
        goals: [],
        responseConfig: {},
      });
    } catch (err) {
      console.error('Failed to create test case:', err);
    } finally {
      setPopoutSaving(false);
    }
  };

  const handleOpenPopout = (testCase: GoalTestCaseRecord) => {
    setPopoutTestCase(testCase);
  };

  const handleClosePopout = () => {
    setPopoutTestCase(null);
  };

  const handleEditFromPopout = () => {
    if (popoutTestCase) {
      dispatch(selectTestCase(String(popoutTestCase.id)));
      dispatch(startEditing(popoutTestCase));
      setPopoutTestCase(null);
    }
  };

  const handleRunFromPopout = async () => {
    if (!popoutTestCase) return;
    if (!selectedFlowiseConfigId) {
      alert('Please select a Flowise config before running tests.');
      return;
    }
    try {
      const result = await dispatch(runGoalTests({
        caseIds: [popoutTestCase.caseId],
        config: {
          concurrency: 1,
          flowiseConfigId: selectedFlowiseConfigId,
        },
      })).unwrap();

      setPopoutTestCase(null);
      navigate(`/test-monitor/run/${result.runId}`);
    } catch (err) {
      console.error('Failed to run test:', err);
    }
  };

  // Progress percentage
  const progressPercentage = executionState.progress.total > 0
    ? Math.round((executionState.progress.completed / executionState.progress.total) * 100)
    : 0;

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Tests</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage and execute goal-based test cases
          </p>
        </div>
        <Button onClick={handleCreateNew} size="sm">
          <Icons.Plus />
          New Test
        </Button>
      </div>

      {/* 3-Panel Layout - CSS Grid */}
      <div className="flex-1 grid grid-cols-12 gap-4">
        {/* LEFT PANEL - Test Library */}
        <div className="col-span-3 flex flex-col gap-3">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
              <Icons.Search />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tests..."
              className={clsx(
                'block w-full pl-8 pr-3 py-1.5 text-sm rounded-lg',
                'border border-gray-200 dark:border-gray-600',
                'bg-white dark:bg-gray-800',
                'text-gray-900 dark:text-gray-100',
                'placeholder-gray-400',
                'focus:ring-2 focus:ring-primary-500 focus:border-transparent'
              )}
            />
          </div>

          {/* Test Categories */}
          <Card className="flex-1 overflow-hidden">
            <div className="p-3 h-full flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Test Library
                  </h3>
                  <button
                    onClick={() => setShowLibraryPopout(true)}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Open in popout"
                  >
                    <Icons.Expand />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTestCaseIds.length > 0 && (
                    <button
                      onClick={() => dispatch(clearSelection())}
                      className="text-[10px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      Clear ({selectedTestCaseIds.length})
                    </button>
                  )}
                  <button
                    onClick={() => dispatch(selectAll())}
                    className="text-[10px] text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                    title="Select all tests"
                  >
                    All
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {filteredTestCases.length}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-20">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent" />
                  </div>
                ) : error ? (
                  <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                  </div>
                ) : (
                  CATEGORIES.map((category) => (
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
                      onSelectAllInCategory={() => dispatch(selectAllInCategory(category))}
                      onDeselectAllInCategory={() => dispatch(deselectAllInCategory(category))}
                      onOpenPopout={handleOpenPopout}
                    />
                  ))
                )}
              </div>
            </div>
          </Card>

          {/* Execution Config */}
          <Card className="p-3">
            <ExecutionConfigPanel
              concurrency={concurrency}
              setConcurrency={setConcurrency}
              runCount={runCount}
              setRunCount={setRunCount}
              testTimeout={testTimeout}
              setTestTimeout={setTestTimeout}
              retryFailed={retryFailed}
              setRetryFailed={setRetryFailed}
              enableSemanticEval={enableSemanticEval}
              setEnableSemanticEval={setEnableSemanticEval}
              isExecuting={executionState.isExecuting}
              onStartExecution={handleStartExecution}
              onStopExecution={handleStopExecution}
              testCount={filteredTestCases.length}
              selectedCount={selectedTestCount}
              flowiseConfigs={flowiseConfigs}
              selectedFlowiseConfigId={selectedFlowiseConfigId}
              onFlowiseConfigChange={setSelectedFlowiseConfigId}
            />
          </Card>
        </div>

        {/* CENTER PANEL - Test Editor/Details */}
        <div className="col-span-6 flex flex-col">
          <Card className="flex-1 flex flex-col">
            {activeTestCase ? (
              <>
                {/* Test Header */}
                <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx(
                          'px-2 py-0.5 text-xs font-mono font-bold rounded',
                          CATEGORY_CONFIG[activeTestCase.category as TestCategory]?.colors.badge
                        )}>
                          {activeTestCase.caseId}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {activeTestCase.name || 'Untitled Test'}
                      </h2>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Icons.User />
                          {activeTestCase.persona?.name || 'No persona'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Icons.Target />
                          {activeTestCase.goals?.length || 0} goals
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingTestCase ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => dispatch(cancelEditing())}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleSaveTestCase}>
                            Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" onClick={handleCancelSelection}>
                            <Icons.X />
                          </Button>
                          <Button size="sm" variant="secondary" onClick={handleEdit}>
                            Edit
                          </Button>
                          <Button size="sm" onClick={handleRunSelectedTest}>
                            <Icons.Play />
                            Run
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 mt-3">
                    {(['persona', 'goals', 'config'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={clsx(
                          'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                          activeTab === tab
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        )}
                      >
                        {tab === 'persona' && 'Persona'}
                        {tab === 'goals' && 'Goals'}
                        {tab === 'config' && 'Config'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {activeTab === 'persona' && (
                    <PersonaEditor
                      persona={activeTestCase.persona || {}}
                      onChange={handlePersonaChange}
                      readOnly={!editingTestCase}
                    />
                  )}
                  {activeTab === 'goals' && (
                    <GoalsEditor
                      goals={activeTestCase.goals || []}
                      onChange={handleGoalsChange}
                      readOnly={!editingTestCase}
                    />
                  )}
                  {activeTab === 'config' && (
                    <ResponseConfigEditor
                      config={activeTestCase.responseConfig || {}}
                      onChange={handleConstraintsChange}
                      readOnly={!editingTestCase}
                    />
                  )}
                </div>
              </>
            ) : (
              /* Empty State */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-gray-300 dark:text-gray-600 mb-4">
                    <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                    No Test Selected
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Select a test from the library to view details
                  </p>
                  <Button onClick={handleCreateNew} size="sm">
                    <Icons.Plus />
                    Create New Test
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT PANEL - History & Status */}
        <div className="col-span-3 flex flex-col gap-3">
          {/* Pass Rate Trend Chart */}
          <Card className="p-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Icons.Clock />
              Pass Rate Trend
            </h4>
            <div className="h-32">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={30} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-bg-primary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="passRate"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981', r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">
                  No run history yet
                </div>
              )}
            </div>
          </Card>

          {/* Execution Status */}
          {executionState.isExecuting && (
            <Card className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
              <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-2">
                Execution in Progress
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-400">
                  <span>Progress</span>
                  <span>{executionState.progress.completed}/{executionState.progress.total}</span>
                </div>
                <div className="w-full bg-emerald-200 dark:bg-emerald-900 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-600">
                    Pass: {executionState.progress.passed}
                  </span>
                  <span className="text-rose-600">
                    Fail: {executionState.progress.failed}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Recent Runs */}
          <Card className="flex-1 overflow-hidden">
            <div className="p-3 h-full flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Recent Runs
                </h4>
                {/* Environment Filter Dropdown */}
                <select
                  value={runFilterPresetId === null ? 'all' : runFilterPresetId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRunFilterPresetId(val === 'all' ? null : parseInt(val, 10));
                  }}
                  className="text-[10px] px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                >
                  <option value="all">All Environments</option>
                  {environmentPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {filteredRuns.slice(0, 5).map((run) => {
                  const passRate = run.totalTests > 0
                    ? Math.round((run.passed / run.totalTests) * 100)
                    : 0;
                  const isRunning = run.status === 'running';
                  return (
                    <button
                      key={run.runId}
                      onClick={() => handleViewRun(run.runId)}
                      className={clsx(
                        'w-full p-2 rounded-lg border transition-colors text-left',
                        isRunning
                          ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                          {new Date(run.startedAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isRunning ? (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                            </span>
                            running
                          </span>
                        ) : (
                          <span className={clsx(
                            'px-1.5 py-0.5 text-[10px] font-bold rounded',
                            passRate >= 80
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                              : passRate >= 50
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                          )}>
                            {passRate}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                        <span>{run.passed} passed</span>
                        <span>{run.failed} failed</span>
                        {run.environmentPresetName && (
                          <span className="ml-auto px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400 truncate max-w-[60px]" title={run.environmentPresetName}>
                            {run.environmentPresetName}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {filteredRuns.length === 0 && (
                  <div className="text-center text-xs text-gray-500 py-4">
                    {runFilterPresetId !== null ? 'No runs for this environment' : 'No runs yet'}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Test Detail Popout Modal */}
      {popoutTestCase && (
        <TestDetailPopout
          testCase={popoutTestCase}
          onClose={handleClosePopout}
          onEdit={handleEditFromPopout}
          onRun={handleRunFromPopout}
        />
      )}

      {/* Test Library Popout Modal */}
      {showLibraryPopout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { setShowLibraryPopout(false); setLibraryPopoutMode('browse'); }}
        >
          <div
            className="relative w-full max-w-4xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3">
                {libraryPopoutMode === 'create-manual' ? (
                  <>
                    <button
                      onClick={handleCancelCreateInPopout}
                      className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      Create New Test
                    </h2>
                  </>
                ) : libraryPopoutMode === 'create-choice' ? (
                  <>
                    <button
                      onClick={handleCancelCreateInPopout}
                      className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      Create New Test
                    </h2>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      Test Library
                    </h2>
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                      {filteredTestCases.length} tests
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {libraryPopoutMode === 'browse' && (
                  <>
                    {selectedTestCaseIds.length > 0 && (
                      <button
                        onClick={() => dispatch(clearSelection())}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        Clear ({selectedTestCaseIds.length})
                      </button>
                    )}
                    <button
                      onClick={() => dispatch(selectAll())}
                      className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      Select All
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setShowLibraryPopout(false); setLibraryPopoutMode('browse'); }}
                  className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <Icons.X />
                </button>
              </div>
            </div>

            {libraryPopoutMode === 'create-choice' ? (
              <>
                {/* Create Choice Content */}
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="grid grid-cols-2 gap-6 max-w-2xl w-full">
                    {/* Wizard Option */}
                    <button
                      onClick={handleChooseWizardCreate}
                      className="group flex flex-col items-center p-6 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 bg-white dark:bg-gray-800 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
                    >
                      <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-4 group-hover:bg-primary-200 dark:group-hover:bg-primary-900/50 transition-colors">
                        <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Use Wizard
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        Step-by-step guided creation with templates and presets
                      </p>
                      <span className="mt-4 text-xs text-primary-600 dark:text-primary-400 font-medium">
                        Recommended for new users
                      </span>
                    </button>

                    {/* Manual Option */}
                    <button
                      onClick={handleChooseManualCreate}
                      className="group flex flex-col items-center p-6 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-amber-500 dark:hover:border-amber-500 bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                    >
                      <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/50 transition-colors">
                        <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Create Manually
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        Quick form-based creation for experienced users
                      </p>
                      <span className="mt-4 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        Faster for experts
                      </span>
                    </button>
                  </div>
                </div>
              </>
            ) : libraryPopoutMode === 'create-manual' ? (
              <>
                {/* Create Form Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {/* Test Name and Category */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Test Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={popoutNewTest.name || ''}
                        onChange={(e) => setPopoutNewTest(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter test name..."
                        className={clsx(
                          'block w-full px-3 py-2 text-sm rounded-lg',
                          'border border-gray-200 dark:border-gray-600',
                          'bg-white dark:bg-gray-800',
                          'text-gray-900 dark:text-gray-100',
                          'placeholder-gray-400',
                          'focus:ring-2 focus:ring-primary-500 focus:border-transparent'
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Category <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={popoutNewTest.category || 'happy-path'}
                        onChange={(e) => setPopoutNewTest(prev => ({ ...prev, category: e.target.value as TestCategory }))}
                        className={clsx(
                          'block w-full px-3 py-2 text-sm rounded-lg',
                          'border border-gray-200 dark:border-gray-600',
                          'bg-white dark:bg-gray-800',
                          'text-gray-900 dark:text-gray-100',
                          'focus:ring-2 focus:ring-primary-500 focus:border-transparent'
                        )}
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {CATEGORY_CONFIG[cat].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
                    {(['persona', 'goals', 'config'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setPopoutCreateTab(tab)}
                        className={clsx(
                          'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                          popoutCreateTab === tab
                            ? 'border-primary-500 text-primary-700 dark:text-primary-300'
                            : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        )}
                      >
                        {tab === 'persona' && 'Persona'}
                        {tab === 'goals' && `Goals (${popoutNewTest.goals?.length || 0})`}
                        {tab === 'config' && 'Config'}
                      </button>
                    ))}
                  </div>

                  {/* Tab Content */}
                  <div className="min-h-[300px]">
                    {popoutCreateTab === 'persona' && (
                      <PersonaEditor
                        persona={popoutNewTest.persona || {}}
                        onChange={(persona) => setPopoutNewTest(prev => ({ ...prev, persona }))}
                        readOnly={false}
                      />
                    )}
                    {popoutCreateTab === 'goals' && (
                      <GoalsEditor
                        goals={popoutNewTest.goals || []}
                        onChange={(goals) => setPopoutNewTest(prev => ({ ...prev, goals }))}
                        readOnly={false}
                      />
                    )}
                    {popoutCreateTab === 'config' && (
                      <ResponseConfigEditor
                        config={popoutNewTest.responseConfig || {}}
                        onChange={(responseConfig) => setPopoutNewTest(prev => ({ ...prev, responseConfig }))}
                        readOnly={false}
                      />
                    )}
                  </div>
                </div>

                {/* Create Form Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Fill in test details and save
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={handleCancelCreateInPopout} disabled={popoutSaving}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveTestFromPopout} disabled={popoutSaving}>
                      {popoutSaving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Icons.Plus />
                          Create Test
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Search */}
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Icons.Search />
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tests..."
                      className={clsx(
                        'block w-full pl-10 pr-3 py-2 text-sm rounded-lg',
                        'border border-gray-200 dark:border-gray-600',
                        'bg-white dark:bg-gray-800',
                        'text-gray-900 dark:text-gray-100',
                        'placeholder-gray-400',
                        'focus:ring-2 focus:ring-primary-500 focus:border-transparent'
                      )}
                    />
                  </div>
                </div>

                {/* Content - 3 column grid for categories */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="grid grid-cols-3 gap-4">
                    {CATEGORIES.map((category) => {
                      const categoryTests = testCasesByCategory[category] || [];
                      const config = CATEGORY_CONFIG[category];
                      const isCollapsed = collapsedCategories.includes(category);
                      const allSelected = categoryTests.length > 0 && categoryTests.every(tc => selectedTestCaseIds.includes(String(tc.id)));
                      const someSelected = categoryTests.some(tc => selectedTestCaseIds.includes(String(tc.id)));

                      return (
                        <div key={category} className="flex flex-col">
                          {/* Category Header */}
                          <div
                            className={clsx(
                              'flex items-center justify-between px-3 py-2 rounded-t-lg',
                              config.colors.bg,
                              'border',
                              config.colors.border
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = someSelected && !allSelected;
                                }}
                                onChange={() => {
                                  if (allSelected) {
                                    dispatch(deselectAllInCategory(category));
                                  } else {
                                    dispatch(selectAllInCategory(category));
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                              />
                              <span className={clsx('text-sm font-semibold', config.colors.text)}>
                                {config.label}
                              </span>
                            </div>
                            <span className={clsx(
                              'px-2 py-0.5 text-xs font-bold rounded-full',
                              config.colors.badge
                            )}>
                              {categoryTests.length}
                            </span>
                          </div>

                          {/* Category Tests */}
                          <div className={clsx(
                            'flex-1 border border-t-0 rounded-b-lg p-2 space-y-2 max-h-[50vh] overflow-y-auto',
                            'border-gray-200 dark:border-gray-700'
                          )}>
                            {categoryTests.map((testCase) => (
                              <div
                                key={testCase.id}
                                onClick={() => {
                                  handleSelectTestCase(String(testCase.id));
                                  setShowLibraryPopout(false);
                                }}
                                className={clsx(
                                  'group relative rounded-lg border p-2.5 cursor-pointer transition-all duration-200',
                                  selectedTestCaseId === String(testCase.id)
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                )}
                              >
                                <div className={clsx('absolute left-0 top-2 bottom-2 w-1 rounded-r', config.colors.accent)} />
                                <div className="flex items-start gap-2 pl-2">
                                  <div className="pt-0.5" onClick={(e) => { e.stopPropagation(); handleToggleSelection(String(testCase.id)); }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedTestCaseIds.includes(String(testCase.id))}
                                      onChange={() => {}}
                                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className={clsx(
                                        'inline-flex px-1.5 py-0.5 text-[10px] font-mono font-medium rounded',
                                        config.colors.badge
                                      )}>
                                        {testCase.caseId}
                                      </span>
                                    </div>
                                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                      {testCase.name || 'Untitled Test'}
                                    </h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                      {testCase.persona?.name || 'No persona'} · {testCase.goals?.length || 0} goals
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {categoryTests.length === 0 && (
                              <div className="text-center text-xs text-gray-400 py-4">
                                No tests in this category
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedTestCaseIds.length > 0 ? (
                      <span>{selectedTestCaseIds.length} tests selected</span>
                    ) : (
                      <span>Click to view, checkbox to select for batch run</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={handleOpenCreateInPopout}>
                      <Icons.Plus />
                      New Test
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setShowLibraryPopout(false)}>
                      Close
                    </Button>
                    {selectedTestCaseIds.length > 0 && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setShowLibraryPopout(false);
                          handleStartExecution();
                        }}
                      >
                        <Icons.Play />
                        Run {selectedTestCaseIds.length} Selected
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TestsPage;

/**
 * Test Monitor Index
 * Tab router wrapper for test monitoring pages
 */

import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '../../utils/constants';

const tabs = [
  // Unified tabs (6 total) - Sprint 4 consolidation
  { name: 'Tests', path: ROUTES.TEST_MONITOR_TESTS, exact: true },
  { name: 'Analysis', path: ROUTES.TEST_MONITOR_ANALYSIS },
  { name: 'A/B Testing', path: ROUTES.TEST_MONITOR_SANDBOX_LAB },
  { name: 'API Explorer', path: ROUTES.TEST_MONITOR_API_TESTING },
  // { name: 'Experiments', path: ROUTES.TEST_MONITOR_EXPERIMENTS },
  { name: 'Call Tracing', path: ROUTES.TEST_MONITOR_CALL_TRACE },
  { name: 'Skills Runner', path: ROUTES.TEST_MONITOR_SKILLS_RUNNER },
  { name: 'Prod Tracker', path: ROUTES.TEST_MONITOR_PROD_TRACKER },
  // { name: 'Queue Activity', path: ROUTES.TEST_MONITOR_QUEUE_ACTIVITY },
  { name: 'Alerts', path: ROUTES.TEST_MONITOR_ALERTS },
  { name: 'Cache Health', path: ROUTES.TEST_MONITOR_CACHE_HEALTH },
  { name: 'Trace Analysis', path: ROUTES.TEST_MONITOR_TRACE_ANALYSIS },
  { name: 'Detailed Report', path: ROUTES.TEST_MONITOR_DETAILED_REPORT },
  // Legacy tabs (deprecated - routes still work for backwards compatibility)
  // { name: 'Goal Tests', path: ROUTES.TEST_MONITOR_GOAL_CASES },
  // { name: 'Goal Test Generator', path: ROUTES.TEST_MONITOR_CREATE },
  // { name: 'History', path: ROUTES.TEST_MONITOR_HISTORY },
  // { name: 'Tuning', path: ROUTES.TEST_MONITOR_TUNING },
  // { name: 'A/B Testing Sandbox', path: ROUTES.TEST_MONITOR_SANDBOX },
  // { name: 'AI Prompting', path: ROUTES.TEST_MONITOR_AI_PROMPTING },
];

export function TestMonitorLayout() {
  const location = useLocation();

  // Check if we're on a run detail page
  const isRunDetail = location.pathname.includes('/run/');

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation - hide on run detail */}
      {!isRunDetail && (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => {
              const isActive = tab.exact
                ? location.pathname === tab.path
                : location.pathname.startsWith(tab.path);

              return (
                <NavLink
                  key={tab.name}
                  to={tab.path}
                  className={`
                    py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    ${isActive
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }
                  `}
                >
                  {tab.name}
                </NavLink>
              );
            })}
          </nav>
        </div>
      )}

      {/* Page Content */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

// Re-export pages for convenience
export { TestMonitorDashboard } from './TestMonitorDashboard';
export { TestRunDetail } from './TestRunDetail';
export { TestRunHistory } from './TestRunHistory';
export { AgentTuning } from './AgentTuning';
export { TestCasesPage } from './TestCasesPage';
export { GoalTestCasesPage } from './GoalTestCasesPage';
export { GoalTestsDashboard } from './GoalTestsDashboard';
export { CreateGoalTestPage } from './CreateGoalTestPage';
export { ABTestingDashboard } from './ABTestingDashboard';
export { ABTestingSandbox } from './ABTestingSandbox';
export { default as AIPromptingPage } from './AIPromptingPage';
export { APITestingPage } from './APITestingPage';
// New unified pages
export { TestsPage } from './TestsPage';
export { AnalysisPage } from './AnalysisPage';
export { SandboxLabPage } from './SandboxLabPage';
export { default as CallTracePage } from './CallTracePage';
export { SkillsRunnerPage } from './SkillsRunnerPage';
export { ProdTestTrackerPage } from './ProdTestTracker';
export { AlertsPage } from './AlertsPage';
export { QueueActivityPage } from './QueueActivityPage';
export { CacheHealthPage } from './CacheHealthPage';
export { default as TraceAnalysisPage } from './TraceAnalysisPage';
export { DetailedReportPage } from './DetailedReportPage';

/**
 * Test Monitor Index
 * Tab router wrapper for test monitoring pages
 */

import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '../../utils/constants';

const tabs = [
  { name: 'Dashboard', path: ROUTES.TEST_MONITOR_DASHBOARD, exact: true },
  { name: 'Test Cases', path: ROUTES.TEST_MONITOR_CASES },
  { name: 'Goal Tests', path: ROUTES.TEST_MONITOR_GOAL_CASES },
  { name: 'History', path: ROUTES.TEST_MONITOR_HISTORY },
  { name: 'Tuning', path: ROUTES.TEST_MONITOR_TUNING },
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

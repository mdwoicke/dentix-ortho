/**
 * Navbar Component
 * Top navigation bar with logo, environment indicator, theme toggle, and menu toggle
 */

import React from 'react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectEnvironment, toggleEnvironment } from '../../store/slices/authSlice';
import { toggleSidebar } from '../../store/slices/uiSlice';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../ui';

export function Navbar() {
  const dispatch = useAppDispatch();
  const environment = useAppSelector(selectEnvironment);
  const { theme, toggleTheme } = useTheme();

  const handleToggleSidebar = () => {
    dispatch(toggleSidebar());
  };

  const handleToggleEnvironment = () => {
    dispatch(toggleEnvironment());
  };

  return (
    <nav className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 transition-colors shadow-sm dark:shadow-lg">
      <div className="flex items-center justify-between">
        {/* Left: Menu toggle + Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleToggleSidebar}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors lg:hidden text-gray-700 dark:text-gray-200"
            aria-label="Toggle sidebar"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 dark:bg-blue-500 rounded-md flex items-center justify-center transition-colors">
              <span className="text-white font-bold text-lg">C9</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 hidden sm:block transition-colors">
              Cloud9 Ortho
            </h1>
          </div>
        </div>

        {/* Right: Theme toggle & Environment toggle */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              // Moon icon for dark mode
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            ) : (
              // Sun icon for light mode
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            )}
          </button>

          {/* Environment Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400 hidden sm:inline transition-colors">Environment:</span>
            <button
              onClick={handleToggleEnvironment}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                environment === 'sandbox'
                  ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800'
                  : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800'
              }`}
              aria-label={`Switch from ${environment} environment`}
            >
              {environment === 'sandbox' ? 'Sandbox' : 'Production'}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

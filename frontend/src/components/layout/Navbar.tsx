/**
 * Navbar Component
 * Top navigation bar with logo, environment indicator, theme toggle, user info, and menu toggle
 */

import { useState } from 'react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectEnvironment, toggleEnvironment, selectUser, logout } from '../../store/slices/authSlice';
import { clearTenantState, selectCurrentTenant } from '../../store/slices/tenantSlice';
import { toggleSidebar } from '../../store/slices/uiSlice';
import { useTheme } from '../../contexts/ThemeContext';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { TenantSelector } from './TenantSelector';

export function Navbar() {
  const dispatch = useAppDispatch();
  const environment = useAppSelector(selectEnvironment);
  const user = useAppSelector(selectUser);
  const currentTenant = useAppSelector(selectCurrentTenant);
  const { theme, toggleTheme } = useTheme();
  const [showProductionWarning, setShowProductionWarning] = useState(false);

  const handleToggleSidebar = () => {
    dispatch(toggleSidebar());
  };

  const handleToggleEnvironment = () => {
    // Show warning when switching TO production
    if (environment === 'sandbox') {
      setShowProductionWarning(true);
    } else {
      // Switching to sandbox doesn't need confirmation
      dispatch(toggleEnvironment());
    }
  };

  const handleConfirmProduction = () => {
    dispatch(toggleEnvironment());
  };

  const handleLogout = () => {
    dispatch(clearTenantState());
    dispatch(logout());
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
            {currentTenant?.logo_url ? (
              <img
                src={currentTenant.logo_url}
                alt={currentTenant.name}
                className="w-8 h-8 rounded-md object-contain"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
                style={{ backgroundColor: currentTenant?.color_primary || '#2563EB' }}
              >
                <span className="text-white font-bold text-sm">
                  {currentTenant?.short_name || 'C9'}
                </span>
              </div>
            )}
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 hidden sm:block transition-colors">
              {currentTenant?.name || 'Cloud9 Ortho'}
            </h1>
          </div>
        </div>

        {/* Right: Tenant selector, Theme toggle, Environment toggle, User info & Logout */}
        <div className="flex items-center gap-3">
          {/* Tenant Selector */}
          <TenantSelector />

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

          {/* Divider */}
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 hidden sm:block" />

          {/* User Info & Logout */}
          {user && (
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {user.display_name || user.email.split('@')[0]}
                </div>
                {user.is_admin && (
                  <div className="text-xs text-blue-600 dark:text-blue-400">Admin</div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
                aria-label="Logout"
                title="Logout"
              >
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
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Production Environment Warning Modal */}
      <ConfirmationModal
        isOpen={showProductionWarning}
        onClose={() => setShowProductionWarning(false)}
        onConfirm={handleConfirmProduction}
        title="Switch to Production?"
        variant="warning"
        confirmText="Yes, Switch to Production"
        cancelText="Stay in Sandbox"
        message={
          <div className="space-y-3 text-left">
            <p className="font-medium text-gray-800 dark:text-gray-200">
              You are about to switch to the <span className="text-green-600 font-semibold">Production</span> environment.
            </p>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3">
              <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  All API calls will affect <strong>real patient data</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  Changes cannot be easily reversed
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  Ensure you have proper authorization
                </li>
              </ul>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to continue?
            </p>
          </div>
        }
      />
    </nav>
  );
}

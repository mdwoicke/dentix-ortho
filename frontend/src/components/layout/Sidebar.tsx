/**
 * Sidebar Component
 * Navigation sidebar with menu items filtered by user permissions
 */

import { NavLink } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectSidebarOpen, setSidebarOpen, selectSidebarCollapsed, toggleSidebarCollapsed } from '../../store/slices/uiSlice';
import { selectUser, selectIsAdmin, selectCanAccessTab } from '../../store/slices/authSlice';
import { ROUTES } from '../../utils/constants';
import { cn } from '../../utils/cn';
import type { TabKey } from '../../types/auth.types';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  tabKey?: TabKey;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: ROUTES.HOME,
    tabKey: 'dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    label: 'Patients',
    path: ROUTES.PATIENTS,
    tabKey: 'patients',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    ),
  },
  {
    label: 'Appointments',
    path: ROUTES.APPOINTMENTS,
    tabKey: 'appointments',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    label: 'Calendar',
    path: ROUTES.CALENDAR,
    tabKey: 'calendar',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
    ),
  },
  {
    label: 'Test Monitor',
    path: ROUTES.TEST_MONITOR_TESTS,
    tabKey: 'test_monitor',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    label: 'Settings',
    path: ROUTES.SETTINGS,
    tabKey: 'settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  {
    label: 'Admin',
    path: ROUTES.ADMIN,
    adminOnly: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m9-4.803a4 4 0 11-8 0 4 4 0 018 0zM6.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
        />
      </svg>
    ),
  },
];

export function Sidebar() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectSidebarOpen);
  const isCollapsed = useAppSelector(selectSidebarCollapsed);
  const user = useAppSelector(selectUser);
  const isAdmin = useAppSelector(selectIsAdmin);

  const handleClose = () => {
    // Only close on mobile
    if (window.innerWidth < 1024) {
      dispatch(setSidebarOpen(false));
    }
  };

  const handleToggleCollapse = () => {
    dispatch(toggleSidebarCollapsed());
  };

  // Filter nav items based on permissions
  const filteredNavItems = navItems.filter((item) => {
    // Admin-only items: only show to admin users
    if (item.adminOnly) {
      return isAdmin;
    }

    // Tab-based items: check permissions
    if (item.tabKey) {
      // Admin users can see all tabs
      if (isAdmin) {
        return true;
      }
      // Check user permissions
      const permission = user?.permissions.find(p => p.tab_key === item.tabKey);
      return permission?.can_access ?? false;
    }

    // No restrictions
    return true;
  });

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 z-40 lg:hidden transition-opacity"
          onClick={() => dispatch(setSidebarOpen(false))}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen pt-16 transition-all duration-300 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700',
          'lg:translate-x-0 lg:static lg:pt-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          isCollapsed ? 'lg:w-16' : 'w-64'
        )}
      >
        <div className="h-full flex flex-col overflow-y-auto scrollbar-thin">
          {/* Collapse toggle button - visible only on desktop */}
          <div className="hidden lg:flex items-center justify-end px-2 py-2 border-b border-gray-200 dark:border-slate-700">
            <button
              onClick={handleToggleCollapse}
              className="p-1.5 rounded-md text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg
                className={cn('w-5 h-5 transition-transform duration-300', isCollapsed && 'rotate-180')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>
          </div>

          {/* Navigation items */}
          <nav className={cn('flex-1 space-y-1 py-4', isCollapsed ? 'px-2' : 'px-3')}>
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={handleClose}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded-md text-sm font-medium transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
                    isActive
                      ? cn(
                          'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
                          !isCollapsed && 'border-l-4 border-blue-500'
                        )
                      : cn(
                          'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50',
                          !isCollapsed && 'border-l-4 border-transparent'
                        )
                  )
                }
              >
                {item.icon}
                {!isCollapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}

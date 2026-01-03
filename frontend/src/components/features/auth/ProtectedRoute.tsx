/**
 * Protected Route Component
 * Wraps routes that require authentication and/or specific permissions
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../../store/hooks';
import {
  selectIsAuthenticated,
  selectIsAdmin,
  selectCanAccessTab,
  selectIsInitialized,
  selectMustChangePassword
} from '../../../store/slices/authSlice';
import type { TabKey } from '../../../types/auth.types';
import { ROUTES } from '../../../utils/constants';
import { ChangePasswordModal } from './ChangePasswordModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  tabKey?: TabKey;
}

export function ProtectedRoute({ children, requireAdmin = false, tabKey }: ProtectedRouteProps) {
  const location = useLocation();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isInitialized = useAppSelector(selectIsInitialized);
  const isAdmin = useAppSelector(selectIsAdmin);
  const mustChangePassword = useAppSelector(selectMustChangePassword);
  const canAccessTab = useAppSelector(tabKey ? selectCanAccessTab(tabKey) : () => true);

  // Show loading while checking auth
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <svg
            className="animate-spin h-8 w-8 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  // Show change password modal if required
  if (mustChangePassword) {
    return (
      <>
        {children}
        <ChangePasswordModal isOpen={true} isForced={true} />
      </>
    );
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin) {
    // Redirect to dashboard for non-admin users
    return <Navigate to={ROUTES.HOME} replace />;
  }

  // Check tab permission
  if (tabKey && !canAccessTab) {
    // Redirect to dashboard for users without permission
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;

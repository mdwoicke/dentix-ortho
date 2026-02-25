/**
 * Authentication Types
 */

export interface TabPermission {
  tab_key: string;
  can_access: boolean;
}

export interface User {
  id: number;
  email: string;
  display_name?: string;
  is_admin: boolean;
  is_active: boolean;
  must_change_password: boolean;
  permissions: TabPermission[];
  created_at?: string;
  updated_at?: string;
  last_login_at?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  status: string;
  data: {
    user: User;
    token: string;
    tenants?: Tenant[];
    defaultTenantId?: number | null;
    enabledTabs?: string[];
  };
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  status: string;
  message: string;
  data: {
    user: User;
  };
}

export interface GetCurrentUserResponse {
  status: string;
  data: {
    user: User;
    tenants?: Tenant[];
    defaultTenantId?: number | null;
    enabledTabs?: string[];
  };
}

// Admin types
export interface CreateUserRequest {
  email: string;
  display_name?: string;
  is_admin?: boolean;
  is_active?: boolean;
  permissions?: TabPermission[];
}

export interface CreateUserResponse {
  status: string;
  message: string;
  data: {
    user: User;
    tempPassword: string;
  };
}

export interface UpdateUserRequest {
  email?: string;
  display_name?: string;
  is_admin?: boolean;
  is_active?: boolean;
}

export interface SetPermissionsRequest {
  permissions: TabPermission[];
}

export interface ResetPasswordResponse {
  status: string;
  message: string;
  data: {
    tempPassword: string;
  };
}

export interface UsersListResponse {
  status: string;
  data: {
    users: User[];
  };
}

export interface UserResponse {
  status: string;
  data: {
    user: User;
  };
}

// Tenant types
export interface Tenant {
  id: number;
  slug: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  color_primary: string;
  color_secondary: string;
  is_active: boolean;
  is_default: boolean;
}

// All available tab keys (shared source of truth)
export const ALL_TABS = [
  'dashboard', 'patients', 'appointments', 'calendar', 'test_monitor', 'settings',
  'goal_tests', 'goal_test_generator', 'history', 'tuning',
  'ab_testing_sandbox', 'ai_prompting', 'api_testing', 'advanced',
  'dominos_dashboard', 'dominos_orders', 'dominos_health',
  'dominos_menu', 'dominos_sessions', 'dominos_errors',
  'list_management',
] as const;

/** @deprecated Use ALL_TABS instead */
export const TAB_KEYS = ALL_TABS;

export type TabKey = typeof ALL_TABS[number];

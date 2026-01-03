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

// Tab keys constant
export const TAB_KEYS = [
  'dashboard',
  'patients',
  'appointments',
  'calendar',
  'test_monitor',
  'settings'
] as const;

export type TabKey = typeof TAB_KEYS[number];

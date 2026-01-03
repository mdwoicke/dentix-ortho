/**
 * Admin API Service
 * Handles admin user management API calls
 */

import { get, post, put, del } from './client';
import type {
  CreateUserRequest,
  CreateUserResponse,
  UpdateUserRequest,
  SetPermissionsRequest,
  ResetPasswordResponse,
  UsersListResponse,
  UserResponse
} from '../../types/auth.types';

/**
 * Get all users
 */
export async function getUsers(): Promise<UsersListResponse> {
  return get<UsersListResponse>('/admin/users');
}

/**
 * Get user by ID
 */
export async function getUser(id: number): Promise<UserResponse> {
  return get<UserResponse>(`/admin/users/${id}`);
}

/**
 * Create a new user
 */
export async function createUser(data: CreateUserRequest): Promise<CreateUserResponse> {
  return post<CreateUserResponse>('/admin/users', data);
}

/**
 * Update a user
 */
export async function updateUser(id: number, data: UpdateUserRequest): Promise<UserResponse> {
  return put<UserResponse>(`/admin/users/${id}`, data);
}

/**
 * Delete a user
 */
export async function deleteUser(id: number): Promise<{ status: string; message: string }> {
  return del<{ status: string; message: string }>(`/admin/users/${id}`);
}

/**
 * Set user permissions
 */
export async function setUserPermissions(id: number, data: SetPermissionsRequest): Promise<UserResponse> {
  return put<UserResponse>(`/admin/users/${id}/permissions`, data);
}

/**
 * Reset user password
 */
export async function resetPassword(id: number): Promise<ResetPasswordResponse> {
  return post<ResetPasswordResponse>(`/admin/users/${id}/reset-password`);
}

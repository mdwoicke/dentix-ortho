/**
 * Auth API Service
 * Handles authentication API calls
 */

import { post, get } from './client';
import type {
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  GetCurrentUserResponse
} from '../../types/auth.types';

/**
 * Login with email and password
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', credentials);
}

/**
 * Change password
 */
export async function changePassword(request: ChangePasswordRequest): Promise<ChangePasswordResponse> {
  return post<ChangePasswordResponse>('/auth/change-password', request);
}

/**
 * Get current user info
 */
export async function getCurrentUser(): Promise<GetCurrentUserResponse> {
  return get<GetCurrentUserResponse>('/auth/me');
}

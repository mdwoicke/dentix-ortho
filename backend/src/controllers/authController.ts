import { Request, Response } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { UserModel } from '../models/User';
import { TenantModel } from '../models/Tenant';
import { TenantTabModel } from '../models/TenantTab';
import { authenticate, changePassword, verifyToken } from '../services/authService';

/**
 * Auth Controller
 * Handles authentication endpoints
 */

/**
 * POST /api/auth/login
 * Authenticate user and return token
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  try {
    const result = await authenticate(email, password);

    if (!result) {
      throw new AppError('Invalid email or password', 401);
    }

    // Get enabled tabs for the user's default tenant
    let enabledTabs: string[] = [];
    try {
      const tenantId = result.defaultTenantId;
      if (tenantId) {
        enabledTabs = TenantTabModel.getEnabledTabs(tenantId);
      }
    } catch {
      // tenant_tabs table may not exist yet
    }

    res.json({
      status: 'success',
      data: {
        user: result.user,
        token: result.token,
        tenants: result.tenants,
        defaultTenantId: result.defaultTenantId,
        enabledTabs,
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    // Re-throw with specific message for disabled accounts
    if ((error as Error).message === 'Account is disabled') {
      throw new AppError('Account is disabled. Please contact an administrator.', 403);
    }
    throw new AppError('Invalid email or password', 401);
  }
});

/**
 * POST /api/auth/change-password
 * Change user's password
 */
export const changePasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  // Get user from auth header
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    throw new AppError('Invalid or expired token', 401);
  }

  if (!currentPassword || !newPassword) {
    throw new AppError('Current password and new password are required', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters', 400);
  }

  try {
    await changePassword(payload.userId, currentPassword, newPassword);

    // Get updated user data
    const user = UserModel.getById(payload.userId);

    res.json({
      status: 'success',
      message: 'Password changed successfully',
      data: { user }
    });
  } catch (error) {
    if ((error as Error).message === 'Current password is incorrect') {
      throw new AppError('Current password is incorrect', 400);
    }
    throw new AppError('Failed to change password', 500);
  }
});

/**
 * GET /api/auth/me
 * Get current user info from token
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    throw new AppError('Invalid or expired token', 401);
  }

  const user = UserModel.getById(payload.userId);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (!user.is_active) {
    throw new AppError('Account is disabled', 403);
  }

  // Get tenant info
  let tenants: any[] = [];
  let defaultTenantId: number | null = null;
  let enabledTabs: string[] = [];
  try {
    tenants = TenantModel.getUserTenants(payload.userId);
    defaultTenantId = TenantModel.getUserDefaultTenantId(payload.userId);
    if (defaultTenantId) {
      enabledTabs = TenantTabModel.getEnabledTabs(defaultTenantId);
    }
  } catch {
    // Tenants table may not exist yet
  }

  res.json({
    status: 'success',
    data: { user, tenants, defaultTenantId, enabledTabs }
  });
});

/**
 * GET /api/auth/tenants
 * List current user's tenants
 */
export const getUserTenants = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    throw new AppError('Invalid or expired token', 401);
  }

  const tenants = TenantModel.getUserTenants(payload.userId);
  const defaultTenantId = TenantModel.getUserDefaultTenantId(payload.userId);

  res.json({
    status: 'success',
    data: { tenants, defaultTenantId }
  });
});

/**
 * POST /api/auth/tenants/:id/switch
 * Switch user's active (default) tenant
 */
export const switchTenant = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    throw new AppError('Invalid or expired token', 401);
  }

  const tenantId = parseInt(req.params.id);
  if (isNaN(tenantId)) {
    throw new AppError('Invalid tenant ID', 400);
  }

  // Verify user has access to this tenant
  if (!TenantModel.userHasAccess(payload.userId, tenantId)) {
    throw new AppError('You do not have access to this tenant', 403);
  }

  // Verify tenant is active
  const tenant = TenantModel.getById(tenantId);
  if (!tenant || !tenant.is_active) {
    throw new AppError('Tenant not found or inactive', 404);
  }

  TenantModel.setUserDefaultTenant(payload.userId, tenantId);

  let enabledTabs: string[] = [];
  try {
    enabledTabs = TenantTabModel.getEnabledTabs(tenantId);
  } catch {
    // tenant_tabs table may not exist yet
  }

  res.json({
    status: 'success',
    message: `Switched to tenant: ${tenant.name}`,
    data: { tenantId, tenantName: tenant.name, enabledTabs }
  });
});

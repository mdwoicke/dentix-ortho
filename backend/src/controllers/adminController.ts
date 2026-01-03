import { Request, Response } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { UserModel, TabPermission } from '../models/User';
import { hashPassword, generateTempPassword, verifyToken } from '../services/authService';

/**
 * Admin Controller
 * Handles user management endpoints
 */

/**
 * Verify admin access from token
 */
function requireAdmin(req: Request): number {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    throw new AppError('Invalid or expired token', 401);
  }

  if (!payload.isAdmin) {
    throw new AppError('Admin access required', 403);
  }

  return payload.userId;
}

/**
 * GET /api/admin/users
 * List all users
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const users = UserModel.getAll();

  res.json({
    status: 'success',
    data: { users }
  });
});

/**
 * GET /api/admin/users/:id
 * Get user by ID
 */
export const getUser = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = UserModel.getById(id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    status: 'success',
    data: { user }
  });
});

/**
 * POST /api/admin/users
 * Create a new user with temp password
 */
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const { email, display_name, is_admin, is_active, permissions } = req.body;

  if (!email) {
    throw new AppError('Email is required', 400);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Invalid email format', 400);
  }

  // Check if email already exists
  if (UserModel.exists(email)) {
    throw new AppError('Email already exists', 400);
  }

  // Generate temporary password
  const tempPassword = generateTempPassword();

  // Hash password
  const passwordHash = await hashPassword(tempPassword);

  // Create user
  const userId = UserModel.create({
    email,
    password_hash: passwordHash,
    display_name: display_name || null,
    is_admin: is_admin || false,
    is_active: is_active !== false,
    must_change_password: true
  });

  // Set permissions if provided, otherwise grant all if admin
  if (permissions && Array.isArray(permissions)) {
    UserModel.setPermissions(userId, permissions);
  } else if (is_admin) {
    UserModel.grantAllPermissions(userId);
  }

  // Get created user
  const user = UserModel.getById(userId);

  res.status(201).json({
    status: 'success',
    message: 'User created successfully',
    data: {
      user,
      tempPassword // Return temp password so admin can share it
    }
  });
});

/**
 * PUT /api/admin/users/:id
 * Update user details
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    throw new AppError('Invalid user ID', 400);
  }

  const existingUser = UserModel.getById(id);

  if (!existingUser) {
    throw new AppError('User not found', 404);
  }

  const { email, display_name, is_admin, is_active } = req.body;

  // If changing email, validate format
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError('Invalid email format', 400);
    }
  }

  // Update user
  UserModel.update(id, {
    email,
    display_name,
    is_admin,
    is_active
  });

  // Get updated user
  const user = UserModel.getById(id);

  res.json({
    status: 'success',
    message: 'User updated successfully',
    data: { user }
  });
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = UserModel.getById(id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  try {
    UserModel.delete(id);
  } catch (error) {
    if ((error as Error).message.includes('master admin')) {
      throw new AppError('Cannot delete master admin account', 403);
    }
    throw error;
  }

  res.json({
    status: 'success',
    message: 'User deleted successfully'
  });
});

/**
 * PUT /api/admin/users/:id/permissions
 * Set user permissions
 */
export const setUserPermissions = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = UserModel.getById(id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const { permissions } = req.body;

  if (!permissions || !Array.isArray(permissions)) {
    throw new AppError('Permissions array is required', 400);
  }

  // Validate permission structure
  const validTabs = ['dashboard', 'patients', 'appointments', 'calendar', 'test_monitor', 'settings'];
  for (const perm of permissions) {
    if (!perm.tab_key || typeof perm.can_access !== 'boolean') {
      throw new AppError('Invalid permission format. Each permission must have tab_key and can_access', 400);
    }
    if (!validTabs.includes(perm.tab_key)) {
      throw new AppError(`Invalid tab_key: ${perm.tab_key}. Valid tabs are: ${validTabs.join(', ')}`, 400);
    }
  }

  UserModel.setPermissions(id, permissions as TabPermission[]);

  // Get updated user
  const updatedUser = UserModel.getById(id);

  res.json({
    status: 'success',
    message: 'Permissions updated successfully',
    data: { user: updatedUser }
  });
});

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password to a new temp password
 */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = UserModel.getById(id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Generate new temporary password
  const tempPassword = generateTempPassword();

  // Hash and reset password
  const passwordHash = await hashPassword(tempPassword);
  UserModel.resetPassword(id, passwordHash);

  res.json({
    status: 'success',
    message: 'Password reset successfully',
    data: {
      tempPassword // Return temp password so admin can share it
    }
  });
});

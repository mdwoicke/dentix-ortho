import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel, UserWithPermissions } from '../models/User';
import logger from '../utils/logger';

/**
 * Auth Service
 * Handles password hashing, JWT token generation, and master admin seeding
 */

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'dentix-ortho-secret-key-change-in-production';
const JWT_EXPIRES_IN = '8h';

// Master admin configuration
const MASTER_ADMIN = {
  email: 'mwoicke@intelepeer.ai',
  password: 'Cyclones',
  display_name: 'Master Admin'
};

// Salt rounds for bcrypt
const SALT_ROUNDS = 10;

export interface JwtPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

export interface LoginResult {
  user: UserWithPermissions;
  token: string;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a password with a hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a random temporary password
 */
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(user: UserWithPermissions): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    isAdmin: user.is_admin
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Authenticate a user with email and password
 */
export async function authenticate(email: string, password: string): Promise<LoginResult | null> {
  // Get user with password hash
  const user = UserModel.getByEmail(email);

  if (!user) {
    return null;
  }

  // Check if user is active
  if (!user.is_active) {
    throw new Error('Account is disabled');
  }

  // Compare password
  const isValid = await comparePassword(password, user.password_hash);

  if (!isValid) {
    return null;
  }

  // Record login
  UserModel.recordLogin(user.id);

  // Get full user data with permissions
  const userWithPermissions = UserModel.getById(user.id);

  if (!userWithPermissions) {
    return null;
  }

  // Generate token
  const token = generateToken(userWithPermissions);

  logger.info(`User authenticated: ${email}`);

  return {
    user: userWithPermissions,
    token
  };
}

/**
 * Change a user's password
 */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  // Get user with password hash
  const user = UserModel.getByEmail(
    (UserModel.getById(userId)?.email || '')
  );

  if (!user) {
    throw new Error('User not found');
  }

  // Verify current password
  const isValid = await comparePassword(currentPassword, user.password_hash);

  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  // Hash new password
  const newHash = await hashPassword(newPassword);

  // Update password (clears must_change_password flag)
  UserModel.updatePassword(userId, newHash);

  logger.info(`Password changed for user: ${user.email}`);

  return true;
}

/**
 * Seed the master admin account on server startup
 */
export async function seedMasterAdmin(): Promise<void> {
  try {
    // Check if master admin already exists
    if (UserModel.exists(MASTER_ADMIN.email)) {
      logger.info('Master admin account already exists');
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(MASTER_ADMIN.password);

    // Create master admin user
    const userId = UserModel.create({
      email: MASTER_ADMIN.email,
      password_hash: passwordHash,
      display_name: MASTER_ADMIN.display_name,
      is_admin: true,
      is_active: true,
      must_change_password: false // Master admin doesn't need to change password
    });

    // Grant all permissions
    UserModel.grantAllPermissions(userId);

    logger.info(`Master admin account created: ${MASTER_ADMIN.email}`);
  } catch (error) {
    logger.error(`Error seeding master admin: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

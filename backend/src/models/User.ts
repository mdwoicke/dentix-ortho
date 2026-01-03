import { getDatabase } from '../config/database';
import { loggers } from '../utils/logger';

/**
 * User Model
 * Handles CRUD operations for user authentication and management
 */

export interface User {
  id: number;
  email: string;
  password_hash: string;
  display_name?: string;
  is_admin: boolean;
  is_active: boolean;
  must_change_password: boolean;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string;
}

export interface UserWithPermissions extends Omit<User, 'password_hash'> {
  permissions: TabPermission[];
}

export interface TabPermission {
  tab_key: string;
  can_access: boolean;
}

export interface CreateUserInput {
  email: string;
  password_hash: string;
  display_name?: string;
  is_admin?: boolean;
  is_active?: boolean;
  must_change_password?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  display_name?: string;
  is_admin?: boolean;
  is_active?: boolean;
}

// Master admin email - protected from deletion
const MASTER_ADMIN_EMAIL = 'mwoicke@intelepeer.ai';

export class UserModel {
  /**
   * Get all users (without password hashes)
   */
  static getAll(): UserWithPermissions[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT id, email, display_name, is_admin, is_active, must_change_password,
               created_at, updated_at, last_login_at
        FROM users
        ORDER BY email ASC
      `);

      const users = stmt.all() as Omit<User, 'password_hash'>[];

      // Get permissions for each user
      const usersWithPermissions = users.map(user => ({
        ...user,
        is_admin: Boolean(user.is_admin),
        is_active: Boolean(user.is_active),
        must_change_password: Boolean(user.must_change_password),
        permissions: UserModel.getPermissions(user.id)
      }));

      loggers.dbOperation('SELECT', 'users', { count: users.length });

      return usersWithPermissions;
    } catch (error) {
      throw new Error(
        `Error fetching users: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get user by ID (without password hash)
   */
  static getById(id: number): UserWithPermissions | null {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT id, email, display_name, is_admin, is_active, must_change_password,
               created_at, updated_at, last_login_at
        FROM users
        WHERE id = ?
      `);

      const user = stmt.get(id) as Omit<User, 'password_hash'> | undefined;

      if (!user) {
        return null;
      }

      loggers.dbOperation('SELECT', 'users', { id });

      return {
        ...user,
        is_admin: Boolean(user.is_admin),
        is_active: Boolean(user.is_active),
        must_change_password: Boolean(user.must_change_password),
        permissions: UserModel.getPermissions(user.id)
      };
    } catch (error) {
      throw new Error(
        `Error fetching user: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get user by email (includes password hash for authentication)
   */
  static getByEmail(email: string): User | null {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM users
        WHERE email = ?
      `);

      const user = stmt.get(email.toLowerCase()) as User | undefined;

      loggers.dbOperation('SELECT', 'users', { email });

      if (!user) {
        return null;
      }

      return {
        ...user,
        is_admin: Boolean(user.is_admin),
        is_active: Boolean(user.is_active),
        must_change_password: Boolean(user.must_change_password)
      };
    } catch (error) {
      throw new Error(
        `Error fetching user by email: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create a new user
   */
  static create(input: CreateUserInput): number {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        INSERT INTO users (email, password_hash, display_name, is_admin, is_active, must_change_password)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        input.email.toLowerCase(),
        input.password_hash,
        input.display_name || null,
        input.is_admin ? 1 : 0,
        input.is_active !== false ? 1 : 0,
        input.must_change_password !== false ? 1 : 0
      );

      loggers.dbOperation('INSERT', 'users', { email: input.email });

      return result.lastInsertRowid as number;
    } catch (error) {
      if ((error as any)?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Email already exists');
      }
      throw new Error(
        `Error creating user: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Update user details
   */
  static update(id: number, input: UpdateUserInput): void {
    const db = getDatabase();

    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (input.email !== undefined) {
        updates.push('email = ?');
        values.push(input.email.toLowerCase());
      }
      if (input.display_name !== undefined) {
        updates.push('display_name = ?');
        values.push(input.display_name);
      }
      if (input.is_admin !== undefined) {
        updates.push('is_admin = ?');
        values.push(input.is_admin ? 1 : 0);
      }
      if (input.is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(input.is_active ? 1 : 0);
      }

      if (updates.length === 0) {
        return;
      }

      updates.push("updated_at = datetime('now')");
      values.push(id);

      const stmt = db.prepare(`
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = ?
      `);

      stmt.run(...values);

      loggers.dbOperation('UPDATE', 'users', { id });
    } catch (error) {
      if ((error as any)?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Email already exists');
      }
      throw new Error(
        `Error updating user: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Update user password and clear must_change_password flag
   */
  static updatePassword(id: number, passwordHash: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        UPDATE users
        SET password_hash = ?, must_change_password = 0, updated_at = datetime('now')
        WHERE id = ?
      `);

      stmt.run(passwordHash, id);

      loggers.dbOperation('UPDATE', 'users', { id, action: 'password_change' });
    } catch (error) {
      throw new Error(
        `Error updating password: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Reset password and set must_change_password flag
   */
  static resetPassword(id: number, passwordHash: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        UPDATE users
        SET password_hash = ?, must_change_password = 1, updated_at = datetime('now')
        WHERE id = ?
      `);

      stmt.run(passwordHash, id);

      loggers.dbOperation('UPDATE', 'users', { id, action: 'password_reset' });
    } catch (error) {
      throw new Error(
        `Error resetting password: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Delete user by ID (protects master admin)
   */
  static delete(id: number): void {
    const db = getDatabase();

    try {
      // Check if this is the master admin
      const user = UserModel.getById(id);
      if (user && user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
        throw new Error('Cannot delete master admin account');
      }

      const stmt = db.prepare(`
        DELETE FROM users
        WHERE id = ?
      `);

      stmt.run(id);

      loggers.dbOperation('DELETE', 'users', { id });
    } catch (error) {
      throw new Error(
        `Error deleting user: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Record login timestamp
   */
  static recordLogin(id: number): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        UPDATE users
        SET last_login_at = datetime('now')
        WHERE id = ?
      `);

      stmt.run(id);

      loggers.dbOperation('UPDATE', 'users', { id, action: 'login' });
    } catch (error) {
      throw new Error(
        `Error recording login: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get permissions for a user
   */
  static getPermissions(userId: number): TabPermission[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT tab_key, can_access
        FROM user_permissions
        WHERE user_id = ?
      `);

      const permissions = stmt.all(userId) as { tab_key: string; can_access: number }[];

      return permissions.map(p => ({
        tab_key: p.tab_key,
        can_access: Boolean(p.can_access)
      }));
    } catch (error) {
      throw new Error(
        `Error fetching permissions: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Set permissions for a user (replaces all existing permissions)
   */
  static setPermissions(userId: number, permissions: TabPermission[]): void {
    const db = getDatabase();

    try {
      // Delete existing permissions
      const deleteStmt = db.prepare(`
        DELETE FROM user_permissions
        WHERE user_id = ?
      `);
      deleteStmt.run(userId);

      // Insert new permissions
      const insertStmt = db.prepare(`
        INSERT INTO user_permissions (user_id, tab_key, can_access)
        VALUES (?, ?, ?)
      `);

      for (const permission of permissions) {
        insertStmt.run(userId, permission.tab_key, permission.can_access ? 1 : 0);
      }

      loggers.dbOperation('UPDATE', 'user_permissions', { userId, count: permissions.length });
    } catch (error) {
      throw new Error(
        `Error setting permissions: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Grant all tab permissions to a user
   */
  static grantAllPermissions(userId: number): void {
    const allTabs: TabPermission[] = [
      { tab_key: 'dashboard', can_access: true },
      { tab_key: 'patients', can_access: true },
      { tab_key: 'appointments', can_access: true },
      { tab_key: 'calendar', can_access: true },
      { tab_key: 'test_monitor', can_access: true },
      { tab_key: 'settings', can_access: true },
      { tab_key: 'goal_tests', can_access: true },
      { tab_key: 'goal_test_generator', can_access: true },
      { tab_key: 'history', can_access: true },
      { tab_key: 'tuning', can_access: true },
      { tab_key: 'ab_testing_sandbox', can_access: true },
      { tab_key: 'ai_prompting', can_access: true },
      { tab_key: 'api_testing', can_access: true },
      { tab_key: 'advanced', can_access: true }
    ];

    UserModel.setPermissions(userId, allTabs);
  }

  /**
   * Check if user exists by email
   */
  static exists(email: string): boolean {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT 1 FROM users
        WHERE email = ?
      `);

      const result = stmt.get(email.toLowerCase());

      return !!result;
    } catch (error) {
      throw new Error(
        `Error checking user existence: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

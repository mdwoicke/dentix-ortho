import { getDatabase } from '../config/database';
import { loggers } from '../utils/logger';

/**
 * Tenant Model
 * Handles CRUD operations for multi-tenant management
 */

export interface Tenant {
  id: number;
  slug: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  color_primary: string;
  color_secondary: string;
  cloud9_prod_endpoint: string;
  cloud9_prod_client_id: string | null;
  cloud9_prod_username: string | null;
  cloud9_prod_password: string | null;
  cloud9_sandbox_endpoint: string;
  cloud9_sandbox_client_id: string | null;
  cloud9_sandbox_username: string | null;
  cloud9_sandbox_password: string | null;
  nodered_url: string | null;
  nodered_username: string | null;
  nodered_password: string | null;
  flowise_url: string | null;
  flowise_api_key: string | null;
  langfuse_host: string | null;
  langfuse_public_key: string | null;
  langfuse_secret_key: string | null;
  v1_files_dir: string;
  nodered_flows_dir: string;
  dominos_service_url: string | null;
  dominos_service_auth_token: string | null;
  dominos_default_store_id: string | null;
  dominos_data_source_url: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** Safe tenant info returned to non-admin users (no credentials) */
export interface TenantSummary {
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

export interface TenantUserRole {
  user_id: number;
  tenant_id: number;
  role: string;
  is_default: boolean;
  email?: string;
  display_name?: string;
}

export interface CreateTenantInput {
  slug: string;
  name: string;
  short_name?: string;
  logo_url?: string;
  color_primary?: string;
  color_secondary?: string;
  cloud9_prod_endpoint?: string;
  cloud9_prod_client_id?: string;
  cloud9_prod_username?: string;
  cloud9_prod_password?: string;
  cloud9_sandbox_endpoint?: string;
  cloud9_sandbox_client_id?: string;
  cloud9_sandbox_username?: string;
  cloud9_sandbox_password?: string;
  nodered_url?: string;
  nodered_username?: string;
  nodered_password?: string;
  flowise_url?: string;
  flowise_api_key?: string;
  langfuse_host?: string;
  langfuse_public_key?: string;
  langfuse_secret_key?: string;
  v1_files_dir?: string;
  nodered_flows_dir?: string;
  dominos_service_url?: string;
  dominos_service_auth_token?: string;
  dominos_default_store_id?: string;
  dominos_data_source_url?: string;
}

export interface UpdateTenantInput extends Partial<CreateTenantInput> {
  is_active?: boolean;
}

function toBool(val: any): boolean {
  return Boolean(val);
}

function rowToTenant(row: any): Tenant {
  return {
    ...row,
    is_active: toBool(row.is_active),
    is_default: toBool(row.is_default),
  };
}

function tenantToSummary(t: Tenant): TenantSummary {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    short_name: t.short_name,
    logo_url: t.logo_url,
    color_primary: t.color_primary,
    color_secondary: t.color_secondary,
    is_active: t.is_active,
    is_default: t.is_default,
  };
}

export class TenantModel {
  static getAll(): Tenant[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM tenants ORDER BY is_default DESC, name ASC').all();
    loggers.dbOperation('SELECT', 'tenants', { count: rows.length });
    return (rows as any[]).map(rowToTenant);
  }

  static getById(id: number): Tenant | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!row) return null;
    loggers.dbOperation('SELECT', 'tenants', { id });
    return rowToTenant(row);
  }

  static getBySlug(slug: string): Tenant | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug);
    if (!row) return null;
    return rowToTenant(row);
  }

  static getDefault(): Tenant | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM tenants WHERE is_default = 1 LIMIT 1').get();
    if (!row) return null;
    return rowToTenant(row);
  }

  static create(input: CreateTenantInput): number {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO tenants (
        slug, name, short_name, logo_url, color_primary, color_secondary,
        cloud9_prod_endpoint, cloud9_prod_client_id, cloud9_prod_username, cloud9_prod_password,
        cloud9_sandbox_endpoint, cloud9_sandbox_client_id, cloud9_sandbox_username, cloud9_sandbox_password,
        nodered_url, nodered_username, nodered_password,
        flowise_url, flowise_api_key,
        langfuse_host, langfuse_public_key, langfuse_secret_key,
        v1_files_dir, nodered_flows_dir,
        dominos_service_url, dominos_service_auth_token, dominos_default_store_id,
        dominos_data_source_url
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?
      )
    `);

    const result = stmt.run(
      input.slug,
      input.name,
      input.short_name || null,
      input.logo_url || null,
      input.color_primary || '#2563EB',
      input.color_secondary || '#1E40AF',
      input.cloud9_prod_endpoint || 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
      input.cloud9_prod_client_id || null,
      input.cloud9_prod_username || null,
      input.cloud9_prod_password || null,
      input.cloud9_sandbox_endpoint || 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
      input.cloud9_sandbox_client_id || null,
      input.cloud9_sandbox_username || null,
      input.cloud9_sandbox_password || null,
      input.nodered_url || null,
      input.nodered_username || null,
      input.nodered_password || null,
      input.flowise_url || null,
      input.flowise_api_key || null,
      input.langfuse_host || null,
      input.langfuse_public_key || null,
      input.langfuse_secret_key || null,
      input.v1_files_dir || `tenants/${input.slug}/v1`,
      input.nodered_flows_dir || `tenants/${input.slug}/nodered`,
      input.dominos_service_url || null,
      input.dominos_service_auth_token || null,
      input.dominos_default_store_id || null,
      input.dominos_data_source_url || null,
    );

    loggers.dbOperation('INSERT', 'tenants', { slug: input.slug });
    return result.lastInsertRowid as number;
  }

  static update(id: number, input: UpdateTenantInput): void {
    const db = getDatabase();

    const updates: string[] = [];
    const values: any[] = [];

    const fields: Record<string, string> = {
      slug: 'slug', name: 'name', short_name: 'short_name',
      logo_url: 'logo_url', color_primary: 'color_primary', color_secondary: 'color_secondary',
      cloud9_prod_endpoint: 'cloud9_prod_endpoint', cloud9_prod_client_id: 'cloud9_prod_client_id',
      cloud9_prod_username: 'cloud9_prod_username', cloud9_prod_password: 'cloud9_prod_password',
      cloud9_sandbox_endpoint: 'cloud9_sandbox_endpoint', cloud9_sandbox_client_id: 'cloud9_sandbox_client_id',
      cloud9_sandbox_username: 'cloud9_sandbox_username', cloud9_sandbox_password: 'cloud9_sandbox_password',
      nodered_url: 'nodered_url', nodered_username: 'nodered_username', nodered_password: 'nodered_password',
      flowise_url: 'flowise_url', flowise_api_key: 'flowise_api_key',
      langfuse_host: 'langfuse_host', langfuse_public_key: 'langfuse_public_key',
      langfuse_secret_key: 'langfuse_secret_key',
      v1_files_dir: 'v1_files_dir', nodered_flows_dir: 'nodered_flows_dir',
      dominos_service_url: 'dominos_service_url', dominos_service_auth_token: 'dominos_service_auth_token',
      dominos_default_store_id: 'dominos_default_store_id', dominos_data_source_url: 'dominos_data_source_url',
    };

    for (const [key, col] of Object.entries(fields)) {
      if ((input as any)[key] !== undefined) {
        updates.push(`${col} = ?`);
        values.push((input as any)[key]);
      }
    }

    if (input.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(input.is_active ? 1 : 0);
    }

    if (updates.length === 0) return;

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    loggers.dbOperation('UPDATE', 'tenants', { id });
  }

  static softDelete(id: number): void {
    const db = getDatabase();
    const tenant = TenantModel.getById(id);
    if (tenant?.is_default) {
      throw new Error('Cannot delete the default tenant');
    }
    db.prepare("UPDATE tenants SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    loggers.dbOperation('SOFT_DELETE', 'tenants', { id });
  }

  // User-tenant association methods

  static getUserTenants(userId: number): TenantSummary[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT t.* FROM tenants t
      INNER JOIN user_tenants ut ON t.id = ut.tenant_id
      WHERE ut.user_id = ? AND t.is_active = 1
      ORDER BY ut.is_default DESC, t.name ASC
    `).all(userId) as any[];

    return rows.map(rowToTenant).map(tenantToSummary);
  }

  static getUserDefaultTenantId(userId: number): number | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT tenant_id FROM user_tenants
      WHERE user_id = ? AND is_default = 1
      LIMIT 1
    `).get(userId) as { tenant_id: number } | undefined;

    if (row) return row.tenant_id;

    // Fallback: first tenant the user has access to
    const fallback = db.prepare(`
      SELECT tenant_id FROM user_tenants
      WHERE user_id = ?
      ORDER BY tenant_id ASC LIMIT 1
    `).get(userId) as { tenant_id: number } | undefined;

    return fallback?.tenant_id || null;
  }

  static setUserDefaultTenant(userId: number, tenantId: number): void {
    const db = getDatabase();
    const txn = db.transaction(() => {
      // Clear existing defaults for this user
      db.prepare('UPDATE user_tenants SET is_default = 0 WHERE user_id = ?').run(userId);
      // Set new default
      db.prepare('UPDATE user_tenants SET is_default = 1 WHERE user_id = ? AND tenant_id = ?')
        .run(userId, tenantId);
    });
    txn();
  }

  static getTenantUsers(tenantId: number): TenantUserRole[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT ut.user_id, ut.tenant_id, ut.role, ut.is_default,
             u.email, u.display_name
      FROM user_tenants ut
      INNER JOIN users u ON ut.user_id = u.id
      WHERE ut.tenant_id = ?
      ORDER BY u.email ASC
    `).all(tenantId) as TenantUserRole[];
  }

  static addUserToTenant(userId: number, tenantId: number, role: string = 'member'): void {
    const db = getDatabase();
    db.prepare(`
      INSERT OR IGNORE INTO user_tenants (user_id, tenant_id, role)
      VALUES (?, ?, ?)
    `).run(userId, tenantId, role);
    loggers.dbOperation('INSERT', 'user_tenants', { userId, tenantId, role });
  }

  static removeUserFromTenant(userId: number, tenantId: number): void {
    const db = getDatabase();
    // Prevent removing from default tenant if it's their only one
    const count = db.prepare('SELECT COUNT(*) as cnt FROM user_tenants WHERE user_id = ?')
      .get(userId) as { cnt: number };

    if (count.cnt <= 1) {
      throw new Error('Cannot remove user from their only tenant');
    }

    db.prepare('DELETE FROM user_tenants WHERE user_id = ? AND tenant_id = ?')
      .run(userId, tenantId);
    loggers.dbOperation('DELETE', 'user_tenants', { userId, tenantId });
  }

  static userHasAccess(userId: number, tenantId: number): boolean {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT 1 FROM user_tenants WHERE user_id = ? AND tenant_id = ?'
    ).get(userId, tenantId);
    return !!row;
  }

  static toSummary(tenant: Tenant): TenantSummary {
    return tenantToSummary(tenant);
  }
}

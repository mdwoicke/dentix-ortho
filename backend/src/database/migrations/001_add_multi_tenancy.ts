import Database from 'better-sqlite3';
import logger from '../../utils/logger';
import { SANDBOX_CONFIG, PRODUCTION_CONFIG } from '../../config/cloud9';

/**
 * Migration 001: Add Multi-Tenancy Support
 *
 * Creates tenants table, user_tenants junction table,
 * adds tenant_id columns to existing tables,
 * and seeds a Default tenant with current Cloud9 credentials.
 */

const MIGRATION_ID = '001_add_multi_tenancy';

export function run(db: Database.Database): void {
  // Check if migration already ran (tenants table exists)
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'"
  ).get();

  if (tableExists) {
    logger.info(`Migration ${MIGRATION_ID}: already applied, skipping`);
    return;
  }

  logger.info(`Migration ${MIGRATION_ID}: applying...`);

  const migrate = db.transaction(() => {
    // 1. Create tenants table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        short_name TEXT,
        logo_url TEXT,
        color_primary TEXT DEFAULT '#2563EB',
        color_secondary TEXT DEFAULT '#1E40AF',
        cloud9_prod_endpoint TEXT DEFAULT 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
        cloud9_prod_client_id TEXT,
        cloud9_prod_username TEXT,
        cloud9_prod_password TEXT,
        cloud9_sandbox_endpoint TEXT DEFAULT 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
        cloud9_sandbox_client_id TEXT,
        cloud9_sandbox_username TEXT,
        cloud9_sandbox_password TEXT,
        nodered_url TEXT,
        nodered_username TEXT,
        nodered_password TEXT,
        flowise_url TEXT,
        flowise_api_key TEXT,
        langfuse_host TEXT,
        langfuse_public_key TEXT,
        langfuse_secret_key TEXT,
        v1_files_dir TEXT DEFAULT 'docs/v1',
        nodered_flows_dir TEXT DEFAULT 'nodered',
        is_active INTEGER DEFAULT 1,
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // 2. Create user_tenants junction table
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'member' CHECK(role IN ('member','admin','owner')),
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, tenant_id)
      )
    `);

    // 3. Add tenant_id to existing tables (with default NULL, we'll backfill)
    const tablesNeedingTenantId = [
      'locations',
      'appointment_types',
      'providers',
      'patients',
      'appointments',
      'cache_metadata',
      'prompt_working_copies',
      'prompt_version_history',
      'prod_test_records',
      'session_analysis',
      'artifact_deploy_events',
    ];

    for (const table of tablesNeedingTenantId) {
      // Check if table exists in this database
      const tableCheck = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (!tableCheck) continue;

      // Check if column already exists
      const columns = db.pragma(`table_info(${table})`);
      const hasTenantId = (columns as any[]).some((c: any) => c.name === 'tenant_id');
      if (!hasTenantId) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN tenant_id INTEGER REFERENCES tenants(id)`);
      }
    }

    // 4. Seed Default tenant with current Cloud9 credentials
    const insertTenant = db.prepare(`
      INSERT INTO tenants (
        slug, name, short_name, is_default,
        cloud9_prod_endpoint, cloud9_prod_client_id, cloud9_prod_username, cloud9_prod_password,
        cloud9_sandbox_endpoint, cloud9_sandbox_client_id, cloud9_sandbox_username, cloud9_sandbox_password,
        nodered_url, nodered_username, nodered_password,
        flowise_url, flowise_api_key,
        langfuse_host, langfuse_public_key, langfuse_secret_key,
        v1_files_dir, nodered_flows_dir
      ) VALUES (
        'default', 'Default Practice', 'Default', 1,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        'docs/v1', 'nodered'
      )
    `);

    insertTenant.run(
      PRODUCTION_CONFIG.endpoint,
      PRODUCTION_CONFIG.credentials.clientId,
      PRODUCTION_CONFIG.credentials.userName,
      PRODUCTION_CONFIG.credentials.password,
      SANDBOX_CONFIG.endpoint,
      SANDBOX_CONFIG.credentials.clientId,
      SANDBOX_CONFIG.credentials.userName,
      SANDBOX_CONFIG.credentials.password,
      process.env.NODERED_URL || 'http://localhost:1880',
      process.env.NODERED_USERNAME || '',
      process.env.NODERED_PASSWORD || '',
      process.env.FLOWISE_URL || 'http://localhost:3000',
      process.env.FLOWISE_API_KEY || '',
      process.env.LANGFUSE_HOST || '',
      process.env.LANGFUSE_PUBLIC_KEY || '',
      process.env.LANGFUSE_SECRET_KEY || '',
    );

    const defaultTenantId = 1;

    // 5. Map all existing users to the Default tenant
    const users = db.prepare('SELECT id FROM users').all() as { id: number }[];
    const insertUserTenant = db.prepare(`
      INSERT OR IGNORE INTO user_tenants (user_id, tenant_id, role, is_default)
      VALUES (?, ?, ?, 1)
    `);

    for (const user of users) {
      insertUserTenant.run(user.id, defaultTenantId, 'owner');
    }

    // 6. Backfill tenant_id on all existing rows
    for (const table of tablesNeedingTenantId) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (exists) {
        db.exec(`UPDATE ${table} SET tenant_id = ${defaultTenantId} WHERE tenant_id IS NULL`);
      }
    }

    // 7. Create indexes for tenant_id lookups
    const indexableTablesForTenant = [
      'locations', 'patients', 'appointments', 'providers',
      'prod_test_records', 'session_analysis',
    ];

    for (const table of indexableTablesForTenant) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (exists) {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant_id ON ${table}(tenant_id)`);
      }
    }
  });

  migrate();
  logger.info(`Migration ${MIGRATION_ID}: applied successfully`);
}

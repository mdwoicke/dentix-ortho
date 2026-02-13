import Database from 'better-sqlite3';
import logger from '../../utils/logger';

/**
 * Migration 003: Add Tenant Tabs (Feature Gating)
 *
 * Creates tenant_tabs table for per-tenant feature/tab enablement.
 * New tenants start with zero tabs enabled.
 * Default tenant (id=1) gets all tabs backfilled.
 */

const MIGRATION_ID = '003_add_tenant_tabs';

export const ALL_TAB_KEYS = [
  'dashboard', 'patients', 'appointments', 'calendar', 'test_monitor', 'settings',
  'goal_tests', 'goal_test_generator', 'history', 'tuning',
  'ab_testing_sandbox', 'ai_prompting', 'api_testing', 'advanced',
  'dominos_dashboard', 'dominos_orders', 'dominos_health',
  'dominos_menu', 'dominos_sessions', 'dominos_errors',
] as const;

export function run(db: Database.Database): void {
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='tenant_tabs'"
  ).get();

  if (tableExists) {
    logger.info(`Migration ${MIGRATION_ID}: already applied, skipping`);
    return;
  }

  logger.info(`Migration ${MIGRATION_ID}: applying...`);

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_tabs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tab_key TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, tab_key)
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_tenant_tabs_tenant_id ON tenant_tabs(tenant_id)`);

    // Backfill: Default tenant (id=1) gets all tabs
    const defaultTenant = db.prepare('SELECT id FROM tenants WHERE is_default = 1 LIMIT 1').get() as { id: number } | undefined;
    if (defaultTenant) {
      const insert = db.prepare('INSERT OR IGNORE INTO tenant_tabs (tenant_id, tab_key) VALUES (?, ?)');
      for (const tabKey of ALL_TAB_KEYS) {
        insert.run(defaultTenant.id, tabKey);
      }
      logger.info(`Migration ${MIGRATION_ID}: backfilled ${ALL_TAB_KEYS.length} tabs for default tenant`);
    }
  });

  migrate();
  logger.info(`Migration ${MIGRATION_ID}: applied successfully`);
}

import Database from 'better-sqlite3';
import logger from '../../utils/logger';

/**
 * Migration 004: Add Dominos Integration Fields
 *
 * Adds dominos_service_url, dominos_service_auth_token, dominos_default_store_id
 * to tenants table. Seeds dominos-pizza tenant with default values.
 * Adds 6 dominos tab keys for the dominos-pizza tenant.
 */

const MIGRATION_ID = '004_add_dominos_integration';

const DOMINOS_TAB_KEYS = [
  'dominos_dashboard',
  'dominos_orders',
  'dominos_health',
  'dominos_menu',
  'dominos_sessions',
  'dominos_errors',
] as const;

export function run(db: Database.Database): void {
  // Check if migration already applied by looking for the column
  const columns = db.prepare("PRAGMA table_info('tenants')").all() as { name: string }[];
  const hasColumn = columns.some(c => c.name === 'dominos_service_url');

  if (hasColumn) {
    logger.info(`Migration ${MIGRATION_ID}: already applied, skipping`);
    return;
  }

  logger.info(`Migration ${MIGRATION_ID}: applying...`);

  const migrate = db.transaction(() => {
    // Add dominos columns to tenants table
    db.exec(`ALTER TABLE tenants ADD COLUMN dominos_service_url TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE tenants ADD COLUMN dominos_service_auth_token TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE tenants ADD COLUMN dominos_default_store_id TEXT DEFAULT NULL`);

    // Seed dominos-pizza tenant with default values
    const dominosTenant = db.prepare("SELECT id FROM tenants WHERE slug = 'dominos-pizza'").get() as { id: number } | undefined;
    if (dominosTenant) {
      db.prepare(`
        UPDATE tenants
        SET dominos_service_url = ?, dominos_default_store_id = ?
        WHERE id = ?
      `).run('http://localhost:3001', '7539', dominosTenant.id);

      // Insert dominos tab keys for the dominos-pizza tenant
      const insertTab = db.prepare('INSERT OR IGNORE INTO tenant_tabs (tenant_id, tab_key) VALUES (?, ?)');
      for (const tabKey of DOMINOS_TAB_KEYS) {
        insertTab.run(dominosTenant.id, tabKey);
      }
      logger.info(`Migration ${MIGRATION_ID}: configured dominos-pizza tenant (id=${dominosTenant.id}) with ${DOMINOS_TAB_KEYS.length} tabs`);
    } else {
      logger.info(`Migration ${MIGRATION_ID}: dominos-pizza tenant not found, skipping seed data`);
    }
  });

  migrate();
  logger.info(`Migration ${MIGRATION_ID}: applied successfully`);
}

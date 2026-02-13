import Database from 'better-sqlite3';
import logger from '../../utils/logger';

/**
 * Migration 006: Add dominos_data_source_url to tenants table
 *
 * Stores the base URL for the external order service API used by the import feature.
 * Seeds the dominos-pizza tenant with the default Replit service URL.
 */

const MIGRATION_ID = '006_add_dominos_data_source';

export function run(db: Database.Database): void {
  // Check if column already exists
  const columns = db.prepare("PRAGMA table_info('tenants')").all() as { name: string }[];
  if (columns.some(c => c.name === 'dominos_data_source_url')) {
    logger.info(`Migration ${MIGRATION_ID}: already applied, skipping`);
    return;
  }

  logger.info(`Migration ${MIGRATION_ID}: applying...`);

  const migrate = db.transaction(() => {
    db.exec(`ALTER TABLE tenants ADD COLUMN dominos_data_source_url TEXT DEFAULT NULL`);

    // Seed dominos-pizza tenant with the default URL
    db.prepare(`
      UPDATE tenants SET dominos_data_source_url = ?
      WHERE slug = 'dominos-pizza' AND dominos_data_source_url IS NULL
    `).run('https://dominos-order-service-v4.replit.app');
  });

  migrate();
  logger.info(`Migration ${MIGRATION_ID}: applied successfully`);
}

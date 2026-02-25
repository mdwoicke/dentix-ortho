import Database from 'better-sqlite3';
import logger from '../../utils/logger';

/**
 * Migration 009: Add Fabric Workflow credentials to tenants table
 *
 * Stores URL, username, and password for the Fabric Workflow API.
 * Seeds the default Ortho tenant (id=1) with the initial credentials.
 * Adds list_management tab for the default tenant.
 */

const MIGRATION_ID = '009_fabric_workflow';

export function run(db: Database.Database): void {
  // Check if column already exists
  const columns = db.prepare("PRAGMA table_info('tenants')").all() as { name: string }[];
  if (columns.some(c => c.name === 'fabric_workflow_url')) {
    logger.info(`Migration ${MIGRATION_ID}: already applied, skipping`);
    return;
  }

  logger.info(`Migration ${MIGRATION_ID}: applying...`);

  const migrate = db.transaction(() => {
    db.exec(`ALTER TABLE tenants ADD COLUMN fabric_workflow_url TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE tenants ADD COLUMN fabric_workflow_username TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE tenants ADD COLUMN fabric_workflow_password TEXT DEFAULT NULL`);

    // Seed the default Ortho tenant (id=1) with credentials
    db.prepare(`
      UPDATE tenants SET
        fabric_workflow_url = ?,
        fabric_workflow_username = ?,
        fabric_workflow_password = ?
      WHERE id = 1
    `).run(
      'https://dom-nginx-noderedflow.prod.c1conversations.io/FabricWorkflow/api/chord',
      'workflowapi2',
      'workflowapi2'
    );

    // Add list_management tab for default tenant (if tenant_tabs table exists)
    try {
      const existing = db.prepare(
        `SELECT 1 FROM tenant_tabs WHERE tenant_id = 1 AND tab_key = 'list_management'`
      ).get();
      if (!existing) {
        db.prepare(
          `INSERT INTO tenant_tabs (tenant_id, tab_key) VALUES (1, 'list_management')`
        ).run();
      }
    } catch {
      // tenant_tabs table may not exist yet
    }
  });

  migrate();
  logger.info(`Migration ${MIGRATION_ID}: applied successfully`);
}

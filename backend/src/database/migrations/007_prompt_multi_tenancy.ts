import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from '../../utils/logger';

/**
 * Migration 007: Make Prompt Tables Multi-Tenant
 *
 * Adds tenant_id to prompt_working_copies, prompt_version_history,
 * prompt_deployments, and prompt_quality_scores in the test-agent database.
 *
 * Backfills:
 *   - Rows with file_key starting with 'chord_' → tenant_id = 5 (Chord NexHealth)
 *   - All other rows → tenant_id = 1 (Ortho)
 *
 * Also updates the unique constraint on prompt_working_copies to be
 * (file_key, tenant_id) instead of just (file_key).
 */

const MIGRATION_ID = '007_prompt_multi_tenancy';

// The test-agent database where prompt tables live
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../../test-agent/data/test-results.db');

const ORTHO_TENANT_ID = 1;
const CHORD_TENANT_ID = 5;

export function run(_mainDb: Database.Database): void {
  // This migration targets the test-agent database, not dentix.db
  if (!fs.existsSync(TEST_AGENT_DB_PATH)) {
    logger.info(`Migration ${MIGRATION_ID}: test-agent DB not found at ${TEST_AGENT_DB_PATH}, skipping`);
    return;
  }

  const db = new Database(TEST_AGENT_DB_PATH);

  try {
    // Check if migration already applied
    const columns = db.pragma("table_info('prompt_working_copies')") as { name: string }[];
    const hasTenantId = columns.some(c => c.name === 'tenant_id');

    if (hasTenantId) {
      logger.info(`Migration ${MIGRATION_ID}: already applied, skipping`);
      db.close();
      return;
    }

    logger.info(`Migration ${MIGRATION_ID}: applying...`);

    const migrate = db.transaction(() => {
      // 1. Add tenant_id to all prompt tables
      const tables = [
        'prompt_working_copies',
        'prompt_version_history',
        'prompt_deployments',
        'prompt_quality_scores',
      ];

      for (const table of tables) {
        const tableExists = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).get(table);
        if (!tableExists) continue;

        const cols = db.pragma(`table_info('${table}')`) as { name: string }[];
        if (!cols.some(c => c.name === 'tenant_id')) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT ${ORTHO_TENANT_ID}`);
        }
      }

      // 2. Backfill: chord_* file_keys → tenant_id=5, others → tenant_id=1
      for (const table of tables) {
        const tableExists = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).get(table);
        if (!tableExists) continue;

        db.exec(`UPDATE ${table} SET tenant_id = ${CHORD_TENANT_ID} WHERE file_key LIKE 'chord_%'`);
        db.exec(`UPDATE ${table} SET tenant_id = ${ORTHO_TENANT_ID} WHERE tenant_id != ${CHORD_TENANT_ID}`);
      }

      // 3. Recreate prompt_working_copies with composite unique (file_key, tenant_id)
      //    SQLite doesn't support ALTER TABLE to modify constraints, so we recreate.
      db.exec(`
        CREATE TABLE IF NOT EXISTS prompt_working_copies_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_key TEXT NOT NULL,
          file_path TEXT NOT NULL,
          content TEXT NOT NULL,
          version INTEGER DEFAULT 1,
          last_fix_id TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          display_name TEXT,
          tenant_id INTEGER NOT NULL DEFAULT ${ORTHO_TENANT_ID},
          UNIQUE(file_key, tenant_id)
        )
      `);

      db.exec(`
        INSERT INTO prompt_working_copies_new (id, file_key, file_path, content, version, last_fix_id, updated_at, display_name, tenant_id)
        SELECT id, file_key, file_path, content, version, last_fix_id, updated_at, display_name, tenant_id
        FROM prompt_working_copies
      `);

      db.exec(`DROP TABLE prompt_working_copies`);
      db.exec(`ALTER TABLE prompt_working_copies_new RENAME TO prompt_working_copies`);

      // 4. Create indexes for tenant_id lookups
      db.exec(`CREATE INDEX IF NOT EXISTS idx_pwc_tenant ON prompt_working_copies(tenant_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_pvh_tenant ON prompt_version_history(tenant_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_pd_tenant ON prompt_deployments(tenant_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_pqs_tenant ON prompt_quality_scores(tenant_id)`);

      // 5. Add tenant_id to artifact_deploy_events if it exists and doesn't have it
      const adeExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='artifact_deploy_events'"
      ).get();
      if (adeExists) {
        const adeCols = db.pragma("table_info('artifact_deploy_events')") as { name: string }[];
        if (!adeCols.some(c => c.name === 'tenant_id')) {
          db.exec(`ALTER TABLE artifact_deploy_events ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT ${ORTHO_TENANT_ID}`);
          db.exec(`UPDATE artifact_deploy_events SET tenant_id = ${CHORD_TENANT_ID} WHERE artifact_key LIKE 'chord_%'`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_ade_tenant ON artifact_deploy_events(tenant_id)`);
        }
      }
    });

    migrate();
    logger.info(`Migration ${MIGRATION_ID}: applied successfully`);
  } finally {
    db.close();
  }
}

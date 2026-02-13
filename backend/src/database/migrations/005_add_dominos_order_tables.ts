import Database from 'better-sqlite3';
import logger from '../../utils/logger';

/**
 * Migration 005: Add Dominos Order Logs Table
 *
 * Creates dominos_order_logs table for storing order/call data
 * imported from CSV export. Replaces dependency on external proxy service.
 */

const MIGRATION_ID = '005_add_dominos_order_tables';

export function run(db: Database.Database): void {
  // Check if migration already applied
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dominos_order_logs'").get();
  if (tables) {
    logger.info(`Migration ${MIGRATION_ID}: already applied, skipping`);
    return;
  }

  logger.info(`Migration ${MIGRATION_ID}: applying...`);

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dominos_order_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        request_id TEXT,
        timestamp TEXT NOT NULL,
        timestamp_cst TEXT,
        method TEXT NOT NULL DEFAULT 'POST',
        endpoint TEXT NOT NULL DEFAULT '/api/v1/direct-order',
        status_code INTEGER NOT NULL DEFAULT 200,
        response_time_ms INTEGER DEFAULT 0,
        error_message TEXT,
        user_agent TEXT DEFAULT 'node-dominos-pizza-api',
        ip_address TEXT DEFAULT '35.209.60.11',
        store_id TEXT,
        order_total REAL DEFAULT 0,
        items_count INTEGER DEFAULT 0,
        success INTEGER NOT NULL DEFAULT 0,
        request_body TEXT,
        response_body TEXT,
        error_stack TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        customer_address TEXT,
        order_type TEXT,
        order_summary TEXT,
        utterance TEXT,
        call_type TEXT,
        payment_type TEXT,
        intent TEXT,
        address_verified TEXT,
        order_confirmed INTEGER DEFAULT 0,
        ai_agent_order_output TEXT,
        delivery_instructions TEXT,
        call_data TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_dominos_order_logs_tenant ON dominos_order_logs(tenant_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_dominos_order_logs_session ON dominos_order_logs(session_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_dominos_order_logs_timestamp ON dominos_order_logs(timestamp DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_dominos_order_logs_store ON dominos_order_logs(store_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_dominos_order_logs_success ON dominos_order_logs(success)`);
  });

  migrate();
  logger.info(`Migration ${MIGRATION_ID}: applied successfully`);
}

import Database from 'better-sqlite3';
import logger from '../../utils/logger';

/**
 * Migration 002: Add Composite Unique Constraints for Tenant Isolation
 *
 * Creates composite unique indexes on (tenant_id, *_guid) columns
 * so that ON CONFLICT upserts work correctly per-tenant.
 * Also drops the old single-column unique indexes.
 */

const MIGRATION_ID = '002_tenant_unique_constraints';

export function run(db: Database.Database): void {
  // Check if migration already ran (check for one of the composite indexes)
  const indexExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_locations_tenant_guid'"
  ).get();

  if (indexExists) {
    logger.info(`Migration ${MIGRATION_ID}: already applied, skipping`);
    return;
  }

  logger.info(`Migration ${MIGRATION_ID}: applying...`);

  const migrate = db.transaction(() => {
    // Drop old single-column unique indexes (these conflict with composite upserts)
    // SQLite doesn't error if the index doesn't exist when using IF EXISTS
    const oldIndexes = [
      'idx_locations_guid',
      'idx_appointment_types_guid',
      'idx_providers_guid',
      'idx_patients_guid',
      'idx_appointments_guid',
    ];

    for (const idx of oldIndexes) {
      db.exec(`DROP INDEX IF EXISTS ${idx}`);
    }

    // Also drop any auto-created unique indexes from column constraints
    // We need to check what indexes exist on each table
    const existingIndexes = db.prepare(
      "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND sql LIKE '%UNIQUE%'"
    ).all() as { name: string; tbl_name: string }[];

    for (const idx of existingIndexes) {
      // Only drop single-column unique indexes on our target tables
      // Don't drop composite indexes or indexes on other tables
      const targetTables = ['locations', 'appointment_types', 'providers', 'patients', 'appointments'];
      if (targetTables.includes(idx.tbl_name) && !idx.name.startsWith('idx_') && !idx.name.startsWith('sqlite_')) {
        try {
          db.exec(`DROP INDEX IF EXISTS "${idx.name}"`);
          logger.info(`Dropped old unique index ${idx.name} on ${idx.tbl_name}`);
        } catch {
          // Ignore errors - some indexes can't be dropped (e.g., implicit from UNIQUE column constraint)
        }
      }
    }

    // Create composite unique indexes for tenant-scoped upserts
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_tenant_guid ON locations(tenant_id, location_guid)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_types_tenant_guid ON appointment_types(tenant_id, appointment_type_guid)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_tenant_guid ON providers(tenant_id, provider_guid)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_tenant_guid ON patients(tenant_id, patient_guid)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_tenant_guid ON appointments(tenant_id, appointment_guid)`);
  });

  migrate();
  logger.info(`Migration ${MIGRATION_ID}: applied successfully`);
}

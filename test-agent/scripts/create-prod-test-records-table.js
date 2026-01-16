/**
 * Migration script: Create prod_test_records table
 * Run this to add the table to an existing database
 */

const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../data/test-results.db');

console.log('Opening database at:', DB_PATH);
const db = new BetterSqlite3(DB_PATH);

console.log('Creating prod_test_records table...');

db.exec(`
  -- Track patients and appointments created in Production for cleanup
  CREATE TABLE IF NOT EXISTS prod_test_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_type TEXT NOT NULL CHECK(record_type IN ('patient', 'appointment')),

    -- Cloud9 identifiers
    patient_guid TEXT NOT NULL,
    appointment_guid TEXT,

    -- Patient info
    patient_id TEXT,
    patient_first_name TEXT,
    patient_last_name TEXT,
    patient_email TEXT,
    patient_phone TEXT,
    patient_birthdate TEXT,

    -- Appointment info
    appointment_datetime TEXT,
    appointment_type TEXT,
    appointment_type_guid TEXT,
    appointment_minutes INTEGER,

    -- Location/Provider context
    location_guid TEXT,
    location_name TEXT,
    provider_guid TEXT,
    provider_name TEXT,
    schedule_view_guid TEXT,
    schedule_column_guid TEXT,

    -- Langfuse tracing
    trace_id TEXT,
    observation_id TEXT,
    session_id TEXT,
    langfuse_config_id INTEGER,

    -- Status tracking
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'deleted', 'cleanup_failed')),
    cancelled_at TEXT,
    deleted_at TEXT,
    cleanup_notes TEXT,
    cleanup_error TEXT,

    -- Timestamps
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    cloud9_created_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_prod_test_records_type ON prod_test_records(record_type);
  CREATE INDEX IF NOT EXISTS idx_prod_test_records_status ON prod_test_records(status);
  CREATE INDEX IF NOT EXISTS idx_prod_test_records_patient_guid ON prod_test_records(patient_guid);
  CREATE INDEX IF NOT EXISTS idx_prod_test_records_appointment_guid ON prod_test_records(appointment_guid);
  CREATE INDEX IF NOT EXISTS idx_prod_test_records_trace_id ON prod_test_records(trace_id);
  CREATE INDEX IF NOT EXISTS idx_prod_test_records_created_at ON prod_test_records(created_at);
`);

// Verify table was created
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='prod_test_records'").all();
if (tables.length > 0) {
  console.log('✓ Table created successfully');

  // Check structure
  const columns = db.prepare("PRAGMA table_info(prod_test_records)").all();
  console.log(`✓ Table has ${columns.length} columns`);
} else {
  console.error('✗ Table creation failed');
}

db.close();
console.log('Done!');

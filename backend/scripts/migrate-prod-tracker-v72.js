/**
 * Migration Script: Add v72 Individual Patient Model columns to prod_test_records
 *
 * This script adds the following columns to support the v72 model:
 * - family_id: Links all family members together (parent + children)
 * - is_child: 1 if this is a child record, 0 if parent
 * - parent_patient_guid: For child records, references the parent's patient_guid
 *
 * Run: node backend/scripts/migrate-prod-tracker-v72.js
 */

const BetterSqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Try multiple possible database locations
const possiblePaths = [
  path.join(__dirname, '../data/test-results.db'),
  path.join(__dirname, '../../test-agent/data/test-results.db'),
  path.join(__dirname, '../src/database/test-results.db'),
];

let dbPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    // Check if this database has the prod_test_records table
    try {
      const testDb = new BetterSqlite3(p);
      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map(t => t.name);
      testDb.close();
      if (tableNames.includes('prod_test_records')) {
        dbPath = p;
        break;
      }
    } catch (e) {
      // Continue to next path
    }
  }
}

if (!dbPath) {
  console.error('Could not find database with prod_test_records table');
  console.log('Checked paths:', possiblePaths.join('\n  '));
  process.exit(1);
}

console.log('Opening database at:', dbPath);
const db = new BetterSqlite3(dbPath);

try {
  console.log('\n=== v72 Individual Patient Model Migration ===\n');

  // Check current schema
  const tableInfo = db.prepare("PRAGMA table_info(prod_test_records)").all();
  const existingColumns = tableInfo.map(col => col.name);

  console.log('Current columns:', existingColumns.join(', '));

  // Add family_id column if not exists
  if (!existingColumns.includes('family_id')) {
    console.log('\nAdding family_id column...');
    db.exec('ALTER TABLE prod_test_records ADD COLUMN family_id TEXT');
    console.log('  Added family_id column');
  } else {
    console.log('\nfamily_id column already exists');
  }

  // Add is_child column if not exists
  if (!existingColumns.includes('is_child')) {
    console.log('Adding is_child column...');
    db.exec('ALTER TABLE prod_test_records ADD COLUMN is_child INTEGER DEFAULT 0');
    console.log('  Added is_child column');
  } else {
    console.log('is_child column already exists');
  }

  // Add parent_patient_guid column if not exists
  if (!existingColumns.includes('parent_patient_guid')) {
    console.log('Adding parent_patient_guid column...');
    db.exec('ALTER TABLE prod_test_records ADD COLUMN parent_patient_guid TEXT');
    console.log('  Added parent_patient_guid column');
  } else {
    console.log('parent_patient_guid column already exists');
  }

  // Create indexes for the new columns
  console.log('\nCreating indexes...');

  // Check if indexes exist before creating
  const indexInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='prod_test_records'").all();
  const existingIndexes = indexInfo.map(idx => idx.name);

  if (!existingIndexes.includes('idx_prod_test_records_family_id')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_prod_test_records_family_id ON prod_test_records(family_id)');
    console.log('  Created idx_prod_test_records_family_id');
  } else {
    console.log('  idx_prod_test_records_family_id already exists');
  }

  if (!existingIndexes.includes('idx_prod_test_records_parent_guid')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_prod_test_records_parent_guid ON prod_test_records(parent_patient_guid)');
    console.log('  Created idx_prod_test_records_parent_guid');
  } else {
    console.log('  idx_prod_test_records_parent_guid already exists');
  }

  if (!existingIndexes.includes('idx_prod_test_records_is_child')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_prod_test_records_is_child ON prod_test_records(is_child)');
    console.log('  Created idx_prod_test_records_is_child');
  } else {
    console.log('  idx_prod_test_records_is_child already exists');
  }

  // Verify the migration
  console.log('\nVerifying migration...');
  const newTableInfo = db.prepare("PRAGMA table_info(prod_test_records)").all();
  const newColumns = newTableInfo.map(col => col.name);

  const requiredColumns = ['family_id', 'is_child', 'parent_patient_guid'];
  const missingColumns = requiredColumns.filter(col => !newColumns.includes(col));

  if (missingColumns.length === 0) {
    console.log('\n Migration successful! All v72 columns are present.');
    console.log('\nNew columns added:');
    console.log('  - family_id: TEXT (links family members together)');
    console.log('  - is_child: INTEGER DEFAULT 0 (1 if child record)');
    console.log('  - parent_patient_guid: TEXT (reference to parent)');
  } else {
    console.error('\n Migration incomplete! Missing columns:', missingColumns.join(', '));
    process.exit(1);
  }

  // Show record counts
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN family_id IS NOT NULL THEN 1 ELSE 0 END) as with_family_id,
      SUM(CASE WHEN is_child = 1 THEN 1 ELSE 0 END) as children,
      SUM(CASE WHEN parent_patient_guid IS NOT NULL THEN 1 ELSE 0 END) as with_parent_guid
    FROM prod_test_records
  `).get();

  console.log('\nCurrent record statistics:');
  console.log(`  Total records: ${stats.total}`);
  console.log(`  Records with family_id: ${stats.with_family_id}`);
  console.log(`  Child records: ${stats.children}`);
  console.log(`  Records with parent_patient_guid: ${stats.with_parent_guid}`);

} catch (error) {
  console.error('\nMigration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
  console.log('\nDatabase closed.');
}

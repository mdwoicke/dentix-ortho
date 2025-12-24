import Database from 'better-sqlite3';
import path from 'path';
import logger from '../utils/logger';

/**
 * SQLite Database Configuration
 * Provides a singleton database connection
 */

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../dentix.db');

let dbInstance: Database.Database | null = null;

/**
 * Get the database instance (singleton pattern)
 */
export function getDatabase(): Database.Database {
  if (!dbInstance) {
    try {
      dbInstance = new Database(DB_PATH, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
      });

      // Enable foreign keys
      dbInstance.pragma('foreign_keys = ON');

      // Set journal mode to WAL for better concurrency
      dbInstance.pragma('journal_mode = WAL');

      logger.info('Database connection established', { path: DB_PATH });
    } catch (error) {
      logger.error('Failed to connect to database', {
        path: DB_PATH,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
      dbInstance = null;
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Run a database transaction
 */
export function transaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDatabase();
  const txn = db.transaction(fn);
  return txn(db);
}

/**
 * Check if database is connected
 */
export function isDatabaseConnected(): boolean {
  return dbInstance !== null && dbInstance.open;
}

// Graceful shutdown
process.on('exit', () => {
  closeDatabase();
});

process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});

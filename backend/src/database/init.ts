import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_PATH = process.env.DATABASE_PATH || './dentix.db';
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export function initializeDatabase(): Database.Database {
  const db = new Database(DATABASE_PATH);

  console.log('Initializing database...');

  // Read and execute schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  console.log('Database initialized successfully at:', DATABASE_PATH);

  return db;
}

// Run initialization if this file is executed directly
if (require.main === module) {
  initializeDatabase();
}

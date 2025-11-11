import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dbLogger as logger } from '../utils/logger.js';
import { initializeDatabase } from './schema.js';

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = process.env['DB_PATH'] || './data/monitor.db';

  // Ensure data directory exists
  const dataDir = dbPath.includes('/') ? dbPath.substring(0, dbPath.lastIndexOf('/')) : '.';
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    logger.info(`Created data directory: ${dataDir}`);
  }

  logger.info(`Opening database at: ${dbPath}`);

  dbInstance = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  dbInstance.pragma('journal_mode = WAL');

  // Initialize schema
  initializeDatabase(dbInstance);

  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    logger.info('Database connection closed');
  }
}

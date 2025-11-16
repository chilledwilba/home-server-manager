/**
 * Database query performance tracking utilities
 * Wraps better-sqlite3 queries with Prometheus metrics
 */

import type Database from 'better-sqlite3';
import { dbQueryDuration } from '../utils/metrics.js';

/**
 * Execute a query with performance tracking
 */
export function trackedQuery<T>(
  _db: Database.Database,
  operation: string,
  table: string,
  fn: () => T,
): T {
  const start = Date.now();
  try {
    const result = fn();
    const duration = (Date.now() - start) / 1000;
    dbQueryDuration.labels(operation, table).observe(duration);
    return result;
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    dbQueryDuration.labels(`${operation}_error`, table).observe(duration);
    throw error;
  }
}

/**
 * Execute a prepared statement with tracking
 */
export function trackedPrepare<T extends unknown[] = unknown[]>(
  db: Database.Database,
  table: string,
  query: string,
): Database.Statement<T> {
  const stmt = db.prepare<T>(query);

  // Wrap methods with tracking
  const originalRun = stmt.run.bind(stmt);
  const originalGet = stmt.get.bind(stmt);
  const originalAll = stmt.all.bind(stmt);

  stmt.run = (...params: T) => trackedQuery(db, 'run', table, () => originalRun(...params));

  stmt.get = (...params: T) => trackedQuery(db, 'get', table, () => originalGet(...params));

  stmt.all = (...params: T) => trackedQuery(db, 'all', table, () => originalAll(...params));

  return stmt;
}

/**
 * Wrapper for database.exec() with tracking
 */
export function trackedExec(db: Database.Database, table: string, sql: string): void {
  trackedQuery(db, 'exec', table, () => db.exec(sql));
}

/**
 * Wrapper for transaction with tracking
 */
export function trackedTransaction<T>(db: Database.Database, table: string, fn: () => T): () => T {
  const txn = db.transaction(fn);

  return () => {
    return trackedQuery(db, 'transaction', table, txn);
  };
}

/**
 * Example usage patterns and best practices
 */
export const DB_METRICS_EXAMPLES = `
Example usage:

// Simple query
const result = trackedQuery(db, 'select', 'users', () => {
  return db.prepare('SELECT * FROM users').all();
});

// Prepared statement
const stmt = trackedPrepare(db, 'users', 'INSERT INTO users (name) VALUES (?)');
stmt.run('John Doe');

// Transaction
const insertMany = trackedTransaction(db, 'users', () => {
  const stmt = db.prepare('INSERT INTO users (name) VALUES (?)');
  for (const name of names) {
    stmt.run(name);
  }
});
insertMany();
`;

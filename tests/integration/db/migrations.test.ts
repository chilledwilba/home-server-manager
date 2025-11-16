import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

describe('Database Migration System', () => {
	const testDir = './test-migration-data';
	const dbPath = join(testDir, 'test-migration.db');
	const backupDir = join(testDir, 'backups');

	beforeEach(() => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
		mkdirSync(testDir, { recursive: true });
		mkdirSync(backupDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('Migration Table Creation', () => {
		it('should create migrations table with all required fields', () => {
			const db = new Database(dbPath);

			db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          applied_at TEXT NOT NULL,
          rolled_back_at TEXT,
          backup_path TEXT,
          status TEXT NOT NULL DEFAULT 'applied',
          error_message TEXT,
          UNIQUE(version)
        );
      `);

			// Verify table structure
			const tableInfo = db.pragma('table_info(migrations)') as Array<{
				name: string;
				type: string;
				notnull: number;
				pk: number;
			}>;

			expect(tableInfo).toContainEqual(
				expect.objectContaining({
					name: 'version',
					type: 'INTEGER',
					pk: 1,
				})
			);

			expect(tableInfo).toContainEqual(
				expect.objectContaining({
					name: 'name',
					type: 'TEXT',
					notnull: 1,
				})
			);

			expect(tableInfo).toContainEqual(
				expect.objectContaining({
					name: 'status',
					type: 'TEXT',
					notnull: 1,
				})
			);

			db.close();
		});

		it('should create migration_history table', () => {
			const db = new Database(dbPath);

			db.exec(`
        CREATE TABLE IF NOT EXISTS migration_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          direction TEXT NOT NULL,
          status TEXT NOT NULL,
          backup_path TEXT,
          error_message TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT
        );
      `);

			const tableInfo = db.pragma('table_info(migration_history)') as Array<{
				name: string;
				type: string;
			}>;

			expect(tableInfo).toContainEqual(expect.objectContaining({ name: 'id' }));
			expect(tableInfo).toContainEqual(expect.objectContaining({ name: 'version' }));
			expect(tableInfo).toContainEqual(expect.objectContaining({ name: 'direction' }));
			expect(tableInfo).toContainEqual(expect.objectContaining({ name: 'status' }));

			db.close();
		});
	});

	describe('Migration Application', () => {
		it('should apply migration and track it in migrations table', () => {
			const db = new Database(dbPath);

			// Create migrations table
			db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          applied_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'applied'
        );
      `);

			// Apply a test migration
			const migrationDate = new Date().toISOString();
			db.transaction(() => {
				db.exec(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL
          );
        `);

				db.prepare(`INSERT INTO migrations (version, name, description, applied_at, status) VALUES (?, ?, ?, ?, ?)`).run(
					1,
					'create_users_table',
					'Create users table',
					migrationDate,
					'applied'
				);
			})();

			// Verify migration was tracked
			const migration = db.prepare('SELECT * FROM migrations WHERE version = ?').get(1) as {
				version: number;
				name: string;
				status: string;
			};

			expect(migration).toBeDefined();
			expect(migration.version).toBe(1);
			expect(migration.name).toBe('create_users_table');
			expect(migration.status).toBe('applied');

			// Verify table was created
			const tables = db
				.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`)
				.all() as { name: string }[];

			expect(tables).toHaveLength(1);

			db.close();
		});

		it('should rollback transaction if migration fails', () => {
			const db = new Database(dbPath);

			db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          status TEXT NOT NULL
        );
      `);

			// Attempt migration that will fail
			expect(() => {
				db.transaction(() => {
					db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
					// This will fail - invalid SQL
					db.exec('INVALID SQL SYNTAX');
					db.prepare('INSERT INTO migrations (version, name, applied_at, status) VALUES (?, ?, ?, ?)').run(
						1,
						'failed_migration',
						new Date().toISOString(),
						'applied'
					);
				})();
			}).toThrow();

			// Verify migration was not tracked
			const migrations = db.prepare('SELECT * FROM migrations').all();
			expect(migrations).toHaveLength(0);

			// Verify table was not created (rollback worked)
			const tables = db
				.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='test'`)
				.all();
			expect(tables).toHaveLength(0);

			db.close();
		});
	});

	describe('Migration Rollback', () => {
		it('should rollback migration and update status', () => {
			const db = new Database(dbPath);

			// Setup: Create migrations table and apply a migration
			db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          rolled_back_at TEXT,
          status TEXT NOT NULL DEFAULT 'applied'
        );

        CREATE TABLE test_table (id INTEGER PRIMARY KEY);
      `);

			db.prepare('INSERT INTO migrations (version, name, applied_at, status) VALUES (?, ?, ?, ?)').run(
				1,
				'create_test_table',
				new Date().toISOString(),
				'applied'
			);

			// Rollback migration
			const rollbackDate = new Date().toISOString();
			db.transaction(() => {
				db.exec('DROP TABLE test_table');
				db.prepare(`UPDATE migrations SET status = 'rolled_back', rolled_back_at = ? WHERE version = ?`).run(
					rollbackDate,
					1
				);
			})();

			// Verify migration status was updated
			const migration = db.prepare('SELECT * FROM migrations WHERE version = ?').get(1) as {
				status: string;
				rolled_back_at: string;
			};

			expect(migration.status).toBe('rolled_back');
			expect(migration.rolled_back_at).toBe(rollbackDate);

			// Verify table was dropped
			const tables = db
				.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'`)
				.all();
			expect(tables).toHaveLength(0);

			db.close();
		});

		it('should track rollback in migration_history', () => {
			const db = new Database(dbPath);

			db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          status TEXT NOT NULL
        );

        CREATE TABLE migration_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          direction TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT
        );
      `);

			// Record rollback in history
			const startedAt = new Date().toISOString();
			const historyId = db
				.prepare('INSERT INTO migration_history (version, direction, status, started_at) VALUES (?, ?, ?, ?)').run(
				1,
				'down',
				'running',
				startedAt
			).lastInsertRowid;

			// Complete rollback
			const completedAt = new Date().toISOString();
			db.prepare('UPDATE migration_history SET status = ?, completed_at = ? WHERE id = ?').run(
				'success',
				completedAt,
				historyId
			);

			// Verify history
			const history = db.prepare('SELECT * FROM migration_history WHERE id = ?').get(historyId) as {
				version: number;
				direction: string;
				status: string;
				started_at: string;
				completed_at: string;
			};

			expect(history.version).toBe(1);
			expect(history.direction).toBe('down');
			expect(history.status).toBe('success');
			expect(history.completed_at).toBe(completedAt);

			db.close();
		});
	});

	describe('Migration History Tracking', () => {
		it('should track successful migration in history', () => {
			const db = new Database(dbPath);

			db.exec(`
        CREATE TABLE migration_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          direction TEXT NOT NULL,
          status TEXT NOT NULL,
          backup_path TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT
        );
      `);

			const startedAt = new Date().toISOString();
			const backupPath = '/data/backups/test.db.backup-2024-01-01';

			const historyId = db
				.prepare(
					'INSERT INTO migration_history (version, direction, status, backup_path, started_at) VALUES (?, ?, ?, ?, ?)'
				).run(1, 'up', 'running', backupPath, startedAt).lastInsertRowid;

			// Simulate successful completion
			const completedAt = new Date().toISOString();
			db.prepare('UPDATE migration_history SET status = ?, completed_at = ? WHERE id = ?').run(
				'success',
				completedAt,
				historyId
			);

			// Verify history entry
			const history = db.prepare('SELECT * FROM migration_history WHERE id = ?').get(historyId) as {
				version: number;
				direction: string;
				status: string;
				backup_path: string;
				completed_at: string;
			};

			expect(history.version).toBe(1);
			expect(history.direction).toBe('up');
			expect(history.status).toBe('success');
			expect(history.backup_path).toBe(backupPath);
			expect(history.completed_at).toBe(completedAt);

			db.close();
		});

		it('should track failed migration with error message', () => {
			const db = new Database(dbPath);

			db.exec(`
        CREATE TABLE migration_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          direction TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT
        );
      `);

			const startedAt = new Date().toISOString();
			const errorMessage = 'UNIQUE constraint failed: users.email';

			const historyId = db
				.prepare('INSERT INTO migration_history (version, direction, status, started_at) VALUES (?, ?, ?, ?)').run(
				2,
				'up',
				'running',
				startedAt
			).lastInsertRowid;

			// Simulate failure
			const completedAt = new Date().toISOString();
			db.prepare('UPDATE migration_history SET status = ?, error_message = ?, completed_at = ? WHERE id = ?').run(
				'failed',
				errorMessage,
				completedAt,
				historyId
			);

			// Verify error was recorded
			const history = db.prepare('SELECT * FROM migration_history WHERE id = ?').get(historyId) as {
				status: string;
				error_message: string;
			};

			expect(history.status).toBe('failed');
			expect(history.error_message).toBe(errorMessage);

			db.close();
		});
	});

	describe('Migration Versioning', () => {
		it('should track current database version correctly', () => {
			const db = new Database(dbPath);

			db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'applied'
        );
      `);

			// Apply multiple migrations
			const migrations = [
				{ version: 1, name: 'initial_schema' },
				{ version: 2, name: 'add_users_table' },
				{ version: 3, name: 'add_indexes' },
			];

			for (const migration of migrations) {
				db.prepare('INSERT INTO migrations (version, name, applied_at, status) VALUES (?, ?, ?, ?)').run(
					migration.version,
					migration.name,
					new Date().toISOString(),
					'applied'
				);
			}

			// Get current version
			const currentVersionRow = db
				.prepare("SELECT MAX(version) as version FROM migrations WHERE status = 'applied'")
				.get() as { version: number };

			expect(currentVersionRow.version).toBe(3);

			db.close();
		});

		it('should not count rolled back migrations in current version', () => {
			const db = new Database(dbPath);

			db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          status TEXT NOT NULL
        );
      `);

			// Apply and rollback some migrations
			db.prepare('INSERT INTO migrations (version, name, applied_at, status) VALUES (?, ?, ?, ?)').run(
				1,
				'migration_1',
				new Date().toISOString(),
				'applied'
			);

			db.prepare('INSERT INTO migrations (version, name, applied_at, status) VALUES (?, ?, ?, ?)').run(
				2,
				'migration_2',
				new Date().toISOString(),
				'rolled_back'
			);

			db.prepare('INSERT INTO migrations (version, name, applied_at, status) VALUES (?, ?, ?, ?)').run(
				3,
				'migration_3',
				new Date().toISOString(),
				'applied'
			);

			// Get current version (should skip rolled back)
			const currentVersionRow = db
				.prepare("SELECT MAX(version) as version FROM migrations WHERE status = 'applied'")
				.get() as { version: number };

			expect(currentVersionRow.version).toBe(3);

			// Count only applied migrations
			const appliedCount = db
				.prepare("SELECT COUNT(*) as count FROM migrations WHERE status = 'applied'")
				.get() as { count: number };

			expect(appliedCount.count).toBe(2);

			db.close();
		});
	});

	describe('Database Integrity Checks', () => {
		it('should pass integrity_check on valid database', () => {
			const db = new Database(dbPath);

			db.exec(`
        CREATE TABLE test (
          id INTEGER PRIMARY KEY,
          data TEXT
        );
        INSERT INTO test (data) VALUES ('test data');
      `);

			const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;

			expect(result).toHaveLength(1);
			expect(result[0]?.integrity_check).toBe('ok');

			db.close();
		});

		it('should check foreign key constraints', () => {
			const db = new Database(dbPath);

			db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY
        );

        CREATE TABLE migration_history (
          id INTEGER PRIMARY KEY,
          version INTEGER NOT NULL,
          FOREIGN KEY (version) REFERENCES migrations(version)
        );

        INSERT INTO migrations (version) VALUES (1);
        INSERT INTO migration_history (version) VALUES (1);
      `);

			// Enable foreign keys
			db.pragma('foreign_keys = ON');

			const fkCheck = db.pragma('foreign_key_check') as unknown[];
			expect(fkCheck).toHaveLength(0); // No FK violations

			db.close();
		});
	});
});

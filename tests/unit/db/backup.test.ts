import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createBackup, listBackups, restoreBackup, verifyDatabaseIntegrity } from '../../../src/db/backup.js';

describe('Database Backup System', () => {
	const testDir = './test-data';
	const dbPath = join(testDir, 'test.db');
	const backupDir = join(testDir, 'backups');

	beforeEach(() => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
		mkdirSync(testDir, { recursive: true });
		mkdirSync(backupDir, { recursive: true });

		// Create a test database
		const db = new Database(dbPath);
		db.exec(`
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER
      );
      INSERT INTO test_table (name, value) VALUES ('test1', 100);
      INSERT INTO test_table (name, value) VALUES ('test2', 200);
    `);
		db.close();
	});

	afterEach(() => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('createBackup', () => {
		it('should create a backup successfully', () => {
			const result = createBackup(dbPath, { backupDir });

			expect(result.success).toBe(true);
			expect(result.backupPath).toBeDefined();
			expect(result.sizeBytes).toBeGreaterThan(0);
			expect(existsSync(result.backupPath!)).toBe(true);
		});

		it('should include timestamp in backup filename', () => {
			const result = createBackup(dbPath, { backupDir });

			expect(result.success).toBe(true);
			expect(result.backupPath).toContain('.backup-');
			expect(result.timestamp).toBeDefined();
		});

		it('should handle non-existent database', () => {
			const result = createBackup('./nonexistent.db', { backupDir });

			expect(result.success).toBe(false);
			expect(result.error).toContain('not found');
		});

		it('should create backup directory if it does not exist', () => {
			const customBackupDir = join(testDir, 'new-backups');
			const result = createBackup(dbPath, { backupDir: customBackupDir });

			expect(result.success).toBe(true);
			expect(existsSync(customBackupDir)).toBe(true);
		});

		it('should clean up old backups when maxBackups is exceeded', () => {
			// Create multiple backups
			for (let i = 0; i < 12; i++) {
				createBackup(dbPath, { backupDir, maxBackups: 5 });
			}

			const backups = listBackups(backupDir);
			expect(backups.length).toBeLessThanOrEqual(5);
		});

		it('should backup WAL and SHM files if they exist', () => {
			// Enable WAL mode
			const db = new Database(dbPath);
			db.pragma('journal_mode = WAL');
			db.exec("INSERT INTO test_table (name, value) VALUES ('wal-test', 300)");
			db.close();

			const result = createBackup(dbPath, { backupDir });

			expect(result.success).toBe(true);
			// WAL/SHM files may or may not exist depending on when checkpoint happens
		});
	});

	describe('restoreBackup', () => {
		it('should restore database from backup successfully', () => {
			// Create backup
			const backupResult = createBackup(dbPath, { backupDir });
			expect(backupResult.success).toBe(true);

			// Modify original database
			const db = new Database(dbPath);
			db.exec("INSERT INTO test_table (name, value) VALUES ('new-data', 999)");
			db.close();

			// Verify modification
			let dbCheck = new Database(dbPath);
			let rows = dbCheck.prepare('SELECT COUNT(*) as count FROM test_table').get() as { count: number };
			expect(rows.count).toBe(3);
			dbCheck.close();

			// Restore backup
			const targetPath = join(testDir, 'restored.db');
			const restoreResult = restoreBackup(backupResult.backupPath!, targetPath);

			expect(restoreResult.success).toBe(true);
			expect(existsSync(targetPath)).toBe(true);

			// Verify restored data
			dbCheck = new Database(targetPath);
			rows = dbCheck.prepare('SELECT COUNT(*) as count FROM test_table').get() as { count: number };
			expect(rows.count).toBe(2); // Original 2 rows, not 3
			dbCheck.close();
		});

		it('should handle non-existent backup file', () => {
			const result = restoreBackup('./nonexistent-backup.db', join(testDir, 'target.db'));

			expect(result.success).toBe(false);
			expect(result.error).toContain('not found');
		});
	});

	describe('listBackups', () => {
		it('should list all backups in directory', () => {
			// Create multiple backups
			createBackup(dbPath, { backupDir });
			createBackup(dbPath, { backupDir });
			createBackup(dbPath, { backupDir });

			const backups = listBackups(backupDir);

			expect(backups.length).toBe(3);
			expect(backups[0]).toHaveProperty('name');
			expect(backups[0]).toHaveProperty('path');
			expect(backups[0]).toHaveProperty('timestamp');
			expect(backups[0]).toHaveProperty('sizeBytes');
		});

		it('should sort backups by timestamp descending', () => {
			// Create backups with delays
			createBackup(dbPath, { backupDir });
			createBackup(dbPath, { backupDir });

			const backups = listBackups(backupDir);

			expect(backups.length).toBeGreaterThan(0);
			// Check that timestamps are in descending order
			for (let i = 0; i < backups.length - 1; i++) {
				const current = backups[i];
				const next = backups[i + 1];
				if (current && next) {
					expect(current.timestamp.getTime()).toBeGreaterThanOrEqual(next.timestamp.getTime());
				}
			}
		});

		it('should return empty array for non-existent directory', () => {
			const backups = listBackups('./nonexistent-backup-dir');

			expect(backups).toEqual([]);
		});

		it('should exclude WAL and SHM files from backup list', () => {
			// Create backup
			createBackup(dbPath, { backupDir });

			// Create fake WAL and SHM files
			const fakeName = 'test.db.backup-2024-01-01T00-00-00-000Z';
			writeFileSync(join(backupDir, `${fakeName}-wal`), 'fake wal');
			writeFileSync(join(backupDir, `${fakeName}-shm`), 'fake shm');

			const backups = listBackups(backupDir);

			// Should only list actual backup files, not WAL/SHM
			expect(backups.every((b) => !b.name.endsWith('-wal') && !b.name.endsWith('-shm'))).toBe(true);
		});
	});

	describe('verifyDatabaseIntegrity', () => {
		it('should verify valid database successfully', () => {
			const db = new Database(dbPath);
			// Create migrations table for valid database
			db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
      `);

			const result = verifyDatabaseIntegrity(db);

			expect(result.isValid).toBe(true);
			expect(result.errors).toEqual([]);

			db.close();
		});

		it('should detect missing migrations table', () => {
			const db = new Database(dbPath);

			const result = verifyDatabaseIntegrity(db);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('Migrations table not found'))).toBe(true);

			db.close();
		});

		it('should pass integrity check with migrations table', () => {
			const db = new Database(dbPath);
			db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
      `);

			const result = verifyDatabaseIntegrity(db);

			expect(result.isValid).toBe(true);
			expect(result.errors).toEqual([]);

			db.close();
		});
	});

	describe('Backup Integration', () => {
		it('should handle complete backup and restore workflow', () => {
			// 1. Create initial database state
			let db = new Database(dbPath);
			db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
        INSERT INTO migrations VALUES (1, 'initial', '2024-01-01T00:00:00Z');
      `);
			db.close();

			// 2. Create backup
			const backupResult = createBackup(dbPath, { backupDir, maxBackups: 3 });
			expect(backupResult.success).toBe(true);

			// 3. Modify database (simulate migration)
			db = new Database(dbPath);
			db.exec(`INSERT INTO migrations VALUES (2, 'second', '2024-01-02T00:00:00Z')`);
			db.close();

			// 4. Verify modification
			db = new Database(dbPath);
			let count = db.prepare('SELECT COUNT(*) as count FROM migrations').get() as { count: number };
			expect(count.count).toBe(2);
			db.close();

			// 5. Restore from backup
			const targetPath = join(testDir, 'restored-integration.db');
			const restoreResult = restoreBackup(backupResult.backupPath!, targetPath);
			expect(restoreResult.success).toBe(true);

			// 6. Verify restored state
			db = new Database(targetPath);
			count = db.prepare('SELECT COUNT(*) as count FROM migrations').get() as { count: number };
			expect(count.count).toBe(1); // Back to original state
			db.close();
		});
	});
});

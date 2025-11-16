#!/usr/bin/env tsx

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import {
  createBackup,
  listBackups,
  restoreBackup,
  verifyDatabaseIntegrity,
} from '../src/db/backup.js';
import { initializeDatabase } from '../src/db/schema.js';

interface Migration {
  version: number;
  name: string;
  description: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    description: 'Create initial database schema',
    up: (db: Database.Database) => {
      // Initial schema is created by initializeDatabase
      initializeDatabase(db);
    },
    down: (db: Database.Database) => {
      // Drop all tables except migrations
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'`,
        )
        .all() as { name: string }[];

      for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${table.name}`);
      }
    },
  },
  // Add future migrations here
];

interface MigrateOptions {
  direction: 'up' | 'down';
  targetVersion?: number;
  skipBackup?: boolean;
  dryRun?: boolean;
}

async function migrate(options: MigrateOptions): Promise<void> {
  const { direction, targetVersion, skipBackup = false, dryRun = false } = options;
  const dbPath = process.env['DATABASE_PATH'] || './data/home-server-monitor.db';

  // Ensure data directory exists
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  console.log('\n🔄 Database Migration Tool');
  console.log('═'.repeat(50));
  console.log(`Database: ${dbPath}`);
  console.log(`Direction: ${direction.toUpperCase()}`);
  if (targetVersion !== undefined) {
    console.log(`Target Version: ${targetVersion}`);
  }
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made');
  }
  console.log('═'.repeat(50) + '\n');

  const db = new Database(dbPath);

  try {
    // Create migrations table with enhanced tracking
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

      CREATE TABLE IF NOT EXISTS migration_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL,
        direction TEXT NOT NULL,
        status TEXT NOT NULL,
        backup_path TEXT,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (version) REFERENCES migrations(version)
      );
    `);

    // Verify database integrity before proceeding
    console.log('🔍 Verifying database integrity...');
    const integrityCheck = verifyDatabaseIntegrity(db);
    if (!integrityCheck.isValid) {
      console.error('❌ Database integrity check failed:');
      for (const error of integrityCheck.errors) {
        console.error(`   - ${error}`);
      }
      throw new Error('Database integrity check failed. Aborting migration.');
    }
    console.log('✅ Database integrity verified\n');

    // Get current version
    const currentVersionRow = db
      .prepare("SELECT MAX(version) as version FROM migrations WHERE status = 'applied'")
      .get() as { version: number | null };

    const currentVersion = currentVersionRow?.version || 0;
    console.log(`📊 Current database version: ${currentVersion}\n`);

    if (direction === 'up') {
      // Apply pending migrations
      let pending = migrations.filter((m) => m.version > currentVersion);

      // Filter to target version if specified
      if (targetVersion !== undefined) {
        pending = pending.filter((m) => m.version <= targetVersion);
      }

      if (pending.length === 0) {
        console.log('✅ No pending migrations');
        return;
      }

      console.log(`📋 Found ${pending.length} pending migration(s):\n`);
      for (const m of pending) {
        console.log(`   ${m.version}. ${m.name} - ${m.description}`);
      }
      console.log();

      // Create backup before applying migrations (unless skipped)
      let backupPath: string | undefined;
      if (!skipBackup && !dryRun && existsSync(dbPath)) {
        console.log('💾 Creating database backup...');
        const backupResult = createBackup(dbPath, {
          maxBackups: 10,
          backupDir: './data/backups',
        });

        if (!backupResult.success) {
          throw new Error(`Backup failed: ${backupResult.error}`);
        }

        backupPath = backupResult.backupPath;
        const sizeMB = ((backupResult.sizeBytes || 0) / 1024 / 1024).toFixed(2);
        console.log(`✅ Backup created: ${backupPath} (${sizeMB} MB)\n`);
      }

      if (dryRun) {
        console.log('✅ Dry run complete. No changes made.');
        return;
      }

      // Apply each migration
      for (const migration of pending) {
        console.log(`\n⚙️  Applying migration ${migration.version}: ${migration.name}`);
        console.log(`   Description: ${migration.description}`);

        // Record migration attempt in history
        const historyId = db
          .prepare(
            `INSERT INTO migration_history (version, direction, status, backup_path, started_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            migration.version,
            'up',
            'running',
            backupPath || null,
            new Date().toISOString(),
          ).lastInsertRowid;

        try {
          // Run migration in a transaction
          db.transaction(() => {
            migration.up(db);

            // Record migration application
            db.prepare(
              `INSERT INTO migrations (version, name, description, applied_at, backup_path, status)
               VALUES (?, ?, ?, ?, ?, 'applied')
               ON CONFLICT(version) DO UPDATE SET
                 applied_at = excluded.applied_at,
                 backup_path = excluded.backup_path,
                 status = 'applied',
                 rolled_back_at = NULL`,
            ).run(
              migration.version,
              migration.name,
              migration.description,
              new Date().toISOString(),
              backupPath || null,
            );
          })();

          // Update history
          db.prepare(
            `UPDATE migration_history SET status = 'success', completed_at = ? WHERE id = ?`,
          ).run(new Date().toISOString(), historyId);

          console.log(`✅ Migration ${migration.version} applied successfully`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Update history with error
          db.prepare(
            `UPDATE migration_history SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`,
          ).run(errorMessage, new Date().toISOString(), historyId);

          console.error(`❌ Migration ${migration.version} failed: ${errorMessage}`);

          // If we have a backup, offer to restore
          if (backupPath) {
            console.error(`\n⚠️  Migration failed. Backup available at: ${backupPath}`);
            console.error('   You can restore it using: tsx scripts/restore.ts <backup-path>');
          }

          throw error;
        }
      }

      console.log('\n✅ All migrations applied successfully');
    } else {
      // Rollback migrations
      const applied = migrations
        .filter((m) => m.version <= currentVersion)
        .sort((a, b) => b.version - a.version); // Reverse order for rollback

      if (applied.length === 0) {
        console.log('✅ No migrations to rollback');
        return;
      }

      // Determine how many to rollback
      let toRollback: Migration[];
      if (targetVersion !== undefined) {
        // Rollback to specific version
        toRollback = applied.filter((m) => m.version > targetVersion);
        console.log(
          `📋 Rolling back to version ${targetVersion} (${toRollback.length} migration(s))\n`,
        );
      } else {
        // Rollback one migration by default
        toRollback = applied.slice(0, 1);
        console.log('📋 Rolling back most recent migration\n');
      }

      if (toRollback.length === 0) {
        console.log('✅ Already at target version');
        return;
      }

      for (const m of toRollback) {
        console.log(`   ${m.version}. ${m.name}`);
      }
      console.log();

      // Create backup before rollback
      let backupPath: string | undefined;
      if (!skipBackup && !dryRun && existsSync(dbPath)) {
        console.log('💾 Creating database backup before rollback...');
        const backupResult = createBackup(dbPath, {
          maxBackups: 10,
          backupDir: './data/backups',
        });

        if (!backupResult.success) {
          throw new Error(`Backup failed: ${backupResult.error}`);
        }

        backupPath = backupResult.backupPath;
        console.log(`✅ Backup created: ${backupPath}\n`);
      }

      if (dryRun) {
        console.log('✅ Dry run complete. No changes made.');
        return;
      }

      // Rollback each migration
      for (const migration of toRollback) {
        console.log(`\n⚙️  Rolling back migration ${migration.version}: ${migration.name}`);

        // Record rollback attempt in history
        const historyId = db
          .prepare(
            `INSERT INTO migration_history (version, direction, status, backup_path, started_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            migration.version,
            'down',
            'running',
            backupPath || null,
            new Date().toISOString(),
          ).lastInsertRowid;

        try {
          db.transaction(() => {
            migration.down(db);

            // Mark migration as rolled back
            db.prepare(
              `UPDATE migrations SET status = 'rolled_back', rolled_back_at = ? WHERE version = ?`,
            ).run(new Date().toISOString(), migration.version);
          })();

          // Update history
          db.prepare(
            `UPDATE migration_history SET status = 'success', completed_at = ? WHERE id = ?`,
          ).run(new Date().toISOString(), historyId);

          console.log(`✅ Migration ${migration.version} rolled back successfully`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Update history with error
          db.prepare(
            `UPDATE migration_history SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`,
          ).run(errorMessage, new Date().toISOString(), historyId);

          console.error(`❌ Rollback ${migration.version} failed: ${errorMessage}`);
          throw error;
        }
      }

      console.log('\n✅ Rollback completed successfully');
    }

    // Verify database integrity after migration
    console.log('\n🔍 Verifying database integrity after migration...');
    const finalCheck = verifyDatabaseIntegrity(db);
    if (!finalCheck.isValid) {
      console.error('❌ Post-migration integrity check failed:');
      for (const error of finalCheck.errors) {
        console.error(`   - ${error}`);
      }
      throw new Error('Post-migration integrity check failed');
    }
    console.log('✅ Database integrity verified');
  } finally {
    db.close();
  }
}

// Command to show migration status
async function showStatus(): Promise<void> {
  const dbPath = process.env['DATABASE_PATH'] || './data/home-server-monitor.db';

  if (!existsSync(dbPath)) {
    console.log('❌ Database not found. Run migrations first.');
    return;
  }

  const db = new Database(dbPath);

  try {
    // Ensure migrations table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        applied_at TEXT NOT NULL,
        rolled_back_at TEXT,
        backup_path TEXT,
        status TEXT NOT NULL DEFAULT 'applied',
        UNIQUE(version)
      );
    `);

    const currentVersionRow = db
      .prepare("SELECT MAX(version) as version FROM migrations WHERE status = 'applied'")
      .get() as { version: number | null };

    const currentVersion = currentVersionRow?.version || 0;

    console.log('\n📊 Migration Status');
    console.log('═'.repeat(50));
    console.log(`Current Version: ${currentVersion}`);
    console.log(`Total Migrations Available: ${migrations.length}`);
    console.log(`Pending Migrations: ${Math.max(0, migrations.length - currentVersion)}\n`);

    // Show applied migrations
    const applied = db
      .prepare("SELECT * FROM migrations WHERE status = 'applied' ORDER BY version ASC")
      .all() as Array<{
      version: number;
      name: string;
      description: string;
      applied_at: string;
    }>;

    if (applied.length > 0) {
      console.log('✅ Applied Migrations:');
      for (const m of applied) {
        console.log(`   ${m.version}. ${m.name} (${new Date(m.applied_at).toLocaleString()})`);
      }
      console.log();
    }

    // Show pending migrations
    const pending = migrations.filter((m) => m.version > currentVersion);
    if (pending.length > 0) {
      console.log('📋 Pending Migrations:');
      for (const m of pending) {
        console.log(`   ${m.version}. ${m.name} - ${m.description}`);
      }
      console.log();
    }

    // Show recent migration history
    const history = db
      .prepare('SELECT * FROM migration_history ORDER BY started_at DESC LIMIT 5')
      .all() as Array<{
      version: number;
      direction: string;
      status: string;
      started_at: string;
      completed_at: string | null;
      error_message: string | null;
    }>;

    if (history.length > 0) {
      console.log('📜 Recent Migration History:');
      for (const h of history) {
        const statusIcon = h.status === 'success' ? '✅' : h.status === 'failed' ? '❌' : '⏳';
        const duration = h.completed_at
          ? `(${((new Date(h.completed_at).getTime() - new Date(h.started_at).getTime()) / 1000).toFixed(2)}s)`
          : '(running)';
        console.log(
          `   ${statusIcon} v${h.version} ${h.direction.toUpperCase()} - ${h.status} ${duration} ${new Date(h.started_at).toLocaleString()}`,
        );
        if (h.error_message) {
          console.log(`      Error: ${h.error_message}`);
        }
      }
      console.log();
    }

    // Show available backups
    const backups = listBackups('./data/backups');
    if (backups.length > 0) {
      console.log('💾 Recent Backups:');
      for (const backup of backups.slice(0, 5)) {
        const sizeMB = (backup.sizeBytes / 1024 / 1024).toFixed(2);
        console.log(`   ${backup.name} (${sizeMB} MB) - ${backup.timestamp.toLocaleString()}`);
      }
    }
  } finally {
    db.close();
  }
}

// Parse command line arguments
const command = process.argv[2];
const arg = process.argv[3];

if (command === 'status') {
  showStatus().catch((error) => {
    console.error('Failed to show status:', error);
    process.exit(1);
  });
} else if (command === 'up' || command === 'down') {
  const targetVersion = arg === 'dry-run' ? undefined : arg ? Number.parseInt(arg, 10) : undefined;
  const dryRun = arg === 'dry-run' || process.argv[4] === 'dry-run';

  migrate({
    direction: command,
    targetVersion: Number.isNaN(targetVersion) ? undefined : targetVersion,
    dryRun,
  }).catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
} else {
  console.log('Usage:');
  console.log('  tsx scripts/migrate.ts up [target-version] [dry-run]  - Apply migrations');
  console.log('  tsx scripts/migrate.ts down [target-version]          - Rollback migrations');
  console.log('  tsx scripts/migrate.ts status                         - Show migration status');
  console.log('\nExamples:');
  console.log('  tsx scripts/migrate.ts up                    - Apply all pending migrations');
  console.log('  tsx scripts/migrate.ts up 3                  - Apply migrations up to version 3');
  console.log(
    '  tsx scripts/migrate.ts up dry-run            - Preview migrations without applying',
  );
  console.log('  tsx scripts/migrate.ts down                  - Rollback one migration');
  console.log('  tsx scripts/migrate.ts down 2                - Rollback to version 2');
  console.log('  tsx scripts/migrate.ts status                - Show current migration status');
  process.exit(1);
}

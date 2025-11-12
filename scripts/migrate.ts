#!/usr/bin/env tsx

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
      // Drop all tables
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
        .all() as { name: string }[];

      for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${table.name}`);
      }
    },
  },
  // Add future migrations here
];

async function migrate(direction: 'up' | 'down' = 'up'): Promise<void> {
  const dbPath = process.env.DATABASE_PATH || './data/home-server-monitor.db';

  // Ensure data directory exists
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(dbPath);

  try {
    // Create migrations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        applied_at TEXT NOT NULL,
        UNIQUE(version)
      );
    `);

    // Get current version
    const currentVersionRow = db
      .prepare('SELECT MAX(version) as version FROM migrations')
      .get() as { version: number | null };

    const currentVersion = currentVersionRow?.version || 0;

    console.log(`Current database version: ${currentVersion}`);
    console.log(`Direction: ${direction}`);

    if (direction === 'up') {
      // Apply pending migrations
      const pending = migrations.filter((m) => m.version > currentVersion);

      if (pending.length === 0) {
        console.log('✓ No pending migrations');
        return;
      }

      console.log(`Found ${pending.length} pending migration(s)`);

      for (const migration of pending) {
        console.log(`\nApplying migration ${migration.version}: ${migration.name}`);
        console.log(`  Description: ${migration.description}`);

        try {
          // Run migration in a transaction
          db.transaction(() => {
            migration.up(db);
            db.prepare('INSERT INTO migrations (version, name, description, applied_at) VALUES (?, ?, ?, ?)').run(
              migration.version,
              migration.name,
              migration.description,
              new Date().toISOString()
            );
          })();

          console.log(`✓ Migration ${migration.version} applied successfully`);
        } catch (error) {
          console.error(`✗ Migration ${migration.version} failed:`, error);
          throw error;
        }
      }

      console.log('\n✓ All migrations applied successfully');
    } else {
      // Rollback migrations
      const applied = migrations.filter((m) => m.version <= currentVersion).reverse();

      if (applied.length === 0) {
        console.log('✓ No migrations to rollback');
        return;
      }

      const toRollback = applied.slice(0, 1); // Rollback one at a time

      for (const migration of toRollback) {
        console.log(`\nRolling back migration ${migration.version}: ${migration.name}`);

        try {
          db.transaction(() => {
            migration.down(db);
            db.prepare('DELETE FROM migrations WHERE version = ?').run(migration.version);
          })();

          console.log(`✓ Migration ${migration.version} rolled back successfully`);
        } catch (error) {
          console.error(`✗ Rollback ${migration.version} failed:`, error);
          throw error;
        }
      }

      console.log('\n✓ Rollback completed successfully');
    }
  } finally {
    db.close();
  }
}

// Parse command line arguments
const direction = (process.argv[2] as 'up' | 'down') || 'up';

if (!['up', 'down'].includes(direction)) {
  console.error('Usage: tsx scripts/migrate.ts [up|down]');
  process.exit(1);
}

migrate(direction).catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});

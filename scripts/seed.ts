#!/usr/bin/env tsx

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

async function seed(): Promise<void> {
  const dbPath = process.env.DATABASE_PATH || './data/home-server-monitor.db';

  if (!existsSync(dbPath)) {
    console.error('Database does not exist. Run migrations first: npm run db:migrate');
    process.exit(1);
  }

  const db = new Database(dbPath);

  try {
    console.log('Seeding database with sample data...');

    // Check if already seeded
    const existingPools = db.prepare('SELECT COUNT(*) as count FROM pools').get() as {
      count: number;
    };

    if (existingPools.count > 0) {
      console.log('Database already contains data. Skipping seed.');
      return;
    }

    // Seed sample data (optional for development)
    db.transaction(() => {
      // Sample pool data
      db.prepare(
        `INSERT INTO pools (id, name, size, used, available, health, status, scan_state, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        1,
        'tank',
        2000000000000,
        1000000000000,
        1000000000000,
        'ONLINE',
        'ONLINE',
        'FINISHED',
        new Date().toISOString()
      );

      console.log('✓ Seeded pools table');

      // Sample dataset data
      db.prepare(
        `INSERT INTO datasets (id, name, pool, used, available, mountpoint, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'tank/media',
        'media',
        'tank',
        500000000000,
        1500000000000,
        '/mnt/tank/media',
        new Date().toISOString()
      );

      console.log('✓ Seeded datasets table');

      // Add more seed data as needed
    })();

    console.log('\n✓ Database seeded successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});

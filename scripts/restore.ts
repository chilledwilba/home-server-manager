#!/usr/bin/env tsx
// biome-ignore lint: CLI script requires console output

import { existsSync } from 'node:fs';
import { listBackups, restoreBackup } from '../src/db/backup.js';

async function restore(): Promise<void> {
  const backupPath = process.argv[2];
  const targetPath = process.env.DATABASE_PATH || './data/home-server-monitor.db';

  console.log('\n🔄 Database Restore Tool');
  console.log('═'.repeat(50));

  if (!backupPath) {
    // List available backups
    console.log('\nAvailable backups:\n');
    const backups = listBackups('./data/backups');

    if (backups.length === 0) {
      console.log('❌ No backups found');
      console.log('\nUsage: tsx scripts/restore.ts <backup-path>');
      process.exit(1);
    }

    for (const backup of backups) {
      const sizeMB = (backup.sizeBytes / 1024 / 1024).toFixed(2);
      console.log(`   ${backup.name}`);
      console.log(`      Size: ${sizeMB} MB`);
      console.log(`      Date: ${backup.timestamp.toLocaleString()}`);
      console.log(`      Path: ${backup.path}\n`);
    }

    console.log('Usage: tsx scripts/restore.ts <backup-path>');
    console.log('Example: tsx scripts/restore.ts ./data/backups/monitor.db.backup-2024-01-01T12-00-00-000Z');
    process.exit(0);
  }

  if (!existsSync(backupPath)) {
    console.error(`\n❌ Backup file not found: ${backupPath}`);
    console.log('\nRun without arguments to see available backups:');
    console.log('  tsx scripts/restore.ts');
    process.exit(1);
  }

  console.log(`Source: ${backupPath}`);
  console.log(`Target: ${targetPath}`);
  console.log('');

  // Warn about overwriting
  if (existsSync(targetPath)) {
    console.log('⚠️  WARNING: This will overwrite the current database!');
    console.log('   Current database will be LOST unless you have another backup.\n');
  }

  console.log('💾 Restoring database from backup...');
  const result = restoreBackup(backupPath, targetPath);

  if (result.success) {
    const sizeMB = ((result.sizeBytes || 0) / 1024 / 1024).toFixed(2);
    console.log(`✅ Database restored successfully (${sizeMB} MB)`);
    console.log(`\nDatabase is now at: ${targetPath}`);
  } else {
    console.error(`❌ Restore failed: ${result.error}`);
    process.exit(1);
  }
}

restore().catch((error) => {
  console.error('\n❌ Restore failed:', error);
  process.exit(1);
});

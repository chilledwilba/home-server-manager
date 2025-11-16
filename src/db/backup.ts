import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { dbLogger as logger } from '../utils/logger.js';

export interface BackupOptions {
  maxBackups?: number;
  backupDir?: string;
  compressionEnabled?: boolean;
}

export interface BackupResult {
  success: boolean;
  backupPath?: string;
  error?: string;
  timestamp: string;
  sizeBytes?: number;
}

/**
 * Create a backup of the database before running migrations
 */
export function createBackup(dbPath: string, options: BackupOptions = {}): BackupResult {
  const { maxBackups = 10, backupDir = './data/backups' } = options;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const result: BackupResult = {
    success: false,
    timestamp,
  };

  try {
    // Ensure backup directory exists
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
      logger.info(`Created backup directory: ${backupDir}`);
    }

    // Generate backup filename
    const dbFileName = dbPath.split('/').pop() || 'monitor.db';
    const backupFileName = `${dbFileName}.backup-${timestamp}`;
    const backupPath = join(backupDir, backupFileName);

    // Check if source database exists
    if (!existsSync(dbPath)) {
      throw new Error(`Source database not found: ${dbPath}`);
    }

    // Get source file size
    const stats = statSync(dbPath);
    const sizeBytes = stats.size;

    logger.info(
      `Creating database backup: ${backupPath} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`,
    );

    // Copy database file
    copyFileSync(dbPath, backupPath);

    // Also backup WAL file if it exists
    const walPath = `${dbPath}-wal`;
    if (existsSync(walPath)) {
      copyFileSync(walPath, `${backupPath}-wal`);
      logger.info('WAL file backed up');
    }

    // Also backup SHM file if it exists
    const shmPath = `${dbPath}-shm`;
    if (existsSync(shmPath)) {
      copyFileSync(shmPath, `${backupPath}-shm`);
      logger.info('SHM file backed up');
    }

    logger.info(`Database backup created successfully: ${backupPath}`);

    // Clean up old backups
    cleanOldBackups(backupDir, maxBackups);

    result.success = true;
    result.backupPath = backupPath;
    result.sizeBytes = sizeBytes;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to create database backup: ${errorMessage}`);
    result.error = errorMessage;
  }

  return result;
}

/**
 * Clean up old backups, keeping only the most recent N backups
 */
function cleanOldBackups(backupDir: string, maxBackups: number): void {
  try {
    const files = readdirSync(backupDir)
      .filter((f) => f.includes('.backup-'))
      .map((f) => ({
        name: f,
        path: join(backupDir, f),
        mtime: statSync(join(backupDir, f)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Keep only the most recent backups
    const toDelete = files.slice(maxBackups);

    for (const file of toDelete) {
      try {
        // Delete main backup file and associated WAL/SHM files
        const fs = require('node:fs');
        fs.unlinkSync(file.path);
        logger.info(`Deleted old backup: ${file.name}`);

        // Also delete WAL and SHM files if they exist
        if (existsSync(`${file.path}-wal`)) {
          fs.unlinkSync(`${file.path}-wal`);
        }
        if (existsSync(`${file.path}-shm`)) {
          fs.unlinkSync(`${file.path}-shm`);
        }
      } catch (error) {
        logger.warn(`Failed to delete old backup ${file.name}: ${error}`);
      }
    }

    if (toDelete.length > 0) {
      logger.info(`Cleaned up ${toDelete.length} old backup(s)`);
    }
  } catch (error) {
    logger.warn(`Failed to clean old backups: ${error}`);
  }
}

/**
 * Restore database from a backup
 */
export function restoreBackup(backupPath: string, targetPath: string): BackupResult {
  const result: BackupResult = {
    success: false,
    timestamp: new Date().toISOString(),
  };

  try {
    if (!existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    logger.info(`Restoring database from backup: ${backupPath}`);

    // Copy backup to target location
    copyFileSync(backupPath, targetPath);

    // Restore WAL file if it exists
    const walBackupPath = `${backupPath}-wal`;
    if (existsSync(walBackupPath)) {
      copyFileSync(walBackupPath, `${targetPath}-wal`);
      logger.info('WAL file restored');
    }

    // Restore SHM file if it exists
    const shmBackupPath = `${backupPath}-shm`;
    if (existsSync(shmBackupPath)) {
      copyFileSync(shmBackupPath, `${targetPath}-shm`);
      logger.info('SHM file restored');
    }

    const stats = statSync(targetPath);
    result.success = true;
    result.backupPath = backupPath;
    result.sizeBytes = stats.size;

    logger.info('Database restored successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to restore database: ${errorMessage}`);
    result.error = errorMessage;
  }

  return result;
}

/**
 * List available backups
 */
export function listBackups(backupDir: string = './data/backups'): Array<{
  name: string;
  path: string;
  timestamp: Date;
  sizeBytes: number;
}> {
  try {
    if (!existsSync(backupDir)) {
      return [];
    }

    return readdirSync(backupDir)
      .filter((f) => f.includes('.backup-') && !f.endsWith('-wal') && !f.endsWith('-shm'))
      .map((f) => {
        const path = join(backupDir, f);
        const stats = statSync(path);
        return {
          name: f,
          path,
          timestamp: stats.mtime,
          sizeBytes: stats.size,
        };
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  } catch (error) {
    logger.error(`Failed to list backups: ${error}`);
    return [];
  }
}

/**
 * Verify database integrity
 */
export function verifyDatabaseIntegrity(db: Database.Database): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  try {
    // Run integrity check
    const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;

    if (result.length === 0 || result[0]?.integrity_check !== 'ok') {
      errors.push(`Integrity check failed: ${JSON.stringify(result)}`);
    }

    // Check foreign keys
    const fkResult = db.pragma('foreign_key_check') as unknown[];
    if (fkResult.length > 0) {
      errors.push(`Foreign key violations found: ${JSON.stringify(fkResult)}`);
    }

    // Verify migrations table exists
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'`)
      .all() as { name: string }[];

    if (tables.length === 0) {
      errors.push('Migrations table not found');
    }
  } catch (error) {
    errors.push(`Verification error: ${error}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

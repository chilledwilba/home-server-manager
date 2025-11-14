import type Database from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('zfs-persistence');

/**
 * ZFS Persistence Layer
 * Handles all database operations for ZFS snapshots, scrubs, and backups
 */
export class ZFSPersistence {
  constructor(private db: Database.Database) {}

  /**
   * Store snapshot in database
   */
  storeSnapshot(poolName: string, snapshotName: string, type: string, reason?: string): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO snapshots (
          pool_name, snapshot_name, type, reason, size, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(poolName, snapshotName, type, reason || null, 0, new Date().toISOString());
    } catch (error) {
      logger.error({ err: error, poolName, snapshotName }, 'Failed to store snapshot');
      throw error;
    }
  }

  /**
   * Mark snapshot as deleted
   */
  markSnapshotDeleted(poolName: string, snapshotName: string): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE snapshots
        SET deleted_at = ?
        WHERE pool_name = ? AND snapshot_name = ?
      `);

      stmt.run(new Date().toISOString(), poolName, snapshotName);
    } catch (error) {
      logger.error({ err: error, poolName, snapshotName }, 'Failed to mark snapshot deleted');
      throw error;
    }
  }

  /**
   * Get all active snapshots for a pool
   */
  getSnapshots(poolName: string): Array<{
    id: number;
    snapshot_name: string;
    type: string;
    created_at: string;
  }> {
    try {
      const snapshots = this.db
        .prepare(
          `SELECT * FROM snapshots
          WHERE pool_name = ? AND deleted_at IS NULL
          ORDER BY created_at DESC`,
        )
        .all(poolName) as Array<{
        id: number;
        snapshot_name: string;
        type: string;
        created_at: string;
      }>;

      return snapshots;
    } catch (error) {
      logger.error({ err: error, poolName }, 'Failed to get snapshots');
      return [];
    }
  }

  /**
   * Get snapshot statistics
   */
  getSnapshotStats(): Array<{
    pool_name: string;
    total_snapshots: number;
    total_size: number;
    oldest: string;
    newest: string;
  }> {
    const stats = this.db
      .prepare(
        `SELECT
          pool_name,
          COUNT(*) as total_snapshots,
          SUM(size) as total_size,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM snapshots
        WHERE deleted_at IS NULL
        GROUP BY pool_name`,
      )
      .all() as Array<{
      pool_name: string;
      total_snapshots: number;
      total_size: number;
      oldest: string;
      newest: string;
    }>;

    return stats;
  }

  /**
   * Store scrub start event
   */
  storeScrubStart(poolName: string): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO scrub_history (
          pool_name, started_at, status
        ) VALUES (?, ?, 'running')
      `);

      stmt.run(poolName, new Date().toISOString());
    } catch (error) {
      logger.error({ err: error, poolName }, 'Failed to store scrub start');
      throw error;
    }
  }

  /**
   * Store TRIM start event
   */
  storeTrimStart(poolName: string): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO maintenance_history (
          pool_name, type, started_at
        ) VALUES (?, 'trim', ?)
      `);

      stmt.run(poolName, new Date().toISOString());
    } catch (error) {
      logger.error({ err: error, poolName }, 'Failed to store TRIM start');
      throw error;
    }
  }

  /**
   * Get scrub history
   */
  getScrubHistory(poolName?: string): Array<{
    id: number;
    pool_name: string;
    started_at: string;
    completed_at?: string;
    status: string;
    errors_found: number;
  }> {
    const query = poolName
      ? 'SELECT * FROM scrub_history WHERE pool_name = ? ORDER BY started_at DESC LIMIT 10'
      : 'SELECT * FROM scrub_history ORDER BY started_at DESC LIMIT 20';

    return poolName
      ? (this.db.prepare(query).all(poolName) as Array<{
          id: number;
          pool_name: string;
          started_at: string;
          completed_at?: string;
          status: string;
          errors_found: number;
        }>)
      : (this.db.prepare(query).all() as Array<{
          id: number;
          pool_name: string;
          started_at: string;
          completed_at?: string;
          status: string;
          errors_found: number;
        }>);
  }

  /**
   * Get backup history
   */
  getBackupHistory(limit: number = 20): Array<{
    id: number;
    job_id: string;
    source: string;
    target: string;
    status: string;
    started_at: string;
  }> {
    return this.db
      .prepare(
        `SELECT * FROM backup_history
        ORDER BY started_at DESC
        LIMIT ?`,
      )
      .all(limit) as Array<{
      id: number;
      job_id: string;
      source: string;
      target: string;
      status: string;
      started_at: string;
    }>;
  }

  /**
   * Create alert
   */
  createAlert(type: string, severity: string, pool: string, error: unknown): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO alerts (type, severity, message, details, triggered_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      stmt.run(
        type,
        severity,
        `ZFS ${type} for pool ${pool}`,
        JSON.stringify({ pool, error: errorMsg }),
        new Date().toISOString(),
      );
    } catch (err) {
      logger.error({ err }, 'Failed to create alert');
    }
  }
}

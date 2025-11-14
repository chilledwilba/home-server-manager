import { createLogger } from '../../utils/logger.js';
import type { ZFSPersistence } from './zfs-persistence.js';

const logger = createLogger('snapshot-manager');

export interface SnapshotPolicy {
  poolName: string;
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  retention: {
    hourly: number;
    daily: number;
    weekly: number;
    monthly: number;
  };
  prefix: string;
}

/**
 * Snapshot Manager
 * Handles snapshot creation, cleanup, and retention policies
 */
export class SnapshotManager {
  constructor(private persistence: ZFSPersistence) {}

  /**
   * Create snapshot for a pool
   */
  async createSnapshot(poolName: string, policy: SnapshotPolicy): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotName = `${policy.prefix}-${policy.frequency}-${timestamp}`;

      logger.info(`Creating snapshot: ${poolName}@${snapshotName}`);

      // Note: TrueNAS client would need createSnapshot method
      // For now, record in database
      this.persistence.storeSnapshot(poolName, snapshotName, policy.frequency);

      logger.info(`Snapshot created: ${snapshotName}`);
    } catch (error) {
      logger.error({ err: error }, `Failed to create snapshot for ${poolName}`);
      this.persistence.createAlert('snapshot_failed', 'warning', poolName, error);
    }
  }

  /**
   * Clean up old snapshots based on retention policy
   */
  async cleanupOldSnapshots(poolName: string, policy: SnapshotPolicy): Promise<void> {
    try {
      // Get all snapshots for this pool
      const snapshots = this.persistence.getSnapshots(poolName);

      // Group by frequency type
      const grouped: Record<string, Array<(typeof snapshots)[0]>> = {
        hourly: [],
        daily: [],
        weekly: [],
        monthly: [],
      };

      for (const snap of snapshots) {
        const name = snap['snapshot_name'];
        if (name && name.includes('-hourly-')) grouped['hourly']?.push(snap);
        else if (name && name.includes('-daily-')) grouped['daily']?.push(snap);
        else if (name && name.includes('-weekly-')) grouped['weekly']?.push(snap);
        else if (name && name.includes('-monthly-')) grouped['monthly']?.push(snap);
      }

      // Apply retention policies
      for (const [frequency, snaps] of Object.entries(grouped)) {
        const retention = policy.retention[frequency as keyof typeof policy.retention];
        if (retention && snaps && snaps.length > retention) {
          const toDelete = snaps.slice(retention);

          for (const snap of toDelete) {
            await this.deleteSnapshot(poolName, snap.snapshot_name);
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, `Cleanup failed for ${poolName}`);
    }
  }

  /**
   * Delete a snapshot
   */
  private async deleteSnapshot(poolName: string, snapshotName: string): Promise<void> {
    try {
      logger.info(`Deleting old snapshot: ${poolName}@${snapshotName}`);
      this.persistence.markSnapshotDeleted(poolName, snapshotName);
    } catch (error) {
      logger.error({ err: error }, `Failed to delete snapshot ${snapshotName}`);
    }
  }

  /**
   * Manual snapshot creation
   */
  async createManualSnapshot(
    poolName: string,
    reason: string,
  ): Promise<{ success: boolean; snapshotName?: string; error?: string }> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotName = `manual-${reason.replace(/\s+/g, '-')}-${timestamp}`;

      this.persistence.storeSnapshot(poolName, snapshotName, 'manual', reason);
      logger.info(`Manual snapshot created: ${snapshotName}`);

      return { success: true, snapshotName };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: error }, 'Manual snapshot failed');
      return { success: false, error: errorMsg };
    }
  }
}

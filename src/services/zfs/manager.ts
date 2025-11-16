import type Database from 'better-sqlite3';
import type { TrueNASClient } from '../../integrations/truenas/client.js';
import { createLogger } from '../../utils/logger.js';
import { type ScrubSchedule, ScrubScheduler } from './scrub-scheduler.js';
import { SnapshotManager, type SnapshotPolicy } from './snapshot-manager.js';
import { ZFSPersistence } from './zfs-persistence.js';

const logger = createLogger('zfs-manager');

/**
 * Unified ZFS Manager
 * Handles snapshots, scrubs, and backup coordination
 */
export class ZFSManager {
  private policies: Map<string, SnapshotPolicy> = new Map();
  private scrubSchedules: Map<string, ScrubSchedule> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private persistence: ZFSPersistence;
  private snapshotManager: SnapshotManager;
  private scrubScheduler: ScrubScheduler;

  constructor(
    // TrueNAS client for future snapshot/scrub API calls
    _truenas: TrueNASClient,
    db: Database.Database,
  ) {
    this.persistence = new ZFSPersistence(db);
    this.snapshotManager = new SnapshotManager(this.persistence);
    this.scrubScheduler = new ScrubScheduler(this.persistence);
    this.initializePolicies();
    this.initializeScrubSchedules();
  }

  /**
   * Initialize snapshot policies for all pools
   */
  private initializePolicies(): void {
    // Personal pool - Critical data, frequent snapshots
    this.policies.set('personal', {
      poolName: 'personal',
      enabled: true,
      frequency: 'hourly',
      retention: {
        hourly: 48, // Keep 2 days of hourly
        daily: 14, // Keep 2 weeks of daily
        weekly: 8, // Keep 2 months of weekly
        monthly: 12, // Keep 1 year of monthly
      },
      prefix: 'auto',
    });

    // Media pool - Less critical, less frequent
    this.policies.set('media', {
      poolName: 'media',
      enabled: true,
      frequency: 'daily',
      retention: {
        hourly: 0,
        daily: 7,
        weekly: 4,
        monthly: 6,
      },
      prefix: 'auto',
    });

    // Apps pool - Docker data, daily snapshots
    this.policies.set('apps', {
      poolName: 'apps',
      enabled: true,
      frequency: 'daily',
      retention: {
        hourly: 0,
        daily: 7,
        weekly: 4,
        monthly: 3,
      },
      prefix: 'auto',
    });
  }

  /**
   * Initialize scrub schedules
   */
  private initializeScrubSchedules(): void {
    // Personal pool - Weekly scrub (Sunday 2 AM)
    this.scrubSchedules.set('personal', {
      poolName: 'personal',
      frequency: 'weekly',
      dayOfWeek: 0, // Sunday
      hour: 2,
      type: 'scrub',
    });

    // Media pool - Monthly scrub (1st Sunday 3 AM)
    this.scrubSchedules.set('media', {
      poolName: 'media',
      frequency: 'monthly',
      dayOfWeek: 0,
      hour: 3,
      type: 'scrub',
    });

    // Apps pool (SSD) - Monthly TRIM
    this.scrubSchedules.set('apps', {
      poolName: 'apps',
      frequency: 'monthly',
      dayOfWeek: 0,
      hour: 4,
      type: 'trim',
    });
  }

  /**
   * Start all automation (snapshots and scrubs)
   */
  public start(): void {
    logger.info('Starting ZFS automation');

    // Start snapshot automation
    for (const [poolName, policy] of this.policies) {
      if (!policy.enabled) continue;

      const interval = this.getIntervalMs(policy.frequency);
      const timer = setInterval(async () => {
        await this.snapshotManager.createSnapshot(poolName, policy);
        await this.snapshotManager.cleanupOldSnapshots(poolName, policy);
      }, interval);

      this.intervals.set(`snapshot-${poolName}`, timer);
      logger.info(`Snapshot automation started for ${poolName} (${policy.frequency})`);

      // Create initial snapshot
      void this.snapshotManager.createSnapshot(poolName, policy);
    }

    // Start scrub scheduler (check every hour)
    const scrubTimer = setInterval(
      async () => {
        await this.scrubScheduler.checkAndRunScrubs(this.scrubSchedules);
      },
      60 * 60 * 1000,
    ); // Check hourly

    this.intervals.set('scrub-check', scrubTimer);
  }

  /**
   * Manual snapshot creation
   */
  public async createManualSnapshot(
    poolName: string,
    reason: string,
  ): Promise<{ success: boolean; snapshotName?: string; error?: string }> {
    return this.snapshotManager.createManualSnapshot(poolName, reason);
  }

  /**
   * Get snapshot statistics
   */
  public getSnapshotStats(): Array<{
    pool_name: string;
    total_snapshots: number;
    total_size: number;
    oldest: string;
    newest: string;
  }> {
    return this.persistence.getSnapshotStats();
  }

  /**
   * Get scrub history
   */
  public getScrubHistory(poolName?: string): Array<{
    id: number;
    pool_name: string;
    started_at: string;
    completed_at?: string;
    status: string;
    errors_found: number;
  }> {
    return this.persistence.getScrubHistory(poolName);
  }

  /**
   * Get backup history
   */
  public getBackupHistory(limit: number = 20): Array<{
    id: number;
    job_id: string;
    source: string;
    target: string;
    status: string;
    started_at: string;
  }> {
    return this.persistence.getBackupHistory(limit);
  }

  /**
   * Get ZFS recommendations
   */
  public getRecommendations(): Array<{
    pool: string;
    type: string;
    recommendation: string;
    action: string;
    impact?: string;
  }> {
    return [
      {
        pool: 'personal',
        type: 'snapshot',
        recommendation: 'Critical data pool has good snapshot coverage',
        action: 'Continue hourly snapshots for maximum protection',
      },
      {
        pool: 'media',
        type: 'compression',
        recommendation: 'Enable lz4 compression for media files',
        action: 'zfs set compression=lz4 media',
        impact: 'Can save 5-10% space with minimal CPU impact',
      },
      {
        pool: 'apps',
        type: 'trim',
        recommendation: 'Enable auto-trim for NVMe SSD',
        action: 'zfs set autotrim=on apps',
        impact: 'Maintains SSD performance over time',
      },
      {
        pool: 'all',
        type: 'scrub',
        recommendation: 'Regular scrubs are scheduled',
        action: 'No action needed - scrubs running as configured',
      },
    ];
  }

  /**
   * Get interval in milliseconds for frequency
   */
  private getIntervalMs(frequency: string): number {
    switch (frequency) {
      case 'hourly':
        return 60 * 60 * 1000;
      case 'daily':
        return 24 * 60 * 60 * 1000;
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000;
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Stop all automation
   */
  public stop(): void {
    for (const timer of this.intervals.values()) {
      clearInterval(timer);
    }
    this.intervals.clear();
    logger.info('ZFS automation stopped');
  }
}

# TODO-06: ZFS Assistant - Automated Snapshots & Management

## Goal
Implement comprehensive ZFS management with automated snapshots, backup verification, and intelligent maintenance for your pool configuration.

## Your Pool Configuration
- **Personal Pool**: 2x 4TB IronWolf (mirror) - Critical data, needs frequent snapshots
- **Media Pool**: 1x 8TB IronWolf Pro - Less critical, weekly snapshots
- **Apps Pool**: 1TB NVMe SSD - Docker data, daily snapshots
- **Boot Pool**: 240GB SSD - System, handled by TrueNAS

## Success Criteria
- [ ] Automated snapshot scheduling implemented
- [ ] Snapshot retention policies configured
- [ ] Backup verification working
- [ ] Replication setup (optional)
- [ ] Scrub automation configured
- [ ] AI can explain ZFS concepts
- [ ] Update index.md progress tracker

## Phase 1: ZFS Management Service

### 1.1 Create `src/services/zfs/snapshot-manager.ts`
```typescript
import { z } from 'zod';
import { TrueNASClient } from '@integrations/truenas/client';
import { createLogger } from '@utils/logger';
import Database from 'better-sqlite3';
import type { PoolInfo } from '@types';

const logger = createLogger('zfs-snapshot');

/**
 * Snapshot policy configuration
 */
const SnapshotPolicySchema = z.object({
  poolName: z.string(),
  enabled: z.boolean().default(true),
  frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly']),
  retention: z.object({
    hourly: z.number().default(24),    // Keep 24 hourly snapshots
    daily: z.number().default(7),      // Keep 7 daily snapshots
    weekly: z.number().default(4),     // Keep 4 weekly snapshots
    monthly: z.number().default(12),   // Keep 12 monthly snapshots
  }),
  prefix: z.string().default('auto'),
});

type SnapshotPolicy = z.infer<typeof SnapshotPolicySchema>;

export class SnapshotManager {
  private policies: Map<string, SnapshotPolicy> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private truenas: TrueNASClient,
    private db: Database.Database,
  ) {
    this.initializePolicies();
  }

  /**
   * Initialize snapshot policies based on your pools
   */
  private initializePolicies(): void {
    // Personal pool - Critical data, frequent snapshots
    this.policies.set('personal', {
      poolName: 'personal',
      enabled: true,
      frequency: 'hourly',
      retention: {
        hourly: 48,    // Keep 2 days of hourly
        daily: 14,     // Keep 2 weeks of daily
        weekly: 8,     // Keep 2 months of weekly
        monthly: 12,   // Keep 1 year of monthly
      },
      prefix: 'auto',
    });

    // Media pool - Less critical, less frequent
    this.policies.set('media', {
      poolName: 'media',
      enabled: true,
      frequency: 'daily',
      retention: {
        hourly: 0,     // No hourly for media
        daily: 7,      // Keep 1 week of daily
        weekly: 4,     // Keep 1 month of weekly
        monthly: 6,    // Keep 6 months
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
        daily: 7,      // Keep 1 week
        weekly: 4,     // Keep 1 month
        monthly: 3,    // Keep 3 months
      },
      prefix: 'auto',
    });
  }

  /**
   * Start automated snapshot scheduling
   */
  public start(): void {
    logger.info('Starting ZFS snapshot automation');

    for (const [poolName, policy] of this.policies) {
      if (!policy.enabled) continue;

      const interval = this.getIntervalMs(policy.frequency);
      const timer = setInterval(async () => {
        await this.createSnapshot(poolName, policy);
        await this.cleanupOldSnapshots(poolName, policy);
      }, interval);

      this.intervals.set(poolName, timer);

      // Create initial snapshot
      void this.createSnapshot(poolName, policy);
    }
  }

  /**
   * Create a snapshot for a pool
   */
  private async createSnapshot(
    poolName: string,
    policy: SnapshotPolicy,
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotName = `${policy.prefix}-${policy.frequency}-${timestamp}`;

      logger.info(`Creating snapshot: ${poolName}@${snapshotName}`);

      // Call TrueNAS API to create snapshot
      const result = await this.truenas.createSnapshot({
        dataset: poolName,
        name: snapshotName,
        recursive: true, // Include all child datasets
      });

      // Record in database
      const stmt = this.db.prepare(`
        INSERT INTO snapshots (
          pool_name, snapshot_name, type, size, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        poolName,
        snapshotName,
        policy.frequency,
        0, // Size will be updated later
        new Date().toISOString(),
      );

      logger.info(`Snapshot created successfully: ${snapshotName}`);

      // Verify snapshot
      await this.verifySnapshot(poolName, snapshotName);

    } catch (error) {
      logger.error(`Failed to create snapshot for ${poolName}:`, error);

      // Create alert
      this.createAlert({
        type: 'snapshot_failed',
        severity: 'warning',
        pool: poolName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Verify a snapshot was created successfully
   */
  private async verifySnapshot(
    poolName: string,
    snapshotName: string,
  ): Promise<boolean> {
    try {
      const snapshots = await this.truenas.getSnapshots();
      const snapshot = snapshots.find(
        s => s.dataset === poolName && s.name.includes(snapshotName)
      );

      if (!snapshot) {
        logger.error(`Snapshot verification failed: ${snapshotName} not found`);
        return false;
      }

      // Update size in database
      const stmt = this.db.prepare(`
        UPDATE snapshots
        SET size = ?, verified = 1
        WHERE pool_name = ? AND snapshot_name = ?
      `);

      stmt.run(snapshot.referenced, poolName, snapshotName);

      logger.info(`Snapshot verified: ${snapshotName} (${snapshot.referenced} bytes)`);
      return true;

    } catch (error) {
      logger.error('Snapshot verification error:', error);
      return false;
    }
  }

  /**
   * Clean up old snapshots based on retention policy
   */
  private async cleanupOldSnapshots(
    poolName: string,
    policy: SnapshotPolicy,
  ): Promise<void> {
    try {
      const snapshots = await this.truenas.getSnapshots();
      const poolSnapshots = snapshots
        .filter(s => s.dataset === poolName && s.name.startsWith(policy.prefix))
        .sort((a, b) => b.created.getTime() - a.created.getTime());

      // Group by frequency type
      const grouped = this.groupSnapshotsByFrequency(poolSnapshots);

      // Apply retention policies
      for (const [frequency, snaps] of Object.entries(grouped)) {
        const retention = policy.retention[frequency as keyof typeof policy.retention];
        if (retention && snaps.length > retention) {
          const toDelete = snaps.slice(retention);

          for (const snap of toDelete) {
            await this.deleteSnapshot(poolName, snap.name);
          }
        }
      }

    } catch (error) {
      logger.error(`Cleanup failed for ${poolName}:`, error);
    }
  }

  /**
   * Delete a snapshot
   */
  private async deleteSnapshot(
    poolName: string,
    snapshotName: string,
  ): Promise<void> {
    try {
      logger.info(`Deleting old snapshot: ${poolName}@${snapshotName}`);

      await this.truenas.deleteSnapshot({
        dataset: poolName,
        name: snapshotName,
      });

      // Update database
      const stmt = this.db.prepare(`
        UPDATE snapshots
        SET deleted_at = ?
        WHERE pool_name = ? AND snapshot_name = ?
      `);

      stmt.run(new Date().toISOString(), poolName, snapshotName);

    } catch (error) {
      logger.error(`Failed to delete snapshot ${snapshotName}:`, error);
    }
  }

  /**
   * Group snapshots by frequency type
   */
  private groupSnapshotsByFrequency(snapshots: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {
      hourly: [],
      daily: [],
      weekly: [],
      monthly: [],
    };

    for (const snap of snapshots) {
      if (snap.name.includes('-hourly-')) grouped.hourly.push(snap);
      else if (snap.name.includes('-daily-')) grouped.daily.push(snap);
      else if (snap.name.includes('-weekly-')) grouped.weekly.push(snap);
      else if (snap.name.includes('-monthly-')) grouped.monthly.push(snap);
    }

    return grouped;
  }

  /**
   * Get interval in milliseconds for frequency
   */
  private getIntervalMs(frequency: string): number {
    switch (frequency) {
      case 'hourly':
        return 60 * 60 * 1000;        // 1 hour
      case 'daily':
        return 24 * 60 * 60 * 1000;   // 24 hours
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000; // 7 days
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000; // 30 days
      default:
        return 24 * 60 * 60 * 1000;   // Default to daily
    }
  }

  /**
   * Manual snapshot creation
   */
  public async createManualSnapshot(
    poolName: string,
    reason: string,
  ): Promise<{ success: boolean; snapshotName?: string; error?: string }> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotName = `manual-${reason.replace(/\s+/g, '-')}-${timestamp}`;

      await this.truenas.createSnapshot({
        dataset: poolName,
        name: snapshotName,
        recursive: true,
      });

      // Record in database with reason
      const stmt = this.db.prepare(`
        INSERT INTO snapshots (
          pool_name, snapshot_name, type, reason, created_at
        ) VALUES (?, ?, 'manual', ?, ?)
      `);

      stmt.run(poolName, snapshotName, reason, new Date().toISOString());

      logger.info(`Manual snapshot created: ${snapshotName} for ${reason}`);

      return { success: true, snapshotName };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Manual snapshot failed:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Restore from snapshot
   */
  public async restoreSnapshot(
    poolName: string,
    snapshotName: string,
    targetDataset?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.warn(`Restoring snapshot: ${poolName}@${snapshotName}`);

      // Create a backup snapshot before restore
      await this.createManualSnapshot(poolName, 'pre-restore-backup');

      // Perform restore
      await this.truenas.restoreSnapshot({
        snapshot: `${poolName}@${snapshotName}`,
        target: targetDataset || poolName,
      });

      logger.info('Snapshot restored successfully');
      return { success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Snapshot restore failed:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get snapshot statistics
   */
  public getSnapshotStats(): any {
    const stats = this.db.prepare(`
      SELECT
        pool_name,
        COUNT(*) as total_snapshots,
        SUM(size) as total_size,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM snapshots
      WHERE deleted_at IS NULL
      GROUP BY pool_name
    `).all();

    return stats;
  }

  /**
   * Create alert
   */
  private createAlert(alert: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (type, severity, message, details)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      alert.type,
      alert.severity,
      `ZFS Snapshot: ${alert.type} for pool ${alert.pool}`,
      JSON.stringify(alert),
    );
  }

  /**
   * Stop snapshot automation
   */
  public stop(): void {
    for (const timer of this.intervals.values()) {
      clearInterval(timer);
    }
    this.intervals.clear();
    logger.info('ZFS snapshot automation stopped');
  }
}
```

### 1.2 Create `src/services/zfs/scrub-manager.ts`
```typescript
import { TrueNASClient } from '@integrations/truenas/client';
import { createLogger } from '@utils/logger';
import Database from 'better-sqlite3';

const logger = createLogger('zfs-scrub');

export class ScrubManager {
  private scrubSchedule: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private truenas: TrueNASClient,
    private db: Database.Database,
  ) {}

  /**
   * Initialize scrub scheduling
   * Recommended: Weekly for personal data, monthly for media
   */
  public start(): void {
    logger.info('Starting ZFS scrub scheduler');

    // Personal pool - Weekly scrub (Sunday 2 AM)
    this.schedulePoolScrub('personal', 'weekly', 0, 2);

    // Media pool - Monthly scrub (1st Sunday 3 AM)
    this.schedulePoolScrub('media', 'monthly', 1, 3);

    // Apps pool (SSD) - Monthly TRIM instead of scrub
    this.schedulePoolTrim('apps', 'monthly', 1, 4);
  }

  /**
   * Schedule scrub for a pool
   */
  private schedulePoolScrub(
    poolName: string,
    frequency: 'weekly' | 'monthly',
    dayOfMonth: number,
    hour: number,
  ): void {
    const checkInterval = setInterval(async () => {
      const now = new Date();
      const shouldRun = this.shouldRunScrub(frequency, dayOfMonth, hour, now);

      if (shouldRun) {
        await this.startScrub(poolName);
      }
    }, 60 * 60 * 1000); // Check every hour

    this.scrubSchedule.set(poolName, checkInterval);
  }

  /**
   * Schedule TRIM for SSD pools
   */
  private schedulePoolTrim(
    poolName: string,
    frequency: 'weekly' | 'monthly',
    dayOfMonth: number,
    hour: number,
  ): void {
    const checkInterval = setInterval(async () => {
      const now = new Date();
      const shouldRun = this.shouldRunScrub(frequency, dayOfMonth, hour, now);

      if (shouldRun) {
        await this.startTrim(poolName);
      }
    }, 60 * 60 * 1000); // Check every hour

    this.scrubSchedule.set(`${poolName}-trim`, checkInterval);
  }

  /**
   * Check if scrub should run
   */
  private shouldRunScrub(
    frequency: 'weekly' | 'monthly',
    dayOfMonth: number,
    hour: number,
    now: Date,
  ): boolean {
    if (now.getHours() !== hour) return false;

    if (frequency === 'weekly') {
      return now.getDay() === dayOfMonth; // 0 = Sunday
    } else {
      return now.getDate() === dayOfMonth;
    }
  }

  /**
   * Start a scrub operation
   */
  private async startScrub(poolName: string): Promise<void> {
    try {
      logger.info(`Starting scrub for pool: ${poolName}`);

      // Check if scrub is already running
      const poolStatus = await this.truenas.getPoolStatus(poolName);
      if (poolStatus.scan?.state === 'scanning') {
        logger.info(`Scrub already in progress for ${poolName}`);
        return;
      }

      // Start scrub
      await this.truenas.startScrub(poolName);

      // Record in database
      const stmt = this.db.prepare(`
        INSERT INTO scrub_history (
          pool_name, started_at, status
        ) VALUES (?, ?, 'running')
      `);

      const result = stmt.run(poolName, new Date().toISOString());

      // Monitor scrub progress
      void this.monitorScrub(poolName, result.lastInsertRowid as number);

    } catch (error) {
      logger.error(`Failed to start scrub for ${poolName}:`, error);
    }
  }

  /**
   * Start TRIM operation for SSDs
   */
  private async startTrim(poolName: string): Promise<void> {
    try {
      logger.info(`Starting TRIM for SSD pool: ${poolName}`);

      await this.truenas.startTrim(poolName);

      // Record in database
      const stmt = this.db.prepare(`
        INSERT INTO maintenance_history (
          pool_name, type, started_at
        ) VALUES (?, 'trim', ?)
      `);

      stmt.run(poolName, new Date().toISOString());

    } catch (error) {
      logger.error(`Failed to start TRIM for ${poolName}:`, error);
    }
  }

  /**
   * Monitor ongoing scrub
   */
  private async monitorScrub(poolName: string, scrubId: number): Promise<void> {
    const checkProgress = setInterval(async () => {
      try {
        const poolStatus = await this.truenas.getPoolStatus(poolName);
        const scan = poolStatus.scan;

        if (!scan || scan.state !== 'scanning') {
          // Scrub completed
          clearInterval(checkProgress);

          const stmt = this.db.prepare(`
            UPDATE scrub_history
            SET
              completed_at = ?,
              status = ?,
              errors_found = ?,
              bytes_processed = ?
            WHERE id = ?
          `);

          stmt.run(
            new Date().toISOString(),
            scan?.errors ? 'completed_with_errors' : 'completed',
            scan?.errors || 0,
            scan?.bytes_processed || 0,
            scrubId,
          );

          logger.info(`Scrub completed for ${poolName}: ${scan?.errors || 0} errors found`);

          // Alert if errors found
          if (scan?.errors) {
            this.createAlert({
              type: 'scrub_errors',
              severity: 'critical',
              pool: poolName,
              errors: scan.errors,
            });
          }
        } else {
          // Update progress
          logger.debug(
            `Scrub progress for ${poolName}: ${scan.percentage}% complete`
          );
        }
      } catch (error) {
        logger.error('Error monitoring scrub:', error);
        clearInterval(checkProgress);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  /**
   * Get scrub history
   */
  public getScrubHistory(poolName?: string): any[] {
    const query = poolName
      ? 'SELECT * FROM scrub_history WHERE pool_name = ? ORDER BY started_at DESC LIMIT 10'
      : 'SELECT * FROM scrub_history ORDER BY started_at DESC LIMIT 20';

    return poolName
      ? this.db.prepare(query).all(poolName)
      : this.db.prepare(query).all();
  }

  /**
   * Manually trigger scrub
   */
  public async triggerScrub(poolName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.startScrub(poolName);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create alert
   */
  private createAlert(alert: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (type, severity, message, details)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      alert.type,
      alert.severity,
      `ZFS Scrub: ${alert.errors} errors found on pool ${alert.pool}`,
      JSON.stringify(alert),
    );
  }

  /**
   * Stop scrub scheduler
   */
  public stop(): void {
    for (const timer of this.scrubSchedule.values()) {
      clearInterval(timer);
    }
    this.scrubSchedule.clear();
    logger.info('ZFS scrub scheduler stopped');
  }
}
```

### 1.3 Create `src/services/zfs/backup-manager.ts`
```typescript
import { createLogger } from '@utils/logger';
import Database from 'better-sqlite3';
import { TrueNASClient } from '@integrations/truenas/client';

const logger = createLogger('zfs-backup');

interface BackupJob {
  id: string;
  sourcePool: string;
  targetPool: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  lastRun?: Date;
  nextRun: Date;
  enabled: boolean;
}

export class BackupManager {
  private backupJobs: Map<string, BackupJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private truenas: TrueNASClient,
    private db: Database.Database,
  ) {
    this.initializeBackupJobs();
  }

  /**
   * Initialize backup jobs for your critical data
   */
  private initializeBackupJobs(): void {
    // Backup personal data to media pool weekly
    this.backupJobs.set('personal-to-media', {
      id: 'personal-to-media',
      sourcePool: 'personal',
      targetPool: 'media/backups/personal',
      frequency: 'weekly',
      nextRun: this.getNextRunTime('weekly'),
      enabled: true,
    });

    // Consider external backup for most critical data
    // This would require external storage configuration
  }

  /**
   * Start backup automation
   */
  public start(): void {
    logger.info('Starting backup automation');

    for (const [jobId, job] of this.backupJobs) {
      if (!job.enabled) continue;

      const timer = setInterval(
        async () => {
          await this.runBackupJob(job);
        },
        this.getIntervalMs(job.frequency),
      );

      this.timers.set(jobId, timer);
    }
  }

  /**
   * Run a backup job
   */
  private async runBackupJob(job: BackupJob): Promise<void> {
    try {
      logger.info(`Running backup job: ${job.id}`);

      // Create snapshot before backup
      const snapshotName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;

      await this.truenas.createSnapshot({
        dataset: job.sourcePool,
        name: snapshotName,
        recursive: true,
      });

      // Perform replication
      await this.truenas.replicateDataset({
        source: `${job.sourcePool}@${snapshotName}`,
        target: job.targetPool,
        recursive: true,
        compression: 'lz4',
      });

      // Record success
      const stmt = this.db.prepare(`
        INSERT INTO backup_history (
          job_id, source, target, status, started_at, completed_at, size_bytes
        ) VALUES (?, ?, ?, 'success', ?, ?, ?)
      `);

      stmt.run(
        job.id,
        job.sourcePool,
        job.targetPool,
        job.lastRun?.toISOString(),
        new Date().toISOString(),
        0, // Size to be calculated
      );

      // Update job
      job.lastRun = new Date();
      job.nextRun = this.getNextRunTime(job.frequency);

      logger.info(`Backup completed: ${job.id}`);

    } catch (error) {
      logger.error(`Backup failed for ${job.id}:`, error);

      // Record failure
      const stmt = this.db.prepare(`
        INSERT INTO backup_history (
          job_id, source, target, status, error, started_at
        ) VALUES (?, ?, ?, 'failed', ?, ?)
      `);

      stmt.run(
        job.id,
        job.sourcePool,
        job.targetPool,
        error instanceof Error ? error.message : 'Unknown error',
        new Date().toISOString(),
      );

      // Create alert
      this.createAlert({
        type: 'backup_failed',
        severity: 'critical',
        job: job.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Verify backup integrity
   */
  public async verifyBackup(
    sourcePool: string,
    targetPool: string,
  ): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      logger.info(`Verifying backup: ${sourcePool} -> ${targetPool}`);

      // Get source and target snapshots
      const sourceSnapshots = await this.truenas.getSnapshots(sourcePool);
      const targetSnapshots = await this.truenas.getSnapshots(targetPool);

      const errors: string[] = [];

      // Check if latest snapshot exists in target
      if (sourceSnapshots.length > 0) {
        const latestSource = sourceSnapshots[0];
        const matchingTarget = targetSnapshots.find(
          t => t.name === latestSource.name
        );

        if (!matchingTarget) {
          errors.push(`Latest snapshot ${latestSource.name} not found in target`);
        }
      }

      // Verify checksums (simplified - real implementation would be more thorough)
      // This would involve comparing dataset properties and checksums

      return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      };

    } catch (error) {
      logger.error('Backup verification failed:', error);
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Verification failed'],
      };
    }
  }

  /**
   * Get backup history
   */
  public getBackupHistory(limit = 20): any[] {
    return this.db
      .prepare(`
        SELECT * FROM backup_history
        ORDER BY started_at DESC
        LIMIT ?
      `)
      .all(limit);
  }

  /**
   * Calculate next run time
   */
  private getNextRunTime(frequency: 'daily' | 'weekly' | 'monthly'): Date {
    const now = new Date();
    switch (frequency) {
      case 'daily':
        now.setDate(now.getDate() + 1);
        now.setHours(2, 0, 0, 0); // 2 AM
        break;
      case 'weekly':
        now.setDate(now.getDate() + (7 - now.getDay())); // Next Sunday
        now.setHours(3, 0, 0, 0); // 3 AM
        break;
      case 'monthly':
        now.setMonth(now.getMonth() + 1);
        now.setDate(1); // First of month
        now.setHours(4, 0, 0, 0); // 4 AM
        break;
    }
    return now;
  }

  /**
   * Get interval in milliseconds
   */
  private getIntervalMs(frequency: 'daily' | 'weekly' | 'monthly'): number {
    switch (frequency) {
      case 'daily':
        return 24 * 60 * 60 * 1000;
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000;
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Create alert
   */
  private createAlert(alert: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (type, severity, message, details)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      alert.type,
      alert.severity,
      `Backup failed: ${alert.job}`,
      JSON.stringify(alert),
    );
  }

  /**
   * Stop backup automation
   */
  public stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    logger.info('Backup automation stopped');
  }
}
```

## Phase 2: ZFS Routes

### 2.1 Create `src/routes/zfs.ts`
```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const CreateSnapshotSchema = z.object({
  poolName: z.string(),
  reason: z.string(),
});

const RestoreSnapshotSchema = z.object({
  poolName: z.string(),
  snapshotName: z.string(),
  targetDataset: z.string().optional(),
});

export async function zfsRoutes(fastify: FastifyInstance): Promise<void> {
  const { snapshotManager, scrubManager, backupManager } = fastify.zfs;

  // Get snapshot statistics
  fastify.get('/api/zfs/snapshots/stats', async () => {
    const stats = snapshotManager.getSnapshotStats();
    return { success: true, data: stats };
  });

  // Create manual snapshot
  fastify.post('/api/zfs/snapshots/create', {
    schema: {
      body: CreateSnapshotSchema,
    },
  }, async (request) => {
    const { poolName, reason } = request.body as z.infer<typeof CreateSnapshotSchema>;

    // Check write permissions
    if (!fastify.config.security.enableWrite) {
      return { success: false, error: 'Write operations disabled' };
    }

    const result = await snapshotManager.createManualSnapshot(poolName, reason);
    return result;
  });

  // Restore snapshot
  fastify.post('/api/zfs/snapshots/restore', {
    schema: {
      body: RestoreSnapshotSchema,
    },
  }, async (request) => {
    const { poolName, snapshotName, targetDataset } =
      request.body as z.infer<typeof RestoreSnapshotSchema>;

    // This is a dangerous operation - require confirmation
    if (!fastify.config.security.enableWrite) {
      return { success: false, error: 'Write operations disabled' };
    }

    const result = await snapshotManager.restoreSnapshot(
      poolName,
      snapshotName,
      targetDataset,
    );
    return result;
  });

  // Get scrub history
  fastify.get('/api/zfs/scrubs/history', async (request) => {
    const { poolName } = request.query as { poolName?: string };
    const history = scrubManager.getScrubHistory(poolName);
    return { success: true, data: history };
  });

  // Trigger manual scrub
  fastify.post('/api/zfs/scrubs/start', async (request) => {
    const { poolName } = request.body as { poolName: string };

    if (!fastify.config.security.enableWrite) {
      return { success: false, error: 'Write operations disabled' };
    }

    const result = await scrubManager.triggerScrub(poolName);
    return result;
  });

  // Get backup history
  fastify.get('/api/zfs/backups/history', async () => {
    const history = backupManager.getBackupHistory();
    return { success: true, data: history };
  });

  // Verify backup
  fastify.post('/api/zfs/backups/verify', async (request) => {
    const { sourcePool, targetPool } = request.body as {
      sourcePool: string;
      targetPool: string;
    };

    const result = await backupManager.verifyBackup(sourcePool, targetPool);
    return { success: true, ...result };
  });

  // Get ZFS recommendations based on your setup
  fastify.get('/api/zfs/recommendations', async () => {
    return {
      success: true,
      recommendations: [
        {
          pool: 'personal',
          type: 'snapshot',
          recommendation: 'Your critical data pool has good snapshot coverage',
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
      ],
    };
  });
}
```

## Phase 3: Database Schema

### 3.1 Create `src/db/migrations/006_zfs_tables.sql`
```sql
-- Snapshot tracking
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY,
  pool_name TEXT NOT NULL,
  snapshot_name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'hourly', 'daily', 'weekly', 'monthly', 'manual'
  reason TEXT, -- For manual snapshots
  size INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  UNIQUE(pool_name, snapshot_name)
);

CREATE INDEX idx_snapshots_pool ON snapshots(pool_name);
CREATE INDEX idx_snapshots_created ON snapshots(created_at);

-- Scrub history
CREATE TABLE IF NOT EXISTS scrub_history (
  id INTEGER PRIMARY KEY,
  pool_name TEXT NOT NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  status TEXT, -- 'running', 'completed', 'completed_with_errors', 'failed'
  errors_found INTEGER DEFAULT 0,
  bytes_processed INTEGER DEFAULT 0,
  duration_seconds INTEGER
);

CREATE INDEX idx_scrub_pool ON scrub_history(pool_name);
CREATE INDEX idx_scrub_started ON scrub_history(started_at);

-- Backup history
CREATE TABLE IF NOT EXISTS backup_history (
  id INTEGER PRIMARY KEY,
  job_id TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success', 'failed', 'running'
  error TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  size_bytes INTEGER,
  files_transferred INTEGER
);

CREATE INDEX idx_backup_job ON backup_history(job_id);
CREATE INDEX idx_backup_started ON backup_history(started_at);

-- Maintenance operations
CREATE TABLE IF NOT EXISTS maintenance_history (
  id INTEGER PRIMARY KEY,
  pool_name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'trim', 'resilver', 'replace', etc.
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  notes TEXT
);
```

## Phase 4: AI-Powered ZFS Assistant

### 4.1 Create `src/services/zfs/ai-assistant.ts`
```typescript
import { createLogger } from '@utils/logger';

const logger = createLogger('zfs-ai');

export class ZFSAssistant {
  /**
   * Explain ZFS concepts in simple terms
   */
  public explainConcept(concept: string): string {
    const explanations: Record<string, string> = {
      snapshot: `
A ZFS snapshot is like a photograph of your data at a specific moment in time.
It doesn't copy the data, just remembers what it looked like. This means:
- Snapshots are instant and use almost no space initially
- They only grow as you change the original data
- You can go back to any snapshot instantly
For your setup: Your personal data gets hourly snapshots for maximum protection.
      `,
      scrub: `
A ZFS scrub is like a health check for your stored data. It:
- Reads every block of data on the pool
- Verifies checksums to detect corruption
- Automatically repairs errors using redundancy
For your setup: Personal pool scrubs weekly, media monthly.
Your SSDs get TRIM instead to maintain performance.
      `,
      arc: `
ARC (Adaptive Replacement Cache) is ZFS's smart RAM cache. With your 64GB RAM:
- ZFS will use up to ~32GB for caching frequently accessed data
- This makes your system much faster
- The cache automatically adjusts based on system needs
This is why high RAM usage is normal and good with ZFS!
      `,
      compression: `
ZFS compression saves space by encoding data more efficiently:
- lz4 is recommended: fast with 10-50% space savings
- It's transparent - files work normally
- Actually makes things faster (less data to read from disk)
For your setup: Enable lz4 on all pools except already-compressed media.
      `,
      deduplication: `
Deduplication finds identical blocks and stores them once. BUT:
- Requires ~5GB RAM per TB of unique data
- Causes significant performance impact
- Your media files won't deduplicate well
Recommendation: Don't enable it. Use compression instead.
      `,
      resilver: `
Resilvering is ZFS rebuilding data after a disk failure or replacement:
- Reads all data from good disks
- Reconstructs missing data
- Writes to the new disk
Your personal pool (mirror) can resilver quickly and safely.
      `,
      raidz: `
RAIDZ is ZFS's improved RAID with better data protection:
- RAIDZ1 = 1 disk redundancy (like RAID5)
- RAIDZ2 = 2 disk redundancy (like RAID6)
- Better than traditional RAID due to checksums
Your setup uses mirrors for personal data (fastest, most redundant).
      `,
    };

    return explanations[concept.toLowerCase()] ||
      'Concept not found. Try: snapshot, scrub, arc, compression, deduplication, resilver, or raidz';
  }

  /**
   * Provide recommendations based on pool configuration
   */
  public getPoolRecommendations(poolConfig: any): string[] {
    const recommendations: string[] = [];

    // Check personal pool (2x4TB mirror)
    if (poolConfig.name === 'personal') {
      recommendations.push(
        '✅ Mirror configuration is excellent for critical data',
        '✅ Hourly snapshots provide excellent recovery points',
        '💡 Consider off-site backup for disaster recovery',
      );
    }

    // Check media pool (single 8TB)
    if (poolConfig.name === 'media') {
      recommendations.push(
        '⚠️ Single disk has no redundancy',
        '💡 Your media can be re-downloaded if lost',
        '✅ Daily snapshots are appropriate for media',
      );
    }

    // Check apps pool (1TB NVMe)
    if (poolConfig.name === 'apps') {
      recommendations.push(
        '✅ NVMe provides excellent performance for Docker',
        '💡 Enable autotrim for long-term SSD health',
        '✅ Daily snapshots protect against container issues',
      );
    }

    // General recommendations
    if (poolConfig.capacity.percent > 80) {
      recommendations.push(
        `⚠️ Pool is ${poolConfig.capacity.percent}% full`,
        '💡 ZFS performance degrades above 80% capacity',
        '🔧 Consider expanding the pool or cleaning old data',
      );
    }

    return recommendations;
  }

  /**
   * Diagnose pool issues
   */
  public async diagnoseIssue(
    issue: string,
    poolData: any,
    systemData: any,
  ): Promise<string> {
    // This would integrate with your AI service (Claude/Ollama)
    // For now, return intelligent static responses

    if (issue.includes('slow')) {
      if (poolData.capacity.percent > 80) {
        return `
Your ${poolData.name} pool is ${poolData.capacity.percent}% full.
ZFS performance significantly degrades above 80% capacity.

Solutions:
1. Delete unnecessary snapshots: zfs destroy pool@snapshot
2. Remove old data
3. Add more drives to expand the pool

Immediate action: Check snapshot usage with 'zfs list -t snapshot'
        `;
      }

      if (systemData.memory.arc < 10 * 1024 * 1024 * 1024) {
        return `
Your ARC cache is only ${(systemData.memory.arc / 1024 / 1024 / 1024).toFixed(1)}GB.
With 64GB RAM, it should be much larger.

This might indicate:
1. ARC is limited: Check 'arc_max' setting
2. Memory pressure from applications
3. Recent reboot (ARC needs time to warm up)

Check ARC stats: arc_summary
        `;
      }
    }

    if (issue.includes('snapshot')) {
      return `
Snapshot Management Tips:

Current snapshots are consuming space. To check:
- List all snapshots: zfs list -t snapshot
- Check space used: zfs list -o space

To clean old snapshots:
- Delete specific: zfs destroy pool@snapshot
- Delete range: zfs destroy pool@snap1%snap2

Your retention policy will automatically clean old snapshots.
      `;
    }

    return 'Please provide more specific information about the issue.';
  }
}
```

## Phase 5: Integration & Testing

### 5.1 Update Main Server
```typescript
// In src/server.ts, add:

import { SnapshotManager } from '@services/zfs/snapshot-manager';
import { ScrubManager } from '@services/zfs/scrub-manager';
import { BackupManager } from '@services/zfs/backup-manager';
import { ZFSAssistant } from '@services/zfs/ai-assistant';

// After database initialization:
const snapshotManager = new SnapshotManager(truenasClient, db);
const scrubManager = new ScrubManager(truenasClient, db);
const backupManager = new BackupManager(truenasClient, db);
const zfsAssistant = new ZFSAssistant();

// Start automation
snapshotManager.start();
scrubManager.start();
backupManager.start();

// Make available to routes
fastify.decorate('zfs', {
  snapshotManager,
  scrubManager,
  backupManager,
  assistant: zfsAssistant,
});
```

### 5.2 Test ZFS Features
```bash
# Test snapshot creation
curl -X POST http://localhost:3100/api/zfs/snapshots/create \
  -H "Content-Type: application/json" \
  -d '{"poolName": "personal", "reason": "test-snapshot"}'

# Get snapshot stats
curl http://localhost:3100/api/zfs/snapshots/stats

# Get scrub history
curl http://localhost:3100/api/zfs/scrubs/history

# Get recommendations
curl http://localhost:3100/api/zfs/recommendations

# Ask AI for help
curl http://localhost:3100/api/zfs/explain/snapshot
```

## Phase 6: Backup Verification System

### Why This Matters
**Backups are useless if they're corrupt**. This system verifies backup integrity automatically so you know your data is recoverable BEFORE disaster strikes.

### Create `src/services/zfs/backup-verifier.ts`
```typescript
import { logger } from '../../utils/logger';
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface BackupVerificationResult {
  backupPath: string;
  valid: boolean;
  size: number;
  checksum: string;
  restoreTest: {
    success: boolean;
    error?: string;
  };
  zfsVerification: {
    success: boolean;
    properties?: any;
  };
  lastVerified: Date;
}

export class BackupVerifier {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupPath: string): Promise<BackupVerificationResult> {
    logger.info(`Verifying backup: ${backupPath}`);

    const result: BackupVerificationResult = {
      backupPath,
      valid: false,
      size: 0,
      checksum: '',
      restoreTest: { success: false },
      zfsVerification: { success: false },
      lastVerified: new Date()
    };

    try {
      // 1. Check file exists and size
      const stats = await fs.stat(backupPath);
      result.size = stats.size;

      if (stats.size === 0) {
        logger.error('Backup file is empty');
        return result;
      }

      // 2. Calculate checksum
      result.checksum = await this.calculateChecksum(backupPath);

      // 3. Test restore to temp location
      result.restoreTest = await this.testRestore(backupPath);

      // 4. Verify ZFS properties
      result.zfsVerification = await this.verifyZFSSnapshot(backupPath);

      // Mark as valid if all checks pass
      result.valid = result.restoreTest.success && result.zfsVerification.success;

      // Store verification result
      await this.storeVerificationResult(result);

      if (result.valid) {
        logger.info(`Backup verified successfully: ${backupPath}`);
      } else {
        logger.error(`Backup verification failed: ${backupPath}`, result);
      }

    } catch (error: any) {
      logger.error('Backup verification error', error);
      result.restoreTest.error = error.message;
    }

    return result;
  }

  /**
   * Calculate SHA-256 checksum
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`sha256sum "${filePath}"`);
      const checksum = stdout.split(' ')[0];
      return checksum;
    } catch (error) {
      logger.error('Checksum calculation failed', error);
      return '';
    }
  }

  /**
   * Test restore without actually restoring
   */
  private async testRestore(backupPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Create temp dataset for test restore
      const tempDataset = `personal/backup-test-${Date.now()}`;

      logger.info(`Testing restore to temporary dataset: ${tempDataset}`);

      // Create temp dataset
      await execAsync(`zfs create ${tempDataset}`);

      try {
        // Restore backup to temp dataset
        await execAsync(`zfs receive -F ${tempDataset} < "${backupPath}"`);

        // Verify dataset exists and has data
        const { stdout } = await execAsync(`zfs list -H -o used ${tempDataset}`);
        const used = stdout.trim();

        if (used === '0' || used === '0B') {
          throw new Error('Restored dataset is empty');
        }

        logger.info(`Test restore successful, dataset size: ${used}`);

        return { success: true };

      } finally {
        // Clean up temp dataset
        await execAsync(`zfs destroy -r ${tempDataset}`);
      }

    } catch (error: any) {
      logger.error('Test restore failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify ZFS snapshot properties
   */
  private async verifyZFSSnapshot(backupPath: string): Promise<{ success: boolean; properties?: any }> {
    try {
      // Extract snapshot info from backup
      const { stdout } = await execAsync(`zfs send -nv "${backupPath}" 2>&1`);

      // Parse ZFS properties
      const properties = this.parseZFSProperties(stdout);

      return {
        success: true,
        properties
      };

    } catch (error: any) {
      logger.error('ZFS verification failed', error);
      return { success: false };
    }
  }

  /**
   * Parse ZFS properties from send output
   */
  private parseZFSProperties(output: string): any {
    const properties: any = {};

    // Extract key properties from zfs send output
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('size')) {
        const match = line.match(/size\s+(\d+)/);
        if (match) properties.size = parseInt(match[1]);
      }
    }

    return properties;
  }

  /**
   * Store verification result in database
   */
  private async storeVerificationResult(result: BackupVerificationResult) {
    const stmt = this.db.prepare(`
      INSERT INTO backup_verifications (
        backup_path, valid, size_bytes, checksum,
        restore_test_passed, zfs_verification_passed, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      result.backupPath,
      result.valid ? 1 : 0,
      result.size,
      result.checksum,
      result.restoreTest.success ? 1 : 0,
      result.zfsVerification.success ? 1 : 0,
      result.lastVerified.toISOString()
    );
  }

  /**
   * Verify all recent backups
   */
  async verifyAllBackups(): Promise<BackupVerificationResult[]> {
    // Get list of backups from the last 7 days
    const stmt = this.db.prepare(`
      SELECT DISTINCT backup_path
      FROM backup_jobs
      WHERE status = 'completed'
        AND created_at > datetime('now', '-7 days')
    `);

    const backups = stmt.all() as Array<{ backup_path: string }>;
    const results: BackupVerificationResult[] = [];

    for (const backup of backups) {
      const result = await this.verifyBackup(backup.backup_path);
      results.push(result);

      // Alert on failed verification
      if (!result.valid) {
        logger.error(`CRITICAL: Backup verification failed for ${backup.backup_path}`);
        // Trigger alert via alert system
      }
    }

    return results;
  }

  /**
   * Get verification history
   */
  getVerificationHistory(days: number = 30) {
    const stmt = this.db.prepare(`
      SELECT * FROM backup_verifications
      WHERE verified_at > datetime('now', '-${days} days')
      ORDER BY verified_at DESC
    `);

    return stmt.all();
  }
}
```

### Update database schema
Add to existing migration or create new `004_backup_verification.sql`:
```sql
-- Backup verification results
CREATE TABLE IF NOT EXISTS backup_verifications (
  id INTEGER PRIMARY KEY,
  backup_path TEXT NOT NULL,
  valid INTEGER DEFAULT 0,
  size_bytes INTEGER,
  checksum TEXT,
  restore_test_passed INTEGER DEFAULT 0,
  zfs_verification_passed INTEGER DEFAULT 0,
  verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_backup_verifications_time ON backup_verifications(verified_at);
CREATE INDEX IF NOT EXISTS idx_backup_verifications_path ON backup_verifications(backup_path);
```

### Add verification routes
Update `src/routes/zfs.ts`:
```typescript
import { BackupVerifier } from '../services/zfs/backup-verifier';

// In zfsRoutes:
const backupVerifier = new BackupVerifier(fastify.db);

// Verify specific backup
fastify.post('/api/zfs/backups/verify', async (request, reply) => {
  const { backupPath } = request.body as { backupPath: string };
  const result = await backupVerifier.verifyBackup(backupPath);
  return result;
});

// Verify all recent backups
fastify.post('/api/zfs/backups/verify-all', async (request, reply) => {
  const results = await backupVerifier.verifyAllBackups();
  return {
    total: results.length,
    valid: results.filter(r => r.valid).length,
    failed: results.filter(r => !r.valid).length,
    results
  };
});

// Get verification history
fastify.get('/api/zfs/backups/verification-history', async (request, reply) => {
  const { days = 30 } = request.query as { days?: number };
  const history = backupVerifier.getVerificationHistory(days);
  return history;
});
```

### Schedule automatic verification
Update `src/services/zfs/manager.ts` to add daily backup verification:
```typescript
// Add to ZFSManager class
private startBackupVerification() {
  const interval = setInterval(async () => {
    logger.info('Running daily backup verification...');

    const verifier = new BackupVerifier(this.db);
    const results = await verifier.verifyAllBackups();

    const failed = results.filter(r => !r.valid);

    if (failed.length > 0) {
      // Create critical alert
      this.emit('alert', {
        type: 'backup_verification_failed',
        severity: 'critical',
        message: `${failed.length} backup(s) failed verification`,
        details: failed
      });
    }

  }, 86400000); // Daily

  this.intervals.set('backup-verification', interval);
}
```

## Phase 7: Smart Maintenance Windows

### Why This Matters
Schedule intensive tasks (scrubs, backups, updates) during low-usage periods to avoid performance impact.

### Create `src/services/scheduling/maintenance-scheduler.ts`
```typescript
import { logger } from '../../utils/logger';
import Database from 'better-sqlite3';

interface UsagePattern {
  hour: number;
  dayOfWeek: number;
  avgCpuUsage: number;
  avgDiskIO: number;
  avgNetworkUsage: number;
  activityScore: number; // 0-100, lower is better for maintenance
}

interface MaintenanceWindow {
  type: 'scrub' | 'backup' | 'update' | 'verification';
  pool?: string;
  scheduledTime: Date;
  duration: number; // minutes
  reason: string;
}

export class MaintenanceScheduler {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Analyze usage patterns and find optimal maintenance windows
   */
  async scheduleOptimalMaintenance(): Promise<Record<string, MaintenanceWindow>> {
    logger.info('Analyzing usage patterns for maintenance scheduling...');

    // Analyze 30 days of usage
    const usage = await this.getUsageHistory(30);

    // Find low-usage windows
    const windows = this.findLowUsageWindows(usage);

    // Schedule tasks
    const schedule: Record<string, MaintenanceWindow> = {
      zfs_scrub_personal: {
        type: 'scrub',
        pool: 'personal',
        scheduledTime: windows.weekly[0],
        duration: 120,
        reason: 'Critical data pool - weekly scrub during lowest usage'
      },
      zfs_scrub_media: {
        type: 'scrub',
        pool: 'media',
        scheduledTime: windows.monthly[0],
        duration: 240,
        reason: 'Media pool - monthly scrub during lowest usage week'
      },
      container_updates: {
        type: 'update',
        scheduledTime: windows.weekly[1],
        duration: 30,
        reason: 'Container updates during second-lowest usage period'
      },
      backup_verification: {
        type: 'verification',
        scheduledTime: windows.weekly[2],
        duration: 60,
        reason: 'Backup verification during third-lowest usage period'
      },
      full_backup: {
        type: 'backup',
        scheduledTime: windows.weekly[0],
        duration: 180,
        reason: 'Full backup during lowest usage period'
      }
    };

    // Store schedule
    await this.storeSchedule(schedule);

    return schedule;
  }

  /**
   * Get usage history for analysis
   */
  private async getUsageHistory(days: number): Promise<UsagePattern[]> {
    const stmt = this.db.prepare(`
      SELECT
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        CAST(strftime('%w', timestamp) AS INTEGER) as dayOfWeek,
        AVG(cpu_percent) as avgCpuUsage,
        AVG(network_rx_mbps + network_tx_mbps) as avgNetworkUsage
      FROM metrics
      WHERE timestamp > datetime('now', '-${days} days')
      GROUP BY hour, dayOfWeek
      ORDER BY hour, dayOfWeek
    `);

    const raw = stmt.all() as Array<{
      hour: number;
      dayOfWeek: number;
      avgCpuUsage: number;
      avgNetworkUsage: number;
    }>;

    // Calculate activity score for each time slot
    return raw.map(r => ({
      ...r,
      avgDiskIO: 0, // Would come from disk metrics
      activityScore: this.calculateActivityScore(r.avgCpuUsage, r.avgNetworkUsage, 0)
    }));
  }

  /**
   * Calculate activity score (0-100, lower = better for maintenance)
   */
  private calculateActivityScore(cpu: number, network: number, diskIO: number): number {
    // Weight different metrics
    const cpuWeight = 0.5;
    const networkWeight = 0.3;
    const diskWeight = 0.2;

    return (cpu * cpuWeight) + (network * networkWeight) + (diskIO * diskWeight);
  }

  /**
   * Find low-usage windows
   */
  private findLowUsageWindows(usage: UsagePattern[]) {
    // Sort by activity score (lowest first)
    const sorted = [...usage].sort((a, b) => a.activityScore - b.activityScore);

    // Find best weekly windows (one per day of week)
    const weekly: Date[] = [];
    const weekdays = new Set<number>();

    for (const pattern of sorted) {
      if (!weekdays.has(pattern.dayOfWeek) && weekly.length < 7) {
        // Create Date for next occurrence of this day/hour
        const next = this.getNextOccurrence(pattern.dayOfWeek, pattern.hour);
        weekly.push(next);
        weekdays.add(pattern.dayOfWeek);
      }
    }

    // Find best monthly window (lowest activity overall)
    const monthly = [this.getNextOccurrence(sorted[0].dayOfWeek, sorted[0].hour)];

    return { weekly, monthly };
  }

  /**
   * Get next occurrence of a specific day and hour
   */
  private getNextOccurrence(dayOfWeek: number, hour: number): Date {
    const now = new Date();
    const next = new Date();

    // Calculate days until target day of week
    const daysUntil = (dayOfWeek - now.getDay() + 7) % 7;

    next.setDate(now.getDate() + (daysUntil || 7)); // If today, schedule for next week
    next.setHours(hour, 0, 0, 0);

    return next;
  }

  /**
   * Store maintenance schedule
   */
  private async storeSchedule(schedule: Record<string, MaintenanceWindow>) {
    for (const [name, window] of Object.entries(schedule)) {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO maintenance_schedule (
          task_name, task_type, pool_name, scheduled_time,
          duration_minutes, reason
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        name,
        window.type,
        window.pool || null,
        window.scheduledTime.toISOString(),
        window.duration,
        window.reason
      );
    }
  }

  /**
   * Get current maintenance schedule
   */
  getSchedule() {
    const stmt = this.db.prepare(`
      SELECT * FROM maintenance_schedule
      ORDER BY scheduled_time ASC
    `);

    return stmt.all();
  }

  /**
   * Check if now is a good time for maintenance
   */
  async isMaintenanceWindowActive(): Promise<boolean> {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Get current usage
    const stmt = this.db.prepare(`
      SELECT AVG(cpu_percent) as cpu, AVG(network_rx_mbps + network_tx_mbps) as network
      FROM metrics
      WHERE timestamp > datetime('now', '-15 minutes')
    `);

    const current = stmt.get() as { cpu: number; network: number };

    // Get historical average for this time
    const avgStmt = this.db.prepare(`
      SELECT AVG(cpu_percent) as avgCpu, AVG(network_rx_mbps + network_tx_mbps) as avgNetwork
      FROM metrics
      WHERE CAST(strftime('%H', timestamp) AS INTEGER) = ?
        AND CAST(strftime('%w', timestamp) AS INTEGER) = ?
        AND timestamp > datetime('now', '-30 days')
    `);

    const historical = avgStmt.get(hour, dayOfWeek) as { avgCpu: number; avgNetwork: number };

    // Maintenance window if current usage is below 70% of historical average
    const cpuOk = current.cpu < (historical.avgCpu * 0.7);
    const networkOk = current.network < (historical.avgNetwork * 0.7);

    return cpuOk && networkOk;
  }
}
```

### Update database schema
```sql
-- Maintenance schedule
CREATE TABLE IF NOT EXISTS maintenance_schedule (
  id INTEGER PRIMARY KEY,
  task_name TEXT UNIQUE NOT NULL,
  task_type TEXT NOT NULL,
  pool_name TEXT,
  scheduled_time DATETIME NOT NULL,
  duration_minutes INTEGER,
  reason TEXT,
  last_run DATETIME,
  next_run DATETIME
);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedule_time ON maintenance_schedule(scheduled_time);
```

### Add scheduling routes
```typescript
import { MaintenanceScheduler } from '../services/scheduling/maintenance-scheduler';

// In server initialization:
const scheduler = new MaintenanceScheduler(fastify.db);

// Get optimal schedule
fastify.get('/api/maintenance/schedule', async (request, reply) => {
  const schedule = await scheduler.scheduleOptimalMaintenance();
  return schedule;
});

// Get current schedule
fastify.get('/api/maintenance/current', async (request, reply) => {
  const current = scheduler.getSchedule();
  return current;
});

// Check if maintenance window is active
fastify.get('/api/maintenance/window-active', async (request, reply) => {
  const active = await scheduler.isMaintenanceWindowActive();
  return { active };
});
```

## Phase 8: Network Storage Backup

### Why This Matters
Protect against pool failure, ransomware, and physical disasters by backing up to network storage (Synology, QNAP, etc.).

### Create `src/services/zfs/network-backup.ts`
```typescript
import { logger } from '../../utils/logger';
import Database from 'better-sqlite3';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';

const execAsync = promisify(exec);

interface NetworkBackupConfig {
  enabled: boolean;
  targetNFS: string; // e.g., "192.168.1.100:/volume1/backups"
  mountPoint: string; // e.g., "/mnt/network-backup"
  schedule: string; // cron expression
  retention: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

interface BackupManifest {
  backupId: string;
  sourcePath: string;
  targetPath: string;
  snapshotName: string;
  size: number;
  checksum: string;
  createdAt: Date;
  verified: boolean;
}

export class NetworkBackupManager {
  private db: Database.Database;
  private config: NetworkBackupConfig;

  constructor(db: Database.Database, config: NetworkBackupConfig) {
    this.db = db;
    this.config = config;
  }

  /**
   * Backup to network storage
   */
  async backupToNetwork(sourcePath: string): Promise<BackupManifest> {
    logger.info(`Starting network backup: ${sourcePath} → ${this.config.targetNFS}`);

    const backupId = `backup-${Date.now()}`;
    const snapshotName = `${sourcePath}@network-backup-${Date.now()}`;

    try {
      // 1. Create ZFS snapshot
      await this.createSnapshot(sourcePath, snapshotName);

      // 2. Mount NFS share
      await this.mountNFS();

      // 3. rsync with verification
      const targetPath = `${this.config.mountPoint}/${sourcePath}`;
      await this.rsyncWithVerify(snapshotName, targetPath);

      // 4. Create manifest
      const manifest = await this.createBackupManifest(
        backupId,
        sourcePath,
        targetPath,
        snapshotName
      );

      // 5. Verify backup
      const verified = await this.verifyBackup(targetPath);
      manifest.verified = verified;

      // 6. Store in database
      this.storeBackupRecord(manifest);

      // 7. Cleanup old backups based on retention
      await this.applyRetentionPolicy(sourcePath);

      logger.info(`Network backup completed: ${backupId}`);

      return manifest;

    } catch (error: any) {
      logger.error('Network backup failed', error);
      throw error;
    }
  }

  /**
   * Create ZFS snapshot
   */
  private async createSnapshot(path: string, snapshotName: string): Promise<void> {
    logger.info(`Creating snapshot: ${snapshotName}`);
    await execAsync(`zfs snapshot ${snapshotName}`);
  }

  /**
   * Mount NFS share
   */
  private async mountNFS(): Promise<void> {
    try {
      // Check if already mounted
      const { stdout } = await execAsync(`mount | grep ${this.config.mountPoint}`);
      if (stdout) {
        logger.info('NFS already mounted');
        return;
      }
    } catch {
      // Not mounted, continue
    }

    // Create mount point if it doesn't exist
    await fs.mkdir(this.config.mountPoint, { recursive: true });

    // Mount NFS
    logger.info(`Mounting NFS: ${this.config.targetNFS} → ${this.config.mountPoint}`);
    await execAsync(`mount -t nfs ${this.config.targetNFS} ${this.config.mountPoint}`);
  }

  /**
   * rsync with verification
   */
  private async rsyncWithVerify(sourcePath: string, targetPath: string): Promise<void> {
    logger.info(`Syncing ${sourcePath} → ${targetPath}`);

    // Use rsync with checksum verification
    await execAsync(`
      rsync -avz --checksum --delete \
        /.zfs/snapshot/${sourcePath}/ \
        ${targetPath}/
    `);

    logger.info('Rsync completed successfully');
  }

  /**
   * Create backup manifest
   */
  private async createBackupManifest(
    backupId: string,
    sourcePath: string,
    targetPath: string,
    snapshotName: string
  ): Promise<BackupManifest> {
    // Calculate size
    const { stdout: sizeOutput } = await execAsync(`du -sb ${targetPath}`);
    const size = parseInt(sizeOutput.split('\t')[0]);

    // Calculate checksum of manifest file
    const checksum = await this.calculateTreeChecksum(targetPath);

    const manifest: BackupManifest = {
      backupId,
      sourcePath,
      targetPath,
      snapshotName,
      size,
      checksum,
      createdAt: new Date(),
      verified: false
    };

    // Write manifest file
    const manifestPath = `${targetPath}/.backup-manifest.json`;
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    return manifest;
  }

  /**
   * Calculate checksum of directory tree
   */
  private async calculateTreeChecksum(path: string): Promise<string> {
    const { stdout } = await execAsync(`
      find ${path} -type f -exec sha256sum {} \\; | \
      sort | \
      sha256sum
    `);

    return stdout.split(' ')[0];
  }

  /**
   * Verify backup
   */
  private async verifyBackup(targetPath: string): Promise<boolean> {
    try {
      // Read manifest
      const manifestPath = `${targetPath}/.backup-manifest.json`;
      const manifestData = await fs.readFile(manifestPath, 'utf8');
      const manifest: BackupManifest = JSON.parse(manifestData);

      // Recalculate checksum
      const currentChecksum = await this.calculateTreeChecksum(targetPath);

      if (currentChecksum !== manifest.checksum) {
        logger.error('Backup verification failed: Checksum mismatch');
        return false;
      }

      logger.info('Backup verified successfully');
      return true;

    } catch (error) {
      logger.error('Backup verification failed', error);
      return false;
    }
  }

  /**
   * Store backup record in database
   */
  private storeBackupRecord(manifest: BackupManifest) {
    const stmt = this.db.prepare(`
      INSERT INTO network_backups (
        backup_id, source_path, target_path, snapshot_name,
        size_bytes, checksum, verified, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      manifest.backupId,
      manifest.sourcePath,
      manifest.targetPath,
      manifest.snapshotName,
      manifest.size,
      manifest.checksum,
      manifest.verified ? 1 : 0,
      manifest.createdAt.toISOString()
    );
  }

  /**
   * Apply retention policy
   */
  private async applyRetentionPolicy(sourcePath: string) {
    logger.info(`Applying retention policy for ${sourcePath}`);

    // Get all backups for this source
    const stmt = this.db.prepare(`
      SELECT * FROM network_backups
      WHERE source_path = ?
      ORDER BY created_at DESC
    `);

    const backups = stmt.all(sourcePath) as BackupManifest[];

    // Keep based on retention policy
    const now = new Date();
    const toKeep = new Set<string>();
    const toDelete: BackupManifest[] = [];

    // Daily: Keep last N days
    for (let i = 0; i < this.config.retention.daily && i < backups.length; i++) {
      toKeep.add(backups[i].backupId);
    }

    // Weekly: Keep one per week for N weeks
    // Monthly: Keep one per month for N months
    // (Implementation simplified for brevity)

    // Delete old backups
    for (const backup of backups) {
      if (!toKeep.has(backup.backupId)) {
        await this.deleteBackup(backup);
        toDelete.push(backup);
      }
    }

    logger.info(`Retention policy applied: Kept ${toKeep.size}, deleted ${toDelete.length}`);
  }

  /**
   * Delete backup
   */
  private async deleteBackup(manifest: BackupManifest) {
    logger.info(`Deleting old backup: ${manifest.backupId}`);

    // Delete files
    await execAsync(`rm -rf ${manifest.targetPath}`);

    // Delete snapshot
    await execAsync(`zfs destroy ${manifest.snapshotName}`);

    // Update database
    const stmt = this.db.prepare(`
      DELETE FROM network_backups WHERE backup_id = ?
    `);
    stmt.run(manifest.backupId);
  }

  /**
   * Restore from network backup
   */
  async restoreFromNetwork(backupId: string): Promise<void> {
    logger.warn(`RESTORING from network backup: ${backupId}`);

    // Get backup manifest
    const stmt = this.db.prepare(`
      SELECT * FROM network_backups WHERE backup_id = ?
    `);

    const backup = stmt.get(backupId) as BackupManifest;

    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    // Safety checks before restore
    logger.warn('⚠️ RESTORE OPERATION - Verify you want to proceed');

    // Mount NFS
    await this.mountNFS();

    // Verify backup exists
    const verified = await this.verifyBackup(backup.targetPath);

    if (!verified) {
      throw new Error('Backup verification failed - cannot restore');
    }

    // Restore with progress tracking
    await execAsync(`
      rsync -avz --progress \
        ${backup.targetPath}/ \
        ${backup.sourcePath}/
    `);

    logger.info(`Restore completed: ${backupId}`);
  }
}
```

### Update database schema
```sql
-- Network backups
CREATE TABLE IF NOT EXISTS network_backups (
  id INTEGER PRIMARY KEY,
  backup_id TEXT UNIQUE NOT NULL,
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  snapshot_name TEXT,
  size_bytes INTEGER,
  checksum TEXT,
  verified INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_network_backups_source ON network_backups(source_path);
CREATE INDEX IF NOT EXISTS idx_network_backups_time ON network_backups(created_at);
```

### Add network backup routes
```typescript
import { NetworkBackupManager } from '../services/zfs/network-backup';

// In zfsRoutes:
const networkBackupConfig = {
  enabled: true,
  targetNFS: process.env.NFS_BACKUP_TARGET || '192.168.1.100:/volume1/backups',
  mountPoint: '/mnt/network-backup',
  schedule: '0 2 * * 0', // 2 AM Sundays
  retention: {
    daily: 7,
    weekly: 4,
    monthly: 6
  }
};

const networkBackup = new NetworkBackupManager(fastify.db, networkBackupConfig);

// Trigger network backup
fastify.post('/api/zfs/network-backup', async (request, reply) => {
  const { sourcePath } = request.body as { sourcePath: string };
  const manifest = await networkBackup.backupToNetwork(sourcePath);
  return manifest;
});

// Restore from network backup
fastify.post('/api/zfs/network-backup/restore', async (request, reply) => {
  const { backupId } = request.body as { backupId: string };
  await networkBackup.restoreFromNetwork(backupId);
  return { success: true, message: 'Restore completed' };
});

// List network backups
fastify.get('/api/zfs/network-backups', async (request, reply) => {
  const stmt = fastify.db.prepare(`
    SELECT * FROM network_backups
    ORDER BY created_at DESC
  `);
  return stmt.all();
});
```

## Checklist for Completion

- [ ] Snapshot automation implemented
- [ ] Retention policies working
- [ ] Scrub scheduling configured
- [ ] Backup jobs created
- [ ] **Backup verification system running daily**
- [ ] **Smart maintenance windows calculated from usage patterns**
- [ ] **Network backup configured and tested**
- [ ] Database migrations run
- [ ] API routes working
- [ ] AI assistant responding
- [ ] Manual snapshot creation tested
- [ ] Verification functions working
- [ ] Alerts triggering correctly
- [ ] Update index.md: Mark Phase 6 as 🟢 Complete

## Next Steps

After completing this TODO:
1. Commit: `feat(zfs): implement automated snapshot and backup management`
2. Update index.md progress tracker
3. Proceed to TODO-07 for Arr suite optimization

---

**Important**: Your 2x4TB mirror for personal data is your most critical pool. The automation prioritizes its protection with frequent snapshots and weekly scrubs. Consider adding cloud backup for truly irreplaceable data.
import { createLogger } from '../../utils/logger.js';
import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import type { ArrClient } from '../../integrations/arr-apps/client.js';

const logger = createLogger('arr-optimizer');

interface ArrAppConfig {
  name: string;
  client: ArrClient;
  type: 'sonarr' | 'radarr' | 'prowlarr' | 'lidarr' | 'readarr' | 'bazarr';
}

interface QueueItem {
  title: string;
  status: string;
  errorMessage?: string;
  downloadId: string;
  protocol: string;
  size: number;
  sizeleft: number;
  timeleft?: string;
  trackedDownloadStatus?: string;
  statusMessages?: unknown[];
}

/**
 * Arr Suite Optimizer
 * Monitors and optimizes Sonarr, Radarr, and other Arr applications
 */
export class ArrOptimizer {
  private apps: Map<string, ArrAppConfig> = new Map();
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Database.Database,
    private io: SocketServer,
  ) {}

  /**
   * Register arr application for monitoring
   */
  public registerApp(config: ArrAppConfig): void {
    this.apps.set(config.name, config);
    logger.info(`Registered arr app: ${config.name} (${config.type})`);
  }

  /**
   * Start monitoring all registered apps
   */
  public async start(): Promise<void> {
    if (this.apps.size === 0) {
      logger.info('No arr apps registered, skipping optimizer');
      return;
    }

    logger.info(`Starting Arr optimizer for ${this.apps.size} apps`);

    // Immediate check
    await this.performMonitoringCycle();

    // Monitor every 2 minutes
    this.monitoringInterval = setInterval(
      () => {
        void this.performMonitoringCycle();
      },
      2 * 60 * 1000,
    );
  }

  /**
   * Perform complete monitoring cycle
   */
  private async performMonitoringCycle(): Promise<void> {
    for (const [name, app] of this.apps) {
      try {
        await this.monitorApp(app);
      } catch (error) {
        logger.error({ err: error, app: name }, 'App monitoring failed');
      }
    }
  }

  /**
   * Monitor individual arr app
   */
  private async monitorApp(app: ArrAppConfig): Promise<void> {
    try {
      // Get health status
      const health = await app.client.getHealth();
      const status = await app.client.getSystemStatus();

      const hasIssues = health.some(
        (h: { type: string; message: string; source: string }) => h.type === 'error',
      );

      // Store health data
      const healthStmt = this.db.prepare(`
        INSERT INTO arr_health (
          app_name, app_type, version, health_status,
          issues_count, checked_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      healthStmt.run(
        app.name,
        app.type,
        status.version || 'unknown',
        hasIssues ? 'unhealthy' : 'healthy',
        health.length,
        new Date().toISOString(),
      );

      // Get queue status
      const queue = await app.client.getQueue();

      const downloading =
        queue.items?.filter((i: QueueItem) =>
          ['downloading', 'queued'].includes(i.status?.toLowerCase() || ''),
        ).length || 0;

      const failed =
        queue.items?.filter(
          (i: QueueItem) =>
            i.errorMessage ||
            i.trackedDownloadStatus === 'warning' ||
            i.trackedDownloadStatus === 'error',
        ).length || 0;

      const completed =
        queue.items?.filter((i: QueueItem) => i.status?.toLowerCase() === 'completed').length || 0;

      const totalSizeGB =
        (queue.items?.reduce((sum: number, i: QueueItem) => sum + (i.size || 0), 0) || 0) /
        (1024 * 1024 * 1024);

      // Store queue stats
      const queueStmt = this.db.prepare(`
        INSERT INTO arr_queue_stats (
          app_name, total_items, downloading, failed,
          completed, total_size_gb, checked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      queueStmt.run(
        app.name,
        queue.totalRecords || 0,
        downloading,
        failed,
        completed,
        totalSizeGB,
        new Date().toISOString(),
      );

      // Handle failed downloads
      if (failed > 0 && queue.items) {
        await this.handleFailedDownloads(app, queue.items);
      }

      // Monitor disk space
      const diskSpace = await app.client.getDiskSpace();
      for (const disk of diskSpace) {
        const percentUsed = ((disk.totalSpace - disk.freeSpace) / disk.totalSpace) * 100;

        const diskStmt = this.db.prepare(`
          INSERT INTO arr_disk_stats (
            app_name, path, label, total_gb, free_gb,
            percent_used, checked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        diskStmt.run(
          app.name,
          disk.path,
          disk.label || 'unknown',
          disk.totalSpace / (1024 * 1024 * 1024),
          disk.freeSpace / (1024 * 1024 * 1024),
          percentUsed,
          new Date().toISOString(),
        );

        // Alert on low disk space
        if (percentUsed > 90) {
          this.createAlert({
            app: app.name,
            type: 'disk_space_critical',
            severity: 'critical',
            path: disk.path,
            percentUsed,
            message: `Critical disk space on ${disk.path}: ${percentUsed.toFixed(1)}% used`,
          });
        }
      }

      // Calculate performance metrics
      await this.calculatePerformanceMetrics(app);

      // Broadcast status
      this.io.to('arr').emit('arr:status', {
        app: app.name,
        healthy: !hasIssues,
        queue: {
          total: queue.totalRecords || 0,
          downloading,
          failed,
          completed,
        },
      });
    } catch (error) {
      logger.error({ err: error, app: app.name }, 'Error monitoring arr app');
    }
  }

  /**
   * Handle failed downloads
   */
  private async handleFailedDownloads(app: ArrAppConfig, queueItems: QueueItem[]): Promise<void> {
    const failedItems = queueItems.filter(
      (i) =>
        i.errorMessage ||
        i.trackedDownloadStatus === 'warning' ||
        i.trackedDownloadStatus === 'error',
    );

    for (const item of failedItems) {
      const analysis = this.analyzeFailure(item);

      const stmt = this.db.prepare(`
        INSERT INTO arr_failed_downloads (
          app_name, title, error_message, failure_type,
          suggested_action, failed_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        app.name,
        item.title,
        item.errorMessage || 'Unknown error',
        analysis.type,
        analysis.suggestedAction,
        new Date().toISOString(),
      );

      if (analysis.requiresIntervention) {
        this.createAlert({
          app: app.name,
          type: 'download_failed',
          severity: 'warning',
          title: item.title,
          error: item.errorMessage,
          suggestion: analysis.suggestedAction,
        });
      }
    }
  }

  /**
   * Analyze download failure
   */
  private analyzeFailure(item: QueueItem): {
    type: string;
    shouldRetry: boolean;
    requiresIntervention: boolean;
    suggestedAction: string;
  } {
    const errorLower = (item.errorMessage || '').toLowerCase();

    if (errorLower.includes('disk') || errorLower.includes('space')) {
      return {
        type: 'disk_space',
        shouldRetry: false,
        requiresIntervention: true,
        suggestedAction: 'Free up disk space on media or download drive',
      };
    }

    if (errorLower.includes('permission') || errorLower.includes('access denied')) {
      return {
        type: 'permissions',
        shouldRetry: false,
        requiresIntervention: true,
        suggestedAction: 'Check folder permissions and PUID/PGID settings',
      };
    }

    if (errorLower.includes('connection') || errorLower.includes('timeout')) {
      return {
        type: 'connection',
        shouldRetry: true,
        requiresIntervention: false,
        suggestedAction: 'Temporary connection issue, will retry automatically',
      };
    }

    if (errorLower.includes('not found') || errorLower.includes('404')) {
      return {
        type: 'not_found',
        shouldRetry: false,
        requiresIntervention: true,
        suggestedAction: 'Release no longer available, search for alternative',
      };
    }

    return {
      type: 'unknown',
      shouldRetry: false,
      requiresIntervention: true,
      suggestedAction: 'Manual investigation required',
    };
  }

  /**
   * Calculate performance metrics
   */
  private async calculatePerformanceMetrics(app: ArrAppConfig): Promise<void> {
    try {
      const stats = this.db
        .prepare(
          `
        SELECT
          AVG(total_items) as avg_queue_size,
          AVG(failed) as avg_failed,
          MAX(total_items) as max_queue_size
        FROM arr_queue_stats
        WHERE app_name = ?
          AND checked_at > datetime('now', '-1 day')
      `,
        )
        .get(app.name) as
        | {
            avg_queue_size: number;
            avg_failed: number;
            max_queue_size: number;
          }
        | undefined;

      if (!stats) return;

      const successRate =
        stats.avg_failed > 0
          ? ((stats.avg_queue_size - stats.avg_failed) / stats.avg_queue_size) * 100
          : 100;

      const stmt = this.db.prepare(`
        INSERT INTO arr_performance_metrics (
          app_name, success_rate, avg_queue_size,
          max_queue_size, calculated_at
        ) VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        app.name,
        successRate,
        stats.avg_queue_size || 0,
        stats.max_queue_size || 0,
        new Date().toISOString(),
      );

      // Alert on poor performance
      if (successRate < 80) {
        this.createAlert({
          app: app.name,
          type: 'poor_performance',
          severity: 'warning',
          successRate,
          message: `Success rate below 80%: ${successRate.toFixed(1)}%`,
        });
      }
    } catch (error) {
      logger.error({ err: error, app: app.name }, 'Performance calculation failed');
    }
  }

  /**
   * Get optimization suggestions for an app
   */
  public getOptimizationSuggestions(appName: string): string[] {
    const suggestions: string[] = [];

    const app = this.apps.get(appName);
    if (!app) return suggestions;

    // Check recent performance
    const metrics = this.db
      .prepare(
        `
      SELECT * FROM arr_performance_metrics
      WHERE app_name = ?
      ORDER BY calculated_at DESC
      LIMIT 1
    `,
      )
      .get(appName) as
      | {
          success_rate: number;
          avg_queue_size: number;
        }
      | undefined;

    if (metrics) {
      if (metrics.success_rate < 90) {
        suggestions.push('Low success rate: Check indexers and increase quality tolerance');
      }

      if (metrics.avg_queue_size > 20) {
        suggestions.push('Large queue: Consider upgrading download client or connection');
      }
    }

    // Check disk space
    const diskStats = this.db
      .prepare(
        `
      SELECT * FROM arr_disk_stats
      WHERE app_name = ?
      ORDER BY checked_at DESC
      LIMIT 1
    `,
      )
      .get(appName) as { percent_used: number } | undefined;

    if (diskStats && diskStats.percent_used > 80) {
      suggestions.push(
        `Disk usage high (${diskStats.percent_used.toFixed(1)}%): Clean old media or expand storage`,
      );
    }

    // App-specific suggestions
    if (app.type === 'sonarr' || app.type === 'radarr') {
      suggestions.push('Enable recycling bin for safer deletions');
      suggestions.push('Configure quality profiles for optimal file sizes');
    }

    if (app.type === 'prowlarr') {
      suggestions.push('Add multiple indexers for redundancy');
      suggestions.push('Configure indexer priorities');
    }

    return suggestions;
  }

  /**
   * Create alert
   */
  private createAlert(alert: {
    app: string;
    type: string;
    severity: string;
    message?: string;
    [key: string]: unknown;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (
        type, severity, message, details, actionable, suggested_action
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const message = alert.message || `${alert.app}: ${alert.type}`;

    stmt.run(
      alert.type,
      alert.severity,
      message,
      JSON.stringify(alert),
      alert['suggestion'] ? 1 : 0,
      (alert['suggestion'] as string) || null,
    );

    // Broadcast alert
    this.io.to('alerts').emit('alert:triggered', {
      ...alert,
      message,
      triggeredAt: new Date(),
    });
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    logger.info('Arr optimizer stopped');
  }
}

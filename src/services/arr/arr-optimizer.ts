import { createLogger } from '../../utils/logger.js';
import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import type { ArrClient } from '../../integrations/arr-apps/client.js';
import { ArrFailureAnalyzer } from './failure-analyzer.js';
import { ArrMetricsCalculator } from './metrics-calculator.js';
import { ArrPersistence } from './arr-persistence.js';

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
  private failureAnalyzer: ArrFailureAnalyzer;
  private metricsCalculator: ArrMetricsCalculator;
  private persistence: ArrPersistence;

  constructor(db: Database.Database, io: SocketServer) {
    this.failureAnalyzer = new ArrFailureAnalyzer();
    this.metricsCalculator = new ArrMetricsCalculator(db);
    this.persistence = new ArrPersistence(db, io);
  }

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
      this.persistence.storeHealthCheck(
        app.name,
        app.type,
        status.version || 'unknown',
        hasIssues,
        health.length,
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
      this.persistence.storeQueueStats(
        app.name,
        queue.totalRecords || 0,
        downloading,
        failed,
        completed,
        totalSizeGB,
      );

      // Handle failed downloads
      if (failed > 0 && queue.items) {
        await this.handleFailedDownloads(app, queue.items);
      }

      // Monitor disk space
      const diskSpace = await app.client.getDiskSpace();
      for (const disk of diskSpace) {
        const percentUsed = ((disk.totalSpace - disk.freeSpace) / disk.totalSpace) * 100;

        this.persistence.storeDiskStats(
          app.name,
          disk.path,
          disk.label || 'unknown',
          disk.totalSpace / (1024 * 1024 * 1024),
          disk.freeSpace / (1024 * 1024 * 1024),
          percentUsed,
        );

        // Alert on low disk space
        if (percentUsed > 90) {
          this.persistence.createAlert({
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
      await this.metricsCalculator.calculatePerformanceMetrics(app.name);

      // Broadcast status
      this.persistence.broadcastStatus(app.name, !hasIssues, {
        total: queue.totalRecords || 0,
        downloading,
        failed,
        completed,
      });
    } catch (error) {
      logger.error({ err: error, app: app.name }, 'Error monitoring arr app');
    }
  }

  /**
   * Handle failed downloads
   */
  private async handleFailedDownloads(app: ArrAppConfig, queueItems: QueueItem[]): Promise<void> {
    const failedItems = this.failureAnalyzer.getFailedItems(queueItems);

    for (const item of failedItems) {
      const analysis = this.failureAnalyzer.analyzeFailure(item);

      this.persistence.storeFailedDownload(app.name, item, analysis);

      if (analysis.requiresIntervention) {
        this.persistence.createAlert({
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
   * Get optimization suggestions for an app
   */
  public getOptimizationSuggestions(appName: string): string[] {
    const app = this.apps.get(appName);
    if (!app) return [];

    return this.metricsCalculator.getOptimizationSuggestions(appName, app.type);
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

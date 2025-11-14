import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';

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

interface FailureAnalysis {
  type: string;
  shouldRetry: boolean;
  requiresIntervention: boolean;
  suggestedAction: string;
}

/**
 * Arr Persistence Layer
 * Handles database operations and Socket.IO broadcasting
 */
export class ArrPersistence {
  constructor(
    private db: Database.Database,
    private io: SocketServer,
  ) {}

  /**
   * Store health check data
   */
  storeHealthCheck(
    appName: string,
    appType: string,
    version: string,
    hasIssues: boolean,
    issuesCount: number,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO arr_health (
        app_name, app_type, version, health_status,
        issues_count, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      appName,
      appType,
      version,
      hasIssues ? 'unhealthy' : 'healthy',
      issuesCount,
      new Date().toISOString(),
    );
  }

  /**
   * Store queue statistics
   */
  storeQueueStats(
    appName: string,
    totalRecords: number,
    downloading: number,
    failed: number,
    completed: number,
    totalSizeGB: number,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO arr_queue_stats (
        app_name, total_items, downloading, failed,
        completed, total_size_gb, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      appName,
      totalRecords,
      downloading,
      failed,
      completed,
      totalSizeGB,
      new Date().toISOString(),
    );
  }

  /**
   * Store disk space statistics
   */
  storeDiskStats(
    appName: string,
    path: string,
    label: string,
    totalGB: number,
    freeGB: number,
    percentUsed: number,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO arr_disk_stats (
        app_name, path, label, total_gb, free_gb,
        percent_used, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(appName, path, label, totalGB, freeGB, percentUsed, new Date().toISOString());
  }

  /**
   * Store failed download
   */
  storeFailedDownload(appName: string, item: QueueItem, analysis: FailureAnalysis): void {
    const stmt = this.db.prepare(`
      INSERT INTO arr_failed_downloads (
        app_name, title, error_message, failure_type,
        suggested_action, failed_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      appName,
      item.title,
      item.errorMessage || 'Unknown error',
      analysis.type,
      analysis.suggestedAction,
      new Date().toISOString(),
    );
  }

  /**
   * Create and broadcast alert
   */
  createAlert(alert: {
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
   * Broadcast arr status update
   */
  broadcastStatus(
    appName: string,
    healthy: boolean,
    queue: {
      total: number;
      downloading: number;
      failed: number;
      completed: number;
    },
  ): void {
    this.io.to('arr').emit('arr:status', {
      app: appName,
      healthy,
      queue,
    });
  }
}

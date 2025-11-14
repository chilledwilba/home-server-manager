import type Database from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('arr-metrics-calculator');

/**
 * Arr Metrics Calculator
 * Calculates performance metrics and generates optimization suggestions
 */
export class ArrMetricsCalculator {
  constructor(private db: Database.Database) {}

  /**
   * Calculate performance metrics for an app
   */
  async calculatePerformanceMetrics(appName: string): Promise<void> {
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
        .get(appName) as
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

      stmt.run(appName, successRate, stats.avg_queue_size, stats.max_queue_size, new Date());

      logger.debug(
        {
          app: appName,
          successRate,
          avgQueueSize: stats.avg_queue_size,
        },
        'Performance metrics calculated',
      );
    } catch (error) {
      logger.error({ err: error, app: appName }, 'Performance calculation failed');
    }
  }

  /**
   * Get optimization suggestions for an app
   */
  getOptimizationSuggestions(
    appName: string,
    appType: 'sonarr' | 'radarr' | 'prowlarr' | 'lidarr' | 'readarr' | 'bazarr',
  ): string[] {
    const suggestions: string[] = [];

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
    if (appType === 'sonarr' || appType === 'radarr') {
      suggestions.push('Enable recycling bin for safer deletions');
      suggestions.push('Configure quality profiles for optimal file sizes');
    }

    if (appType === 'prowlarr') {
      suggestions.push('Add multiple indexers for redundancy');
      suggestions.push('Configure indexer priorities');
    }

    return suggestions;
  }
}

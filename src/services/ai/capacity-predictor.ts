import type Database from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';
import type { StatisticalUtils } from './statistical-utils.js';

const logger = createLogger('capacity-predictor');

export interface CapacityPrediction {
  resource: string;
  current_usage: number;
  current_usage_percent: number;
  growth_rate_per_day: number;
  predicted_full_date: string | null;
  days_until_full: number | null;
  confidence: number;
  recommendations: string[];
  trend_analysis: string;
}

/**
 * Capacity Predictor
 * Predicts when resources will reach capacity
 */
export class CapacityPredictor {
  constructor(
    private db: Database.Database,
    private stats: StatisticalUtils,
  ) {}

  /**
   * Predict resource capacity
   */
  predictCapacity(resource: string): CapacityPrediction | null {
    try {
      if (resource === 'storage') {
        return this.predictStorageCapacity();
      } else if (resource === 'memory') {
        return this.predictMemoryCapacity();
      } else if (resource === 'swap') {
        return this.predictSwapCapacity();
      }
    } catch (error) {
      logger.error({ err: error, resource }, 'Failed to predict capacity');
    }
    return null;
  }

  private predictStorageCapacity(): CapacityPrediction | null {
    // Get storage growth over last 30 days
    const dataPoints = this.db
      .prepare(
        `SELECT timestamp, SUM(used_bytes) as total_used, SUM(total_bytes) as total_capacity
        FROM pool_metrics
        WHERE timestamp > datetime('now', '-30 days')
        GROUP BY DATE(timestamp)
        ORDER BY timestamp ASC`,
      )
      .all() as Array<{ timestamp: string; total_used: number; total_capacity: number }>;

    if (dataPoints.length < 7) return null; // Need at least a week of data

    // Calculate linear regression for growth rate
    const growthRate = this.stats.calculateLinearGrowthRate(
      dataPoints.map((dp, idx) => ({ x: idx, y: dp.total_used })),
    );

    const latest = dataPoints[dataPoints.length - 1];
    if (!latest) return null;
    const currentUsagePercent = (latest.total_used / latest.total_capacity) * 100;
    const bytesRemaining = latest.total_capacity - latest.total_used;
    const daysUntilFull = growthRate > 0 ? Math.floor(bytesRemaining / growthRate) : null;

    let trendAnalysis = `Storage is currently ${currentUsagePercent.toFixed(1)}% full.`;
    if (daysUntilFull && daysUntilFull < 90) {
      trendAnalysis += ` At current growth rate, storage will be full in approximately ${daysUntilFull} days.`;
    } else if (growthRate <= 0) {
      trendAnalysis += ' Storage usage is stable or decreasing.';
    } else {
      trendAnalysis += ' Storage capacity is healthy.';
    }

    const recommendations: string[] = [];
    if (daysUntilFull && daysUntilFull < 90) {
      recommendations.push('Plan storage expansion or data cleanup within the next 60 days');
      recommendations.push('Review and delete old snapshots');
      recommendations.push('Identify large files that can be archived or deleted');
    }

    return {
      resource: 'storage',
      current_usage: latest.total_used,
      current_usage_percent: currentUsagePercent,
      growth_rate_per_day: growthRate,
      predicted_full_date: daysUntilFull
        ? new Date(Date.now() + daysUntilFull * 24 * 60 * 60 * 1000).toISOString()
        : null,
      days_until_full: daysUntilFull,
      confidence: dataPoints.length >= 30 ? 0.9 : 0.7,
      recommendations,
      trend_analysis: trendAnalysis,
    };
  }

  private predictMemoryCapacity(): CapacityPrediction | null {
    const dataPoints = this.db
      .prepare(
        `SELECT timestamp, AVG(ram_percent) as avg_percent
        FROM metrics
        WHERE timestamp > datetime('now', '-30 days')
        GROUP BY DATE(timestamp)
        ORDER BY timestamp ASC`,
      )
      .all() as Array<{ timestamp: string; avg_percent: number }>;

    if (dataPoints.length < 7) return null;

    const growthRate = this.stats.calculateLinearGrowthRate(
      dataPoints.map((dp, idx) => ({ x: idx, y: dp.avg_percent })),
    );

    const latest = dataPoints[dataPoints.length - 1];
    if (!latest) return null;
    const percentRemaining = 100 - latest.avg_percent;
    const daysUntilFull = growthRate > 0 ? Math.floor(percentRemaining / growthRate) : null;

    let trendAnalysis = `Average memory usage is ${latest.avg_percent.toFixed(1)}%.`;
    if (daysUntilFull && daysUntilFull < 90) {
      trendAnalysis += ` Memory usage is trending upward.`;
    }

    const recommendations: string[] = [];
    if (latest.avg_percent > 80) {
      recommendations.push('Consider upgrading RAM or reducing container memory limits');
      recommendations.push('Review container memory usage patterns');
    }

    return {
      resource: 'memory',
      current_usage: latest.avg_percent,
      current_usage_percent: latest.avg_percent,
      growth_rate_per_day: growthRate,
      predicted_full_date: daysUntilFull
        ? new Date(Date.now() + daysUntilFull * 24 * 60 * 60 * 1000).toISOString()
        : null,
      days_until_full: daysUntilFull,
      confidence: 0.6,
      recommendations,
      trend_analysis: trendAnalysis,
    };
  }

  private predictSwapCapacity(): CapacityPrediction | null {
    // Similar to memory but for swap usage (if tracked)
    // Placeholder for now
    return null;
  }
}

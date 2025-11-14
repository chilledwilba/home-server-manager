import type Database from 'better-sqlite3';

/**
 * Statistical Utilities
 * Provides statistical calculation functions for AI insights
 */
export class StatisticalUtils {
  constructor(private db: Database.Database) {}

  /**
   * Calculate standard deviation for a column
   */
  calculateStdDev(table: string, column: string, cutoffTime: string): number {
    const data = this.db
      .prepare(
        `SELECT ${column} as value FROM ${table} WHERE timestamp > ? AND ${column} IS NOT NULL`,
      )
      .all(cutoffTime) as Array<{ value: number }>;

    if (data.length === 0) return 0;

    const mean = data.reduce((sum, d) => sum + d.value, 0) / data.length;
    const variance = data.reduce((sum, d) => sum + Math.pow(d.value - mean, 2), 0) / data.length;

    return Math.sqrt(variance);
  }

  /**
   * Calculate linear growth rate using linear regression
   */
  calculateLinearGrowthRate(dataPoints: Array<{ x: number; y: number }>): number {
    const n = dataPoints.length;
    if (n < 2) return 0;

    const sumX = dataPoints.reduce((sum, dp) => sum + dp.x, 0);
    const sumY = dataPoints.reduce((sum, dp) => sum + dp.y, 0);
    const sumXY = dataPoints.reduce((sum, dp) => sum + dp.x * dp.y, 0);
    const sumX2 = dataPoints.reduce((sum, dp) => sum + dp.x * dp.x, 0);

    // Slope of linear regression
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    return slope;
  }

  /**
   * Get maximum severity from array of severities
   */
  getMaxSeverity(
    severities: Array<'low' | 'medium' | 'high' | 'critical'>,
  ): 'info' | 'low' | 'medium' | 'high' | 'critical' {
    if (severities.includes('critical')) return 'critical';
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    if (severities.includes('low')) return 'low';
    return 'info';
  }
}

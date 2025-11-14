import type Database from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';
import type { StatisticalUtils } from './statistical-utils.js';

const logger = createLogger('performance-analyzer');

export interface PerformanceTrend {
  metric: string;
  period_days: number;
  trend: 'improving' | 'stable' | 'degrading' | 'volatile';
  average_value: number;
  min_value: number;
  max_value: number;
  std_deviation: number;
  variance: number;
  change_percent: number;
  analysis: string;
  recommendations: string[];
}

/**
 * Performance Analyzer
 * Analyzes performance trends over time
 */
export class PerformanceAnalyzer {
  constructor(
    private db: Database.Database,
    private stats: StatisticalUtils,
  ) {}

  /**
   * Analyze performance trends
   */
  analyzeTrends(periodDays: number = 30): PerformanceTrend[] {
    logger.info(`Analyzing performance trends over ${periodDays} days...`);

    const trends: PerformanceTrend[] = [];
    const cutoffTime = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    // Analyze CPU performance trend
    const cpuTrend = this.analyzeCPUTrend(cutoffTime, periodDays);
    if (cpuTrend) trends.push(cpuTrend);

    // Analyze memory performance trend
    const memoryTrend = this.analyzeMemoryTrend(cutoffTime, periodDays);
    if (memoryTrend) trends.push(memoryTrend);

    // Analyze storage performance trend
    const storageTrend = this.analyzeStorageTrend(cutoffTime, periodDays);
    if (storageTrend) trends.push(storageTrend);

    // Analyze disk temperature trends
    const diskTempTrend = this.analyzeDiskTemperatureTrend(cutoffTime, periodDays);
    if (diskTempTrend) trends.push(diskTempTrend);

    return trends;
  }

  private analyzeCPUTrend(cutoffTime: string, periodDays: number): PerformanceTrend | null {
    const stats = this.db
      .prepare(
        `SELECT
          AVG(cpu_percent) as avg,
          MIN(cpu_percent) as min,
          MAX(cpu_percent) as max
        FROM metrics
        WHERE timestamp > ?`,
      )
      .get(cutoffTime) as { avg: number; min: number; max: number } | undefined;

    if (!stats) return null;

    const stdDev = this.stats.calculateStdDev('metrics', 'cpu_percent', cutoffTime);
    const variance = Math.pow(stdDev, 2);

    // Get first and last week averages to determine trend
    const firstWeek = this.db
      .prepare(
        `SELECT AVG(cpu_percent) as avg
        FROM metrics
        WHERE timestamp BETWEEN ? AND datetime(?, '+7 days')`,
      )
      .get(cutoffTime, cutoffTime) as { avg: number } | undefined;

    const lastWeek = this.db
      .prepare(
        `SELECT AVG(cpu_percent) as avg
        FROM metrics
        WHERE timestamp > datetime('now', '-7 days')`,
      )
      .get() as { avg: number } | undefined;

    let trend: PerformanceTrend['trend'] = 'stable';
    let changePercent = 0;

    if (firstWeek && lastWeek) {
      changePercent = ((lastWeek.avg - firstWeek.avg) / firstWeek.avg) * 100;
      if (stdDev / stats.avg > 0.5) {
        trend = 'volatile';
      } else if (changePercent > 20) {
        trend = 'degrading';
      } else if (changePercent < -20) {
        trend = 'improving';
      }
    }

    const recommendations: string[] = [];
    if (trend === 'degrading') {
      recommendations.push('Investigate processes causing increased CPU usage');
      recommendations.push('Consider upgrading CPU or optimizing workloads');
    } else if (trend === 'volatile') {
      recommendations.push('Investigate causes of CPU usage spikes');
      recommendations.push('Consider implementing CPU limits on containers');
    }

    return {
      metric: 'CPU Usage',
      period_days: periodDays,
      trend,
      average_value: stats.avg,
      min_value: stats.min,
      max_value: stats.max,
      std_deviation: stdDev,
      variance,
      change_percent: changePercent,
      analysis: `CPU usage has ${trend === 'degrading' ? 'increased' : trend === 'improving' ? 'decreased' : 'remained stable'} over the last ${periodDays} days.`,
      recommendations,
    };
  }

  private analyzeMemoryTrend(cutoffTime: string, periodDays: number): PerformanceTrend | null {
    const stats = this.db
      .prepare(
        `SELECT
          AVG(ram_percent) as avg,
          MIN(ram_percent) as min,
          MAX(ram_percent) as max
        FROM metrics
        WHERE timestamp > ?`,
      )
      .get(cutoffTime) as { avg: number; min: number; max: number } | undefined;

    if (!stats) return null;

    const stdDev = this.stats.calculateStdDev('metrics', 'ram_percent', cutoffTime);
    const variance = Math.pow(stdDev, 2);

    return {
      metric: 'Memory Usage',
      period_days: periodDays,
      trend: stats.avg > 80 ? 'degrading' : 'stable',
      average_value: stats.avg,
      min_value: stats.min,
      max_value: stats.max,
      std_deviation: stdDev,
      variance,
      change_percent: 0,
      analysis: `Average memory usage is ${stats.avg.toFixed(1)}% over the last ${periodDays} days.`,
      recommendations:
        stats.avg > 80 ? ['Consider adding more RAM', 'Review container memory limits'] : [],
    };
  }

  private analyzeStorageTrend(cutoffTime: string, periodDays: number): PerformanceTrend | null {
    const stats = this.db
      .prepare(
        `SELECT
          AVG(percent_used) as avg,
          MIN(percent_used) as min,
          MAX(percent_used) as max
        FROM pool_metrics
        WHERE timestamp > ?`,
      )
      .get(cutoffTime) as { avg: number; min: number; max: number } | undefined;

    if (!stats) return null;

    const stdDev = this.stats.calculateStdDev('pool_metrics', 'percent_used', cutoffTime);

    return {
      metric: 'Storage Usage',
      period_days: periodDays,
      trend: stats.max > 85 ? 'degrading' : 'stable',
      average_value: stats.avg,
      min_value: stats.min,
      max_value: stats.max,
      std_deviation: stdDev,
      variance: Math.pow(stdDev, 2),
      change_percent: 0,
      analysis: `Storage pools are ${stats.avg.toFixed(1)}% full on average.`,
      recommendations:
        stats.max > 85
          ? ['Plan storage expansion', 'Delete old snapshots', 'Archive unused data']
          : [],
    };
  }

  private analyzeDiskTemperatureTrend(
    cutoffTime: string,
    periodDays: number,
  ): PerformanceTrend | null {
    const stats = this.db
      .prepare(
        `SELECT
          AVG(temperature) as avg,
          MIN(temperature) as min,
          MAX(temperature) as max
        FROM smart_metrics
        WHERE timestamp > ? AND temperature IS NOT NULL`,
      )
      .get(cutoffTime) as
      | { avg: number | null; min: number | null; max: number | null }
      | undefined;

    if (!stats || stats.avg === null || stats.min === null || stats.max === null) return null;

    return {
      metric: 'Disk Temperature',
      period_days: periodDays,
      trend: stats.avg > 45 ? 'degrading' : 'stable',
      average_value: stats.avg,
      min_value: stats.min,
      max_value: stats.max,
      std_deviation: 0,
      variance: 0,
      change_percent: 0,
      analysis: `Average disk temperature is ${stats.avg.toFixed(1)}°C.`,
      recommendations:
        stats.avg > 45
          ? ['Improve case airflow', 'Add additional case fans', 'Check ambient temperature']
          : [],
    };
  }
}

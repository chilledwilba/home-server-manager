import type Database from 'better-sqlite3';
import type { StatisticalUtils } from './statistical-utils.js';

export interface AnomalyDetection {
  detected: boolean;
  anomalies: Array<{
    metric: string;
    type: 'spike' | 'drop' | 'trend' | 'pattern';
    severity: 'low' | 'medium' | 'high' | 'critical';
    current_value: number;
    expected_value: number;
    deviation_percent: number;
    description: string;
    recommendation: string;
  }>;
  summary: string;
  timestamp: string;
}

/**
 * Anomaly Detector
 * Detects anomalies in system metrics using statistical analysis
 */
export class AnomalyDetector {
  constructor(
    private db: Database.Database,
    private stats: StatisticalUtils,
  ) {}

  /**
   * Detect anomalies in system metrics
   */
  detectAnomalies(lookbackHours: number = 24): AnomalyDetection['anomalies'] {
    const anomalies: AnomalyDetection['anomalies'] = [];
    const cutoffTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

    // Analyze CPU usage
    const cpuAnomaly = this.analyzeCPUAnomaly(cutoffTime);
    if (cpuAnomaly) anomalies.push(cpuAnomaly);

    // Analyze memory usage
    const memoryAnomaly = this.analyzeMemoryAnomaly(cutoffTime);
    if (memoryAnomaly) anomalies.push(memoryAnomaly);

    // Analyze pool capacity
    const poolAnomaly = this.analyzePoolAnomaly(cutoffTime);
    if (poolAnomaly) anomalies.push(poolAnomaly);

    // Analyze disk health
    const diskAnomaly = this.analyzeDiskAnomaly(cutoffTime);
    if (diskAnomaly) anomalies.push(diskAnomaly);

    return anomalies;
  }

  private analyzeCPUAnomaly(cutoffTime: string): AnomalyDetection['anomalies'][0] | null {
    const stats = this.db
      .prepare(
        `SELECT AVG(cpu_percent) as avg, MAX(cpu_percent) as max, MIN(cpu_percent) as min
        FROM metrics
        WHERE timestamp > ?`,
      )
      .get(cutoffTime) as { avg: number; max: number; min: number } | undefined;

    if (!stats || !stats.avg) return null;

    const stdDev = this.stats.calculateStdDev('metrics', 'cpu_percent', cutoffTime);
    const latest = this.db
      .prepare('SELECT cpu_percent FROM metrics ORDER BY timestamp DESC LIMIT 1')
      .get() as { cpu_percent: number } | undefined;

    if (!latest) return null;

    const zScore = (latest.cpu_percent - stats.avg) / stdDev;

    // Detect if current value is more than 2 standard deviations from mean
    if (Math.abs(zScore) > 2) {
      const deviation = ((latest.cpu_percent - stats.avg) / stats.avg) * 100;
      return {
        metric: 'CPU Usage',
        type: latest.cpu_percent > stats.avg ? 'spike' : 'drop',
        severity: Math.abs(zScore) > 3 ? 'high' : 'medium',
        current_value: latest.cpu_percent,
        expected_value: stats.avg,
        deviation_percent: Math.abs(deviation),
        description: `CPU usage is ${latest.cpu_percent.toFixed(1)}% (expected ~${stats.avg.toFixed(1)}%)`,
        recommendation:
          latest.cpu_percent > stats.avg
            ? 'Investigate high CPU processes with htop or docker stats'
            : 'Review system logs for unexpected shutdowns or service failures',
      };
    }

    return null;
  }

  private analyzeMemoryAnomaly(cutoffTime: string): AnomalyDetection['anomalies'][0] | null {
    const stats = this.db
      .prepare(
        `SELECT AVG(ram_percent) as avg, MAX(ram_percent) as max, MIN(ram_percent) as min
        FROM metrics
        WHERE timestamp > ?`,
      )
      .get(cutoffTime) as { avg: number; max: number; min: number } | undefined;

    if (!stats || !stats.avg) return null;

    const latest = this.db
      .prepare('SELECT ram_percent, ram_used_gb FROM metrics ORDER BY timestamp DESC LIMIT 1')
      .get() as { ram_percent: number; ram_used_gb: number } | undefined;

    if (!latest) return null;

    // Alert if memory usage is above 90%
    if (latest.ram_percent > 90) {
      return {
        metric: 'Memory Usage',
        type: 'spike',
        severity: latest.ram_percent > 95 ? 'critical' : 'high',
        current_value: latest.ram_percent,
        expected_value: stats.avg,
        deviation_percent: ((latest.ram_percent - stats.avg) / stats.avg) * 100,
        description: `Memory usage is critically high at ${latest.ram_percent.toFixed(1)}% (${latest.ram_used_gb.toFixed(1)}GB)`,
        recommendation:
          'Review container memory limits, consider stopping unused containers, or add more RAM',
      };
    }

    return null;
  }

  private analyzePoolAnomaly(cutoffTime: string): AnomalyDetection['anomalies'][0] | null {
    const criticalPools = this.db
      .prepare(
        `SELECT pool_name, percent_used, used_bytes, total_bytes
        FROM pool_metrics
        WHERE timestamp > ? AND percent_used > 85
        ORDER BY percent_used DESC
        LIMIT 1`,
      )
      .get(cutoffTime) as
      | { pool_name: string; percent_used: number; used_bytes: number; total_bytes: number }
      | undefined;

    if (!criticalPools) return null;

    return {
      metric: 'Pool Capacity',
      type: 'trend',
      severity: criticalPools.percent_used > 95 ? 'critical' : 'high',
      current_value: criticalPools.percent_used,
      expected_value: 75,
      deviation_percent: ((criticalPools.percent_used - 75) / 75) * 100,
      description: `Pool "${criticalPools.pool_name}" is ${criticalPools.percent_used.toFixed(1)}% full`,
      recommendation:
        'Delete old snapshots, move data to another pool, or add more storage capacity',
    };
  }

  private analyzeDiskAnomaly(cutoffTime: string): AnomalyDetection['anomalies'][0] | null {
    const badDisks = this.db
      .prepare(
        `SELECT disk_name, reallocated_sectors, pending_sectors, temperature
        FROM smart_metrics
        WHERE timestamp > ? AND (reallocated_sectors > 10 OR pending_sectors > 5 OR temperature > 55)
        ORDER BY reallocated_sectors DESC
        LIMIT 1`,
      )
      .get(cutoffTime) as
      | {
          disk_name: string;
          reallocated_sectors: number;
          pending_sectors: number;
          temperature: number;
        }
      | undefined;

    if (!badDisks) return null;

    return {
      metric: 'Disk Health',
      type: 'pattern',
      severity:
        badDisks.reallocated_sectors > 50 || badDisks.pending_sectors > 20 ? 'critical' : 'high',
      current_value: badDisks.reallocated_sectors,
      expected_value: 0,
      deviation_percent: 100,
      description: `Disk "${badDisks.disk_name}" has ${badDisks.reallocated_sectors} reallocated sectors and ${badDisks.pending_sectors} pending sectors`,
      recommendation:
        'Order replacement disk immediately, backup critical data, prepare for disk failure',
    };
  }
}

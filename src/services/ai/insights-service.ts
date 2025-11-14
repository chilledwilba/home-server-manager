import type Database from 'better-sqlite3';
import { OllamaClient } from '../../integrations/ollama/client.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ai-insights');

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

export interface CostOptimization {
  current_state: {
    total_storage_tb: number;
    active_containers: number;
    estimated_power_watts: number;
    estimated_monthly_cost_usd: number;
  };
  opportunities: Array<{
    category: 'storage' | 'compute' | 'power' | 'network';
    title: string;
    description: string;
    potential_savings_usd: number;
    difficulty: 'easy' | 'medium' | 'hard';
    implementation_steps: string[];
  }>;
  total_potential_savings_usd: number;
  ai_analysis: string;
}

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

export interface AIInsight {
  id: string;
  type: 'anomaly' | 'capacity' | 'cost' | 'performance' | 'general';
  title: string;
  summary: string;
  details: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  actionable: boolean;
  actions: string[];
  generated_at: string;
  expires_at: string | null;
}

export class AIInsightsService {
  private db: Database.Database;
  private ollama: OllamaClient | null = null;
  private ollamaEnabled: boolean = false;

  constructor(
    db: Database.Database,
    ollamaConfig?: {
      host: string;
      port: number;
      model: string;
    },
  ) {
    this.db = db;

    if (ollamaConfig) {
      this.ollama = new OllamaClient(ollamaConfig);
      this.ollamaEnabled = true;
    }
  }

  /**
   * Initialize AI insights tables in database
   */
  initializeTables(): void {
    logger.info('Initializing AI insights tables...');

    // AI insights cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_insights (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        details TEXT NOT NULL,
        severity TEXT NOT NULL,
        actionable INTEGER DEFAULT 0,
        actions TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        dismissed INTEGER DEFAULT 0
      )
    `);

    // Anomaly detection history
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS anomaly_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric TEXT NOT NULL,
        anomaly_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        current_value REAL NOT NULL,
        expected_value REAL NOT NULL,
        deviation_percent REAL NOT NULL,
        description TEXT,
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Capacity predictions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS capacity_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource TEXT NOT NULL,
        current_usage REAL NOT NULL,
        growth_rate REAL NOT NULL,
        predicted_full_date TEXT,
        days_until_full INTEGER,
        confidence REAL NOT NULL,
        predicted_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(type);
      CREATE INDEX IF NOT EXISTS idx_ai_insights_severity ON ai_insights(severity);
      CREATE INDEX IF NOT EXISTS idx_ai_insights_generated ON ai_insights(generated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_anomaly_metric ON anomaly_history(metric);
      CREATE INDEX IF NOT EXISTS idx_anomaly_detected ON anomaly_history(detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_capacity_resource ON capacity_predictions(resource);
    `);

    logger.info('✓ AI insights tables initialized');
  }

  /**
   * Detect anomalies in system metrics using statistical analysis and AI
   */
  async detectAnomalies(lookbackHours: number = 24): Promise<AnomalyDetection> {
    logger.info(`Detecting anomalies in last ${lookbackHours} hours...`);

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

    // Store anomalies in database
    for (const anomaly of anomalies) {
      this.db
        .prepare(
          `
        INSERT INTO anomaly_history (metric, anomaly_type, severity, current_value, expected_value, deviation_percent, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          anomaly.metric,
          anomaly.type,
          anomaly.severity,
          anomaly.current_value,
          anomaly.expected_value,
          anomaly.deviation_percent,
          anomaly.description,
        );
    }

    // Get AI analysis if Ollama is available
    let aiSummary = `Detected ${anomalies.length} anomalies in system metrics.`;

    if (this.ollamaEnabled && this.ollama && anomalies.length > 0) {
      try {
        const isAvailable = await this.ollama.isAvailable();
        if (isAvailable) {
          aiSummary = await this.getAIAnomalyAnalysis(anomalies);
        }
      } catch (error) {
        logger.warn({ err: error }, 'Failed to get AI analysis for anomalies');
      }
    }

    return {
      detected: anomalies.length > 0,
      anomalies,
      summary: aiSummary,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Predict when resources will reach capacity
   */
  async predictCapacity(resource?: string): Promise<CapacityPrediction[]> {
    logger.info('Generating capacity predictions...');

    const predictions: CapacityPrediction[] = [];
    const resources = resource ? [resource] : ['storage', 'memory', 'swap'];

    for (const res of resources) {
      const prediction = this.predictResourceCapacity(res);
      if (prediction) {
        predictions.push(prediction);

        // Store in database
        this.db
          .prepare(
            `
          INSERT INTO capacity_predictions (resource, current_usage, growth_rate, predicted_full_date, days_until_full, confidence)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          )
          .run(
            prediction.resource,
            prediction.current_usage,
            prediction.growth_rate_per_day,
            prediction.predicted_full_date,
            prediction.days_until_full,
            prediction.confidence,
          );
      }
    }

    return predictions;
  }

  /**
   * Generate cost optimization recommendations
   */
  async generateCostOptimizations(): Promise<CostOptimization> {
    logger.info('Generating cost optimization recommendations...');

    // Get current system state
    const currentState = this.getCurrentSystemState();

    // Identify optimization opportunities
    const opportunities: CostOptimization['opportunities'] = [];

    // Storage optimizations
    const storageOps = this.identifyStorageOptimizations(currentState);
    opportunities.push(...storageOps);

    // Compute optimizations
    const computeOps = this.identifyComputeOptimizations(currentState);
    opportunities.push(...computeOps);

    // Power optimizations
    const powerOps = this.identifyPowerOptimizations(currentState);
    opportunities.push(...powerOps);

    // Calculate total savings
    const totalSavings = opportunities.reduce((sum, op) => sum + op.potential_savings_usd, 0);

    // Get AI analysis
    let aiAnalysis = 'Review the optimization opportunities above.';

    if (this.ollamaEnabled && this.ollama && opportunities.length > 0) {
      try {
        const isAvailable = await this.ollama.isAvailable();
        if (isAvailable) {
          aiAnalysis = await this.getAICostAnalysis(currentState, opportunities);
        }
      } catch (error) {
        logger.warn({ err: error }, 'Failed to get AI cost analysis');
      }
    }

    return {
      current_state: currentState,
      opportunities,
      total_potential_savings_usd: totalSavings,
      ai_analysis: aiAnalysis,
    };
  }

  /**
   * Analyze performance trends over time
   */
  analyzePerformanceTrends(periodDays: number = 30): PerformanceTrend[] {
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

  /**
   * Generate comprehensive AI insights
   */
  async generateInsights(): Promise<AIInsight[]> {
    logger.info('Generating comprehensive AI insights...');

    const insights: AIInsight[] = [];

    try {
      // Detect anomalies
      const anomalies = await this.detectAnomalies(24);
      if (anomalies.detected) {
        insights.push({
          id: `anomaly-${Date.now()}`,
          type: 'anomaly',
          title: 'Anomalies Detected',
          summary: anomalies.summary,
          details: JSON.stringify(anomalies.anomalies, null, 2),
          severity: this.getMaxSeverity(anomalies.anomalies.map((a) => a.severity)),
          actionable: true,
          actions: anomalies.anomalies.map((a) => a.recommendation),
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // Capacity predictions
      const capacityPredictions = await this.predictCapacity();
      for (const prediction of capacityPredictions) {
        if (prediction.days_until_full && prediction.days_until_full < 90) {
          insights.push({
            id: `capacity-${prediction.resource}-${Date.now()}`,
            type: 'capacity',
            title: `${prediction.resource} Capacity Warning`,
            summary: prediction.trend_analysis,
            details: JSON.stringify(prediction, null, 2),
            severity: prediction.days_until_full < 30 ? 'high' : 'medium',
            actionable: true,
            actions: prediction.recommendations,
            generated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }

      // Cost optimizations
      const costOpt = await this.generateCostOptimizations();
      if (costOpt.opportunities.length > 0 && costOpt.total_potential_savings_usd > 10) {
        insights.push({
          id: `cost-${Date.now()}`,
          type: 'cost',
          title: 'Cost Optimization Opportunities',
          summary: `Potential savings: $${costOpt.total_potential_savings_usd.toFixed(2)}/month`,
          details: costOpt.ai_analysis,
          severity: 'info',
          actionable: true,
          actions: costOpt.opportunities.map((op) => op.title),
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // Performance trends
      const perfTrends = this.analyzePerformanceTrends(30);
      for (const trend of perfTrends) {
        if (trend.trend === 'degrading') {
          insights.push({
            id: `perf-${trend.metric}-${Date.now()}`,
            type: 'performance',
            title: `Performance Degradation: ${trend.metric}`,
            summary: trend.analysis,
            details: JSON.stringify(trend, null, 2),
            severity: 'medium',
            actionable: trend.recommendations.length > 0,
            actions: trend.recommendations,
            generated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }

      // Store insights in database
      for (const insight of insights) {
        this.db
          .prepare(
            `
          INSERT OR REPLACE INTO ai_insights (id, type, title, summary, details, severity, actionable, actions, generated_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .run(
            insight.id,
            insight.type,
            insight.title,
            insight.summary,
            insight.details,
            insight.severity,
            insight.actionable ? 1 : 0,
            JSON.stringify(insight.actions),
            insight.generated_at,
            insight.expires_at,
          );
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate AI insights');
    }

    return insights;
  }

  // ========== Private Helper Methods ==========

  private analyzeCPUAnomaly(cutoffTime: string): AnomalyDetection['anomalies'][0] | null {
    const stats = this.db
      .prepare(
        `
      SELECT AVG(cpu_percent) as avg, MAX(cpu_percent) as max, MIN(cpu_percent) as min
      FROM metrics
      WHERE timestamp > ?
    `,
      )
      .get(cutoffTime) as { avg: number; max: number; min: number } | undefined;

    if (!stats || !stats.avg) return null;

    const stdDev = this.calculateStdDev('metrics', 'cpu_percent', cutoffTime);
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
        `
      SELECT AVG(ram_percent) as avg, MAX(ram_percent) as max, MIN(ram_percent) as min
      FROM metrics
      WHERE timestamp > ?
    `,
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
        `
      SELECT pool_name, percent_used, used_bytes, total_bytes
      FROM pool_metrics
      WHERE timestamp > ? AND percent_used > 85
      ORDER BY percent_used DESC
      LIMIT 1
    `,
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
        `
      SELECT disk_name, reallocated_sectors, pending_sectors, temperature
      FROM smart_metrics
      WHERE timestamp > ? AND (reallocated_sectors > 10 OR pending_sectors > 5 OR temperature > 55)
      ORDER BY reallocated_sectors DESC
      LIMIT 1
    `,
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

  private predictResourceCapacity(resource: string): CapacityPrediction | null {
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
        `
      SELECT timestamp, SUM(used_bytes) as total_used, SUM(total_bytes) as total_capacity
      FROM pool_metrics
      WHERE timestamp > datetime('now', '-30 days')
      GROUP BY DATE(timestamp)
      ORDER BY timestamp ASC
    `,
      )
      .all() as Array<{ timestamp: string; total_used: number; total_capacity: number }>;

    if (dataPoints.length < 7) return null; // Need at least a week of data

    // Calculate linear regression for growth rate
    const growthRate = this.calculateLinearGrowthRate(
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
        `
      SELECT timestamp, AVG(ram_percent) as avg_percent
      FROM metrics
      WHERE timestamp > datetime('now', '-30 days')
      GROUP BY DATE(timestamp)
      ORDER BY timestamp ASC
    `,
      )
      .all() as Array<{ timestamp: string; avg_percent: number }>;

    if (dataPoints.length < 7) return null;

    const growthRate = this.calculateLinearGrowthRate(
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

  private getCurrentSystemState(): CostOptimization['current_state'] {
    const poolStats = this.db
      .prepare(
        `
      SELECT SUM(total_bytes) as total_storage
      FROM pool_metrics
      WHERE timestamp > datetime('now', '-1 hour')
    `,
      )
      .get() as { total_storage: number } | undefined;

    const containerCount = this.db
      .prepare(
        `
      SELECT COUNT(DISTINCT container_id) as count
      FROM container_metrics
      WHERE timestamp > datetime('now', '-1 hour') AND state = 'running'
    `,
      )
      .get() as { count: number } | undefined;

    const totalStorageTB = poolStats?.total_storage ? poolStats.total_storage / 1024 ** 4 : 0;

    // Rough power estimation (i5-12400 ~65W, 64GB RAM ~20W, disks ~5W each, overhead)
    const estimatedPowerWatts = 65 + 20 + totalStorageTB * 3 * 5 + (containerCount?.count || 0) * 2;

    // Rough monthly cost at $0.12/kWh
    const estimatedMonthlyCost = (estimatedPowerWatts * 24 * 30 * 0.12) / 1000;

    return {
      total_storage_tb: totalStorageTB,
      active_containers: containerCount?.count || 0,
      estimated_power_watts: Math.round(estimatedPowerWatts),
      estimated_monthly_cost_usd: Math.round(estimatedMonthlyCost * 100) / 100,
    };
  }

  private identifyStorageOptimizations(
    _state: CostOptimization['current_state'],
  ): CostOptimization['opportunities'] {
    const opportunities: CostOptimization['opportunities'] = [];

    // Check for excessive snapshots
    const snapshotCount = this.db
      .prepare("SELECT COUNT(*) as count FROM alerts WHERE type = 'snapshot'")
      .get() as { count: number } | undefined;

    if (snapshotCount && snapshotCount.count > 50) {
      opportunities.push({
        category: 'storage',
        title: 'Reduce snapshot retention',
        description: `You have ${snapshotCount.count} snapshots. Consider implementing automated snapshot cleanup.`,
        potential_savings_usd: 0, // Storage is already purchased
        difficulty: 'easy',
        implementation_steps: [
          'Review snapshot policy in TrueNAS',
          'Delete snapshots older than 30 days',
          'Set up automated snapshot rotation',
        ],
      });
    }

    return opportunities;
  }

  private identifyComputeOptimizations(
    _state: CostOptimization['current_state'],
  ): CostOptimization['opportunities'] {
    const opportunities: CostOptimization['opportunities'] = [];

    // Check for idle containers
    const idleContainers = this.db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM container_metrics
      WHERE timestamp > datetime('now', '-24 hours')
      AND state = 'running'
      AND cpu_percent < 1
      GROUP BY container_id
      HAVING COUNT(*) > 20
    `,
      )
      .get() as { count: number } | undefined;

    if (idleContainers && idleContainers.count > 3) {
      opportunities.push({
        category: 'compute',
        title: 'Stop idle containers',
        description: `${idleContainers.count} containers have been idle for 24+ hours.`,
        potential_savings_usd: Math.round(idleContainers.count * 0.5 * 100) / 100,
        difficulty: 'easy',
        implementation_steps: [
          'Review idle containers with docker ps',
          'Stop non-essential containers',
          'Consider using container orchestration with auto-scaling',
        ],
      });
    }

    return opportunities;
  }

  private identifyPowerOptimizations(
    state: CostOptimization['current_state'],
  ): CostOptimization['opportunities'] {
    const opportunities: CostOptimization['opportunities'] = [];

    // Check CPU usage patterns
    const avgCPU = this.db
      .prepare(
        `
      SELECT AVG(cpu_percent) as avg
      FROM metrics
      WHERE timestamp > datetime('now', '-7 days')
    `,
      )
      .get() as { avg: number | null } | undefined;

    if (avgCPU && avgCPU.avg !== null && avgCPU.avg < 20) {
      opportunities.push({
        category: 'power',
        title: 'Enable CPU power saving features',
        description: `Average CPU usage is only ${avgCPU.avg.toFixed(1)}%. Enable power saving modes.`,
        potential_savings_usd: Math.round(state.estimated_monthly_cost_usd * 0.15 * 100) / 100,
        difficulty: 'medium',
        implementation_steps: [
          'Enable Intel SpeedStep in BIOS',
          'Set CPU governor to "powersave" for non-critical workloads',
          'Consider consolidating workloads to fewer cores',
        ],
      });
    }

    return opportunities;
  }

  private analyzeCPUTrend(cutoffTime: string, periodDays: number): PerformanceTrend | null {
    const stats = this.db
      .prepare(
        `
      SELECT
        AVG(cpu_percent) as avg,
        MIN(cpu_percent) as min,
        MAX(cpu_percent) as max
      FROM metrics
      WHERE timestamp > ?
    `,
      )
      .get(cutoffTime) as { avg: number; min: number; max: number } | undefined;

    if (!stats) return null;

    const stdDev = this.calculateStdDev('metrics', 'cpu_percent', cutoffTime);
    const variance = Math.pow(stdDev, 2);

    // Get first and last week averages to determine trend
    const firstWeek = this.db
      .prepare(
        `
      SELECT AVG(cpu_percent) as avg
      FROM metrics
      WHERE timestamp BETWEEN ? AND datetime(?, '+7 days')
    `,
      )
      .get(cutoffTime, cutoffTime) as { avg: number } | undefined;

    const lastWeek = this.db
      .prepare(
        `
      SELECT AVG(cpu_percent) as avg
      FROM metrics
      WHERE timestamp > datetime('now', '-7 days')
    `,
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
        `
      SELECT
        AVG(ram_percent) as avg,
        MIN(ram_percent) as min,
        MAX(ram_percent) as max
      FROM metrics
      WHERE timestamp > ?
    `,
      )
      .get(cutoffTime) as { avg: number; min: number; max: number } | undefined;

    if (!stats) return null;

    const stdDev = this.calculateStdDev('metrics', 'ram_percent', cutoffTime);
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
        `
      SELECT
        AVG(percent_used) as avg,
        MIN(percent_used) as min,
        MAX(percent_used) as max
      FROM pool_metrics
      WHERE timestamp > ?
    `,
      )
      .get(cutoffTime) as { avg: number; min: number; max: number } | undefined;

    if (!stats) return null;

    const stdDev = this.calculateStdDev('pool_metrics', 'percent_used', cutoffTime);

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
        `
      SELECT
        AVG(temperature) as avg,
        MIN(temperature) as min,
        MAX(temperature) as max
      FROM smart_metrics
      WHERE timestamp > ? AND temperature IS NOT NULL
    `,
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

  private async getAIAnomalyAnalysis(anomalies: AnomalyDetection['anomalies']): Promise<string> {
    if (!this.ollama) return 'AI analysis unavailable';

    const prompt = `Analyze these system anomalies and provide a concise summary:

${JSON.stringify(anomalies, null, 2)}

Provide:
1. Overall severity assessment
2. Most critical issues
3. Prioritized action plan (max 3 steps)

Be concise and actionable.`;

    try {
      const response = await this.ollama.chat([
        {
          role: 'system',
          content: 'You are an expert system administrator analyzing server anomalies.',
        },
        { role: 'user', content: prompt },
      ]);

      return response;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get AI anomaly analysis');
      return `Detected ${anomalies.length} anomalies. Review recommendations for each.`;
    }
  }

  private async getAICostAnalysis(
    state: CostOptimization['current_state'],
    opportunities: CostOptimization['opportunities'],
  ): Promise<string> {
    if (!this.ollama) return 'AI analysis unavailable';

    const prompt = `Analyze these cost optimization opportunities:

Current State:
${JSON.stringify(state, null, 2)}

Opportunities:
${JSON.stringify(opportunities, null, 2)}

Provide:
1. Top 3 highest impact optimizations
2. Implementation priority
3. Estimated ROI timeline

Be specific and actionable.`;

    try {
      const response = await this.ollama.chat([
        {
          role: 'system',
          content: 'You are a cost optimization expert for home lab infrastructure.',
        },
        { role: 'user', content: prompt },
      ]);

      return response;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get AI cost analysis');
      return 'Review the optimization opportunities above.';
    }
  }

  private calculateStdDev(table: string, column: string, cutoffTime: string): number {
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

  private calculateLinearGrowthRate(dataPoints: Array<{ x: number; y: number }>): number {
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

  private getMaxSeverity(
    severities: Array<'low' | 'medium' | 'high' | 'critical'>,
  ): 'info' | 'low' | 'medium' | 'high' | 'critical' {
    if (severities.includes('critical')) return 'critical';
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    if (severities.includes('low')) return 'low';
    return 'info';
  }
}

import type Database from 'better-sqlite3';
import { OllamaClient } from '../../integrations/ollama/client.js';
import { createLogger } from '../../utils/logger.js';
import { StatisticalUtils } from './statistical-utils.js';
import { InsightsPersistence } from './insights-persistence.js';
import { AIAnalysis } from './ai-analysis.js';
import { AnomalyDetector, type AnomalyDetection } from './anomaly-detector.js';
import { CapacityPredictor, type CapacityPrediction } from './capacity-predictor.js';
import { CostOptimizer, type CostOptimization } from './cost-optimizer.js';
import { PerformanceAnalyzer, type PerformanceTrend } from './performance-analyzer.js';

const logger = createLogger('ai-insights');

export type { AnomalyDetection, CapacityPrediction, CostOptimization, PerformanceTrend };

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
  private ollama: OllamaClient | null = null;
  private ollamaEnabled: boolean = false;
  private stats: StatisticalUtils;
  private persistence: InsightsPersistence;
  private aiAnalysis: AIAnalysis;
  private anomalyDetector: AnomalyDetector;
  private capacityPredictor: CapacityPredictor;
  private costOptimizer: CostOptimizer;
  private performanceAnalyzer: PerformanceAnalyzer;

  constructor(
    db: Database.Database,
    ollamaConfig?: {
      host: string;
      port: number;
      model: string;
    },
  ) {
    if (ollamaConfig) {
      this.ollama = new OllamaClient(ollamaConfig);
      this.ollamaEnabled = true;
    }

    // Initialize helper modules
    this.stats = new StatisticalUtils(db);
    this.persistence = new InsightsPersistence(db);
    this.aiAnalysis = new AIAnalysis(this.ollama);
    this.anomalyDetector = new AnomalyDetector(db, this.stats);
    this.capacityPredictor = new CapacityPredictor(db, this.stats);
    this.costOptimizer = new CostOptimizer(db);
    this.performanceAnalyzer = new PerformanceAnalyzer(db, this.stats);
  }

  /**
   * Initialize AI insights tables in database
   */
  initializeTables(): void {
    this.persistence.initializeTables();
  }

  /**
   * Detect anomalies in system metrics using statistical analysis and AI
   */
  async detectAnomalies(lookbackHours: number = 24): Promise<AnomalyDetection> {
    logger.info(`Detecting anomalies in last ${lookbackHours} hours...`);

    const anomalies = this.anomalyDetector.detectAnomalies(lookbackHours);

    // Store anomalies in database
    this.persistence.storeAnomalies(anomalies);

    // Get AI analysis if Ollama is available
    let aiSummary = `Detected ${anomalies.length} anomalies in system metrics.`;

    if (this.ollamaEnabled && anomalies.length > 0) {
      try {
        const isAvailable = await this.aiAnalysis.isAvailable();
        if (isAvailable) {
          aiSummary = await this.aiAnalysis.getAnomalyAnalysis(anomalies);
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
      const prediction = this.capacityPredictor.predictCapacity(res);
      if (prediction) {
        predictions.push(prediction);

        // Store in database
        this.persistence.storeCapacityPrediction(prediction);
      }
    }

    return predictions;
  }

  /**
   * Generate cost optimization recommendations
   */
  async generateCostOptimizations(): Promise<CostOptimization & { ai_analysis: string }> {
    logger.info('Generating cost optimization recommendations...');

    const costOpt = this.costOptimizer.generateOptimizations();

    // Get AI analysis
    let aiAnalysis = 'Review the optimization opportunities above.';

    if (this.ollamaEnabled && costOpt.opportunities.length > 0) {
      try {
        const isAvailable = await this.aiAnalysis.isAvailable();
        if (isAvailable) {
          aiAnalysis = await this.aiAnalysis.getCostAnalysis(
            costOpt.current_state,
            costOpt.opportunities,
          );
        }
      } catch (error) {
        logger.warn({ err: error }, 'Failed to get AI cost analysis');
      }
    }

    return {
      ...costOpt,
      ai_analysis: aiAnalysis,
    };
  }

  /**
   * Analyze performance trends over time
   */
  analyzePerformanceTrends(periodDays: number = 30): PerformanceTrend[] {
    return this.performanceAnalyzer.analyzeTrends(periodDays);
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
          severity: this.stats.getMaxSeverity(anomalies.anomalies.map((a) => a.severity)),
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
      this.persistence.storeInsights(insights);
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate AI insights');
    }

    return insights;
  }
}

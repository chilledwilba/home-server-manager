import type Database from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';
import type { AIInsight, AnomalyDetection, CapacityPrediction } from './insights-service.js';

const logger = createLogger('insights-persistence');

/**
 * Insights Persistence
 * Handles database operations for AI insights
 */
export class InsightsPersistence {
  constructor(private db: Database.Database) {}

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
   * Store anomalies in database
   */
  storeAnomalies(anomalies: AnomalyDetection['anomalies']): void {
    for (const anomaly of anomalies) {
      this.db
        .prepare(
          `INSERT INTO anomaly_history (metric, anomaly_type, severity, current_value, expected_value, deviation_percent, description)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
  }

  /**
   * Store capacity prediction in database
   */
  storeCapacityPrediction(prediction: CapacityPrediction): void {
    this.db
      .prepare(
        `INSERT INTO capacity_predictions (resource, current_usage, growth_rate, predicted_full_date, days_until_full, confidence)
        VALUES (?, ?, ?, ?, ?, ?)`,
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

  /**
   * Store insights in database
   */
  storeInsights(insights: AIInsight[]): void {
    for (const insight of insights) {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO ai_insights (id, type, title, summary, details, severity, actionable, actions, generated_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  }
}

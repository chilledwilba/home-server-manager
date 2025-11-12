import type Database from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('disk-predictor');

interface SmartDataPoint {
  timestamp: string;
  temperature: number;
  power_on_hours: number;
  reallocated_sectors: number;
  pending_sectors: number;
  health_status: string;
}

interface PredictionResult {
  diskName: string;
  failureProbability: number;
  daysUntilFailure: number | null;
  confidence: number;
  contributingFactors: string[];
  recommendedAction: string;
}

export class DiskFailurePredictor {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Predict disk failure based on SMART data trends
   */
  async predictFailure(diskName: string): Promise<PredictionResult> {
    // Get last 30 days of SMART data
    const historicalData = this.getHistoricalSmartData(diskName, 30);

    if (historicalData.length < 2) {
      return {
        diskName,
        failureProbability: 0,
        daysUntilFailure: null,
        confidence: 0,
        contributingFactors: ['Insufficient historical data'],
        recommendedAction: 'Continue monitoring - need more data points',
      };
    }

    const factors: string[] = [];
    let riskScore = 0;

    // Factor 1: Reallocated sectors (CRITICAL)
    const reallocatedTrend = this.analyzeTrend(historicalData.map((d) => d.reallocated_sectors));
    if (reallocatedTrend.current > 0) {
      riskScore += 40;
      factors.push(
        `${reallocatedTrend.current} reallocated sectors detected (${reallocatedTrend.rate > 0 ? 'INCREASING' : 'stable'})`,
      );
    }

    // Factor 2: Pending sectors (HIGH RISK)
    const pendingTrend = this.analyzeTrend(historicalData.map((d) => d.pending_sectors));
    if (pendingTrend.current > 0) {
      riskScore += 30;
      factors.push(`${pendingTrend.current} pending sectors`);
    }

    // Factor 3: Temperature trends
    const tempTrend = this.analyzeTrend(historicalData.map((d) => d.temperature));
    if (tempTrend.average > 50) {
      riskScore += 15;
      factors.push(`High average temperature: ${tempTrend.average.toFixed(1)}°C`);
    }
    if (tempTrend.rate > 0.5) {
      riskScore += 10;
      factors.push('Temperature rising over time');
    }

    // Factor 4: Power-on hours (for IronWolf drives, 8760 hours per year)
    const latestData = historicalData[historicalData.length - 1];
    if (latestData) {
      const powerOnHours = latestData.power_on_hours;
      const powerOnYears = powerOnHours / 8760;

      if (powerOnYears > 4) {
        // IronWolf warranty is typically 3 years
        riskScore += 10;
        factors.push(`Drive age: ${powerOnYears.toFixed(1)} years`);
      }
    }

    // Factor 5: Health status
    if (latestData && latestData.health_status === 'FAILED') {
      riskScore += 50;
      factors.push('SMART health status: FAILED');
    }

    // Calculate failure probability (0-100%)
    const failureProbability = Math.min(100, riskScore);

    // Estimate days until failure based on trend rates
    let daysUntilFailure: number | null = null;
    if (reallocatedTrend.rate > 0) {
      // If reallocated sectors are increasing, estimate when it will hit critical threshold
      const criticalThreshold = 100; // Arbitrary threshold
      const daysToThreshold =
        (criticalThreshold - reallocatedTrend.current) / reallocatedTrend.rate;
      daysUntilFailure = Math.max(1, Math.floor(daysToThreshold));
    } else if (failureProbability > 70) {
      daysUntilFailure = 30; // Conservative estimate
    } else if (failureProbability > 40) {
      daysUntilFailure = 90;
    }

    // Determine confidence level
    const dataPointsCount = historicalData.length;
    const confidence = Math.min(100, (dataPointsCount / 30) * 100 * (factors.length > 0 ? 1 : 0.5));

    // Recommended action
    let recommendedAction = 'Continue regular monitoring';
    if (failureProbability > 70) {
      recommendedAction =
        'URGENT: Order replacement drive immediately. Plan data migration within 1 week.';
    } else if (failureProbability > 40) {
      recommendedAction = 'Order replacement drive as precaution. Increase backup frequency.';
    } else if (failureProbability > 20) {
      recommendedAction = 'Monitor closely. Verify backups are current.';
    }

    const result: PredictionResult = {
      diskName,
      failureProbability,
      daysUntilFailure,
      confidence,
      contributingFactors: factors.length > 0 ? factors : ['No concerning indicators detected'],
      recommendedAction,
    };

    // Store prediction in database
    this.storePrediction(result);

    return result;
  }

  private getHistoricalSmartData(diskName: string, days: number): SmartDataPoint[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString();

    const stmt = this.db.prepare(`
      SELECT timestamp, temperature, power_on_hours,
             reallocated_sectors, pending_sectors, health_status
      FROM smart_metrics
      WHERE disk_name = ? AND timestamp >= ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(diskName, cutoff) as SmartDataPoint[];
  }

  private analyzeTrend(values: number[]): {
    current: number;
    average: number;
    min: number;
    max: number;
    rate: number;
  } {
    if (values.length === 0) {
      return { current: 0, average: 0, min: 0, max: 0, rate: 0 };
    }

    const current = values[values.length - 1] || 0;
    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calculate rate of change (linear regression slope)
    let rate = 0;
    if (values.length > 1) {
      const firstValue = values[0] || 0;
      const lastValue = values[values.length - 1] || 0;
      rate = (lastValue - firstValue) / values.length;
    }

    return { current, average, min, max, rate };
  }

  private storePrediction(prediction: PredictionResult): void {
    const stmt = this.db.prepare(`
      INSERT INTO disk_predictions (
        disk_name, failure_probability, days_until_failure,
        confidence, contributing_factors, recommended_action
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      prediction.diskName,
      prediction.failureProbability,
      prediction.daysUntilFailure,
      prediction.confidence,
      JSON.stringify(prediction.contributingFactors),
      prediction.recommendedAction,
    );

    logger.info(
      `Stored prediction for ${prediction.diskName}: ${prediction.failureProbability.toFixed(1)}% failure probability`,
    );
  }

  /**
   * Get latest predictions for all monitored disks
   */
  getLatestPredictions(): Array<{
    diskName: string;
    failureProbability: number;
    daysUntilFailure: number | null;
    confidence: number;
    predictionDate: string;
  }> {
    const stmt = this.db.prepare(`
      SELECT disk_name, failure_probability, days_until_failure,
             confidence, prediction_date
      FROM disk_predictions
      WHERE id IN (
        SELECT MAX(id)
        FROM disk_predictions
        GROUP BY disk_name
      )
      ORDER BY failure_probability DESC
    `);

    return stmt.all() as Array<{
      diskName: string;
      failureProbability: number;
      daysUntilFailure: number | null;
      confidence: number;
      predictionDate: string;
    }>;
  }
}

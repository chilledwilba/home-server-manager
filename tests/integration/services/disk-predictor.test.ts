import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { DiskFailurePredictor } from '../../../src/services/monitoring/disk-predictor.js';

describe('DiskFailurePredictor Integration', () => {
  let db: Database.Database;
  let predictor: DiskFailurePredictor;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create schema
    db.exec(`
      CREATE TABLE smart_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        disk_name TEXT NOT NULL,
        model TEXT,
        temperature REAL,
        power_on_hours INTEGER,
        reallocated_sectors INTEGER,
        pending_sectors INTEGER,
        health_status TEXT,
        load_cycle_count INTEGER,
        spin_retry_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE disk_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        disk_name TEXT NOT NULL,
        prediction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        failure_probability REAL,
        days_until_failure INTEGER,
        confidence REAL,
        contributing_factors TEXT,
        recommended_action TEXT
      );
    `);

    predictor = new DiskFailurePredictor(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Insufficient Data Handling', () => {
    it('should return low confidence prediction with insufficient data', async () => {
      const result = await predictor.predictFailure('sda');

      expect(result.diskName).toBe('sda');
      expect(result.failureProbability).toBe(0);
      expect(result.daysUntilFailure).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.contributingFactors).toContain('Insufficient historical data');
      expect(result.recommendedAction).toContain('Continue monitoring');
    });

    it('should handle single data point gracefully', async () => {
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                   reallocated_sectors, pending_sectors, health_status)
        VALUES (?, 'sda', 35, 1000, 0, 0, 'PASSED')
      `,
      ).run(now);

      const result = await predictor.predictFailure('sda');

      expect(result.failureProbability).toBe(0);
      expect(result.contributingFactors).toContain('Insufficient historical data');
    });
  });

  describe('Healthy Disk Prediction', () => {
    it('should predict low risk for healthy disk', async () => {
      const now = new Date();

      // Insert 10 days of healthy SMART data
      for (let i = 0; i < 10; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sda', ?, ?, 0, 0, 'PASSED')
        `,
        ).run(timestamp, 35 + i * 0.1, 5000 + i * 24);
      }

      const result = await predictor.predictFailure('sda');

      expect(result.diskName).toBe('sda');
      expect(result.failureProbability).toBeLessThan(20);
      expect(result.contributingFactors).toContain('No concerning indicators detected');
      expect(result.recommendedAction).toContain('Continue regular monitoring');
    });
  });

  describe('High Risk - Reallocated Sectors', () => {
    it('should detect high risk from reallocated sectors', async () => {
      const now = new Date();

      // Insert data with reallocated sectors and high temperature
      for (let i = 0; i < 10; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sdb', 52, 10000, ?, 0, 'PASSED')
        `,
        ).run(timestamp, Math.max(0, 5 - i)); // Decreasing from 5 to 0 (older to newer)
      }

      const result = await predictor.predictFailure('sdb');

      expect(result.diskName).toBe('sdb');
      expect(result.failureProbability).toBeGreaterThanOrEqual(40);
      expect(result.contributingFactors.some((f) => f.includes('reallocated sectors'))).toBe(true);
      expect(result.recommendedAction).toContain('replacement');
    });

    it('should calculate days until failure for increasing reallocated sectors', async () => {
      const now = new Date();

      // Insert data with increasing reallocated sectors
      for (let i = 0; i < 15; i++) {
        const timestamp = new Date(now.getTime() - (14 - i) * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sdc', 40, 15000, ?, 0, 'PASSED')
        `,
        ).run(timestamp, i); // 0 to 14 reallocated sectors over 15 days
      }

      const result = await predictor.predictFailure('sdc');

      expect(result.failureProbability).toBeGreaterThanOrEqual(40);
      expect(result.daysUntilFailure).toBeDefined();
      expect(result.daysUntilFailure).toBeGreaterThan(0);
    });
  });

  describe('High Risk - Pending Sectors', () => {
    it('should detect high risk from pending sectors', async () => {
      const now = new Date();

      for (let i = 0; i < 10; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sdd', 35, 8000, 0, 3, 'PASSED')
        `,
        ).run(timestamp);
      }

      const result = await predictor.predictFailure('sdd');

      expect(result.failureProbability).toBeGreaterThanOrEqual(30);
      expect(result.contributingFactors.some((f) => f.includes('pending sectors'))).toBe(true);
    });
  });

  describe('High Risk - Temperature', () => {
    it('should detect high risk from elevated temperatures', async () => {
      const now = new Date();

      for (let i = 0; i < 10; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sde', ?, 6000, 0, 0, 'PASSED')
        `,
        ).run(timestamp, 55 + i * 0.5); // High and increasing temperature
      }

      const result = await predictor.predictFailure('sde');

      expect(result.contributingFactors.some((f) => f.includes('temperature'))).toBe(true);
      expect(result.failureProbability).toBeGreaterThan(0);
    });
  });

  describe('High Risk - Drive Age', () => {
    it('should consider drive age in risk calculation', async () => {
      const now = new Date();

      // 5 year old drive (43800 hours)
      for (let i = 0; i < 10; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sdf', 38, ?, 0, 0, 'PASSED')
        `,
        ).run(timestamp, 43800 + i * 24);
      }

      const result = await predictor.predictFailure('sdf');

      expect(result.contributingFactors.some((f) => f.includes('Drive age'))).toBe(true);
      expect(result.failureProbability).toBeGreaterThan(0);
    });
  });

  describe('Critical - FAILED Health Status', () => {
    it('should detect critical risk from FAILED health status', async () => {
      const now = new Date();

      for (let i = 0; i < 10; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sdg', 40, 10000, 2, 1, 'FAILED')
        `,
        ).run(timestamp);
      }

      const result = await predictor.predictFailure('sdg');

      expect(result.failureProbability).toBeGreaterThanOrEqual(70);
      expect(
        result.contributingFactors.some((f) => f.includes('SMART health status: FAILED')),
      ).toBe(true);
      expect(result.recommendedAction).toContain('URGENT');
      expect(result.daysUntilFailure).toBeLessThanOrEqual(30);
    });
  });

  describe('Prediction Storage', () => {
    it('should store prediction results in database', async () => {
      const now = new Date();

      for (let i = 0; i < 10; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sdh', 35, 5000, 0, 0, 'PASSED')
        `,
        ).run(timestamp);
      }

      await predictor.predictFailure('sdh');

      const predictions = db
        .prepare('SELECT * FROM disk_predictions WHERE disk_name = ?')
        .all('sdh');

      expect(predictions).toHaveLength(1);
      expect(predictions[0]).toMatchObject({
        disk_name: 'sdh',
      });
      expect((predictions[0] as { failure_probability: number }).failure_probability).toBeDefined();
      expect((predictions[0] as { recommended_action: string }).recommended_action).toBeDefined();
    });
  });

  describe('Multiple Risk Factors', () => {
    it('should compound risk from multiple factors', async () => {
      const now = new Date();

      // Disk with multiple issues: old, hot, reallocated sectors, pending sectors
      for (let i = 0; i < 20; i++) {
        const timestamp = new Date(now.getTime() - (19 - i) * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sdi', ?, ?, ?, ?, 'PASSED')
        `,
        ).run(timestamp, 52 + i * 0.3, 40000 + i * 24, Math.floor(i / 2), i > 15 ? 1 : 0);
      }

      const result = await predictor.predictFailure('sdi');

      expect(result.failureProbability).toBeGreaterThan(70);
      expect(result.contributingFactors.length).toBeGreaterThan(1);
      expect(result.daysUntilFailure).toBeDefined();
      expect(result.recommendedAction).toContain('URGENT');
    });
  });

  describe('Confidence Calculation', () => {
    it('should have higher confidence with more data points', async () => {
      const now = new Date();

      // Create 30 days of data for high confidence
      for (let i = 0; i < 30; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sdj', 38, 8000, 1, 0, 'PASSED')
        `,
        ).run(timestamp);
      }

      const result = await predictor.predictFailure('sdj');

      expect(result.confidence).toBeGreaterThan(50);
      expect(result.failureProbability).toBeGreaterThan(0);
    });

    it('should have lower confidence with few data points', async () => {
      const now = new Date();

      // Only 5 days of data
      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `
          INSERT INTO smart_metrics (timestamp, disk_name, temperature, power_on_hours,
                                     reallocated_sectors, pending_sectors, health_status)
          VALUES (?, 'sdk', 35, 5000, 0, 0, 'PASSED')
        `,
        ).run(timestamp);
      }

      const result = await predictor.predictFailure('sdk');

      expect(result.confidence).toBeLessThan(50);
    });
  });
});

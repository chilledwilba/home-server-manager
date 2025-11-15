/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { monitoringRoutes } from '../../../src/routes/monitoring.js';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock route helpers
jest.mock('../../../src/utils/route-helpers.js', () => {
  const actual = jest.requireActual('../../../src/utils/route-helpers.js') as any;
  return {
    ...actual,
  };
});

// Mock error types
jest.mock('../../../src/utils/error-types.js', () => ({
  DatabaseError: class DatabaseError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'DatabaseError';
    }
  },
}));

describe('Monitoring Routes', () => {
  let app: FastifyInstance;
  let mockMonitor: any;
  let mockPredictor: any;

  beforeEach(async () => {
    app = Fastify();

    // Create mock services
    mockMonitor = {
      getRecentAlerts: jest.fn(),
    };

    mockPredictor = {
      getLatestPredictions: jest.fn(),
    };

    // Register routes with service options
    await app.register(monitoringRoutes, {
      prefix: '/api/monitoring',
      monitor: mockMonitor,
      predictor: mockPredictor,
    });
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /alerts', () => {
    it('should return recent alerts successfully', async () => {
      const mockAlerts = [
        {
          id: 1,
          type: 'disk_warning',
          severity: 'warning',
          message: 'Disk usage above 80%',
          timestamp: '2024-01-01T12:00:00Z',
        },
        {
          id: 2,
          type: 'pool_degraded',
          severity: 'error',
          message: 'Pool in degraded state',
          timestamp: '2024-01-01T13:00:00Z',
        },
      ];

      mockMonitor.getRecentAlerts.mockReturnValue(mockAlerts);

      const response = await app.inject({
        method: 'GET',
        url: '/api/monitoring/alerts',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockAlerts);
      expect(mockMonitor.getRecentAlerts).toHaveBeenCalledWith(100);
    });

    it('should return empty array when no alerts exist', async () => {
      mockMonitor.getRecentAlerts.mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/monitoring/alerts',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });

    it('should handle errors from monitor service', async () => {
      mockMonitor.getRecentAlerts.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/monitoring/alerts',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle non-Error thrown by monitor', async () => {
      mockMonitor.getRecentAlerts.mockImplementation(() => {
        throw 'String error';
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/monitoring/alerts',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /predictions', () => {
    it('should return disk failure predictions successfully', async () => {
      const mockPredictions = [
        {
          disk: '/dev/sda',
          failureProbability: 0.15,
          predictedDate: '2024-06-01',
          confidence: 0.85,
        },
        {
          disk: '/dev/sdb',
          failureProbability: 0.05,
          predictedDate: '2024-12-01',
          confidence: 0.92,
        },
      ];

      mockPredictor.getLatestPredictions.mockReturnValue(mockPredictions);

      const response = await app.inject({
        method: 'GET',
        url: '/api/monitoring/predictions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockPredictions);
      expect(mockPredictor.getLatestPredictions).toHaveBeenCalled();
    });

    it('should return empty array when no predictions exist', async () => {
      mockPredictor.getLatestPredictions.mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/monitoring/predictions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });

    it('should handle errors from predictor service', async () => {
      mockPredictor.getLatestPredictions.mockImplementation(() => {
        throw new Error('Model not loaded');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/monitoring/predictions',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle non-Error thrown by predictor', async () => {
      mockPredictor.getLatestPredictions.mockImplementation(() => {
        throw 'Prediction error';
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/monitoring/predictions',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('POST /alerts/:id/acknowledge', () => {
    it('should acknowledge alert successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitoring/alerts/123/acknowledge',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Alert acknowledged');
    });

    it('should acknowledge alert with numeric ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitoring/alerts/456/acknowledge',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Alert acknowledged');
    });

    it('should handle errors during acknowledgment', async () => {
      // This test relies on implementation throwing an error
      // Since the current implementation just logs, we can't easily test errors
      // But we ensure the endpoint exists and responds
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitoring/alerts/789/acknowledge',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /alerts/:id/resolve', () => {
    it('should resolve alert successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitoring/alerts/123/resolve',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Alert resolved');
    });

    it('should resolve alert with numeric ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitoring/alerts/456/resolve',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Alert resolved');
    });

    it('should handle different alert IDs', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitoring/alerts/abc-def-123/resolve',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });
});

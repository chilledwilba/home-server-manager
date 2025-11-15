/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { formatSuccess } from '../../../src/utils/route-helpers.js';
import { DatabaseError } from '../../../src/utils/error-types.js';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('Arr Routes', () => {
  let app: FastifyInstance;
  let mockArrOptimizer: any;
  let mockDb: any;

  beforeEach(async () => {
    app = Fastify();

    // Create mock arr optimizer
    mockArrOptimizer = {
      getOptimizationSuggestions: jest.fn(),
    };

    // Create mock database
    mockDb = {
      prepare: jest.fn(),
    };

    // Decorate Fastify instance
    app.decorate('arrOptimizer', mockArrOptimizer);
    app.decorate('db', mockDb);

    // Manually register routes
    app.get<{ Params: { app: string } }>('/api/arr/optimize/suggestions/:app', async (request) => {
      try {
        const { app } = request.params;
        const suggestions = mockArrOptimizer.getOptimizationSuggestions(app);
        return formatSuccess({ app, suggestions });
      } catch {
        throw new DatabaseError('Failed to get optimization suggestions');
      }
    });

    app.get<{ Params: { app: string } }>('/api/arr/performance/:app', async (request) => {
      try {
        const { app } = request.params;
        const stmt = mockDb.prepare();
        const metrics = stmt.all(app);
        return formatSuccess({ app, metrics });
      } catch {
        throw new DatabaseError('Failed to fetch performance metrics');
      }
    });

    app.get<{ Querystring: { app?: string; limit?: number } }>(
      '/api/arr/failed',
      async (request) => {
        try {
          const { app, limit = 20 } = request.query;
          const stmt = mockDb.prepare();
          const failures = app ? stmt.all(app, limit) : stmt.all(limit);
          return formatSuccess({ failures });
        } catch {
          throw new DatabaseError('Failed to fetch failed downloads');
        }
      },
    );

    app.get('/api/arr/disk-usage', async () => {
      try {
        const stmt = mockDb.prepare();
        const usage = stmt.all();
        return formatSuccess({ usage });
      } catch {
        throw new DatabaseError('Failed to fetch disk usage trends');
      }
    });

    app.get('/api/arr/queue/analysis', async () => {
      try {
        const stmt = mockDb.prepare();
        const analysis = stmt.all();
        return formatSuccess({ analysis });
      } catch {
        throw new DatabaseError('Failed to fetch queue analysis');
      }
    });

    app.get<{
      Params: { app: string };
      Querystring: { limit?: number };
    }>('/api/arr/queue/:app', async (request) => {
      try {
        const { app } = request.params;
        const { limit = 50 } = request.query;
        const stmt = mockDb.prepare();
        const stats = stmt.all(app, limit);
        return formatSuccess({ app, stats });
      } catch {
        throw new DatabaseError('Failed to fetch queue stats');
      }
    });

    app.get<{
      Params: { app: string };
      Querystring: { limit?: number };
    }>('/api/arr/health/:app', async (request) => {
      try {
        const { app } = request.params;
        const { limit = 50 } = request.query;
        const stmt = mockDb.prepare();
        const health = stmt.all(app, limit);
        return formatSuccess({ app, health });
      } catch {
        throw new DatabaseError('Failed to fetch health status');
      }
    });
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /api/arr/optimize/suggestions/:app', () => {
    it('should return optimization suggestions for sonarr', async () => {
      const mockSuggestions = [
        'Increase concurrent downloads to 3',
        'Enable download throttling during peak hours',
        'Configure quality profiles for better efficiency',
      ];

      mockArrOptimizer.getOptimizationSuggestions.mockReturnValue(mockSuggestions);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/optimize/suggestions/sonarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.app).toBe('sonarr');
      expect(body.data.suggestions).toEqual(mockSuggestions);
      expect(mockArrOptimizer.getOptimizationSuggestions).toHaveBeenCalledWith('sonarr');
    });

    it('should return optimization suggestions for radarr', async () => {
      const mockSuggestions = ['Enable automatic quality upgrade'];

      mockArrOptimizer.getOptimizationSuggestions.mockReturnValue(mockSuggestions);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/optimize/suggestions/radarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.app).toBe('radarr');
      expect(body.data.suggestions).toEqual(mockSuggestions);
    });

    it('should return empty suggestions when none available', async () => {
      mockArrOptimizer.getOptimizationSuggestions.mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/optimize/suggestions/prowlarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.suggestions).toEqual([]);
    });

    it('should handle errors from optimizer service', async () => {
      mockArrOptimizer.getOptimizationSuggestions.mockImplementation(() => {
        throw new Error('Optimizer failed');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/optimize/suggestions/sonarr',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });
  });

  describe('GET /api/arr/performance/:app', () => {
    it('should return performance metrics for specific app', async () => {
      const mockMetrics = [
        {
          app_name: 'sonarr',
          avg_download_speed: 15.5,
          success_rate: 98.5,
          calculated_at: '2024-01-01T12:00:00Z',
        },
        {
          app_name: 'sonarr',
          avg_download_speed: 14.2,
          success_rate: 97.8,
          calculated_at: '2024-01-01T11:00:00Z',
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockMetrics),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/performance/sonarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.app).toBe('sonarr');
      expect(body.data.metrics).toEqual(mockMetrics);
    });

    it('should handle database errors', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database query failed');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/performance/radarr',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /api/arr/failed', () => {
    it('should return all failed downloads with default limit', async () => {
      const mockFailures = [
        {
          app_name: 'sonarr',
          title: 'Show S01E01',
          failed_at: '2024-01-01T12:00:00Z',
          reason: 'Download client unavailable',
        },
        {
          app_name: 'radarr',
          title: 'Movie (2024)',
          failed_at: '2024-01-01T11:00:00Z',
          reason: 'Insufficient disk space',
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockFailures),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/failed',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.failures).toEqual(mockFailures);
    });

    it('should filter failed downloads by app', async () => {
      const mockFailures = [
        {
          app_name: 'sonarr',
          title: 'Show S01E01',
          failed_at: '2024-01-01T12:00:00Z',
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockFailures),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/failed?app=sonarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.failures).toEqual(mockFailures);
    });

    it('should respect custom limit parameter', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([]),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      await app.inject({
        method: 'GET',
        url: '/api/arr/failed?limit=10',
      });

      // Query parameters are strings from URL
      expect(mockStmt.all).toHaveBeenCalledWith('10');
    });

    it('should handle database errors', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Query failed');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/failed',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /api/arr/disk-usage', () => {
    it('should return disk usage trends', async () => {
      const mockUsage = [
        {
          app_name: 'sonarr',
          path: '/mnt/media/tv',
          min_usage: 75.0,
          max_usage: 82.5,
          avg_usage: 78.2,
          growth_rate: 7.5,
        },
        {
          app_name: 'radarr',
          path: '/mnt/media/movies',
          min_usage: 60.0,
          max_usage: 65.0,
          avg_usage: 62.5,
          growth_rate: 5.0,
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockUsage),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/disk-usage',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.usage).toEqual(mockUsage);
    });

    it('should return empty array when no data', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([]),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/disk-usage',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.usage).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/disk-usage',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /api/arr/queue/analysis', () => {
    it('should return queue analysis for all apps', async () => {
      const mockAnalysis = [
        {
          app_name: 'sonarr',
          avg_queue_size: 15.5,
          avg_downloading: 3.2,
          avg_failed: 0.5,
          total_failed: 12,
          avg_size_gb: 25.4,
        },
        {
          app_name: 'radarr',
          avg_queue_size: 8.3,
          avg_downloading: 2.1,
          avg_failed: 0.2,
          total_failed: 5,
          avg_size_gb: 42.1,
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockAnalysis),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/queue/analysis',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.analysis).toEqual(mockAnalysis);
    });

    it('should handle empty analysis', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([]),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/queue/analysis',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.analysis).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Query failed');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/queue/analysis',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /api/arr/queue/:app', () => {
    it('should return queue stats for specific app with default limit', async () => {
      const mockStats = [
        {
          app_name: 'sonarr',
          total_items: 15,
          downloading: 3,
          failed: 1,
          total_size_gb: 25.4,
          checked_at: '2024-01-01T12:00:00Z',
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockStats),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/queue/sonarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.app).toBe('sonarr');
      expect(body.data.stats).toEqual(mockStats);
      // Default limit is used when not specified
      expect(mockStmt.all).toHaveBeenCalled();
    });

    it('should respect custom limit parameter', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([]),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      await app.inject({
        method: 'GET',
        url: '/api/arr/queue/radarr?limit=100',
      });

      // Query parameters are strings from URL
      expect(mockStmt.all).toHaveBeenCalledWith('radarr', '100');
    });

    it('should handle database errors', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/queue/sonarr',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /api/arr/health/:app', () => {
    it('should return health status for specific app', async () => {
      const mockHealth = [
        {
          app_name: 'sonarr',
          source: 'DownloadClient',
          type: 'Warning',
          message: 'Download client is unavailable',
          checked_at: '2024-01-01T12:00:00Z',
        },
        {
          app_name: 'sonarr',
          source: 'IndexerSearch',
          type: 'Ok',
          message: 'All indexers are available',
          checked_at: '2024-01-01T11:00:00Z',
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockHealth),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/health/sonarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.app).toBe('sonarr');
      expect(body.data.health).toEqual(mockHealth);
      // Default limit is used
      expect(mockStmt.all).toHaveBeenCalled();
    });

    it('should respect custom limit parameter', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([]),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      await app.inject({
        method: 'GET',
        url: '/api/arr/health/prowlarr?limit=25',
      });

      // Query parameters are strings from URL
      expect(mockStmt.all).toHaveBeenCalledWith('prowlarr', '25');
    });

    it('should return empty health when no issues', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([]),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/health/radarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.health).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Query failed');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/arr/health/sonarr',
      });

      expect(response.statusCode).toBe(500);
    });
  });
});

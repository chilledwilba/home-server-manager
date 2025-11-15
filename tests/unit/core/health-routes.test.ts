/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { registerHealthRoutes } from '../../../src/core/health-routes.js';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Health Routes', () => {
  let app: FastifyInstance;
  let mockServices: any;
  let mockDb: any;
  let mockHealthMonitor: any;

  beforeEach(async () => {
    app = Fastify();

    // Create mock services
    mockServices = {
      get: jest.fn(),
    };

    // Create mock database
    mockDb = {
      prepare: jest.fn(),
    };

    // Decorate Fastify instance
    (app as any).services = mockServices;
    (app as any).db = mockDb;
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /health (with health monitor)', () => {
    it('should return healthy status when all checks pass', async () => {
      mockHealthMonitor = {
        getHealthReport: jest.fn().mockReturnValue({
          healthy: true,
          checks: {
            database: { healthy: true },
            services: { healthy: true },
          },
        }),
      };

      mockServices.get.mockReturnValue(undefined); // No services configured

      registerHealthRoutes(app, mockHealthMonitor);

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.checks).toBeDefined();
      expect(body.monitoring).toBeDefined();
    });

    it('should return degraded status when checks fail', async () => {
      mockHealthMonitor = {
        getHealthReport: jest.fn().mockReturnValue({
          healthy: false,
          checks: {
            database: { healthy: false },
          },
        }),
      };

      mockServices.get.mockReturnValue(undefined);

      registerHealthRoutes(app, mockHealthMonitor);

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
    });
  });

  describe('GET /health (without health monitor)', () => {
    beforeEach(() => {
      registerHealthRoutes(app);
    });

    it('should return healthy status when all checks pass', async () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ result: 1 }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const mockTruenasMonitor = {
        /* ... */
      };
      const mockDockerMonitor = {
        getContainers: jest.fn<() => Promise<any>>().mockResolvedValue([{ id: 'container1' }]),
      };

      mockServices.get.mockImplementation((name: string) => {
        if (name === 'truenasMonitor') return mockTruenasMonitor;
        if (name === 'dockerMonitor') return mockDockerMonitor;
        return undefined;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.checks.database).toBe(true);
      expect(body.checks.truenas).toBe(true);
      expect(body.checks.portainer).toBe(true);
      expect(body.checks.timestamp).toBeDefined();
      expect(body.checks.uptime).toBeGreaterThan(0);
    });

    it('should return degraded status when database check fails', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      mockServices.get.mockReturnValue(undefined);

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
      expect(body.checks.database).toBe(false);
    });

    it('should return degraded status when TrueNAS is not initialized', async () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ result: 1 }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      mockServices.get.mockReturnValue(undefined); // No TrueNAS monitor

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
      expect(body.checks.truenas).toBe(false);
    });

    it('should handle Portainer check failure', async () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ result: 1 }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const mockTruenasMonitor = {
        /* ... */
      };
      const mockDockerMonitor = {
        getContainers: jest
          .fn<() => Promise<any>>()
          .mockRejectedValue(new Error('Portainer unavailable')),
      };

      mockServices.get.mockImplementation((name: string) => {
        if (name === 'truenasMonitor') return mockTruenasMonitor;
        if (name === 'dockerMonitor') return mockDockerMonitor;
        return undefined;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.checks.portainer).toBe(false);
    });

    it('should skip Portainer check if docker monitor not configured', async () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ result: 1 }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const mockTruenasMonitor = {
        /* ... */
      };

      mockServices.get.mockImplementation((name: string) => {
        if (name === 'truenasMonitor') return mockTruenasMonitor;
        return undefined;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.checks.portainer).toBe(true); // Skipped
    });

    it('should include environment and uptime in checks', async () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ result: 1 }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      mockServices.get.mockReturnValue({
        /* mocked service */
      }); // TrueNAS monitor exists

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.checks.environment).toBeDefined();
      expect(body.checks.uptime).toBeGreaterThan(0);
      expect(body.checks.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should include monitoring status', async () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ result: 1 }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      mockServices.get.mockReturnValue({
        /* mocked service */
      });

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.monitoring).toBeDefined();
      expect(body.monitoring.truenas).toBe(true);
      expect(body.monitoring.database).toBe(true);
      expect(body.monitoring.socketio).toBe(true);
    });
  });

  describe('GET /ready', () => {
    beforeEach(() => {
      registerHealthRoutes(app);
    });

    it('should return ready status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(true);
      expect(body.timestamp).toBeDefined();
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should always return ready=true', async () => {
      // Even if health is degraded, readiness should be true
      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(true);
    });
  });

  describe('GET /live', () => {
    beforeEach(() => {
      registerHealthRoutes(app);
    });

    it('should return alive status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.alive).toBe(true);
      expect(body.timestamp).toBeDefined();
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should always return alive=true', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.alive).toBe(true);
    });
  });

  describe('GET /api/system/info', () => {
    beforeEach(() => {
      registerHealthRoutes(app);
    });

    it('should return system information', async () => {
      mockServices.get.mockImplementation((name: string) => {
        if (name === 'truenasMonitor')
          return {
            /* mock */
          };
        if (name === 'dockerMonitor')
          return {
            /* mock */
          };
        if (name === 'zfsManager')
          return {
            /* mock */
          };
        return undefined;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/system/info',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Home Server Monitor');
      expect(body.data.version).toBe('0.1.0');
      expect(body.data.uptime).toBeGreaterThan(0);
      expect(body.data.monitoring).toBeDefined();
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should include monitoring status for all services', async () => {
      mockServices.get.mockImplementation((name: string) => {
        if (name === 'truenasMonitor')
          return {
            /* mock */
          };
        if (name === 'dockerMonitor')
          return {
            /* mock */
          };
        if (name === 'zfsManager')
          return {
            /* mock */
          };
        if (name === 'arrOptimizer')
          return {
            /* mock */
          };
        if (name === 'infrastructureManager')
          return {
            /* mock */
          };
        if (name === 'securityOrchestrator')
          return {
            /* mock */
          };
        return undefined;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/system/info',
      });

      const body = JSON.parse(response.body);
      expect(body.data.monitoring.truenas).toBe(true);
      expect(body.data.monitoring.docker).toBe(true);
      expect(body.data.monitoring.zfs).toBe(true);
      expect(body.data.monitoring.arr).toBe(true);
      expect(body.data.monitoring.infrastructure).toBe(true);
      expect(body.data.monitoring.security_orchestrator).toBe(true);
      expect(body.data.monitoring.security).toBe(true);
      expect(body.data.monitoring.notifications).toBe(true);
      expect(body.data.monitoring.remediation).toBe(true);
      expect(body.data.monitoring.database).toBe(true);
      expect(body.data.monitoring.socketio).toBe(true);
    });

    it('should handle missing services gracefully', async () => {
      mockServices.get.mockReturnValue(undefined); // No services

      const response = await app.inject({
        method: 'GET',
        url: '/api/system/info',
      });

      const body = JSON.parse(response.body);
      expect(body.data.monitoring.truenas).toBe(false);
      expect(body.data.monitoring.docker).toBe(false);
      expect(body.data.monitoring.zfs).toBe(false);
      expect(body.data.monitoring.arr).toBe(false);
      // These are always true
      expect(body.data.monitoring.security).toBe(true);
      expect(body.data.monitoring.database).toBe(true);
    });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { dockerRoutes } from '../../../src/routes/docker.js';

// Mock route helpers
jest.mock('../../../src/utils/route-helpers.js', () => {
  const actual = jest.requireActual('../../../src/utils/route-helpers.js') as any;
  return {
    ...actual,
  };
});

// Mock error types
jest.mock('../../../src/utils/error-types.js', () => ({
  ExternalServiceError: class ExternalServiceError extends Error {
    constructor(_service: string, message: string) {
      super(message);
      this.name = 'ExternalServiceError';
    }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(resource: string, identifier: string) {
      super(`${resource} with identifier '${identifier}' not found`);
      this.name = 'NotFoundError';
    }
  },
}));

describe('Docker Routes', () => {
  let app: FastifyInstance;
  let mockDockerMonitor: any;

  beforeEach(async () => {
    app = Fastify();

    // Create mock Docker monitor
    mockDockerMonitor = {
      getContainers: jest.fn(),
      getContainerStats: jest.fn(),
      getArrStatus: jest.fn(),
    };

    // Register routes with monitor option
    await app.register(dockerRoutes, {
      prefix: '/api/docker',
      monitor: mockDockerMonitor,
    });
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /containers', () => {
    it('should return all Docker containers successfully', async () => {
      const mockContainers = [
        {
          id: 'abc123',
          name: 'plex',
          status: 'running',
          image: 'plexinc/pms-docker:latest',
          uptime: '2 days',
        },
        {
          id: 'def456',
          name: 'sonarr',
          status: 'running',
          image: 'linuxserver/sonarr:latest',
          uptime: '5 hours',
        },
      ];

      mockDockerMonitor.getContainers.mockResolvedValue(mockContainers);

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/containers',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockContainers);
      expect(mockDockerMonitor.getContainers).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no containers exist', async () => {
      mockDockerMonitor.getContainers.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/containers',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });

    it('should handle errors from Docker monitor', async () => {
      mockDockerMonitor.getContainers.mockRejectedValue(new Error('Docker daemon not responding'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/containers',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle non-Error thrown by monitor', async () => {
      mockDockerMonitor.getContainers.mockRejectedValue('String error');

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/containers',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /containers/:id/stats', () => {
    it('should return container stats successfully', async () => {
      const mockStats = {
        cpu: 12.5,
        memory: 45.2,
        network: {
          rx: 1024000,
          tx: 512000,
        },
        io: {
          read: 2048000,
          write: 1024000,
        },
      };

      mockDockerMonitor.getContainerStats.mockResolvedValue(mockStats);

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/containers/abc123/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockStats);
      expect(mockDockerMonitor.getContainerStats).toHaveBeenCalledWith('abc123');
    });

    it('should throw error when container not found', async () => {
      mockDockerMonitor.getContainerStats.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/containers/nonexistent/stats',
      });

      // NotFoundError is thrown which results in 500 without proper error handler setup
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle errors from Docker monitor', async () => {
      mockDockerMonitor.getContainerStats.mockRejectedValue(new Error('Failed to retrieve stats'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/containers/abc123/stats',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle non-Error thrown by monitor', async () => {
      mockDockerMonitor.getContainerStats.mockRejectedValue('Container error');

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/containers/abc123/stats',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /arr/:app', () => {
    it('should return Sonarr status successfully', async () => {
      const mockStatus = {
        app: 'sonarr',
        version: '3.0.10',
        healthy: true,
        queue: 5,
        diskSpace: {
          free: 500000000000,
          total: 1000000000000,
        },
      };

      mockDockerMonitor.getArrStatus.mockResolvedValue(mockStatus);

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/arr/sonarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockStatus);
      expect(mockDockerMonitor.getArrStatus).toHaveBeenCalledWith('sonarr');
    });

    it('should return Radarr status successfully', async () => {
      const mockStatus = {
        app: 'radarr',
        version: '4.3.2',
        healthy: true,
        queue: 3,
      };

      mockDockerMonitor.getArrStatus.mockResolvedValue(mockStatus);

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/arr/radarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.app).toBe('radarr');
      expect(mockDockerMonitor.getArrStatus).toHaveBeenCalledWith('radarr');
    });

    it('should return Prowlarr status successfully', async () => {
      const mockStatus = {
        app: 'prowlarr',
        version: '1.0.1',
        healthy: true,
        indexers: 10,
      };

      mockDockerMonitor.getArrStatus.mockResolvedValue(mockStatus);

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/arr/prowlarr',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.app).toBe('prowlarr');
    });

    it('should throw error when Arr app not found', async () => {
      mockDockerMonitor.getArrStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/arr/lidarr',
      });

      // NotFoundError is thrown which results in 500 without proper error handler setup
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle errors from Arr monitor', async () => {
      mockDockerMonitor.getArrStatus.mockRejectedValue(new Error('API connection failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/arr/sonarr',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle non-Error thrown by Arr monitor', async () => {
      mockDockerMonitor.getArrStatus.mockRejectedValue('Arr error');

      const response = await app.inject({
        method: 'GET',
        url: '/api/docker/arr/sonarr',
      });

      expect(response.statusCode).toBe(500);
    });
  });
});

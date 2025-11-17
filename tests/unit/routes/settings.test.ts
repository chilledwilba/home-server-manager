/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { settingsRoutes } from '../../../src/routes/settings.js';

// Mock route helpers
jest.mock('../../../src/utils/route-helpers.js', () => {
  const actual = jest.requireActual('../../../src/utils/route-helpers.js') as any;
  return {
    ...actual,
    withService: jest.fn((serviceName: string, handler: any) => {
      return async (request: any, reply: any) => {
        const service = (request as any).server.services[serviceName];
        if (!service) {
          throw new Error(`Service ${serviceName} not found`);
        }
        return handler(service, request, reply);
      };
    }),
  };
});

describe('Settings Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });

    // Mock settings service
    const mockSettingsService = {
      getAll: jest.fn<any>().mockReturnValue({
        refreshInterval: 30,
        alertNotifications: {
          critical: true,
          warning: true,
          info: false,
        },
        truenasUrl: 'https://truenas.local',
        truenasApiKey: 'test-api-key',
      }),
      setMultiple: jest.fn<any>(),
      get: jest.fn<any>(),
      set: jest.fn<any>(),
    };

    // Inject mock service
    app.decorate('services', {
      settings: mockSettingsService,
    });

    await app.register(settingsRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/settings', () => {
    it('should return all settings', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/settings',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({
        refreshInterval: 30,
        alertNotifications: {
          critical: true,
          warning: true,
          info: false,
        },
        truenasUrl: 'https://truenas.local',
        truenasApiKey: 'test-api-key',
      });
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('PUT /api/settings', () => {
    it('should update settings successfully', async () => {
      const newSettings = {
        refreshInterval: 60,
        alertNotifications: {
          critical: true,
          warning: false,
          info: true,
        },
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: newSettings,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Settings updated successfully');
      expect(body.timestamp).toBeDefined();
    });

    it('should reject refreshInterval below minimum (10)', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { refreshInterval: 5 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid settings data');
      expect(body.errors).toBeDefined();
    });

    it('should reject refreshInterval above maximum (300)', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { refreshInterval: 350 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid settings data');
    });
  });
});

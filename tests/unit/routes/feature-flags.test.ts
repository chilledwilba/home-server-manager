import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { featureFlagRoutes } from '../../../src/routes/feature-flags.js';

// Mock the feature flag manager
const mockGetAllFlags = jest.fn<any>();
const mockGetFlag = jest.fn<any>();
const mockIsEnabled = jest.fn<any>();

jest.mock('../../../src/services/feature-flags/manager.js', () => ({
  getFeatureFlagManager: () => ({
    getAllFlags: mockGetAllFlags,
    getFlag: mockGetFlag,
    isEnabled: mockIsEnabled,
    refresh: jest.fn<any>(),
  }),
}));

describe('Feature Flags Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(featureFlagRoutes);
    await app.ready();

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/feature-flags', () => {
    it('should return all feature flags', async () => {
      const mockFlags = [
        {
          name: 'ai-insights',
          enabled: true,
          description: 'AI-powered insights',
          environments: ['development', 'production'],
        },
        {
          name: 'experimental-ui',
          enabled: false,
          description: 'Experimental UI features',
          environments: ['development'],
        },
      ];

      mockGetAllFlags.mockReturnValue(mockFlags);

      const response = await app.inject({
        method: 'GET',
        url: '/api/feature-flags',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.flags).toEqual(mockFlags);
      expect(mockGetAllFlags).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no flags exist', async () => {
      mockGetAllFlags.mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/feature-flags',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.flags).toEqual([]);
    });
  });

  describe('GET /api/feature-flags/:name', () => {
    it('should return a specific feature flag', async () => {
      const mockFlag = {
        name: 'ai-insights',
        enabled: true,
        description: 'AI-powered insights',
        environments: ['development', 'production'],
      };

      mockGetFlag.mockReturnValue(mockFlag);

      const response = await app.inject({
        method: 'GET',
        url: '/api/feature-flags/ai-insights',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.flag).toEqual(mockFlag);
      expect(mockGetFlag).toHaveBeenCalledWith('ai-insights');
    });

    it('should return 404 when feature flag does not exist', async () => {
      mockGetFlag.mockReturnValue(undefined);

      const response = await app.inject({
        method: 'GET',
        url: '/api/feature-flags/non-existent',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FLAG_NOT_FOUND');
      expect(body.error.message).toBe('Feature flag not found');
    });
  });

  describe('GET /api/feature-flags/:name/enabled', () => {
    it('should return true when feature is enabled', async () => {
      mockIsEnabled.mockReturnValue(true);

      const response = await app.inject({
        method: 'GET',
        url: '/api/feature-flags/ai-insights/enabled',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.enabled).toBe(true);
    });

    it('should return false when feature is disabled', async () => {
      mockIsEnabled.mockReturnValue(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/feature-flags/experimental-ui/enabled',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.enabled).toBe(false);
    });
  });
});

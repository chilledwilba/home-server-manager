/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { notificationRoutes } from '../../../src/routes/notifications.js';

// Mock route helpers
jest.mock('../../../src/utils/route-helpers.js', () => {
  const actual = jest.requireActual('../../../src/utils/route-helpers.js') as any;
  return {
    ...actual,
    withService: jest.fn((serviceName: string, handler: any) => {
      return async (request: any, reply: any) => {
        const service = (request as any).server[serviceName];
        if (!service) {
          throw new Error(`Service ${serviceName} not found`);
        }
        return handler(service, request, reply);
      };
    }),
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
}));

describe('Notification Routes', () => {
  let app: FastifyInstance;
  let mockNotificationService: any;

  beforeEach(async () => {
    app = Fastify();

    // Create mock notification service
    mockNotificationService = {
      getNotificationHistory: jest.fn(),
      sendAlert: jest.fn(),
    };

    // Decorate app with the service
    app.decorate('notificationService', mockNotificationService);

    // Register routes
    await app.register(notificationRoutes);
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /api/notifications/history', () => {
    it('should return notification history successfully', async () => {
      const mockHistory = [
        {
          id: 1,
          type: 'alert',
          severity: 'warning',
          message: 'High CPU usage detected',
          timestamp: '2024-01-01T12:00:00Z',
        },
        {
          id: 2,
          type: 'info',
          severity: 'info',
          message: 'System update completed',
          timestamp: '2024-01-01T13:00:00Z',
        },
      ];

      mockNotificationService.getNotificationHistory.mockReturnValue(mockHistory);

      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/history',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockHistory);
      expect(mockNotificationService.getNotificationHistory).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no history exists', async () => {
      mockNotificationService.getNotificationHistory.mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/history',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });

    it('should handle errors from notification service', async () => {
      mockNotificationService.getNotificationHistory.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/history',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      // Fastify error responses have 'error' and 'message' fields
      expect(body.error || body.message).toBeDefined();
    });
  });

  describe('POST /api/notifications/test', () => {
    it('should send test notification without channel', async () => {
      mockNotificationService.sendAlert.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/test',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Test notification sent');

      expect(mockNotificationService.sendAlert).toHaveBeenCalledWith(
        {
          id: 0,
          type: 'test',
          severity: 'info',
          message: 'Test notification from Home Server Monitor',
        },
        undefined,
      );
    });

    it('should send test notification to specific channel', async () => {
      mockNotificationService.sendAlert.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/test',
        payload: {
          channel: 'slack',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Test notification sent');

      expect(mockNotificationService.sendAlert).toHaveBeenCalledWith(
        {
          id: 0,
          type: 'test',
          severity: 'info',
          message: 'Test notification from Home Server Monitor',
        },
        ['slack'],
      );
    });

    it('should send test notification to discord channel', async () => {
      mockNotificationService.sendAlert.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/test',
        payload: {
          channel: 'discord',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      expect(mockNotificationService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test',
          severity: 'info',
        }),
        ['discord'],
      );
    });

    it('should handle errors when sending test notification', async () => {
      mockNotificationService.sendAlert.mockRejectedValue(
        new Error('Slack webhook URL not configured'),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/test',
        payload: {
          channel: 'slack',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle empty request body', async () => {
      mockNotificationService.sendAlert.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/test',
      });

      expect(response.statusCode).toBe(200);
      expect(mockNotificationService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test',
        }),
        undefined,
      );
    });

    it('should handle service throwing non-Error object', async () => {
      mockNotificationService.sendAlert.mockRejectedValue('String error');

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/test',
        payload: {},
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });
  });
});

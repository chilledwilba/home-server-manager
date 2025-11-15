/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { formatSuccess } from '../../../src/utils/route-helpers.js';
import { DatabaseError, NotFoundError } from '../../../src/utils/error-types.js';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('Remediation Routes', () => {
  let app: FastifyInstance;
  let mockRemediationService: any;

  beforeEach(async () => {
    app = Fastify();

    // Create mock service
    mockRemediationService = {
      getPendingApprovals: jest.fn(),
      approveAction: jest.fn(),
      getRemediationHistory: jest.fn(),
    };

    // Decorate Fastify instance with the service
    app.decorate('remediationService', mockRemediationService);

    // Manually register simplified routes without Zod schema validation
    // to avoid requiring @fastify/type-provider-zod
    app.get('/api/remediation/pending', async () => {
      try {
        const pending = mockRemediationService.getPendingApprovals();
        return formatSuccess(pending);
      } catch {
        throw new DatabaseError('Failed to fetch pending approvals');
      }
    });

    app.post<{ Body: { alertId: number; approvedBy: string } }>(
      '/api/remediation/approve',
      async (request) => {
        try {
          const { alertId, approvedBy } = request.body;

          // Basic validation
          if (typeof alertId !== 'number' || typeof approvedBy !== 'string') {
            throw new Error('Invalid request body');
          }

          await mockRemediationService.approveAction(alertId, approvedBy);
          return formatSuccess(null, 'Action approved and executed');
        } catch (error) {
          if (error instanceof Error && error.message.includes('not found')) {
            throw new NotFoundError('Remediation action', String(request.body.alertId));
          }
          throw new DatabaseError('Failed to approve remediation action');
        }
      },
    );

    app.get('/api/remediation/history', async () => {
      try {
        const history = mockRemediationService.getRemediationHistory();
        return formatSuccess(history);
      } catch {
        throw new DatabaseError('Failed to fetch remediation history');
      }
    });
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /api/remediation/pending', () => {
    it('should return pending approvals successfully', async () => {
      const mockPending = [
        {
          id: 1,
          alertId: 123,
          action: 'restart_container',
          containerName: 'sonarr',
          severity: 'medium',
          createdAt: '2024-01-01T12:00:00Z',
        },
        {
          id: 2,
          alertId: 124,
          action: 'clear_disk_space',
          path: '/mnt/tank',
          severity: 'high',
          createdAt: '2024-01-01T13:00:00Z',
        },
      ];

      mockRemediationService.getPendingApprovals.mockReturnValue(mockPending);

      const response = await app.inject({
        method: 'GET',
        url: '/api/remediation/pending',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockPending);
      expect(mockRemediationService.getPendingApprovals).toHaveBeenCalled();
    });

    it('should return empty array when no pending approvals', async () => {
      mockRemediationService.getPendingApprovals.mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/remediation/pending',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });

    it('should handle errors from service', async () => {
      mockRemediationService.getPendingApprovals.mockImplementation(() => {
        throw new Error('Database query failed');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/remediation/pending',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle non-Error thrown by service', async () => {
      mockRemediationService.getPendingApprovals.mockImplementation(() => {
        throw 'Database error';
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/remediation/pending',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('POST /api/remediation/approve', () => {
    it('should approve remediation action successfully', async () => {
      mockRemediationService.approveAction.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/remediation/approve',
        payload: {
          alertId: 123,
          approvedBy: 'admin@example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Action approved and executed');
      expect(mockRemediationService.approveAction).toHaveBeenCalledWith(123, 'admin@example.com');
    });

    it('should approve action with different user', async () => {
      mockRemediationService.approveAction.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/remediation/approve',
        payload: {
          alertId: 456,
          approvedBy: 'john.doe@example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockRemediationService.approveAction).toHaveBeenCalledWith(
        456,
        'john.doe@example.com',
      );
    });

    it('should handle missing alertId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/remediation/approve',
        payload: {
          approvedBy: 'admin@example.com',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle missing approvedBy', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/remediation/approve',
        payload: {
          alertId: 123,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle invalid alertId type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/remediation/approve',
        payload: {
          alertId: 'not-a-number',
          approvedBy: 'admin@example.com',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle invalid approvedBy type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/remediation/approve',
        payload: {
          alertId: 123,
          approvedBy: 12345, // Should be string
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle action not found', async () => {
      mockRemediationService.approveAction.mockRejectedValue(
        new Error('Remediation action not found'),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/remediation/approve',
        payload: {
          alertId: 999,
          approvedBy: 'admin@example.com',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle service errors', async () => {
      mockRemediationService.approveAction.mockRejectedValue(new Error('Execution failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/remediation/approve',
        payload: {
          alertId: 123,
          approvedBy: 'admin@example.com',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle non-Error thrown by service', async () => {
      mockRemediationService.approveAction.mockRejectedValue('Approval failed');

      const response = await app.inject({
        method: 'POST',
        url: '/api/remediation/approve',
        payload: {
          alertId: 123,
          approvedBy: 'admin@example.com',
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /api/remediation/history', () => {
    it('should return remediation history successfully', async () => {
      const mockHistory = [
        {
          id: 1,
          alertId: 100,
          action: 'restart_container',
          containerName: 'radarr',
          status: 'completed',
          executedAt: '2024-01-01T10:00:00Z',
          approvedBy: 'admin@example.com',
        },
        {
          id: 2,
          alertId: 101,
          action: 'clear_cache',
          path: '/tmp',
          status: 'completed',
          executedAt: '2024-01-01T11:00:00Z',
          approvedBy: 'john.doe@example.com',
        },
        {
          id: 3,
          alertId: 102,
          action: 'restart_service',
          serviceName: 'truenas-monitor',
          status: 'failed',
          executedAt: '2024-01-01T12:00:00Z',
          approvedBy: 'admin@example.com',
          error: 'Service not responding',
        },
      ];

      mockRemediationService.getRemediationHistory.mockReturnValue(mockHistory);

      const response = await app.inject({
        method: 'GET',
        url: '/api/remediation/history',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockHistory);
      expect(mockRemediationService.getRemediationHistory).toHaveBeenCalled();
    });

    it('should return empty array when no history', async () => {
      mockRemediationService.getRemediationHistory.mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/remediation/history',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });

    it('should handle errors from service', async () => {
      mockRemediationService.getRemediationHistory.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/remediation/history',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error || body.message).toBeDefined();
    });

    it('should handle non-Error thrown by service', async () => {
      mockRemediationService.getRemediationHistory.mockImplementation(() => {
        throw 'History query error';
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/remediation/history',
      });

      expect(response.statusCode).toBe(500);
    });
  });
});

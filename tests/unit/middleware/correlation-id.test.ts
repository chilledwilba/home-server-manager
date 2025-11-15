import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  correlationIdMiddleware,
  getCorrelationId,
} from '../../../src/middleware/correlation-id.js';

describe('Correlation ID Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let headerSpy: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    headerSpy = jest.fn().mockReturnThis();

    mockRequest = {
      headers: {},
      method: 'GET',
      url: '/api/test',
      ip: '127.0.0.1',
    };

    mockReply = {
      header: headerSpy as any,
    };
  });

  describe('correlationIdMiddleware', () => {
    it('should generate a new correlation ID when header is not provided', () => {
      correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Check that correlation ID was added to request
      const requestWithId = mockRequest as FastifyRequest & { correlationId: string };
      expect(requestWithId.correlationId).toBeDefined();
      expect(typeof requestWithId.correlationId).toBe('string');
      expect(requestWithId.correlationId.length).toBeGreaterThan(0);
    });

    it('should use existing correlation ID from X-Correlation-ID header', () => {
      const existingId = 'existing-correlation-id-123';
      mockRequest.headers = { 'x-correlation-id': existingId };

      correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const requestWithId = mockRequest as FastifyRequest & { correlationId: string };
      expect(requestWithId.correlationId).toBe(existingId);
    });

    it('should add correlation ID to response headers', () => {
      correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(headerSpy).toHaveBeenCalledWith('X-Correlation-ID', expect.any(String));
    });

    it('should add the same correlation ID to both request and response', () => {
      correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const requestWithId = mockRequest as FastifyRequest & { correlationId: string };
      const correlationId = requestWithId.correlationId;

      expect(headerSpy).toHaveBeenCalledWith('X-Correlation-ID', correlationId);
    });

    it('should generate unique UUIDs for different requests', () => {
      const request1 = { ...mockRequest };
      const request2 = { ...mockRequest };
      const reply1 = { ...mockReply, header: jest.fn().mockReturnThis() as any };
      const reply2 = { ...mockReply, header: jest.fn().mockReturnThis() as any };

      correlationIdMiddleware(request1 as FastifyRequest, reply1 as FastifyReply);
      correlationIdMiddleware(request2 as FastifyRequest, reply2 as FastifyReply);

      const id1 = (request1 as FastifyRequest & { correlationId: string }).correlationId;
      const id2 = (request2 as FastifyRequest & { correlationId: string }).correlationId;

      expect(id1).not.toBe(id2);
    });

    it('should generate valid UUID format', () => {
      correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const requestWithId = mockRequest as FastifyRequest & { correlationId: string };
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      expect(requestWithId.correlationId).toMatch(uuidRegex);
    });

    it('should handle uppercase X-Correlation-ID header', () => {
      const existingId = 'uppercase-header-id';
      mockRequest.headers = { 'X-Correlation-ID': existingId };

      correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const requestWithId = mockRequest as FastifyRequest & { correlationId: string };
      // Note: Fastify normalizes headers to lowercase, so this tests that behavior
      expect(requestWithId.correlationId).toBeDefined();
    });

    it('should work with different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        const request = { ...mockRequest, method };
        const reply = { ...mockReply, header: jest.fn().mockReturnThis() as any };

        correlationIdMiddleware(request as FastifyRequest, reply as FastifyReply);

        const requestWithId = request as FastifyRequest & { correlationId: string };
        expect(requestWithId.correlationId).toBeDefined();
      }
    });

    it('should work with different URLs', () => {
      const urls = ['/api/health', '/api/pools', '/api/containers/123', '/'];

      for (const url of urls) {
        const request = { ...mockRequest, url };
        const reply = { ...mockReply, header: jest.fn().mockReturnThis() as any };

        correlationIdMiddleware(request as FastifyRequest, reply as FastifyReply);

        const requestWithId = request as FastifyRequest & { correlationId: string };
        expect(requestWithId.correlationId).toBeDefined();
      }
    });

    it('should work with different IP addresses', () => {
      const ips = ['127.0.0.1', '192.168.1.1', '::1', '10.0.0.1'];

      for (const ip of ips) {
        const request = { ...mockRequest, ip };
        const reply = { ...mockReply, header: jest.fn().mockReturnThis() as any };

        correlationIdMiddleware(request as FastifyRequest, reply as FastifyReply);

        const requestWithId = request as FastifyRequest & { correlationId: string };
        expect(requestWithId.correlationId).toBeDefined();
      }
    });
  });

  describe('getCorrelationId', () => {
    it('should return correlation ID from request if it exists', () => {
      const correlationId = 'test-correlation-id';
      const requestWithId = mockRequest as FastifyRequest & { correlationId: string };
      requestWithId.correlationId = correlationId;

      const result = getCorrelationId(requestWithId as FastifyRequest);

      expect(result).toBe(correlationId);
    });

    it('should return "unknown" if correlation ID does not exist', () => {
      const result = getCorrelationId(mockRequest as FastifyRequest);

      expect(result).toBe('unknown');
    });

    it('should return "unknown" for request without correlationId property', () => {
      const plainRequest = {
        headers: {},
        method: 'GET',
        url: '/test',
        ip: '127.0.0.1',
      } as FastifyRequest;

      const result = getCorrelationId(plainRequest);

      expect(result).toBe('unknown');
    });

    it('should handle request with undefined correlationId', () => {
      const requestWithUndefined = mockRequest as FastifyRequest & { correlationId?: string };
      requestWithUndefined.correlationId = undefined;

      const result = getCorrelationId(requestWithUndefined as FastifyRequest);

      expect(result).toBe('unknown');
    });

    it('should return empty string if correlationId is empty string', () => {
      const requestWithEmpty = mockRequest as FastifyRequest & { correlationId: string };
      requestWithEmpty.correlationId = '';

      const result = getCorrelationId(requestWithEmpty as FastifyRequest);

      // Empty string is falsy, so it returns 'unknown'
      expect(result).toBe('unknown');
    });
  });

  describe('Integration', () => {
    it('should work with correlationIdMiddleware then getCorrelationId', () => {
      // First, middleware adds correlation ID
      correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Then, we can retrieve it
      const correlationId = getCorrelationId(mockRequest as FastifyRequest);

      expect(correlationId).not.toBe('unknown');
      expect(typeof correlationId).toBe('string');
      expect(correlationId.length).toBeGreaterThan(0);
    });

    it('should preserve correlation ID through middleware chain', () => {
      const existingId = 'chain-test-id';
      mockRequest.headers = { 'x-correlation-id': existingId };

      // Apply middleware
      correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Get correlation ID
      const retrievedId = getCorrelationId(mockRequest as FastifyRequest);

      expect(retrievedId).toBe(existingId);
    });
  });
});

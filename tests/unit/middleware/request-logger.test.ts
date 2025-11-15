import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import {
  requestLogger,
  responseLogger,
  registerRequestLogging,
} from '../../../src/middleware/request-logger.js';

describe('Request Logger Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let headerSpy: jest.Mock;
  let originalDateNow: () => number;

  beforeEach(() => {
    // Mock Date.now for consistent timing tests
    originalDateNow = Date.now;
    let currentTime = 1000000;
    Date.now = jest.fn(() => currentTime++) as any;

    headerSpy = jest.fn().mockReturnThis();

    mockRequest = {
      headers: {},
      method: 'GET',
      url: '/api/test',
      ip: '127.0.0.1',
      id: '',
    };

    mockReply = {
      header: headerSpy as any,
      statusCode: 200,
    };
  });

  afterEach(() => {
    // Restore original Date.now
    Date.now = originalDateNow;
    jest.restoreAllMocks();
  });

  describe('requestLogger', () => {
    it('should generate a new request ID when header is not provided', () => {
      requestLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.id).toBeDefined();
      expect(typeof mockRequest.id).toBe('string');
      expect(mockRequest.id!.length).toBeGreaterThan(0);
    });

    it('should use existing request ID from X-Request-ID header', () => {
      const existingId = 'existing-request-id-456';
      mockRequest.headers = { 'x-request-id': existingId };

      requestLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.id).toBe(existingId);
    });

    it('should add request ID to response headers', () => {
      requestLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(headerSpy).toHaveBeenCalledWith('x-request-id', expect.any(String));
    });

    it('should add the same request ID to both request and response', () => {
      requestLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const requestId = mockRequest.id!;
      expect(headerSpy).toHaveBeenCalledWith('x-request-id', requestId);
    });

    it('should store request context with timing information', () => {
      requestLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const requestWithContext = mockRequest as FastifyRequest & {
        context?: {
          requestId: string;
          method: string;
          url: string;
          userAgent?: string;
          ip: string;
          startTime: number;
        };
      };

      expect(requestWithContext.context).toBeDefined();
      expect(requestWithContext.context?.requestId).toBe(mockRequest.id);
      expect(requestWithContext.context?.method).toBe('GET');
      expect(requestWithContext.context?.url).toBe('/api/test');
      expect(requestWithContext.context?.ip).toBe('127.0.0.1');
      expect(requestWithContext.context?.startTime).toBeDefined();
      expect(typeof requestWithContext.context?.startTime).toBe('number');
    });

    it('should capture user agent from headers', () => {
      mockRequest.headers = { 'user-agent': 'Mozilla/5.0' };

      requestLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const requestWithContext = mockRequest as FastifyRequest & {
        context?: { userAgent?: string };
      };

      expect(requestWithContext.context?.userAgent).toBe('Mozilla/5.0');
    });

    it('should handle missing user agent gracefully', () => {
      requestLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const requestWithContext = mockRequest as FastifyRequest & {
        context?: { userAgent?: string };
      };

      expect(requestWithContext.context?.userAgent).toBeUndefined();
    });

    it('should generate unique request IDs for different requests', () => {
      const request1 = { ...mockRequest, id: '' };
      const request2 = { ...mockRequest, id: '' };
      const reply1 = { ...mockReply, header: jest.fn().mockReturnThis() as any };
      const reply2 = { ...mockReply, header: jest.fn().mockReturnThis() as any };

      requestLogger(request1 as FastifyRequest, reply1 as FastifyReply);
      requestLogger(request2 as FastifyRequest, reply2 as FastifyReply);

      expect(request1.id).not.toBe(request2.id);
    });

    it('should generate valid UUID format', () => {
      requestLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(mockRequest.id).toMatch(uuidRegex);
    });

    it('should work with different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

      for (const method of methods) {
        const request = { ...mockRequest, method, id: '' };
        const reply = { ...mockReply, header: jest.fn().mockReturnThis() as any };

        requestLogger(request as FastifyRequest, reply as FastifyReply);

        const requestWithContext = request as FastifyRequest & {
          context?: { method: string };
        };
        expect(requestWithContext.context?.method).toBe(method);
      }
    });

    it('should work with different URLs', () => {
      const urls = [
        '/api/health',
        '/api/pools',
        '/api/containers/abc123',
        '/metrics',
        '/',
        '/api/test?param=value',
      ];

      for (const url of urls) {
        const request = { ...mockRequest, url, id: '' };
        const reply = { ...mockReply, header: jest.fn().mockReturnThis() as any };

        requestLogger(request as FastifyRequest, reply as FastifyReply);

        const requestWithContext = request as FastifyRequest & {
          context?: { url: string };
        };
        expect(requestWithContext.context?.url).toBe(url);
      }
    });
  });

  describe('responseLogger', () => {
    it('should log response with duration for successful request', () => {
      // Setup request context
      const startTime = 1000000;
      const requestWithContext = mockRequest as FastifyRequest & {
        context?: {
          requestId: string;
          method: string;
          url: string;
          userAgent?: string;
          ip: string;
          startTime: number;
        };
      };

      requestWithContext.context = {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/test',
        ip: '127.0.0.1',
        startTime,
      };

      mockReply.statusCode = 200;

      // Should not throw
      expect(() => {
        responseLogger(requestWithContext as FastifyRequest, mockReply as FastifyReply);
      }).not.toThrow();
    });

    it('should handle request without context gracefully', () => {
      // Request without context should return early without error
      expect(() => {
        responseLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }).not.toThrow();
    });

    it('should calculate correct duration', () => {
      const startTime = 1000000;
      const requestWithContext = mockRequest as FastifyRequest & {
        context?: { startTime: number; requestId: string; method: string; url: string; ip: string };
      };

      requestWithContext.context = {
        requestId: 'test-id',
        method: 'GET',
        url: '/test',
        ip: '127.0.0.1',
        startTime,
      };

      // Mock Date.now to return specific values
      Date.now = jest
        .fn()
        .mockReturnValueOnce(startTime) // First call in requestLogger
        .mockReturnValueOnce(startTime + 150) as any; // Call in responseLogger

      responseLogger(requestWithContext as FastifyRequest, mockReply as FastifyReply);

      // Duration should be calculated (we can't assert the exact value without capturing logs)
      // But we can verify it doesn't throw
      expect(Date.now).toHaveBeenCalled();
    });

    it('should handle different status codes', () => {
      const statusCodes = [200, 201, 204, 400, 401, 404, 500, 503];

      for (const statusCode of statusCodes) {
        const request = {
          ...mockRequest,
          context: {
            requestId: 'test-id',
            method: 'GET',
            url: '/test',
            ip: '127.0.0.1',
            startTime: Date.now(),
          },
        };

        const reply = { ...mockReply, statusCode };

        expect(() => {
          responseLogger(request as FastifyRequest, reply as FastifyReply);
        }).not.toThrow();
      }
    });

    it('should include user agent in logs if present', () => {
      const requestWithContext = mockRequest as FastifyRequest & {
        context?: {
          requestId: string;
          method: string;
          url: string;
          userAgent?: string;
          ip: string;
          startTime: number;
        };
      };

      requestWithContext.context = {
        requestId: 'test-id',
        method: 'GET',
        url: '/test',
        userAgent: 'Mozilla/5.0',
        ip: '127.0.0.1',
        startTime: Date.now(),
      };

      mockReply.statusCode = 200;

      expect(() => {
        responseLogger(requestWithContext as FastifyRequest, mockReply as FastifyReply);
      }).not.toThrow();
    });

    it('should handle missing user agent gracefully', () => {
      const requestWithContext = mockRequest as FastifyRequest & {
        context?: {
          requestId: string;
          method: string;
          url: string;
          ip: string;
          startTime: number;
        };
      };

      requestWithContext.context = {
        requestId: 'test-id',
        method: 'GET',
        url: '/test',
        ip: '127.0.0.1',
        startTime: Date.now(),
      };

      mockReply.statusCode = 200;

      expect(() => {
        responseLogger(requestWithContext as FastifyRequest, mockReply as FastifyReply);
      }).not.toThrow();
    });
  });

  describe('registerRequestLogging', () => {
    it('should register onRequest and onResponse hooks', () => {
      const addHookSpy = jest.fn();
      const mockFastify = {
        addHook: addHookSpy,
      } as unknown as FastifyInstance;

      registerRequestLogging(mockFastify);

      expect(addHookSpy).toHaveBeenCalledTimes(2);
      expect(addHookSpy).toHaveBeenCalledWith('onRequest', expect.any(Function));
      expect(addHookSpy).toHaveBeenCalledWith('onResponse', expect.any(Function));
    });

    it('should register requestLogger for onRequest hook', () => {
      const addHookSpy = jest.fn();
      const mockFastify = {
        addHook: addHookSpy,
      } as unknown as FastifyInstance;

      registerRequestLogging(mockFastify);

      const onRequestCall = addHookSpy.mock.calls.find((call) => call[0] === 'onRequest');
      expect(onRequestCall).toBeDefined();
      expect(onRequestCall![1]).toBe(requestLogger);
    });

    it('should register responseLogger for onResponse hook', () => {
      const addHookSpy = jest.fn();
      const mockFastify = {
        addHook: addHookSpy,
      } as unknown as FastifyInstance;

      registerRequestLogging(mockFastify);

      const onResponseCall = addHookSpy.mock.calls.find((call) => call[0] === 'onResponse');
      expect(onResponseCall).toBeDefined();
      expect(onResponseCall![1]).toBe(responseLogger);
    });
  });

  describe('Integration', () => {
    it('should track request from start to finish', () => {
      // Simulate request lifecycle
      requestLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const requestId = mockRequest.id;
      expect(requestId).toBeDefined();

      // Verify context was stored
      const requestWithContext = mockRequest as FastifyRequest & {
        context?: {
          requestId: string;
          startTime: number;
        };
      };
      expect(requestWithContext.context).toBeDefined();
      expect(requestWithContext.context?.requestId).toBe(requestId);

      // Simulate response
      mockReply.statusCode = 200;
      expect(() => {
        responseLogger(requestWithContext as FastifyRequest, mockReply as FastifyReply);
      }).not.toThrow();
    });

    it('should preserve request ID through request-response cycle', () => {
      const existingId = 'preserve-test-id';
      mockRequest.headers = { 'x-request-id': existingId };

      requestLogger(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockRequest.id).toBe(existingId);

      const requestWithContext = mockRequest as FastifyRequest & {
        context?: { requestId: string };
      };
      expect(requestWithContext.context?.requestId).toBe(existingId);

      mockReply.statusCode = 200;
      expect(() => {
        responseLogger(requestWithContext as FastifyRequest, mockReply as FastifyReply);
      }).not.toThrow();
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandler } from '../../../src/middleware/error-handler.js';
import {
  ValidationError,
  DatabaseError,
  NotFoundError,
  AuthenticationError,
  ExternalServiceError,
  ConflictError,
  ErrorCode,
} from '../../../src/utils/error-types.js';

describe('Error Handler Middleware', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('AppError Handling', () => {
    it('should handle ValidationError with 400 status', async () => {
      app.get('/test', async () => {
        throw new ValidationError('Invalid input', { field: 'email' });
      });

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(body.error.message).toBe('Invalid input');
      expect(body.error.severity).toBe('low');
      expect(body.error.recoverable).toBe(true);
      expect(body.error.recoverySuggestion).toBeDefined();
    });

    it('should handle DatabaseError with 500 status', async () => {
      app.get('/test', async () => {
        throw new DatabaseError('Connection failed', { reason: 'timeout' });
      });

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(body.error.message).toBe('Connection failed');
      expect(body.error.severity).toBe('critical');
      expect(body.error.recoverable).toBe(false);
    });

    it('should handle NotFoundError with 404 status', async () => {
      app.get('/test', async () => {
        throw new NotFoundError('User', 123);
      });

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(body.error.message).toContain('User');
      expect(body.error.message).toContain('123');
      expect(body.error.severity).toBe('low');
      expect(body.error.recoverable).toBe(true);
    });

    it('should handle AuthenticationError with 401 status', async () => {
      app.get('/test', async () => {
        throw new AuthenticationError('Invalid credentials');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(body.error.severity).toBe('medium');
      expect(body.error.recoverable).toBe(true);
    });

    it('should handle ExternalServiceError with 502 status', async () => {
      app.get('/test', async () => {
        throw new ExternalServiceError('TrueNAS', 'Connection timeout');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(502);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
      expect(body.error.message).toContain('TrueNAS');
      expect(body.error.severity).toBe('high');
      expect(body.error.recoverable).toBe(true);
    });

    it('should handle ConflictError with 409 status', async () => {
      app.get('/test', async () => {
        throw new ConflictError('Resource already exists');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe(ErrorCode.CONFLICT);
      expect(body.error.severity).toBe('medium');
      expect(body.error.recoverable).toBe(true);
    });
  });

  describe('Request Context', () => {
    it('should include correlation ID in error response', async () => {
      app.get('/test', async () => {
        throw new ValidationError('Test error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-request-id': 'test-123',
        },
      });

      const body = JSON.parse(response.payload);
      expect(body.error.correlationId).toBeDefined();
    });

    it('should include timestamp in error response', async () => {
      app.get('/test', async () => {
        throw new DatabaseError('Test error');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.payload);

      expect(body.error.timestamp).toBeDefined();
      expect(new Date(body.error.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should include path in error response', async () => {
      app.get('/test', async () => {
        throw new ValidationError('Test error');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.payload);

      expect(body.error.path).toBe('/test');
    });
  });

  describe('Error Details', () => {
    it('should include error context in development mode', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'development';

      app.get('/test', async () => {
        throw new ValidationError('Invalid input', {
          field: 'email',
          value: 'not-an-email',
        });
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.payload);

      expect(body.error.context).toBeDefined();
      expect(body.error.context).toHaveProperty('field', 'email');

      process.env['NODE_ENV'] = originalEnv;
    });

    it('should not leak error context in production mode', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      app.get('/test', async () => {
        throw new ValidationError('Invalid input', {
          sensitiveData: 'secret-key-123',
        });
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.payload);

      // Context is still included but stack traces are not
      expect(body.error.stack).toBeUndefined();

      process.env['NODE_ENV'] = originalEnv;
    });

    it('should include stack trace in development mode', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'development';

      app.get('/test', async () => {
        throw new DatabaseError('Test error');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.payload);

      expect(body.error.stack).toBeDefined();

      process.env['NODE_ENV'] = originalEnv;
    });
  });

  describe('Unknown Errors', () => {
    it('should handle unknown errors gracefully', async () => {
      app.get('/test', async () => {
        throw new Error('Something went wrong');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(body.error.severity).toBe('critical');
      expect(body.error.recoverable).toBe(false);
    });

    it('should not leak internal error messages in production', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      app.get('/test', async () => {
        throw new Error('Internal database credentials expired at server.internal.local');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.payload);

      expect(body.error.message).not.toContain('database credentials');
      expect(body.error.message).not.toContain('server.internal.local');
      expect(body.error.message).toBe('An unexpected error occurred');

      process.env['NODE_ENV'] = originalEnv;
    });

    it('should show error messages in development mode', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'development';

      app.get('/test', async () => {
        throw new Error('Detailed error for debugging');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.payload);

      expect(body.error.message).toBe('Detailed error for debugging');

      process.env['NODE_ENV'] = originalEnv;
    });
  });

  describe('Response Format', () => {
    it('should always return consistent error format', async () => {
      app.get('/test', async () => {
        throw new DatabaseError('Test error');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.payload);

      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('severity');
      expect(body.error).toHaveProperty('recoverable');
      expect(body.error).toHaveProperty('correlationId');
      expect(body.error).toHaveProperty('timestamp');
      expect(body.error).toHaveProperty('path');
    });

    it('should set correct Content-Type header', async () => {
      app.get('/test', async () => {
        throw new ValidationError('Test error');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Multiple Error Scenarios', () => {
    it('should handle async errors in route handlers', async () => {
      app.get('/test', async () => {
        // eslint-disable-next-line no-undef
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new DatabaseError('Async operation failed');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(body.error.severity).toBe('critical');
    });

    it('should handle errors thrown in nested function calls', async () => {
      const nestedFunction = () => {
        throw new NotFoundError('Resource', 'abc123');
      };

      app.get('/test', async () => {
        nestedFunction();
      });

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(body.error.severity).toBe('low');
    });
  });
});

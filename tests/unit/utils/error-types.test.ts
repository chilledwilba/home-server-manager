import { describe, it, expect } from '@jest/globals';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  ServiceUnavailableError,
  RateLimitError,
  ErrorCode,
  ErrorSeverity,
} from '../../../src/utils/error-types.js';

describe('Error Types', () => {
  describe('AppError', () => {
    it('should create error with all properties', () => {
      const error = new AppError('Test error', 500, {
        code: ErrorCode.INTERNAL_ERROR,
        severity: ErrorSeverity.HIGH,
        recoverable: true,
        recoverySuggestion: 'Try again',
        context: { extra: 'data' },
      });

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoverable).toBe(true);
      expect(error.recoverySuggestion).toBe('Try again');
      expect(error.context).toEqual({ extra: 'data' });
      expect(error.name).toBe('AppError');
    });

    it('should create error without context', () => {
      const error = new AppError('Simple error', 400, {
        code: ErrorCode.VALIDATION_ERROR,
        severity: ErrorSeverity.LOW,
        recoverable: true,
      });

      expect(error.message).toBe('Simple error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.recoverable).toBe(true);
      expect(error.context).toBeUndefined();
    });

    it('should have stack trace', () => {
      const error = new AppError('Stack test', 500, {
        code: ErrorCode.INTERNAL_ERROR,
        severity: ErrorSeverity.CRITICAL,
        recoverable: false,
      });

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('should serialize to JSON correctly with context', () => {
      const error = new AppError('JSON test', 400, {
        code: ErrorCode.VALIDATION_ERROR,
        severity: ErrorSeverity.LOW,
        recoverable: true,
        recoverySuggestion: 'Fix the input',
        context: { field: 'name' },
      });
      const json = error.toJSON();

      expect(json).toMatchObject({
        name: 'AppError',
        message: 'JSON test',
        code: ErrorCode.VALIDATION_ERROR,
        severity: ErrorSeverity.LOW,
        statusCode: 400,
        recoverable: true,
        recoverySuggestion: 'Fix the input',
        context: { field: 'name' },
      });
    });

    it('should serialize to JSON correctly without context', () => {
      const error = new AppError('JSON test', 400, {
        code: ErrorCode.VALIDATION_ERROR,
        severity: ErrorSeverity.LOW,
        recoverable: true,
      });
      const json = error.toJSON();

      expect(json).toMatchObject({
        name: 'AppError',
        message: 'JSON test',
        code: ErrorCode.VALIDATION_ERROR,
        severity: ErrorSeverity.LOW,
        statusCode: 400,
        recoverable: true,
      });
      expect(json).not.toHaveProperty('context');
    });

    it('should be instanceof Error', () => {
      const error = new AppError('Test', 500, {
        code: ErrorCode.INTERNAL_ERROR,
        severity: ErrorSeverity.CRITICAL,
        recoverable: false,
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('ValidationError');
    });

    it('should include validation context', () => {
      const context = { field: 'email', reason: 'invalid format' };
      const error = new ValidationError('Email validation failed', context);

      expect(error.context).toEqual(context);
    });

    it('should be instanceof AppError', () => {
      const error = new ValidationError('Test');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should serialize with correct status code', () => {
      const error = new ValidationError('Bad input');
      const json = error.toJSON();

      expect(json['statusCode']).toBe(400);
      expect(json['code']).toBe(ErrorCode.VALIDATION_ERROR);
      expect(json['severity']).toBe(ErrorSeverity.LOW);
      expect(json['recoverable']).toBe(true);
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('AuthenticationError');
    });

    it('should create authentication error with custom message', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
      expect(error.statusCode).toBe(401);
    });

    it('should include context', () => {
      const error = new AuthenticationError('Token expired', { expiredAt: '2025-01-01' });

      expect(error.context).toEqual({ expiredAt: '2025-01-01' });
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error with default message', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Insufficient permissions');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(ErrorCode.FORBIDDEN);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoverable).toBe(false);
      expect(error.name).toBe('AuthorizationError');
    });

    it('should create authorization error with custom message', () => {
      const error = new AuthorizationError('Admin access required');

      expect(error.message).toBe('Admin access required');
      expect(error.statusCode).toBe(403);
    });

    it('should include required permissions in context', () => {
      const error = new AuthorizationError('Cannot delete', {
        required: ['admin', 'delete:resource'],
      });

      expect(error.context).toEqual({ required: ['admin', 'delete:resource'] });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error without identifier', () => {
      const error = new NotFoundError('Pool');

      expect(error.message).toBe('Pool not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('NotFoundError');
      expect(error.context).toEqual({ resource: 'Pool', identifier: undefined });
    });

    it('should create not found error with string identifier', () => {
      const error = new NotFoundError('Container', 'nginx-1');

      expect(error.message).toBe("Container with identifier 'nginx-1' not found");
      expect(error.context).toEqual({ resource: 'Container', identifier: 'nginx-1' });
    });

    it('should create not found error with numeric identifier', () => {
      const error = new NotFoundError('User', 123);

      expect(error.message).toBe("User with identifier '123' not found");
      expect(error.context).toEqual({ resource: 'User', identifier: 123 });
    });

    it('should handle zero as identifier (treated as falsy)', () => {
      const error = new NotFoundError('Record', 0);

      // Note: 0 is falsy in JavaScript, so it's treated like no identifier
      expect(error.message).toBe('Record not found');
      expect(error.context).toEqual({ resource: 'Record', identifier: 0 });
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe(ErrorCode.CONFLICT);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('ConflictError');
    });

    it('should include conflict context', () => {
      const context = { existing: 'pool-1', attempted: 'pool-1' };
      const error = new ConflictError('Pool name already exists', context);

      expect(error.context).toEqual(context);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Connection failed');

      expect(error.message).toBe('Connection failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.recoverable).toBe(false);
      expect(error.name).toBe('DatabaseError');
    });

    it('should include SQL error context', () => {
      const context = { sqlCode: 'SQLITE_CONSTRAINT', table: 'pools' };
      const error = new DatabaseError('Constraint violation', context);

      expect(error.context).toEqual(context);
    });
  });

  describe('ExternalServiceError', () => {
    it('should create external service error', () => {
      const error = new ExternalServiceError('TrueNAS', 'API timeout');

      expect(error.message).toBe('TrueNAS: API timeout');
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('ExternalServiceError');
      expect(error.context).toHaveProperty('service', 'TrueNAS');
    });

    it('should include service name in context', () => {
      const error = new ExternalServiceError('Portainer', 'Connection refused');

      expect(error.context).toEqual({ service: 'Portainer' });
    });

    it('should merge additional context', () => {
      const additionalContext = { statusCode: 500, endpoint: '/api/containers' };
      const error = new ExternalServiceError('Portainer', 'API error', additionalContext);

      expect(error.context).toEqual({
        service: 'Portainer',
        statusCode: 500,
        endpoint: '/api/containers',
      });
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error with default message', () => {
      const error = new ServiceUnavailableError();

      expect(error.message).toBe('Service temporarily unavailable');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('ServiceUnavailableError');
    });

    it('should create service unavailable error with custom message', () => {
      const error = new ServiceUnavailableError('Database maintenance in progress');

      expect(error.message).toBe('Database maintenance in progress');
      expect(error.statusCode).toBe(503);
    });

    it('should include maintenance window in context', () => {
      const context = { maintenanceUntil: '2025-01-15T10:00:00Z' };
      const error = new ServiceUnavailableError('Under maintenance', context);

      expect(error.context).toEqual(context);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with default message', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('RateLimitError');
    });

    it('should create rate limit error with custom message', () => {
      const error = new RateLimitError('API rate limit exceeded');

      expect(error.message).toBe('API rate limit exceeded');
      expect(error.statusCode).toBe(429);
    });

    it('should include retry after in context', () => {
      const error = new RateLimitError('Rate limit exceeded', 60);

      expect(error.context).toEqual({ retryAfter: 60 });
    });

    it('should handle undefined retry after', () => {
      const error = new RateLimitError('Too many requests', undefined);

      expect(error.context).toEqual({ retryAfter: undefined });
    });

    it('should handle zero retry after', () => {
      const error = new RateLimitError('Rate limited', 0);

      expect(error.context).toEqual({ retryAfter: 0 });
    });
  });

  describe('Error inheritance chain', () => {
    it('should maintain proper inheritance for all error types', () => {
      const errors = [
        new ValidationError('test'),
        new AuthenticationError('test'),
        new AuthorizationError('test'),
        new NotFoundError('test'),
        new ConflictError('test'),
        new DatabaseError('test'),
        new ExternalServiceError('service', 'test'),
        new ServiceUnavailableError('test'),
        new RateLimitError('test'),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(AppError);
      }
    });

    it('should have unique status codes', () => {
      const statusCodes = [
        new ValidationError('test').statusCode,
        new AuthenticationError('test').statusCode,
        new AuthorizationError('test').statusCode,
        new NotFoundError('test').statusCode,
        new ConflictError('test').statusCode,
        new DatabaseError('test').statusCode,
        new ExternalServiceError('s', 'test').statusCode,
        new ServiceUnavailableError('test').statusCode,
        new RateLimitError('test').statusCode,
      ];

      const uniqueStatusCodes = new Set(statusCodes);
      expect(uniqueStatusCodes.size).toBe(statusCodes.length);
    });

    it('should have unique error codes', () => {
      const codes = [
        new ValidationError('test').code,
        new AuthenticationError('test').code,
        new AuthorizationError('test').code,
        new NotFoundError('test').code,
        new ConflictError('test').code,
        new DatabaseError('test').code,
        new ExternalServiceError('s', 'test').code,
        new ServiceUnavailableError('test').code,
        new RateLimitError('test').code,
      ];

      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });
});

/**
 * Custom application error types with HTTP status codes
 * Provides type-safe error handling across the application
 */

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
    };

    if (this.details) {
      result['details'] = this.details;
    }

    return result;
  }
}

/**
 * Validation error - 400 Bad Request
 * Used when request parameters, query, or body fail validation
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication error - 401 Unauthorized
 * Used when authentication is required but not provided or invalid
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: unknown) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

/**
 * Authorization error - 403 Forbidden
 * Used when user is authenticated but lacks permissions
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: unknown) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

/**
 * Not found error - 404 Not Found
 * Used when requested resource does not exist
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', { resource, identifier });
  }
}

/**
 * Conflict error - 409 Conflict
 * Used when request conflicts with current state (e.g., duplicate resource)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

/**
 * Database error - 500 Internal Server Error
 * Used when database operations fail
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * External service error - 502 Bad Gateway
 * Used when external APIs (TrueNAS, Portainer, etc.) fail
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: unknown) {
    const errorDetails: Record<string, unknown> = { service };

    if (details && typeof details === 'object') {
      Object.assign(errorDetails, details);
    }

    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', errorDetails);
  }
}

/**
 * Service unavailable error - 503 Service Unavailable
 * Used when service is temporarily unavailable (maintenance, circuit breaker open)
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', details?: unknown) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}

/**
 * Rate limit error - 429 Too Many Requests
 * Used when rate limiting is enforced
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT_ERROR', { retryAfter });
  }
}

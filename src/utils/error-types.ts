/**
 * Custom application error types with HTTP status codes
 * Provides type-safe error handling across the application
 */

/**
 * Standardized error codes across the application
 * Categorized by domain for better organization and debugging
 */
export enum ErrorCode {
  // System Errors (1000-1999)
  INTERNAL_ERROR = 'ERR_INTERNAL_1000',
  DATABASE_ERROR = 'ERR_DATABASE_1001',
  CONFIGURATION_ERROR = 'ERR_CONFIG_1002',
  INITIALIZATION_ERROR = 'ERR_INIT_1003',

  // TrueNAS Errors (2000-2999)
  TRUENAS_CONNECTION_FAILED = 'ERR_TRUENAS_2000',
  TRUENAS_AUTH_FAILED = 'ERR_TRUENAS_2001',
  TRUENAS_POOL_NOT_FOUND = 'ERR_TRUENAS_2002',
  TRUENAS_API_ERROR = 'ERR_TRUENAS_2003',
  TRUENAS_TIMEOUT = 'ERR_TRUENAS_2004',

  // Portainer/Docker Errors (3000-3999)
  PORTAINER_CONNECTION_FAILED = 'ERR_PORTAINER_3000',
  PORTAINER_AUTH_FAILED = 'ERR_PORTAINER_3001',
  CONTAINER_NOT_FOUND = 'ERR_CONTAINER_3002',
  CONTAINER_START_FAILED = 'ERR_CONTAINER_3003',
  CONTAINER_STOP_FAILED = 'ERR_CONTAINER_3004',
  DOCKER_API_ERROR = 'ERR_DOCKER_3005',

  // ZFS Errors (4000-4999)
  ZFS_SNAPSHOT_FAILED = 'ERR_ZFS_4000',
  ZFS_SCRUB_FAILED = 'ERR_ZFS_4001',
  ZFS_POOL_DEGRADED = 'ERR_ZFS_4002',
  ZFS_DATASET_NOT_FOUND = 'ERR_ZFS_4003',
  ZFS_OPERATION_FAILED = 'ERR_ZFS_4004',

  // Validation Errors (5000-5999)
  VALIDATION_ERROR = 'ERR_VALIDATION_5000',
  INVALID_INPUT = 'ERR_VALIDATION_5001',
  MISSING_REQUIRED_FIELD = 'ERR_VALIDATION_5002',
  INVALID_FORMAT = 'ERR_VALIDATION_5003',
  SCHEMA_VALIDATION_FAILED = 'ERR_VALIDATION_5004',

  // Authentication/Authorization (6000-6999)
  UNAUTHORIZED = 'ERR_AUTH_6000',
  FORBIDDEN = 'ERR_AUTH_6001',
  INVALID_API_KEY = 'ERR_AUTH_6002',
  TOKEN_EXPIRED = 'ERR_AUTH_6003',
  INSUFFICIENT_PERMISSIONS = 'ERR_AUTH_6004',

  // Resource Errors (7000-7999)
  NOT_FOUND = 'ERR_RESOURCE_7000',
  ALREADY_EXISTS = 'ERR_RESOURCE_7001',
  CONFLICT = 'ERR_RESOURCE_7002',

  // External Service Errors (8000-8999)
  EXTERNAL_SERVICE_ERROR = 'ERR_EXTERNAL_8000',
  SERVICE_UNAVAILABLE = 'ERR_EXTERNAL_8001',
  TIMEOUT = 'ERR_EXTERNAL_8002',
  RATE_LIMIT_EXCEEDED = 'ERR_EXTERNAL_8003',

  // Security Errors (9000-9999)
  SECURITY_SCAN_FAILED = 'ERR_SECURITY_9000',
  FAIL2BAN_ERROR = 'ERR_SECURITY_9001',
  TUNNEL_ERROR = 'ERR_SECURITY_9002',
  VULNERABILITY_DETECTED = 'ERR_SECURITY_9003',
}

/**
 * Error severity levels for categorizing error impact
 */
export enum ErrorSeverity {
  CRITICAL = 'critical', // System down, data loss risk
  HIGH = 'high', // Major functionality broken
  MEDIUM = 'medium', // Feature degraded
  LOW = 'low', // Minor issue
}

/**
 * Metadata for enhanced error tracking and recovery
 */
export interface ErrorMetadata {
  code: ErrorCode;
  severity: ErrorSeverity;
  recoverable: boolean;
  recoverySuggestion?: string;
  correlationId?: string;
  context?: Record<string, unknown>;
}

export class AppError extends Error {
  public statusCode: number;
  public code: ErrorCode;
  public severity: ErrorSeverity;
  public recoverable: boolean;
  public recoverySuggestion?: string;
  public correlationId?: string;
  public context?: Record<string, unknown>;
  public details?: unknown; // Keep for backward compatibility

  constructor(message: string, statusCode: number, metadata: ErrorMetadata) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = metadata.code;
    this.severity = metadata.severity;
    this.recoverable = metadata.recoverable;
    this.recoverySuggestion = metadata.recoverySuggestion;
    this.correlationId = metadata.correlationId;
    this.context = metadata.context;
    this.details = metadata.context; // Map context to details for backward compatibility
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      statusCode: this.statusCode,
      recoverable: this.recoverable,
    };

    if (this.recoverySuggestion) {
      result['recoverySuggestion'] = this.recoverySuggestion;
    }

    if (this.correlationId) {
      result['correlationId'] = this.correlationId;
    }

    if (this.context) {
      result['context'] = this.context;
    }

    return result;
  }
}

/**
 * Validation error - 400 Bad Request
 * Used when request parameters, query, or body fail validation
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, {
      code: ErrorCode.VALIDATION_ERROR,
      severity: ErrorSeverity.LOW,
      recoverable: true,
      recoverySuggestion: 'Check the request format and ensure all required fields are provided',
      context,
    });
  }
}

/**
 * Authentication error - 401 Unauthorized
 * Used when authentication is required but not provided or invalid
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', context?: Record<string, unknown>) {
    super(message, 401, {
      code: ErrorCode.UNAUTHORIZED,
      severity: ErrorSeverity.MEDIUM,
      recoverable: true,
      recoverySuggestion: 'Provide valid authentication credentials',
      context,
    });
  }
}

/**
 * Authorization error - 403 Forbidden
 * Used when user is authenticated but lacks permissions
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', context?: Record<string, unknown>) {
    super(message, 403, {
      code: ErrorCode.FORBIDDEN,
      severity: ErrorSeverity.MEDIUM,
      recoverable: false,
      recoverySuggestion: 'Contact your administrator to request necessary permissions',
      context,
    });
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
    super(message, 404, {
      code: ErrorCode.NOT_FOUND,
      severity: ErrorSeverity.LOW,
      recoverable: true,
      recoverySuggestion: 'Verify the resource identifier and try again',
      context: { resource, identifier },
    });
  }
}

/**
 * Conflict error - 409 Conflict
 * Used when request conflicts with current state (e.g., duplicate resource)
 */
export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 409, {
      code: ErrorCode.CONFLICT,
      severity: ErrorSeverity.MEDIUM,
      recoverable: true,
      recoverySuggestion: 'The resource already exists or conflicts with the current state',
      context,
    });
  }
}

/**
 * Database error - 500 Internal Server Error
 * Used when database operations fail
 */
export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 500, {
      code: ErrorCode.DATABASE_ERROR,
      severity: ErrorSeverity.CRITICAL,
      recoverable: false,
      recoverySuggestion: 'Check database connectivity and integrity',
      context,
    });
  }
}

/**
 * External service error - 502 Bad Gateway
 * Used when external APIs (TrueNAS, Portainer, etc.) fail
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, context?: Record<string, unknown>) {
    super(`${service}: ${message}`, 502, {
      code: ErrorCode.EXTERNAL_SERVICE_ERROR,
      severity: ErrorSeverity.HIGH,
      recoverable: true,
      recoverySuggestion: `Check ${service} service connectivity and API credentials`,
      context: { service, ...context },
    });
  }
}

/**
 * Service unavailable error - 503 Service Unavailable
 * Used when service is temporarily unavailable (maintenance, circuit breaker open)
 */
export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = 'Service temporarily unavailable',
    context?: Record<string, unknown>,
  ) {
    super(message, 503, {
      code: ErrorCode.SERVICE_UNAVAILABLE,
      severity: ErrorSeverity.HIGH,
      recoverable: true,
      recoverySuggestion: 'The service is temporarily unavailable, please try again later',
      context,
    });
  }
}

/**
 * Rate limit error - 429 Too Many Requests
 * Used when rate limiting is enforced
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429, {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      severity: ErrorSeverity.LOW,
      recoverable: true,
      recoverySuggestion: retryAfter
        ? `Rate limit exceeded, retry after ${retryAfter} seconds`
        : 'Rate limit exceeded, please slow down your requests',
      context: { retryAfter },
    });
  }
}

/**
 * TrueNAS error - 502 Bad Gateway
 * Used when TrueNAS API operations fail
 */
export class TrueNASError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.TRUENAS_API_ERROR,
    context?: Record<string, unknown>,
  ) {
    super(message, 502, {
      code,
      severity: ErrorSeverity.HIGH,
      recoverable: true,
      recoverySuggestion: 'Check TrueNAS API connection and credentials',
      context,
    });
  }
}

/**
 * Portainer/Docker error - 502 Bad Gateway
 * Used when Portainer or Docker API operations fail
 */
export class PortainerError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DOCKER_API_ERROR,
    context?: Record<string, unknown>,
  ) {
    super(message, 502, {
      code,
      severity: ErrorSeverity.HIGH,
      recoverable: true,
      recoverySuggestion: 'Check Portainer/Docker API connection and credentials',
      context,
    });
  }
}

/**
 * ZFS error - 500 Internal Server Error
 * Used when ZFS operations fail
 */
export class ZFSError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.ZFS_OPERATION_FAILED,
    context?: Record<string, unknown>,
  ) {
    super(message, 500, {
      code,
      severity: ErrorSeverity.HIGH,
      recoverable: false,
      recoverySuggestion: 'Check ZFS pool status and system logs',
      context,
    });
  }
}

/**
 * Security error - 500 Internal Server Error
 * Used when security operations fail
 */
export class SecurityError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.SECURITY_SCAN_FAILED,
    context?: Record<string, unknown>,
  ) {
    super(message, 500, {
      code,
      severity: ErrorSeverity.HIGH,
      recoverable: true,
      recoverySuggestion: 'Review security configuration and logs',
      context,
    });
  }
}

/**
 * Error transformation middleware for Fastify
 * Transforms all errors into a standardized format with enhanced metadata
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { trackError } from '../utils/error-metrics.js';
import { AppError, ErrorCode, ErrorSeverity } from '../utils/error-types.js';
import { logger } from '../utils/logger.js';

/**
 * Standardized error response format
 */
export interface StandardErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    severity: ErrorSeverity;
    recoverable: boolean;
    recoverySuggestion?: string;
    correlationId: string;
    timestamp: string;
    path: string;
    stack?: string; // Only in development
    context?: Record<string, unknown>;
  };
}

/**
 * Transform errors into standardized format
 */
export function errorTransformer(
  error: Error | FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply,
): StandardErrorResponse {
  const isDevelopment = process.env['NODE_ENV'] === 'development';
  const correlationId = request.id || generateCorrelationId();

  let errorResponse: StandardErrorResponse;

  if (error instanceof AppError) {
    // Custom application error with full metadata
    errorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        severity: error.severity,
        recoverable: error.recoverable,
        recoverySuggestion: error.recoverySuggestion,
        correlationId,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(isDevelopment && error.stack && { stack: error.stack }),
        ...(error.context && { context: error.context }),
      },
    };

    // Log based on severity
    logError(error, correlationId, request);

    // Track error metrics
    trackError(error, request.url);

    reply.status(error.statusCode);
  } else if ('statusCode' in error && error.statusCode) {
    // Fastify error with status code
    const fastifyError = error;
    const statusCode = fastifyError.statusCode || 500;

    errorResponse = {
      success: false,
      error: {
        code: mapStatusToErrorCode(statusCode),
        message: isDevelopment ? fastifyError.message : getGenericMessage(statusCode),
        severity: getSeverityFromStatus(statusCode),
        recoverable: isRecoverableStatus(statusCode),
        recoverySuggestion: getRecoverySuggestion(statusCode),
        correlationId,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(isDevelopment && error.stack && { stack: error.stack }),
      },
    };

    logger.error(
      {
        err: error,
        correlationId,
        method: request.method,
        url: request.url,
        statusCode,
      },
      'Fastify error',
    );

    reply.status(statusCode);
  } else {
    // Unknown error - treat as critical
    errorResponse = {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: isDevelopment ? error.message : 'An unexpected error occurred',
        severity: ErrorSeverity.CRITICAL,
        recoverable: false,
        recoverySuggestion: 'Contact system administrator',
        correlationId,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(isDevelopment && error.stack && { stack: error.stack }),
      },
    };

    logger.fatal(
      {
        err: error,
        correlationId,
        method: request.method,
        url: request.url,
      },
      'Unhandled error',
    );

    reply.status(500);
  }

  return errorResponse;
}

/**
 * Log error based on severity
 */
function logError(error: AppError, correlationId: string, request: FastifyRequest): void {
  const logContext = {
    err: error,
    correlationId,
    method: request.method,
    url: request.url,
    severity: error.severity,
    code: error.code,
    recoverable: error.recoverable,
  };

  switch (error.severity) {
    case ErrorSeverity.CRITICAL:
      logger.fatal(logContext, error.message);
      break;
    case ErrorSeverity.HIGH:
      logger.error(logContext, error.message);
      break;
    case ErrorSeverity.MEDIUM:
      logger.warn(logContext, error.message);
      break;
    case ErrorSeverity.LOW:
      logger.info(logContext, error.message);
      break;
    default:
      logger.error(logContext, error.message);
  }
}

/**
 * Map HTTP status code to ErrorCode
 */
function mapStatusToErrorCode(statusCode: number): string {
  const statusToCode: Record<number, string> = {
    400: ErrorCode.VALIDATION_ERROR,
    401: ErrorCode.UNAUTHORIZED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    409: ErrorCode.CONFLICT,
    429: ErrorCode.RATE_LIMIT_EXCEEDED,
    500: ErrorCode.INTERNAL_ERROR,
    502: ErrorCode.EXTERNAL_SERVICE_ERROR,
    503: ErrorCode.SERVICE_UNAVAILABLE,
    504: ErrorCode.TIMEOUT,
  };

  return statusToCode[statusCode] || ErrorCode.INTERNAL_ERROR;
}

/**
 * Get severity from HTTP status code
 */
function getSeverityFromStatus(statusCode: number): ErrorSeverity {
  if (statusCode >= 500) {
    return ErrorSeverity.HIGH;
  }
  if (statusCode >= 400 && statusCode < 500) {
    return ErrorSeverity.LOW;
  }
  return ErrorSeverity.MEDIUM;
}

/**
 * Determine if status code represents a recoverable error
 */
function isRecoverableStatus(statusCode: number): boolean {
  // Client errors (4xx) are generally recoverable by fixing the request
  // Server errors (5xx) may or may not be recoverable
  const recoverableStatuses = [400, 401, 403, 404, 409, 429, 503];
  return recoverableStatuses.includes(statusCode);
}

/**
 * Get recovery suggestion based on status code
 */
function getRecoverySuggestion(statusCode: number): string {
  const suggestions: Record<number, string> = {
    400: 'Check the request format and parameters',
    401: 'Provide valid authentication credentials',
    403: 'Contact administrator for necessary permissions',
    404: 'Verify the resource identifier',
    409: 'The resource already exists or conflicts with current state',
    429: 'Reduce request rate and try again later',
    500: 'Contact system administrator',
    502: 'External service is unavailable',
    503: 'Service is temporarily unavailable, try again later',
    504: 'Request timeout, try again later',
  };

  return suggestions[statusCode] || 'Please try again or contact support';
}

/**
 * Get generic error message for HTTP status code
 */
function getGenericMessage(statusCode: number): string {
  const messages: Record<number, string> = {
    400: 'Bad request',
    401: 'Authentication required',
    403: 'Forbidden',
    404: 'Not found',
    405: 'Method not allowed',
    409: 'Conflict',
    422: 'Unprocessable entity',
    429: 'Too many requests',
    500: 'Internal server error',
    502: 'Bad gateway',
    503: 'Service unavailable',
    504: 'Gateway timeout',
  };

  return messages[statusCode] || 'An error occurred';
}

/**
 * Generate unique correlation ID for request tracing
 */
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

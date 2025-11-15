/**
 * Centralized error handling middleware for Fastify
 * Provides consistent error responses across all routes
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../utils/error-types.js';
import { logger } from '../utils/logger.js';

/**
 * Error response format
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
  timestamp: string;
}

/**
 * Fastify error handler
 * Catches all errors thrown in routes and formats them consistently
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = request.id;
  const timestamp = new Date().toISOString();

  // Log error with context
  logger.error(
    {
      err: error,
      requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    },
    'Request error',
  );

  // Handle known application errors
  if (error instanceof AppError) {
    const errorObject: {
      code: string;
      message: string;
      details?: unknown;
    } = {
      code: error.code,
      message: error.message,
    };

    // Include details only in development mode
    if (process.env['NODE_ENV'] === 'development' && error.details) {
      errorObject.details = error.details;
    }

    const response: ErrorResponse = {
      success: false,
      error: errorObject,
      requestId,
      timestamp,
    };

    reply.code(error.statusCode).send(response);
    return;
  }

  // Handle Fastify validation errors
  const fastifyError = error as FastifyError;
  if (fastifyError.validation) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: process.env['NODE_ENV'] === 'development' ? fastifyError.validation : undefined,
      },
      requestId,
      timestamp,
    };

    reply.code(400).send(response);
    return;
  }

  // Handle Fastify errors with status codes
  if (fastifyError.statusCode) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: fastifyError.code || 'FASTIFY_ERROR',
        message:
          process.env['NODE_ENV'] === 'development'
            ? fastifyError.message
            : getGenericMessage(fastifyError.statusCode),
      },
      requestId,
      timestamp,
    };

    reply.code(fastifyError.statusCode).send(response);
    return;
  }

  // Handle unknown errors (don't leak internals in production)
  const response: ErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env['NODE_ENV'] === 'development' ? error.message : 'An unexpected error occurred',
      ...(process.env['NODE_ENV'] === 'development' && {
        details: {
          stack: error.stack?.split('\n').slice(0, 5),
        },
      }),
    },
    requestId,
    timestamp,
  };

  reply.code(500).send(response);
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
 * Safe error serialization for logging
 * Removes sensitive data from error objects
 */
export function sanitizeError(error: Error | FastifyError): Record<string, unknown> {
  const sensitiveFields = [
    'password',
    'token',
    'apiKey',
    'api_key',
    'secret',
    'authorization',
    'cookie',
    'session',
  ];

  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  // Copy enumerable properties
  for (const key of Object.keys(error)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveFields.some((field) => lowerKey.includes(field));

    if (!isSensitive) {
      serialized[key] = (error as unknown as Record<string, unknown>)[key];
    } else {
      serialized[key] = '[REDACTED]';
    }
  }

  return serialized;
}

/**
 * Format success response
 * Provides consistent success response format
 */
export function formatSuccessResponse<T>(
  data: T,
  meta?: Record<string, unknown>,
): {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
} {
  return {
    success: true,
    data,
    ...(meta && { meta }),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Centralized error handling middleware for Fastify
 * Provides consistent error responses across all routes
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { errorTransformer } from './error-transformer.js';

/**
 * Fastify error handler
 * Catches all errors thrown in routes and formats them consistently
 * Uses error transformer to create standardized responses
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const errorResponse = errorTransformer(error, request, reply);
  reply.send(errorResponse);
}

// Re-export legacy types for backward compatibility
export type { StandardErrorResponse as ErrorResponse } from './error-transformer.js';

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

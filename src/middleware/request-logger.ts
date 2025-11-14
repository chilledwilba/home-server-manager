/**
 * Request logging middleware with correlation IDs
 * Logs all incoming requests with timing and context
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Request context with timing information
 */
interface RequestContext {
  requestId: string;
  method: string;
  url: string;
  userAgent?: string;
  ip: string;
  startTime: number;
}

/**
 * Add request correlation ID and logging
 */
export async function requestLogger(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Generate or extract correlation ID
  const requestId = (request.headers['x-request-id'] as string) || randomUUID();

  // Add request ID to request object
  request.id = requestId;

  // Add to response headers for client tracing
  reply.header('x-request-id', requestId);

  // Store request start time
  const startTime = Date.now();

  // Log incoming request
  logger.info(
    {
      requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    },
    'Incoming request',
  );

  // Store context for response logging
  (request as { context?: RequestContext }).context = {
    requestId,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
    startTime,
  };
}

/**
 * Log response with timing
 */
export async function responseLogger(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const context = (request as { context?: RequestContext }).context;

  if (!context) {
    return;
  }

  const duration = Date.now() - context.startTime;
  const statusCode = reply.statusCode;

  // Determine log level based on status code
  const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

  logger[logLevel](
    {
      requestId: context.requestId,
      method: context.method,
      url: context.url,
      statusCode,
      duration,
      userAgent: context.userAgent,
      ip: context.ip,
    },
    'Request completed',
  );
}

/**
 * Register request logging hooks
 */
export function registerRequestLogging(fastify: FastifyInstance): void {
  // Log all incoming requests
  fastify.addHook('onRequest', requestLogger);

  // Log all responses
  fastify.addHook('onResponse', responseLogger);

  logger.info('Request logging middleware registered');
}

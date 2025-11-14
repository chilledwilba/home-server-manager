import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('correlation-id');

/**
 * Request correlation ID middleware
 * Adds unique correlation IDs to track requests across services
 * Uses X-Correlation-ID header if provided, otherwise generates new UUID
 */
export async function correlationIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Get correlation ID from header or generate new one
  const correlationId = (request.headers['x-correlation-id'] as string) || randomUUID();

  // Add to request object for use in route handlers
  (request as FastifyRequest & { correlationId: string }).correlationId = correlationId;

  // Add to response headers
  void reply.header('X-Correlation-ID', correlationId);

  // Log the correlation ID with request details
  logger.debug({
    correlationId,
    method: request.method,
    url: request.url,
    ip: request.ip,
  });
}

/**
 * Get correlation ID from request
 */
export function getCorrelationId(request: FastifyRequest): string {
  return (request as FastifyRequest & { correlationId?: string }).correlationId || 'unknown';
}

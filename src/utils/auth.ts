import type { FastifyRequest, FastifyReply } from 'fastify';
import { URL } from 'node:url';
import { logger } from './logger.js';

/**
 * Verify API key from request headers
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 * @throws Will send 401 response if API key is missing or invalid
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function verifyApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    logger.warn('API request without API key', {
      path: request.url,
      ip: request.ip,
    });

    reply.code(401).send({
      error: 'Unauthorized',
      message: 'API key required',
    });
    return;
  }

  // Get valid API keys from environment
  const validKeys = (process.env['API_KEYS'] || '').split(',').filter((k) => k.trim().length > 0);

  if (validKeys.length === 0) {
    // If no API keys configured, log warning but allow request
    logger.warn('No API keys configured in environment', {
      path: request.url,
    });
    return;
  }

  if (!validKeys.includes(apiKey)) {
    logger.warn('Invalid API key attempt', {
      path: request.url,
      ip: request.ip,
      providedKey: apiKey.substring(0, 8) + '...', // Log partial key for debugging
    });

    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  // API key is valid
  logger.debug('API key verified', {
    path: request.url,
  });
}

/**
 * Verify admin permissions
 * Can be extended to integrate with Authentik or JWT
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 * @throws Will send 403 response if user lacks admin permissions
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function verifyAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // For now, admin verification requires API key
  // This can be extended to check JWT claims or Authentik groups

  const adminKey = process.env['ADMIN_API_KEY'];

  if (!adminKey) {
    logger.warn('No admin API key configured', {
      path: request.url,
    });
    // If no admin key is set, allow request (development mode)
    return;
  }

  const providedKey = request.headers['x-api-key'] as string | undefined;

  if (providedKey !== adminKey) {
    logger.warn('Non-admin user attempted admin action', {
      path: request.url,
      ip: request.ip,
    });

    reply.code(403).send({
      error: 'Forbidden',
      message: 'Admin permissions required',
    });
    return;
  }

  logger.debug('Admin permissions verified', {
    path: request.url,
  });
}

/**
 * Rate limiting check (basic implementation)
 * For production, consider using @fastify/rate-limit
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

// eslint-disable-next-line @typescript-eslint/require-await
export async function checkRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  options: { maxRequests: number; windowMs: number } = { maxRequests: 100, windowMs: 60000 },
): Promise<void> {
  const identifier = request.ip || 'unknown';
  const now = Date.now();

  const record = requestCounts.get(identifier);

  if (!record || now > record.resetAt) {
    // New window
    requestCounts.set(identifier, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return;
  }

  if (record.count >= options.maxRequests) {
    logger.warn('Rate limit exceeded', {
      ip: identifier,
      path: request.url,
      count: record.count,
    });

    reply.code(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((record.resetAt - now) / 1000),
    });
    return;
  }

  record.count++;
}

/**
 * Validate request origin for CSRF protection
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function validateOrigin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const origin = request.headers.origin;
  const referer = request.headers.referer;

  // Skip validation for GET requests (CSRF doesn't apply)
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return;
  }

  // Skip if no origin/referer (might be API client)
  if (!origin && !referer) {
    return;
  }

  const allowedOrigins = (process.env['ALLOWED_ORIGINS'] || 'http://localhost:3100').split(',');

  const requestOrigin = origin || (referer ? new URL(referer).origin : null);

  if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
    logger.warn('Request from unauthorized origin', {
      origin: requestOrigin,
      path: request.url,
      ip: request.ip,
    });

    reply.code(403).send({
      error: 'Forbidden',
      message: 'Invalid request origin',
    });
    return;
  }
}

/**
 * Sanitize input to prevent injection attacks
 *
 * @param input - Input string to sanitize
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters
  return input
    .replace(/[<>'"]/g, '') // Remove HTML/JS injection characters
    .replace(/\\/g, '') // Remove escape characters
    .replace(/;/g, '') // Remove SQL injection semicolons
    .trim();
}

/**
 * Validate that a string is alphanumeric with limited special characters
 *
 * @param input - Input string to validate
 * @param allowedChars - Additional allowed characters (default: -_)
 * @returns True if valid, false otherwise
 */
export function isValidIdentifier(input: string, allowedChars: string = '-_'): boolean {
  const regex = new RegExp(
    `^[a-zA-Z0-9${allowedChars.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')}]+$`,
  );
  return regex.test(input);
}

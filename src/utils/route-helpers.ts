import type { FastifyRequest, FastifyReply, RouteHandlerMethod } from 'fastify';
import type { FastifyWithServices } from '../core/fastify-decorators.js';
import type Database from 'better-sqlite3';
import { DatabaseError } from './error-types.js';

/**
 * Standard API response format
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

/**
 * Route handler with database access
 * Eliminates need for unsafe casting and null checks
 *
 * @example
 * fastify.get('/api/example', withDatabase(async (db, request, reply) => {
 *   const items = db.prepare('SELECT * FROM items').all();
 *   return { success: true, data: items };
 * }));
 */
export function withDatabase<TResult = unknown>(
  handler: (
    db: Database.Database,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<TResult> | TResult,
): RouteHandlerMethod {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<TResult> {
    const db = (this as FastifyWithServices).db;

    if (!db) {
      throw new DatabaseError('Database not available');
    }

    return handler(db, request, reply);
  };
}

/**
 * Route handler with service access
 * Type-safe service access with automatic error if service not found
 *
 * @example
 * fastify.get('/api/containers',
 *   withService('dockerMonitor', async (dockerMonitor, request, reply) => {
 *     const containers = await dockerMonitor.getContainers();
 *     return { success: true, data: containers };
 *   })
 * );
 */
export function withService<TService, TResult = unknown>(
  serviceName: string,
  handler: (
    service: TService,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<TResult> | TResult,
): RouteHandlerMethod {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<TResult> {
    const services = (this as FastifyWithServices).services;
    const service = services.get<TService>(serviceName);

    if (!service) {
      throw new Error(`Service '${serviceName}' not available`);
    }

    return handler(service, request, reply);
  };
}

/**
 * Route handler with both database and service access
 * Combines database and service injection for routes that need both
 *
 * @example
 * fastify.get('/api/pools',
 *   withDatabaseAndService('zfsManager', async (db, zfsManager, request, reply) => {
 *     const pools = await zfsManager.getAllPools();
 *     return { success: true, data: pools };
 *   })
 * );
 */
export function withDatabaseAndService<TService, TResult = unknown>(
  serviceName: string,
  handler: (
    db: Database.Database,
    service: TService,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<TResult> | TResult,
): RouteHandlerMethod {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<TResult> {
    const db = (this as FastifyWithServices).db;
    const services = (this as FastifyWithServices).services;

    if (!db) {
      throw new DatabaseError('Database not available');
    }

    const service = services.get<TService>(serviceName);

    if (!service) {
      throw new Error(`Service '${serviceName}' not available`);
    }

    return handler(db, service, request, reply);
  };
}

/**
 * Format a successful API response
 * Provides consistent response structure
 *
 * @example
 * return formatSuccess({ pools: [...] });
 * // Returns: { success: true, data: { pools: [...] }, timestamp: "..." }
 */
export function formatSuccess<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message }),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format an error API response
 * Provides consistent error response structure
 *
 * @example
 * return formatError('Pool not found');
 * // Returns: { success: false, error: "Pool not found", timestamp: "..." }
 */
export function formatError(error: string, message?: string): ApiResponse {
  return {
    success: false,
    error,
    ...(message && { message }),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Parse integer from request parameter/query with validation
 * Throws ValidationError if invalid
 *
 * @example
 * const limit = parseIntParam(request.query, 'limit', 50, 1, 1000);
 */
export function parseIntParam(
  source: Record<string, unknown>,
  key: string,
  defaultValue: number,
  min?: number,
  max?: number,
): number {
  const value = source[key];

  if (value === undefined || value === null) {
    return defaultValue;
  }

  const parsed = typeof value === 'string' ? parseInt(value, 10) : Number(value);

  if (isNaN(parsed)) {
    throw new Error(`Invalid ${key}: must be a number`);
  }

  if (min !== undefined && parsed < min) {
    throw new Error(`Invalid ${key}: must be >= ${min}`);
  }

  if (max !== undefined && parsed > max) {
    throw new Error(`Invalid ${key}: must be <= ${max}`);
  }

  return parsed;
}

/**
 * Parse boolean from request parameter/query
 * Accepts: true, false, 'true', 'false', '1', '0', 1, 0
 *
 * @example
 * const enabled = parseBoolParam(request.query, 'enabled', false);
 */
export function parseBoolParam(
  source: Record<string, unknown>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = source[key];

  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return defaultValue;
}

/**
 * Type-safe parameter extraction with defaults
 * Provides type inference for params/query with validation
 *
 * @example
 * const { app } = extractParams<{ app: string }>(request.params);
 * const { limit = 50 } = extractQuery<{ limit?: number }>(request.query);
 */
export function extractParams<T extends Record<string, unknown>>(
  params: unknown,
): T {
  return (params || {}) as T;
}

export function extractQuery<T extends Record<string, unknown>>(
  query: unknown,
): T {
  return (query || {}) as T;
}

export function extractBody<T extends Record<string, unknown>>(
  body: unknown,
): T {
  return (body || {}) as T;
}

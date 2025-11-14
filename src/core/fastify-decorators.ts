import type { FastifyInstance } from 'fastify';
import type { ServiceContainer } from './service-container.js';
import type Database from 'better-sqlite3';

/**
 * Type-safe Fastify instance with decorators
 */
export interface FastifyWithServices extends FastifyInstance {
  db: Database.Database;
  services: ServiceContainer;
}

/**
 * Register service container and database as Fastify decorators
 */
export function registerServiceDecorators(
  fastify: FastifyInstance,
  db: Database.Database,
  services: ServiceContainer,
): void {
  // Register database
  fastify.decorate('db', db);

  // Register service container
  fastify.decorate('services', services);
}

/**
 * Helper to get services with type safety
 * Throws error if service not found
 */
export function getService<T>(fastify: FastifyInstance, serviceName: string): T {
  const services = (fastify as FastifyWithServices).services;
  const service = services.get<T>(serviceName);

  if (!service) {
    throw new Error(`Service '${serviceName}' not found in container`);
  }

  return service;
}

/**
 * Helper to safely get an optional service
 * Returns undefined if service not found (useful for optional integrations)
 */
export function getOptionalService<T>(
  fastify: FastifyInstance,
  serviceName: string,
): T | undefined {
  const services = (fastify as FastifyWithServices).services;
  return services.get<T>(serviceName);
}

/**
 * Helper to get database with type safety
 */
export function getDatabase(fastify: FastifyInstance): Database.Database {
  const db = (fastify as FastifyWithServices).db;

  if (!db) {
    throw new Error('Database not available');
  }

  return db;
}

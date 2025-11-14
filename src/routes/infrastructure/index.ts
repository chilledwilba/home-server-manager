import type { FastifyInstance } from 'fastify';
import type { InfrastructureManager } from '../../services/infrastructure/manager.js';
import { registerAnalysisRoutes } from './analysis.js';
import { registerServiceRoutes } from './services.js';
import { registerDeploymentRoutes } from './deployment.js';
import { registerManagementRoutes } from './management.js';

/**
 * Infrastructure routes aggregator
 * Combines analysis, service, deployment, and management routes
 * Split from monolithic infrastructure.ts (322 lines) for better maintainability
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function infrastructureRoutes(
  fastify: FastifyInstance,
  options: {
    manager: InfrastructureManager;
  },
): Promise<void> {
  const { manager } = options;

  // Register all route modules
  registerAnalysisRoutes(fastify, manager);
  registerServiceRoutes(fastify, manager);
  registerDeploymentRoutes(fastify, manager);
  registerManagementRoutes(fastify, manager);
}

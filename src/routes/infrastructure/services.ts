import type { FastifyInstance } from 'fastify';
import type { InfrastructureManager } from '../../services/infrastructure/manager.js';
import {
  ExternalServiceError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '../../utils/error-types.js';
import { createLogger } from '../../utils/logger.js';
import { extractParams, extractQuery, formatSuccess } from '../../utils/route-helpers.js';

const logger = createLogger('infrastructure-services-routes');

/**
 * Infrastructure service routes
 * Handles service details and docker-compose template generation
 */
export function registerServiceRoutes(
  fastify: FastifyInstance,
  manager: InfrastructureManager,
): void {
  /**
   * GET /services/:name
   * Get details for a specific service
   */
  fastify.get<{
    Params: { name: string };
  }>('/services/:name', async (request) => {
    try {
      const { name } = extractParams<{ name: string }>(request.params);
      const { deployed, recommended } = await manager.analyzeInfrastructure();
      const allServices = [...deployed, ...recommended];

      const service = allServices.find(
        (s) => s.name.toLowerCase() === name.toLowerCase().replace(/-/g, ' '),
      );

      if (!service) {
        throw new NotFoundError(`Service '${name}' not found`);
      }

      return formatSuccess(service);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get service details');
      if (
        error instanceof ServiceUnavailableError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw new ExternalServiceError('Infrastructure', 'Failed to get service details', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /docker-compose/:name
   * Get docker-compose template for a service
   */
  fastify.get<{
    Params: { name: string };
    Querystring: { env?: string };
  }>('/docker-compose/:name', async (request) => {
    try {
      const { name } = extractParams<{ name: string }>(request.params);
      const { env } = extractQuery<{ env?: string }>(request.query);

      // Parse environment variables if provided
      let envVars: Record<string, string> | undefined;
      if (env) {
        try {
          envVars = JSON.parse(env) as Record<string, string>;
        } catch (parseError) {
          logger.error({ err: parseError, env }, 'Failed to parse environment variables JSON');
          throw new ValidationError('Invalid environment variables JSON');
        }
      }

      const dockerCompose = await manager.generateDockerCompose(name, envVars);

      return formatSuccess({
        service: name,
        compose: dockerCompose,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate docker-compose');
      if (
        error instanceof ServiceUnavailableError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw new ExternalServiceError('Infrastructure', 'Failed to generate docker-compose', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

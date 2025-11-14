import type { FastifyInstance } from 'fastify';
import type { InfrastructureManager } from '../../services/infrastructure/manager.js';
import { createLogger } from '../../utils/logger.js';
import {
  ServiceUnavailableError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../utils/error-types.js';
import { formatSuccess, extractParams, extractBody } from '../../utils/route-helpers.js';

const logger = createLogger('infrastructure-deployment-routes');

/**
 * Infrastructure deployment routes
 * Handles service deployment and removal
 */
export function registerDeploymentRoutes(
  fastify: FastifyInstance,
  manager: InfrastructureManager,
): void {
  /**
   * POST /deploy
   * Deploy a new service
   */
  fastify.post<{
    Body: {
      serviceName: string;
      stackName?: string;
      envVars?: Record<string, string>;
      autoStart?: boolean;
    };
  }>('/deploy', async (request) => {
    try {
      const { serviceName, stackName, envVars, autoStart } = extractBody<{
        serviceName: string;
        stackName?: string;
        envVars?: Record<string, string>;
        autoStart?: boolean;
      }>(request.body);

      if (!serviceName) {
        throw new ValidationError('serviceName is required');
      }

      logger.info(`Deploying service: ${serviceName}`);

      const result = await manager.deployService(serviceName, {
        stackName,
        envVars,
        autoStart,
      });

      if (result.success) {
        logger.info({ stackId: result.stackId }, `Service deployed successfully: ${serviceName}`);
      } else {
        logger.error({ err: result.error }, `Failed to deploy service: ${serviceName}`);
        throw new ExternalServiceError(
          'Infrastructure',
          `Failed to deploy service: ${result.error || 'Unknown error'}`,
        );
      }

      return formatSuccess(result.stackId ? { stackId: result.stackId } : undefined);
    } catch (error) {
      logger.error({ err: error }, 'Failed to deploy service');
      if (
        error instanceof ServiceUnavailableError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError ||
        error instanceof ExternalServiceError
      ) {
        throw error;
      }
      throw new ExternalServiceError('Infrastructure', 'Failed to deploy service', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /services/:name
   * Remove a deployed service
   */
  fastify.delete<{
    Params: { name: string };
  }>('/services/:name', async (request) => {
    try {
      const { name } = extractParams<{ name: string }>(request.params);

      logger.info(`Removing service: ${name}`);

      const result = await manager.removeService(name);

      if (result.success) {
        logger.info(`Service removed successfully: ${name}`);
      } else {
        logger.error({ err: result.error }, `Failed to remove service: ${name}`);
        throw new ExternalServiceError(
          'Infrastructure',
          `Failed to remove service: ${result.error || 'Unknown error'}`,
        );
      }

      return formatSuccess(
        undefined,
        result.success ? `Service '${name}' removed successfully` : undefined,
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to remove service');
      if (
        error instanceof ServiceUnavailableError ||
        error instanceof NotFoundError ||
        error instanceof ExternalServiceError
      ) {
        throw error;
      }
      throw new ExternalServiceError('Infrastructure', 'Failed to remove service', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

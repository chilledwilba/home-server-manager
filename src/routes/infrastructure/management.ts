import type { FastifyInstance } from 'fastify';
import type { InfrastructureManager } from '../../services/infrastructure/manager.js';
import { createLogger } from '../../utils/logger.js';
import {
  ServiceUnavailableError,
  DatabaseError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../utils/error-types.js';
import { withDatabase, formatSuccess, extractBody } from '../../utils/route-helpers.js';

const logger = createLogger('infrastructure-management-routes');

/**
 * Infrastructure management routes
 * Handles deployment history and validation
 */
export function registerManagementRoutes(
  fastify: FastifyInstance,
  manager: InfrastructureManager,
): void {
  /**
   * GET /deployments
   * Get deployment history
   */
  fastify.get(
    '/deployments',
    withDatabase(async (db) => {
      try {
        const deployments = db
          .prepare(
            `
        SELECT
          id, service_name, service_type, stack_id,
          deployed_at, removed_at, status, deployed_by
        FROM infrastructure_deployments
        ORDER BY deployed_at DESC
        LIMIT 100
      `,
          )
          .all();

        return formatSuccess(deployments);
      } catch (error) {
        logger.error({ err: error }, 'Failed to get deployment history');
        throw new DatabaseError('Failed to get deployment history', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * POST /validate
   * Validate a service deployment configuration
   */
  fastify.post<{
    Body: {
      serviceName: string;
    };
  }>('/validate', async (request) => {
    try {
      const { serviceName } = extractBody<{ serviceName: string }>(request.body);

      if (!serviceName) {
        throw new ValidationError('serviceName is required');
      }

      const validation = manager.validateDeployment(serviceName);

      return formatSuccess(validation);
    } catch (error) {
      logger.error({ err: error }, 'Failed to validate deployment');
      if (
        error instanceof ServiceUnavailableError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw new ExternalServiceError('Infrastructure', 'Failed to validate deployment', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

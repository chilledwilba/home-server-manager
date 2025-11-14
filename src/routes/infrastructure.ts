import type { FastifyInstance } from 'fastify';
import type { InfrastructureManager } from '../services/infrastructure/manager.js';
import { createLogger } from '../utils/logger.js';
import {
  ServiceUnavailableError,
  DatabaseError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../utils/error-types.js';
import {
  withDatabase,
  formatSuccess,
  extractParams,
  extractQuery,
  extractBody,
} from '../utils/route-helpers.js';

const logger = createLogger('infrastructure-routes');

// eslint-disable-next-line @typescript-eslint/require-await
export async function infrastructureRoutes(
  fastify: FastifyInstance,
  options: {
    manager: InfrastructureManager;
  },
): Promise<void> {
  const { manager } = options;

  /**
   * GET /analyze
   * Analyze current infrastructure deployment
   */
  fastify.get('/analyze', async () => {
    try {
      const analysis = await manager.analyzeInfrastructure();
      return formatSuccess(analysis);
    } catch (error) {
      logger.error({ err: error }, 'Failed to analyze infrastructure');
      if (error instanceof ServiceUnavailableError || error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError('Infrastructure', 'Failed to analyze infrastructure', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /services
   * List all available services (deployed and recommended)
   */
  fastify.get('/services', async () => {
    try {
      const { deployed, recommended } = await manager.analyzeInfrastructure();
      const allServices = [...deployed, ...recommended];

      // Remove duplicates based on name
      const uniqueServices = allServices.filter(
        (service, index, self) => index === self.findIndex((s) => s.name === service.name),
      );

      return formatSuccess(uniqueServices);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list services');
      if (error instanceof ServiceUnavailableError || error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError('Infrastructure', 'Failed to list services', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

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

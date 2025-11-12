import type { FastifyInstance } from 'fastify';
import type { InfrastructureManager } from '../services/infrastructure/manager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('infrastructure-routes');

// eslint-disable-next-line @typescript-eslint/require-await
export async function infrastructureRoutes(
  fastify: FastifyInstance,
  options: {
    manager: InfrastructureManager;
  },
): Promise<void> {
  const { manager } = options;

  // Analyze current infrastructure
  fastify.get('/analyze', async () => {
    try {
      const analysis = await manager.analyzeInfrastructure();
      return {
        success: true,
        data: analysis,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to analyze infrastructure');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze infrastructure',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // List all available services
  fastify.get('/services', async () => {
    try {
      const { deployed, recommended } = await manager.analyzeInfrastructure();
      const allServices = [...deployed, ...recommended];

      // Remove duplicates based on name
      const uniqueServices = allServices.filter(
        (service, index, self) => index === self.findIndex((s) => s.name === service.name),
      );

      return {
        success: true,
        data: uniqueServices,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to list services');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list services',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Get service details by name
  fastify.get<{
    Params: { name: string };
  }>('/services/:name', async (request) => {
    try {
      const { name } = request.params;
      const { deployed, recommended } = await manager.analyzeInfrastructure();
      const allServices = [...deployed, ...recommended];

      const service = allServices.find(
        (s) => s.name.toLowerCase() === name.toLowerCase().replace(/-/g, ' '),
      );

      if (!service) {
        return {
          success: false,
          error: `Service '${name}' not found`,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        data: service,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get service details');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get service details',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Get docker-compose template for a service
  fastify.get<{
    Params: { name: string };
    Querystring: { env?: string };
  }>('/docker-compose/:name', async (request) => {
    try {
      const { name } = request.params;
      const { env } = request.query;

      // Parse environment variables if provided
      let envVars: Record<string, string> | undefined;
      if (env) {
        try {
          envVars = JSON.parse(env) as Record<string, string>;
        } catch {
          return {
            success: false,
            error: 'Invalid environment variables JSON',
            timestamp: new Date().toISOString(),
          };
        }
      }

      const dockerCompose = await manager.generateDockerCompose(name, envVars);

      return {
        success: true,
        data: {
          service: name,
          compose: dockerCompose,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate docker-compose');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate docker-compose',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Deploy a service
  fastify.post<{
    Body: {
      serviceName: string;
      stackName?: string;
      envVars?: Record<string, string>;
      autoStart?: boolean;
    };
  }>('/deploy', async (request) => {
    try {
      const { serviceName, stackName, envVars, autoStart } = request.body;

      if (!serviceName) {
        return {
          success: false,
          error: 'serviceName is required',
          timestamp: new Date().toISOString(),
        };
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
      }

      return {
        success: result.success,
        data: result.stackId ? { stackId: result.stackId } : undefined,
        error: result.error,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to deploy service');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deploy service',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Remove a service
  fastify.delete<{
    Params: { name: string };
  }>('/services/:name', async (request) => {
    try {
      const { name } = request.params;

      logger.info(`Removing service: ${name}`);

      const result = await manager.removeService(name);

      if (result.success) {
        logger.info(`Service removed successfully: ${name}`);
      } else {
        logger.error({ err: result.error }, `Failed to remove service: ${name}`);
      }

      return {
        success: result.success,
        error: result.error,
        message: result.success ? `Service '${name}' removed successfully` : undefined,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to remove service');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove service',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Get deployment history
  fastify.get('/deployments', async () => {
    try {
      const db = (fastify as { db?: { prepare: (sql: string) => { all: () => unknown[] } } }).db;

      if (!db) {
        return {
          success: false,
          error: 'Database not available',
          timestamp: new Date().toISOString(),
        };
      }

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

      return {
        success: true,
        data: deployments,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get deployment history');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get deployment history',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Validate service deployment
  fastify.post<{
    Body: {
      serviceName: string;
    };
  }>('/validate', async (request) => {
    try {
      const { serviceName } = request.body;

      if (!serviceName) {
        return {
          success: false,
          error: 'serviceName is required',
          timestamp: new Date().toISOString(),
        };
      }

      const validation = manager.validateDeployment(serviceName);

      return {
        success: true,
        data: validation,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to validate deployment');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate deployment',
        timestamp: new Date().toISOString(),
      };
    }
  });
}

import type { FastifyInstance } from 'fastify';
import type { InfrastructureManager } from '../../services/infrastructure/manager.js';
import { createLogger } from '../../utils/logger.js';
import {
  ServiceUnavailableError,
  ExternalServiceError,
  NotFoundError,
} from '../../utils/error-types.js';
import { formatSuccess } from '../../utils/route-helpers.js';

const logger = createLogger('infrastructure-analysis-routes');

/**
 * Infrastructure analysis routes
 * Handles infrastructure analysis and service listing
 */
export function registerAnalysisRoutes(
  fastify: FastifyInstance,
  manager: InfrastructureManager,
): void {
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
}

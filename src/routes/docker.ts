import type { FastifyInstance } from 'fastify';
import type { DockerMonitor } from '../services/monitoring/docker-monitor.js';
import { formatSuccess, extractParams } from '../utils/route-helpers.js';
import { ExternalServiceError, NotFoundError } from '../utils/error-types.js';

export async function dockerRoutes(
  fastify: FastifyInstance,
  options: {
    monitor: DockerMonitor;
  },
): Promise<void> {
  const { monitor } = options;

  /**
   * GET /containers
   * Get all Docker containers
   */
  fastify.get('/containers', async () => {
    try {
      const containers = await monitor.getContainers();
      return formatSuccess(containers);
    } catch (error) {
      throw new ExternalServiceError('Docker', 'Failed to fetch containers', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /containers/:id/stats
   * Get statistics for a specific container
   */
  fastify.get<{
    Params: { id: string };
  }>('/containers/:id/stats', async (request) => {
    try {
      const { id } = extractParams<{ id: string }>(request.params);
      const stats = await monitor.getContainerStats(id);

      if (!stats) {
        throw new NotFoundError('Container', id);
      }

      return formatSuccess(stats);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError('Docker', 'Failed to fetch container stats', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /arr/:app
   * Get status for a specific Arr application (Sonarr, Radarr, etc.)
   */
  fastify.get<{
    Params: { app: string };
  }>('/arr/:app', async (request) => {
    try {
      const { app } = extractParams<{ app: string }>(request.params);
      const status = await monitor.getArrStatus(app);

      if (!status) {
        throw new NotFoundError('Arr application', app);
      }

      return formatSuccess(status);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      const { app } = extractParams<{ app: string }>(request.params);
      throw new ExternalServiceError('Arr', `Failed to fetch ${app} status`, {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

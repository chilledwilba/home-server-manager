import type { FastifyInstance } from 'fastify';
import type { DockerMonitor } from '../services/monitoring/docker-monitor.js';
import { ExternalServiceError, NotFoundError } from '../utils/error-types.js';

// eslint-disable-next-line @typescript-eslint/require-await
export async function dockerRoutes(
  fastify: FastifyInstance,
  options: {
    monitor: DockerMonitor;
  },
): Promise<void> {
  const { monitor } = options;

  // Get all containers
  fastify.get('/containers', async () => {
    try {
      const containers = await monitor.getContainers();
      return {
        success: true,
        data: containers,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new ExternalServiceError('Docker', 'Failed to fetch containers', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get container stats
  fastify.get<{
    Params: { id: string };
  }>('/containers/:id/stats', async (request) => {
    try {
      const { id } = request.params;
      const stats = await monitor.getContainerStats(id);

      if (!stats) {
        throw new NotFoundError('Container', id);
      }

      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError('Docker', 'Failed to fetch container stats', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get Arr app status
  fastify.get<{
    Params: { app: string };
  }>('/arr/:app', async (request) => {
    try {
      const { app } = request.params;
      const status = await monitor.getArrStatus(app);

      if (!status) {
        throw new NotFoundError('Arr application', app);
      }

      return {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError('Arr', `Failed to fetch ${request.params.app} status`, {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

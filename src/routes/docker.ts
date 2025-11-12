import type { FastifyInstance } from 'fastify';
import type { DockerMonitor } from '../services/monitoring/docker-monitor.js';

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
    const containers = await monitor.getContainers();
    return {
      success: true,
      data: containers,
      timestamp: new Date().toISOString(),
    };
  });

  // Get container stats
  fastify.get<{
    Params: { id: string };
  }>('/containers/:id/stats', async (request) => {
    const { id } = request.params;
    const stats = await monitor.getContainerStats(id);
    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };
  });

  // Get Arr app status
  fastify.get<{
    Params: { app: string };
  }>('/arr/:app', async (request) => {
    const { app } = request.params;
    const status = await monitor.getArrStatus(app);
    return {
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    };
  });
}

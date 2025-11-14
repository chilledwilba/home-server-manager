import type { FastifyInstance } from 'fastify';
import type { TrueNASMonitor } from '../services/monitoring/truenas-monitor.js';
import type { DiskFailurePredictor } from '../services/monitoring/disk-predictor.js';
import { createLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/error-types.js';

const logger = createLogger('monitoring-routes');

// eslint-disable-next-line @typescript-eslint/require-await
export async function monitoringRoutes(
  fastify: FastifyInstance,
  options: {
    monitor: TrueNASMonitor;
    predictor: DiskFailurePredictor;
  },
): Promise<void> {
  const { monitor, predictor } = options;

  // Get recent alerts
  fastify.get('/alerts', async () => {
    try {
      const alerts = monitor.getRecentAlerts(100);
      return {
        success: true,
        data: alerts,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new DatabaseError('Failed to fetch alerts', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get disk predictions
  fastify.get('/predictions', async () => {
    try {
      const predictions = predictor.getLatestPredictions();
      return {
        success: true,
        data: predictions,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new DatabaseError('Failed to fetch disk predictions', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Acknowledge alert
  fastify.post<{
    Params: { id: string };
  }>('/alerts/:id/acknowledge', async (request) => {
    try {
      const { id } = request.params;
      // Implementation would update the alert in database
      logger.info(`Alert ${id} acknowledged`);
      return {
        success: true,
        message: 'Alert acknowledged',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new DatabaseError('Failed to acknowledge alert', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Resolve alert
  fastify.post<{
    Params: { id: string };
  }>('/alerts/:id/resolve', async (request) => {
    try {
      const { id } = request.params;
      // Implementation would update the alert in database
      logger.info(`Alert ${id} resolved`);
      return {
        success: true,
        message: 'Alert resolved',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new DatabaseError('Failed to resolve alert', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

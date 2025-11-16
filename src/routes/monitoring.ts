import type { FastifyInstance } from 'fastify';
import type { DiskFailurePredictor } from '../services/monitoring/disk-predictor.js';
import type { TrueNASMonitor } from '../services/monitoring/truenas-monitor.js';
import { DatabaseError } from '../utils/error-types.js';
import { createLogger } from '../utils/logger.js';
import { extractParams, formatSuccess } from '../utils/route-helpers.js';

const logger = createLogger('monitoring-routes');

export async function monitoringRoutes(
  fastify: FastifyInstance,
  options: {
    monitor: TrueNASMonitor;
    predictor: DiskFailurePredictor;
  },
): Promise<void> {
  const { monitor, predictor } = options;

  /**
   * GET /alerts
   * Get recent alerts from the monitoring system
   */
  fastify.get('/alerts', () => {
    try {
      const alerts = monitor.getRecentAlerts(100);
      return formatSuccess(alerts);
    } catch (error) {
      throw new DatabaseError('Failed to fetch alerts', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /predictions
   * Get latest disk failure predictions
   */
  fastify.get('/predictions', () => {
    try {
      const predictions = predictor.getLatestPredictions();
      return formatSuccess(predictions);
    } catch (error) {
      throw new DatabaseError('Failed to fetch disk predictions', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /alerts/:id/acknowledge
   * Acknowledge a specific alert
   */
  fastify.post<{
    Params: { id: string };
  }>('/alerts/:id/acknowledge', (request) => {
    try {
      const { id } = extractParams<{ id: string }>(request.params);
      // Implementation would update the alert in database
      logger.info(`Alert ${id} acknowledged`);
      return formatSuccess(null, 'Alert acknowledged');
    } catch (error) {
      throw new DatabaseError('Failed to acknowledge alert', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /alerts/:id/resolve
   * Resolve a specific alert
   */
  fastify.post<{
    Params: { id: string };
  }>('/alerts/:id/resolve', async (request) => {
    try {
      const { id } = extractParams<{ id: string }>(request.params);
      // Implementation would update the alert in database
      logger.info(`Alert ${id} resolved`);
      return formatSuccess(null, 'Alert resolved');
    } catch (error) {
      throw new DatabaseError('Failed to resolve alert', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

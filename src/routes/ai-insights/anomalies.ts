import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AIInsightsService } from '../../services/ai/insights-service.js';
import type Database from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ai-anomalies-routes');

/**
 * Anomaly detection routes
 * Handles anomaly detection and historical data
 */
export function registerAnomalyRoutes(
  fastify: FastifyInstance,
  aiInsights: AIInsightsService,
  db: Database.Database,
): void {
  /**
   * GET /api/ai/anomalies
   * Detect anomalies in system metrics
   */
  fastify.get('/api/ai/anomalies', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { lookback = '24' } = request.query as { lookback?: string };
      const lookbackHours = parseInt(lookback, 10);

      if (isNaN(lookbackHours) || lookbackHours < 1 || lookbackHours > 168) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid lookback parameter. Must be between 1 and 168 hours.',
        });
      }

      logger.info(`Detecting anomalies (lookback: ${lookbackHours}h)...`);

      const anomalies = await aiInsights.detectAnomalies(lookbackHours);

      return reply.send({
        success: true,
        data: anomalies,
        lookback_hours: lookbackHours,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to detect anomalies');
      return reply.code(500).send({
        success: false,
        error: 'Failed to detect anomalies',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/ai/anomalies/history
   * Get historical anomaly detections
   */
  fastify.get('/api/ai/anomalies/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = '100', days = '7' } = request.query as { limit?: string; days?: string };

      const history = db
        .prepare(
          `
          SELECT *
          FROM anomaly_history
          WHERE detected_at > datetime('now', '-' || ? || ' days')
          ORDER BY detected_at DESC
          LIMIT ?
        `,
        )
        .all(days, limit);

      return reply.send({
        success: true,
        data: history,
        count: Array.isArray(history) ? history.length : 0,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch anomaly history');
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch anomaly history',
      });
    }
  });
}

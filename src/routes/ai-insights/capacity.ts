import type Database from 'better-sqlite3';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AIInsightsService } from '../../services/ai/insights-service.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ai-capacity-routes');

/**
 * Capacity planning routes
 * Handles resource capacity predictions and historical data
 */
export function registerCapacityRoutes(
  fastify: FastifyInstance,
  aiInsights: AIInsightsService,
  db: Database.Database,
): void {
  /**
   * GET /api/ai/capacity
   * Predict when resources will reach capacity
   */
  fastify.get('/api/ai/capacity', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { resource } = request.query as { resource?: string };

      logger.info(`Predicting capacity${resource ? ` for ${resource}` : ''}...`);

      const predictions = await aiInsights.predictCapacity(resource);

      return reply.send({
        success: true,
        data: predictions,
        count: predictions.length,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to predict capacity');
      return reply.code(500).send({
        success: false,
        error: 'Failed to predict capacity',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/ai/capacity/history
   * Get historical capacity predictions
   */
  fastify.get('/api/ai/capacity/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { resource, limit = '50' } = request.query as { resource?: string; limit?: string };

      const query = resource
        ? `SELECT * FROM capacity_predictions WHERE resource = ? ORDER BY predicted_at DESC LIMIT ?`
        : `SELECT * FROM capacity_predictions ORDER BY predicted_at DESC LIMIT ?`;

      const history = resource
        ? db.prepare(query).all(resource, limit)
        : db.prepare(query).all(limit);

      return reply.send({
        success: true,
        data: history,
        count: Array.isArray(history) ? history.length : 0,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch capacity history');
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch capacity history',
      });
    }
  });
}

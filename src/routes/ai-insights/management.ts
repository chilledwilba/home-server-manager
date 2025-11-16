import type Database from 'better-sqlite3';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../../utils/logger.js';
import type { AIInsightsRouteOptions } from './types.js';

const logger = createLogger('ai-management-routes');

/**
 * AI insights management routes
 * Handles insight dismissal, cleanup, and service status
 */
export function registerManagementRoutes(
  fastify: FastifyInstance,
  db: Database.Database,
  options: AIInsightsRouteOptions,
): void {
  const { ollamaEnabled, ollamaConfig } = options;

  /**
   * POST /api/ai/insights/:id/dismiss
   * Dismiss a specific insight
   */
  fastify.post<{ Params: { id: string } }>(
    '/api/ai/insights/:id/dismiss',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const result = db.prepare('UPDATE ai_insights SET dismissed = 1 WHERE id = ?').run(id);

        if (result.changes === 0) {
          return reply.code(404).send({
            success: false,
            error: 'Insight not found',
          });
        }

        return reply.send({
          success: true,
          message: 'Insight dismissed',
        });
      } catch (error) {
        logger.error({ err: error }, 'Failed to dismiss insight');
        return reply.code(500).send({
          success: false,
          error: 'Failed to dismiss insight',
        });
      }
    },
  );

  /**
   * DELETE /api/ai/insights/expired
   * Clean up expired insights
   */
  fastify.delete(
    '/api/ai/insights/expired',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = db
          .prepare(
            `
          DELETE FROM ai_insights
          WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
        `,
          )
          .run();

        return reply.send({
          success: true,
          deleted: result.changes,
          message: `Cleaned up ${result.changes} expired insights`,
        });
      } catch (error) {
        logger.error({ err: error }, 'Failed to clean up expired insights');
        return reply.code(500).send({
          success: false,
          error: 'Failed to clean up expired insights',
        });
      }
    },
  );

  /**
   * GET /api/ai/status
   * Get AI service status and configuration
   */
  fastify.get('/api/ai/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = {
        ollama_enabled: ollamaEnabled || false,
        ollama_configured: !!ollamaConfig,
        ollama_host: ollamaConfig?.host || 'not configured',
        ollama_model: ollamaConfig?.model || 'not configured',
        features: {
          anomaly_detection: true,
          capacity_planning: true,
          cost_optimization: true,
          performance_trends: true,
          ai_analysis: ollamaEnabled || false,
        },
        database: {
          insights_count: db
            .prepare('SELECT COUNT(*) as count FROM ai_insights WHERE dismissed = 0')
            .get() as { count: number },
          anomaly_count: db
            .prepare(
              "SELECT COUNT(*) as count FROM anomaly_history WHERE detected_at > datetime('now', '-7 days')",
            )
            .get() as { count: number },
        },
      };

      return reply.send({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to get AI status');
      return reply.code(500).send({
        success: false,
        error: 'Failed to get AI status',
      });
    }
  });
}

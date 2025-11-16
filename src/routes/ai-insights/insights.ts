import type Database from 'better-sqlite3';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AIInsightsService } from '../../services/ai/insights-service.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ai-insights-routes');

/**
 * General AI insights routes
 * Handles insights generation and retrieval
 */
export function registerInsightsRoutes(
  fastify: FastifyInstance,
  aiInsights: AIInsightsService,
  db: Database.Database,
): void {
  /**
   * GET /api/ai/insights
   * Get all current AI-generated insights
   */
  fastify.get('/api/ai/insights', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.info('Fetching AI insights...');

      const insights = await aiInsights.generateInsights();

      return reply.send({
        success: true,
        data: insights,
        count: insights.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch AI insights');
      return reply.code(500).send({
        success: false,
        error: 'Failed to generate AI insights',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/ai/insights/cached
   * Get cached insights from database (fast)
   */
  fastify.get('/api/ai/insights/cached', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cachedInsights = db
        .prepare(
          `
          SELECT *
          FROM ai_insights
          WHERE dismissed = 0
            AND (expires_at IS NULL OR expires_at > datetime('now'))
          ORDER BY generated_at DESC
          LIMIT 50
        `,
        )
        .all() as Array<{
        id: string;
        type: string;
        title: string;
        summary: string;
        details: string;
        severity: string;
        actionable: number;
        actions: string;
        generated_at: string;
        expires_at: string | null;
      }>;

      const insights = cachedInsights.map((insight) => ({
        ...insight,
        actionable: insight.actionable === 1,
        actions: JSON.parse(insight.actions || '[]'),
      }));

      return reply.send({
        success: true,
        data: insights,
        count: insights.length,
        cached: true,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch cached insights');
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch cached insights',
      });
    }
  });
}

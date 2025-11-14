import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AIInsightsService } from '../../services/ai/insights-service.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ai-analysis-routes');

/**
 * Performance and cost analysis routes
 * Handles cost optimization and performance trend analysis
 */
export function registerAnalysisRoutes(
  fastify: FastifyInstance,
  aiInsights: AIInsightsService,
): void {
  /**
   * GET /api/ai/cost-optimization
   * Generate cost optimization recommendations
   */
  fastify.get(
    '/api/ai/cost-optimization',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        logger.info('Generating cost optimization recommendations...');

        const optimizations = await aiInsights.generateCostOptimizations();

        return reply.send({
          success: true,
          data: optimizations,
        });
      } catch (error) {
        logger.error({ err: error }, 'Failed to generate cost optimizations');
        return reply.code(500).send({
          success: false,
          error: 'Failed to generate cost optimizations',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * GET /api/ai/performance-trends
   * Analyze performance trends over time
   */
  fastify.get(
    '/api/ai/performance-trends',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { period = '30' } = request.query as { period?: string };
        const periodDays = parseInt(period, 10);

        if (isNaN(periodDays) || periodDays < 1 || periodDays > 90) {
          return reply.code(400).send({
            success: false,
            error: 'Invalid period parameter. Must be between 1 and 90 days.',
          });
        }

        logger.info(`Analyzing performance trends (${periodDays} days)...`);

        const trends = aiInsights.analyzePerformanceTrends(periodDays);

        return reply.send({
          success: true,
          data: trends,
          period_days: periodDays,
          count: trends.length,
        });
      } catch (error) {
        logger.error({ err: error }, 'Failed to analyze performance trends');
        return reply.code(500).send({
          success: false,
          error: 'Failed to analyze performance trends',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );
}

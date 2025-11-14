import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import { AIInsightsService } from '../services/ai/insights-service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ai-insights-routes');

interface AIInsightsRouteOptions {
  db: Database.Database;
  ollamaEnabled?: boolean;
  ollamaConfig?: {
    host: string;
    port: number;
    model: string;
  };
}

/**
 * AI-powered insights routes
 * Provides anomaly detection, capacity planning, cost optimization, and performance analysis
 */
export async function aiInsightsRoutes(
  fastify: FastifyInstance,
  options: AIInsightsRouteOptions,
): Promise<void> {
  const { db, ollamaEnabled, ollamaConfig } = options;

  // Initialize AI insights service
  const aiInsights = new AIInsightsService(
    db,
    ollamaEnabled && ollamaConfig ? ollamaConfig : undefined,
  );

  // Initialize database tables
  aiInsights.initializeTables();

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

  logger.info('✓ AI insights routes registered');
}

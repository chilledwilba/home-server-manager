import type { FastifyInstance } from 'fastify';
import { AIInsightsService } from '../../services/ai/insights-service.js';
import { createLogger } from '../../utils/logger.js';
import { registerAnalysisRoutes } from './analysis.js';
import { registerAnomalyRoutes } from './anomalies.js';
import { registerCapacityRoutes } from './capacity.js';
import { registerInsightsRoutes } from './insights.js';
import { registerManagementRoutes } from './management.js';
import type { AIInsightsRouteOptions } from './types.js';

const logger = createLogger('ai-insights-routes');

/**
 * AI-powered insights routes aggregator
 * Combines insights, anomaly detection, capacity planning, analysis, and management routes
 * Split from monolithic ai-insights.ts (416 lines) for better maintainability
 */
export function aiInsightsRoutes(fastify: FastifyInstance, options: AIInsightsRouteOptions): void {
  const { db, ollamaEnabled, ollamaConfig } = options;

  // Initialize AI insights service
  const aiInsights = new AIInsightsService(
    db,
    ollamaEnabled && ollamaConfig ? ollamaConfig : undefined,
  );

  // Initialize database tables
  aiInsights.initializeTables();

  // Register all route modules
  registerInsightsRoutes(fastify, aiInsights, db);
  registerAnomalyRoutes(fastify, aiInsights, db);
  registerCapacityRoutes(fastify, aiInsights, db);
  registerAnalysisRoutes(fastify, aiInsights);
  registerManagementRoutes(fastify, db, options);

  logger.info('✓ AI insights routes registered');
}

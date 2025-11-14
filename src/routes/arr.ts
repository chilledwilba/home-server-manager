import type { FastifyInstance } from 'fastify';
import type { ArrOptimizer } from '../services/arr/arr-optimizer.js';
import { DatabaseError } from '../utils/error-types.js';
import {
  withService,
  withDatabase,
  formatSuccess,
  extractParams,
  extractQuery,
} from '../utils/route-helpers.js';

/**
 * Arr Suite Optimizer Routes
 * API endpoints for arr app monitoring and optimization
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function arrRoutes(fastify: FastifyInstance): Promise<void> {
  const arrOptimizer = (
    fastify as { arrOptimizer?: { getOptimizationSuggestions: (app: string) => string[] } }
  ).arrOptimizer;

  if (!arrOptimizer) {
    // Routes not available if arr optimizer is not initialized
    return;
  }

  /**
   * GET /api/arr/optimize/suggestions/:app
   * Get optimization suggestions for a specific Arr application
   */
  fastify.get<{
    Params: { app: string };
  }>(
    '/api/arr/optimize/suggestions/:app',
    withService<ArrOptimizer>('arrOptimizer', async (arrOptimizer, request) => {
      try {
        const { app } = extractParams<{ app: string }>(request.params);
        const suggestions = arrOptimizer.getOptimizationSuggestions(app);

        return formatSuccess({ app, suggestions });
      } catch (error) {
        throw new DatabaseError('Failed to get optimization suggestions', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * GET /api/arr/performance/:app
   * Get performance metrics for a specific Arr application
   */
  fastify.get<{
    Params: { app: string };
  }>(
    '/api/arr/performance/:app',
    withDatabase(async (db, request) => {
      try {
        const { app } = extractParams<{ app: string }>(request.params);

        const metrics = db
          .prepare(
            `
      SELECT * FROM arr_performance_metrics
      WHERE app_name = ?
      ORDER BY calculated_at DESC
      LIMIT 24
    `,
          )
          .all(app);

        return formatSuccess({ app, metrics });
      } catch (error) {
        throw new DatabaseError('Failed to fetch performance metrics', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * GET /api/arr/failed
   * Get failed downloads, optionally filtered by app
   */
  fastify.get<{
    Querystring: { app?: string; limit?: number };
  }>(
    '/api/arr/failed',
    withDatabase(async (db, request) => {
      try {
        const { app, limit = 20 } = extractQuery<{ app?: string; limit?: number }>(request.query);

        let query = 'SELECT * FROM arr_failed_downloads';
        const params: unknown[] = [];

        if (app) {
          query += ' WHERE app_name = ?';
          params.push(app);
        }

        query += ' ORDER BY failed_at DESC LIMIT ?';
        params.push(limit);

        const failures = db.prepare(query).all(...params);

        return formatSuccess({ failures });
      } catch (error) {
        throw new DatabaseError('Failed to fetch failed downloads', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * GET /api/arr/disk-usage
   * Get disk usage trends for all Arr applications
   */
  fastify.get(
    '/api/arr/disk-usage',
    withDatabase(async (db) => {
      try {
        const usage = db
          .prepare(
            `
      SELECT
        app_name,
        path,
        label,
        MIN(percent_used) as min_usage,
        MAX(percent_used) as max_usage,
        AVG(percent_used) as avg_usage,
        MAX(percent_used) - MIN(percent_used) as growth_rate
      FROM arr_disk_stats
      WHERE checked_at > datetime('now', '-7 days')
      GROUP BY app_name, path
    `,
          )
          .all();

        return formatSuccess({ usage });
      } catch (error) {
        throw new DatabaseError('Failed to fetch disk usage trends', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * GET /api/arr/queue/analysis
   * Get queue analysis across all Arr applications
   */
  fastify.get(
    '/api/arr/queue/analysis',
    withDatabase(async (db) => {
      try {
        const analysis = db
          .prepare(
            `
      SELECT
        app_name,
        AVG(total_items) as avg_queue_size,
        AVG(downloading) as avg_downloading,
        AVG(failed) as avg_failed,
        SUM(failed) as total_failed,
        AVG(total_size_gb) as avg_size_gb
      FROM arr_queue_stats
      WHERE checked_at > datetime('now', '-24 hours')
      GROUP BY app_name
    `,
          )
          .all();

        return formatSuccess({ analysis });
      } catch (error) {
        throw new DatabaseError('Failed to fetch queue analysis', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * GET /api/arr/queue/:app
   * Get queue stats for a specific Arr application
   */
  fastify.get<{
    Params: { app: string };
    Querystring: { limit?: number };
  }>(
    '/api/arr/queue/:app',
    withDatabase(async (db, request) => {
      try {
        const { app } = extractParams<{ app: string }>(request.params);
        const { limit = 50 } = extractQuery<{ limit?: number }>(request.query);

        const stats = db
          .prepare(
            `
      SELECT * FROM arr_queue_stats
      WHERE app_name = ?
      ORDER BY checked_at DESC
      LIMIT ?
    `,
          )
          .all(app, limit);

        return formatSuccess({ app, stats });
      } catch (error) {
        throw new DatabaseError('Failed to fetch queue stats', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * GET /api/arr/health/:app
   * Get health status for a specific Arr application
   */
  fastify.get<{
    Params: { app: string };
    Querystring: { limit?: number };
  }>(
    '/api/arr/health/:app',
    withDatabase(async (db, request) => {
      try {
        const { app } = extractParams<{ app: string }>(request.params);
        const { limit = 50 } = extractQuery<{ limit?: number }>(request.query);

        const health = db
          .prepare(
            `
      SELECT * FROM arr_health
      WHERE app_name = ?
      ORDER BY checked_at DESC
      LIMIT ?
    `,
          )
          .all(app, limit);

        return formatSuccess({ app, health });
      } catch (error) {
        throw new DatabaseError('Failed to fetch health status', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}

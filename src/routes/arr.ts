import type { FastifyInstance } from 'fastify';

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

  // Get optimization suggestions for an app
  fastify.get('/api/arr/optimize/suggestions/:app', async (request) => {
    const { app } = request.params as { app: string };
    const suggestions = arrOptimizer.getOptimizationSuggestions(app);

    return {
      success: true,
      app,
      suggestions,
      timestamp: new Date().toISOString(),
    };
  });

  // Get performance metrics for an app
  fastify.get('/api/arr/performance/:app', async (request) => {
    const { app } = request.params as { app: string };

    const db = (
      fastify as { db?: { prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] } } }
    ).db;
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

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

    return {
      success: true,
      app,
      metrics,
      timestamp: new Date().toISOString(),
    };
  });

  // Get failed downloads
  fastify.get('/api/arr/failed', async (request) => {
    const { app, limit = 20 } = request.query as { app?: string; limit?: number };

    const db = (
      fastify as { db?: { prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] } } }
    ).db;
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

    let query = 'SELECT * FROM arr_failed_downloads';
    const params: unknown[] = [];

    if (app) {
      query += ' WHERE app_name = ?';
      params.push(app);
    }

    query += ' ORDER BY failed_at DESC LIMIT ?';
    params.push(limit);

    const failures = db.prepare(query).all(...params);

    return {
      success: true,
      failures,
      timestamp: new Date().toISOString(),
    };
  });

  // Get disk usage trends
  fastify.get('/api/arr/disk-usage', async () => {
    const db = (
      fastify as { db?: { prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] } } }
    ).db;
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

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

    return {
      success: true,
      usage,
      timestamp: new Date().toISOString(),
    };
  });

  // Get queue analysis
  fastify.get('/api/arr/queue/analysis', async () => {
    const db = (
      fastify as { db?: { prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] } } }
    ).db;
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

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

    return {
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    };
  });

  // Get queue stats for an app
  fastify.get('/api/arr/queue/:app', async (request) => {
    const { app } = request.params as { app: string };
    const { limit = 50 } = request.query as { limit?: number };

    const db = (
      fastify as { db?: { prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] } } }
    ).db;
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

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

    return {
      success: true,
      app,
      stats,
      timestamp: new Date().toISOString(),
    };
  });

  // Get health status for an app
  fastify.get('/api/arr/health/:app', async (request) => {
    const { app } = request.params as { app: string };
    const { limit = 50 } = request.query as { limit?: number };

    const db = (
      fastify as { db?: { prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] } } }
    ).db;
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

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

    return {
      success: true,
      app,
      health,
      timestamp: new Date().toISOString(),
    };
  });
}

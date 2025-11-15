/**
 * Feature Flags API Routes
 * Provides endpoints for querying and managing feature flags
 */

import type { FastifyInstance } from 'fastify';
import { getFeatureFlagManager } from '../services/feature-flags/manager.js';

export async function featureFlagRoutes(app: FastifyInstance): Promise<void> {
  const manager = getFeatureFlagManager();

  // Get all feature flags
  app.get('/api/feature-flags', async (_request, _reply) => {
    const flags = manager.getAllFlags();
    return { success: true, flags };
  });

  // Get specific feature flag
  app.get<{ Params: { name: string } }>('/api/feature-flags/:name', async (request, reply) => {
    const flag = manager.getFlag(request.params.name);
    if (!flag) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'FLAG_NOT_FOUND',
          message: 'Feature flag not found',
        },
      });
    }
    return { success: true, flag };
  });

  // Check if feature is enabled (public endpoint)
  app.get<{ Params: { name: string } }>(
    '/api/feature-flags/:name/enabled',
    async (request, _reply) => {
      const isEnabled = manager.isEnabled(request.params.name, {
        environment: process.env['NODE_ENV'],
      });
      return { success: true, enabled: isEnabled };
    },
  );
}

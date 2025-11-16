/**
 * Feature Flag Middleware
 * Provides middleware and decorators for feature flag checking
 */

import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';
import { getFeatureFlagManager } from '../services/feature-flags/manager.js';

/**
 * Middleware to check feature flags before route execution
 */
export function requireFeatureFlag(flagName: string) {
  return function featureFlagMiddleware(
    _request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    const manager = getFeatureFlagManager();
    const isEnabled = manager.isEnabled(flagName, {
      environment: process.env['NODE_ENV'],
    });

    if (!isEnabled) {
      void reply.status(404).send({
        success: false,
        error: {
          code: 'FEATURE_NOT_AVAILABLE',
          message: `Feature '${flagName}' is not available`,
        },
      });
      return;
    }

    done();
  };
}

/**
 * Decorator to add feature flag check to Fastify instance
 */
export function addFeatureFlagSupport(app: FastifyInstance): void {
  app.decorate(
    'checkFeature',
    (flagName: string, context?: { userId?: string; environment?: string }) => {
      const manager = getFeatureFlagManager();
      return manager.isEnabled(flagName, context);
    },
  );
}

// Augment Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    checkFeature(flagName: string, context?: { userId?: string; environment?: string }): boolean;
  }
}

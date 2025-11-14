import type { FastifyInstance } from 'fastify';
import type { SecurityOrchestrator } from '../../services/security/orchestrator.js';
import { createLogger } from '../../utils/logger.js';
import { ServiceUnavailableError, ExternalServiceError } from '../../utils/error-types.js';
import { formatSuccess } from '../../utils/route-helpers.js';

const logger = createLogger('security-orchestrator-routes');

/**
 * Security orchestrator routes
 * Handles comprehensive security status from multiple services
 */
export async function orchestratorRoutes(
  fastify: FastifyInstance,
  options: {
    orchestrator?: SecurityOrchestrator;
  },
): Promise<void> {
  const { orchestrator } = options;

  /**
   * GET /status
   * Get comprehensive security status
   */
  fastify.get('/status', async () => {
    try {
      if (!orchestrator) {
        throw new ServiceUnavailableError('Security orchestrator not configured');
      }

      const status = await orchestrator.getStatus();
      return formatSuccess(status);
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      logger.error({ err: error }, 'Failed to get security status:');
      throw new ExternalServiceError('Security', 'Failed to get security status', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /tunnel/status
   * Get Cloudflare Tunnel status
   */
  fastify.get('/tunnel/status', async () => {
    try {
      if (!orchestrator) {
        throw new ServiceUnavailableError('Security orchestrator not configured');
      }

      const client = orchestrator.getCloudflareClient();
      if (!client) {
        throw new ServiceUnavailableError('Cloudflare Tunnel not configured');
      }

      const metrics = await client.getMetrics();
      return formatSuccess(metrics);
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      logger.error({ err: error }, 'Failed to get tunnel status:');
      throw new ExternalServiceError('Security', 'Failed to get tunnel status', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /auth/status
   * Get Authentik authentication status
   */
  fastify.get('/auth/status', async () => {
    try {
      if (!orchestrator) {
        throw new ServiceUnavailableError('Security orchestrator not configured');
      }

      const client = orchestrator.getAuthentikClient();
      if (!client) {
        throw new ServiceUnavailableError('Authentik not configured');
      }

      const status = await client.getSystemStatus();
      return formatSuccess(status);
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      logger.error({ err: error }, 'Failed to get Authentik status:');
      throw new ExternalServiceError('Security', 'Failed to get Authentik status', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /fail2ban/status
   * Get Fail2ban status
   */
  fastify.get('/fail2ban/status', async () => {
    try {
      if (!orchestrator) {
        throw new ServiceUnavailableError('Security orchestrator not configured');
      }

      const client = orchestrator.getFail2banClient();
      if (!client) {
        throw new ServiceUnavailableError('Fail2ban not configured');
      }

      const status = await client.getStatus();
      return formatSuccess(status);
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      logger.error({ err: error }, 'Failed to get Fail2ban status:');
      throw new ExternalServiceError('Security', 'Failed to get Fail2ban status', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

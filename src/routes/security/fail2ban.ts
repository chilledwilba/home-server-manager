import type { FastifyInstance } from 'fastify';
import type { SecurityOrchestrator } from '../../services/security/orchestrator.js';
import {
  DatabaseError,
  ExternalServiceError,
  ServiceUnavailableError,
  ValidationError,
} from '../../utils/error-types.js';
import { createLogger } from '../../utils/logger.js';
import { extractBody, formatSuccess, withDatabase } from '../../utils/route-helpers.js';
import { validateIPAddress } from '../../utils/validation.js';

const logger = createLogger('security-fail2ban-routes');

/**
 * Fail2ban action routes
 * Handles IP banning/unbanning and ban status management
 */
export function fail2banRoutes(
  fastify: FastifyInstance,
  options: {
    orchestrator?: SecurityOrchestrator;
  },
): void {
  const { orchestrator } = options;

  /**
   * POST /fail2ban/ban
   * Ban an IP address
   */
  fastify.post<{
    Body: {
      ip: string;
      jail?: string;
    };
  }>('/fail2ban/ban', async (request) => {
    try {
      if (!orchestrator) {
        throw new ServiceUnavailableError('Security orchestrator not configured');
      }

      const { ip, jail } = extractBody<{ ip: string; jail?: string }>(request.body);

      if (!ip) {
        throw new ValidationError('IP address is required');
      }

      // Validate IP address format
      const ipValidation = validateIPAddress(ip);
      if (!ipValidation.valid) {
        throw new ValidationError(ipValidation.error || 'Invalid IP address');
      }

      const client = orchestrator.getFail2banClient();
      if (!client) {
        throw new ServiceUnavailableError('Fail2ban not configured');
      }

      const result = await client.banIP(ip, jail);
      return formatSuccess(
        { banned: result },
        result ? `IP ${ip} banned successfully` : `Failed to ban IP ${ip}`,
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableError || error instanceof ValidationError) {
        throw error;
      }
      logger.error({ err: error }, 'Failed to ban IP:');
      throw new ExternalServiceError('Security', 'Failed to ban IP', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /fail2ban/unban
   * Unban an IP address
   */
  fastify.post<{
    Body: {
      ip: string;
      jail?: string;
    };
  }>('/fail2ban/unban', async (request) => {
    try {
      if (!orchestrator) {
        throw new ServiceUnavailableError('Security orchestrator not configured');
      }

      const { ip, jail } = extractBody<{ ip: string; jail?: string }>(request.body);

      if (!ip) {
        throw new ValidationError('IP address is required');
      }

      // Validate IP address format
      const ipValidation = validateIPAddress(ip);
      if (!ipValidation.valid) {
        throw new ValidationError(ipValidation.error || 'Invalid IP address');
      }

      const client = orchestrator.getFail2banClient();
      if (!client) {
        throw new ServiceUnavailableError('Fail2ban not configured');
      }

      const result = await client.unbanIP(ip, jail);
      return formatSuccess(
        { unbanned: result },
        result ? `IP ${ip} unbanned successfully` : `Failed to unban IP ${ip}`,
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableError || error instanceof ValidationError) {
        throw error;
      }
      logger.error({ err: error }, 'Failed to unban IP:');
      throw new ExternalServiceError('Security', 'Failed to unban IP', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /fail2ban/banned
   * Get all banned IP addresses
   */
  fastify.get('/fail2ban/banned', async () => {
    try {
      if (!orchestrator) {
        throw new ServiceUnavailableError('Security orchestrator not configured');
      }

      const client = orchestrator.getFail2banClient();
      if (!client) {
        throw new ServiceUnavailableError('Fail2ban not configured');
      }

      const bannedIPs = await client.getAllBannedIPs();
      return formatSuccess({ ips: bannedIPs, count: bannedIPs.length });
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      logger.error({ err: error }, 'Failed to get banned IPs:');
      throw new ExternalServiceError('Security', 'Failed to get banned IPs', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /status/history
   * Get security status history
   */
  fastify.get(
    '/status/history',
    withDatabase(async (db) => {
      try {
        const history = db
          .prepare(
            `
        SELECT *
        FROM security_status_log
        ORDER BY timestamp DESC
        LIMIT 100
      `,
          )
          .all();

        return formatSuccess(history);
      } catch (error) {
        logger.error({ err: error }, 'Failed to get security status history:');
        throw new DatabaseError('Failed to get security status history', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}

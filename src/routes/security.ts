import type { FastifyInstance } from 'fastify';
import type { SecurityScanner } from '../services/security/scanner.js';
import type { DockerMonitor } from '../services/monitoring/docker-monitor.js';
import type { SecurityOrchestrator } from '../services/security/orchestrator.js';
import { createLogger } from '../utils/logger.js';
import { validateIPAddress } from '../utils/validation.js';
import {
  ServiceUnavailableError,
  DatabaseError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../utils/error-types.js';
import { withDatabase, formatSuccess, extractBody } from '../utils/route-helpers.js';

const logger = createLogger('security-routes');

// eslint-disable-next-line @typescript-eslint/require-await
export async function securityRoutes(
  fastify: FastifyInstance,
  options: {
    scanner: SecurityScanner;
    dockerMonitor: DockerMonitor | null;
    orchestrator?: SecurityOrchestrator;
  },
): Promise<void> {
  const { scanner, dockerMonitor, orchestrator } = options;

  /**
   * POST /scan
   * Run a security scan on all Docker containers
   */
  fastify.post('/scan', async () => {
    try {
      if (!dockerMonitor) {
        throw new ServiceUnavailableError('Docker monitoring not configured');
      }

      const containers = await dockerMonitor.getContainers();
      const result = await scanner.scanAllContainers(containers as never[]);

      return formatSuccess(result);
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ExternalServiceError('Security', 'Failed to run security scan', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /findings
   * Get the latest security findings
   */
  fastify.get('/findings', async () => {
    try {
      const findings = scanner.getLatestFindings();
      return formatSuccess(findings);
    } catch (error) {
      if (error instanceof ServiceUnavailableError || error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError('Security', 'Failed to get latest findings', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /report
   * Generate a comprehensive security report
   */
  fastify.get('/report', async () => {
    try {
      const report = scanner.generateSecurityReport();
      return formatSuccess(report);
    } catch (error) {
      if (error instanceof ServiceUnavailableError || error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError('Security', 'Failed to generate security report', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /findings/fix
   * Mark a security finding as fixed
   */
  fastify.post<{
    Body: {
      container: string;
      type: string;
    };
  }>('/findings/fix', async (request) => {
    try {
      const { container, type } = extractBody<{ container: string; type: string }>(request.body);

      scanner.markFindingFixed(container, type);

      return formatSuccess(null, 'Finding marked as fixed');
    } catch (error) {
      if (error instanceof ServiceUnavailableError || error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError('Security', 'Failed to mark finding as fixed', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // === Security Orchestrator Routes (Phase 8) ===

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

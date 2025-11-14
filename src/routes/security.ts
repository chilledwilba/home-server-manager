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

  // Run security scan
  fastify.post('/scan', async () => {
    try {
      if (!dockerMonitor) {
        throw new ServiceUnavailableError('Docker monitoring not configured');
      }

      const containers = await dockerMonitor.getContainers();
      const result = await scanner.scanAllContainers(containers as never[]);

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ExternalServiceError('Security', 'Failed to run security scan', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get latest security findings
  fastify.get('/findings', async () => {
    try {
      const findings = scanner.getLatestFindings();
      return {
        success: true,
        data: findings,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableError || error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError('Security', 'Failed to get latest findings', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get security report
  fastify.get('/report', async () => {
    try {
      const report = scanner.generateSecurityReport();
      return {
        success: true,
        data: report,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableError || error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError('Security', 'Failed to generate security report', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Mark finding as fixed
  fastify.post<{
    Body: {
      container: string;
      type: string;
    };
  }>('/findings/fix', async (request) => {
    try {
      const { container, type } = request.body;

      scanner.markFindingFixed(container, type);

      return {
        success: true,
        message: 'Finding marked as fixed',
        timestamp: new Date().toISOString(),
      };
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

  // Get comprehensive security status
  fastify.get('/status', async () => {
    try {
      if (!orchestrator) {
        throw new ServiceUnavailableError('Security orchestrator not configured');
      }

      const status = await orchestrator.getStatus();
      return {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      };
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

  // Get Cloudflare Tunnel status
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
      return {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
      };
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

  // Get Authentik status
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
      return {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      };
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

  // Get Fail2ban status
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
      return {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      };
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

  // Ban an IP address
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

      const { ip, jail } = request.body;

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
      return {
        success: result,
        message: result ? `IP ${ip} banned successfully` : `Failed to ban IP ${ip}`,
        timestamp: new Date().toISOString(),
      };
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

  // Unban an IP address
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

      const { ip, jail } = request.body;

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
      return {
        success: result,
        message: result ? `IP ${ip} unbanned successfully` : `Failed to unban IP ${ip}`,
        timestamp: new Date().toISOString(),
      };
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

  // Get all banned IPs
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
      return {
        success: true,
        data: { ips: bannedIPs, count: bannedIPs.length },
        timestamp: new Date().toISOString(),
      };
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

  // Get security status history
  fastify.get('/status/history', async () => {
    try {
      const db = (fastify as { db?: { prepare: (sql: string) => { all: () => unknown[] } } }).db;

      if (!db) {
        throw new ServiceUnavailableError('Database not available');
      }

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

      return {
        success: true,
        data: history,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      logger.error({ err: error }, 'Failed to get security status history:');
      throw new DatabaseError('Failed to get security status history', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

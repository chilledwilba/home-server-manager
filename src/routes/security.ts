import type { FastifyInstance } from 'fastify';
import type { SecurityScanner } from '../services/security/scanner.js';
import type { DockerMonitor } from '../services/monitoring/docker-monitor.js';
import type { SecurityOrchestrator } from '../services/security/orchestrator.js';
import { createLogger } from '../utils/logger.js';
import { validateIPAddress } from '../utils/validation.js';

const logger = createLogger('security-routes');

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
    if (!dockerMonitor) {
      return {
        success: false,
        error: 'Docker monitoring not configured',
        timestamp: new Date().toISOString(),
      };
    }

    const containers = await dockerMonitor.getContainers();
    const result = await scanner.scanAllContainers(containers as never[]);

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  });

  // Get latest security findings
  fastify.get('/findings', async () => {
    const findings = scanner.getLatestFindings();
    return {
      success: true,
      data: findings,
      timestamp: new Date().toISOString(),
    };
  });

  // Get security report
  fastify.get('/report', async () => {
    const report = scanner.generateSecurityReport();
    return {
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    };
  });

  // Mark finding as fixed
  fastify.post<{
    Body: {
      container: string;
      type: string;
    };
  }>('/findings/fix', async (request) => {
    const { container, type } = request.body;

    scanner.markFindingFixed(container, type);

    return {
      success: true,
      message: 'Finding marked as fixed',
      timestamp: new Date().toISOString(),
    };
  });

  // === Security Orchestrator Routes (Phase 8) ===

  // Get comprehensive security status
  fastify.get('/status', async () => {
    if (!orchestrator) {
      return {
        success: false,
        error: 'Security orchestrator not configured',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const status = await orchestrator.getStatus();
      return {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get security status:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get security status',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Get Cloudflare Tunnel status
  fastify.get('/tunnel/status', async () => {
    if (!orchestrator) {
      return {
        success: false,
        error: 'Security orchestrator not configured',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const client = orchestrator.getCloudflareClient();
      if (!client) {
        return {
          success: false,
          error: 'Cloudflare Tunnel not configured',
          timestamp: new Date().toISOString(),
        };
      }

      const metrics = await client.getMetrics();
      return {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get tunnel status:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tunnel status',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Get Authentik status
  fastify.get('/auth/status', async () => {
    if (!orchestrator) {
      return {
        success: false,
        error: 'Security orchestrator not configured',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const client = orchestrator.getAuthentikClient();
      if (!client) {
        return {
          success: false,
          error: 'Authentik not configured',
          timestamp: new Date().toISOString(),
        };
      }

      const status = await client.getSystemStatus();
      return {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get Authentik status:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get Authentik status',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Get Fail2ban status
  fastify.get('/fail2ban/status', async () => {
    if (!orchestrator) {
      return {
        success: false,
        error: 'Security orchestrator not configured',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const client = orchestrator.getFail2banClient();
      if (!client) {
        return {
          success: false,
          error: 'Fail2ban not configured',
          timestamp: new Date().toISOString(),
        };
      }

      const status = await client.getStatus();
      return {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get Fail2ban status:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get Fail2ban status',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Ban an IP address
  fastify.post<{
    Body: {
      ip: string;
      jail?: string;
    };
  }>('/fail2ban/ban', async (request) => {
    if (!orchestrator) {
      return {
        success: false,
        error: 'Security orchestrator not configured',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const { ip, jail } = request.body;

      if (!ip) {
        return {
          success: false,
          error: 'IP address is required',
          timestamp: new Date().toISOString(),
        };
      }

      // Validate IP address format
      const ipValidation = validateIPAddress(ip);
      if (!ipValidation.valid) {
        return {
          success: false,
          error: ipValidation.error,
          timestamp: new Date().toISOString(),
        };
      }

      const client = orchestrator.getFail2banClient();
      if (!client) {
        return {
          success: false,
          error: 'Fail2ban not configured',
          timestamp: new Date().toISOString(),
        };
      }

      const result = await client.banIP(ip, jail);
      return {
        success: result,
        message: result ? `IP ${ip} banned successfully` : `Failed to ban IP ${ip}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to ban IP:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to ban IP',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Unban an IP address
  fastify.post<{
    Body: {
      ip: string;
      jail?: string;
    };
  }>('/fail2ban/unban', async (request) => {
    if (!orchestrator) {
      return {
        success: false,
        error: 'Security orchestrator not configured',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const { ip, jail } = request.body;

      if (!ip) {
        return {
          success: false,
          error: 'IP address is required',
          timestamp: new Date().toISOString(),
        };
      }

      // Validate IP address format
      const ipValidation = validateIPAddress(ip);
      if (!ipValidation.valid) {
        return {
          success: false,
          error: ipValidation.error,
          timestamp: new Date().toISOString(),
        };
      }

      const client = orchestrator.getFail2banClient();
      if (!client) {
        return {
          success: false,
          error: 'Fail2ban not configured',
          timestamp: new Date().toISOString(),
        };
      }

      const result = await client.unbanIP(ip, jail);
      return {
        success: result,
        message: result ? `IP ${ip} unbanned successfully` : `Failed to unban IP ${ip}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to unban IP:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to unban IP',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Get all banned IPs
  fastify.get('/fail2ban/banned', async () => {
    if (!orchestrator) {
      return {
        success: false,
        error: 'Security orchestrator not configured',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const client = orchestrator.getFail2banClient();
      if (!client) {
        return {
          success: false,
          error: 'Fail2ban not configured',
          timestamp: new Date().toISOString(),
        };
      }

      const bannedIPs = await client.getAllBannedIPs();
      return {
        success: true,
        data: { ips: bannedIPs, count: bannedIPs.length },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get banned IPs:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get banned IPs',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Get security status history
  fastify.get('/status/history', async () => {
    try {
      const db = (fastify as { db?: { prepare: (sql: string) => { all: () => unknown[] } } }).db;

      if (!db) {
        return {
          success: false,
          error: 'Database not available',
          timestamp: new Date().toISOString(),
        };
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
      logger.error({ err: error }, 'Failed to get security status history:');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get security status history',
        timestamp: new Date().toISOString(),
      };
    }
  });
}

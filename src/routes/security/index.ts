import type { FastifyInstance } from 'fastify';
import type { SecurityScanner } from '../../services/security/scanner.js';
import type { DockerMonitor } from '../../services/monitoring/docker-monitor.js';
import type { SecurityOrchestrator } from '../../services/security/orchestrator.js';
import { scannerRoutes } from './scanner.js';
import { orchestratorRoutes } from './orchestrator.js';
import { fail2banRoutes } from './fail2ban.js';

/**
 * Security routes aggregator
 * Combines scanner, orchestrator, and Fail2ban routes
 * Split from monolithic security.ts (377 lines) for better maintainability
 */

export async function securityRoutes(
  fastify: FastifyInstance,
  options: {
    scanner: SecurityScanner;
    dockerMonitor: DockerMonitor | null;
    orchestrator?: SecurityOrchestrator;
  },
): Promise<void> {
  const { scanner, dockerMonitor, orchestrator } = options;

  // Register scanner routes (vulnerability scanning)
  await scannerRoutes(fastify, { scanner, dockerMonitor });

  // Register orchestrator routes (comprehensive security status)
  await orchestratorRoutes(fastify, { orchestrator });

  // Register Fail2ban routes (IP banning/unbanning)
  await fail2banRoutes(fastify, { orchestrator });
}

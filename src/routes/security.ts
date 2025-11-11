import type { FastifyInstance } from 'fastify';
import type { SecurityScanner } from '../services/security/scanner.js';
import type { DockerMonitor } from '../services/monitoring/docker-monitor.js';

export async function securityRoutes(
  fastify: FastifyInstance,
  options: {
    scanner: SecurityScanner;
    dockerMonitor: DockerMonitor | null;
  },
): Promise<void> {
  const { scanner, dockerMonitor } = options;

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
}

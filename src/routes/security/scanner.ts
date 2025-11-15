import type { FastifyInstance } from 'fastify';
import type { SecurityScanner } from '../../services/security/scanner.js';
import type { DockerMonitor } from '../../services/monitoring/docker-monitor.js';
import {
  ServiceUnavailableError,
  ExternalServiceError,
  NotFoundError,
} from '../../utils/error-types.js';
import { formatSuccess, extractBody } from '../../utils/route-helpers.js';

/**
 * Security scanner routes
 * Handles vulnerability scanning and findings management
 */
export function scannerRoutes(
  fastify: FastifyInstance,
  options: {
    scanner: SecurityScanner;
    dockerMonitor: DockerMonitor | null;
  },
): void {
  const { scanner, dockerMonitor } = options;

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
}

import type { FastifyInstance } from 'fastify';
import type { HealthMonitor } from '../middleware/health-monitor.js';
import type { ArrOptimizer } from '../services/arr/arr-optimizer.js';
import type { InfrastructureManager } from '../services/infrastructure/manager.js';
import type { DockerMonitor } from '../services/monitoring/docker-monitor.js';
import type { TrueNASMonitor } from '../services/monitoring/truenas-monitor.js';
import type { SecurityOrchestrator } from '../services/security/orchestrator.js';
import type { ZFSManager } from '../services/zfs/manager.js';
import { logger } from '../utils/logger.js';
import type { FastifyWithServices } from './fastify-decorators.js';

/**
 * Register health check and system info endpoints
 */
export function registerHealthRoutes(
  fastify: FastifyInstance,
  healthMonitor?: HealthMonitor,
): void {
  const services = (fastify as FastifyWithServices).services;
  const db = (fastify as FastifyWithServices).db;

  // Enhanced health check endpoint with actual connectivity tests
  fastify.get('/health', async (_request, reply) => {
    // Use health monitor if available
    if (healthMonitor) {
      const report = healthMonitor.getHealthReport();
      const healthy = report.healthy;

      return reply.code(healthy ? 200 : 503).send({
        status: healthy ? 'healthy' : 'degraded',
        ...report,
        monitoring: getMonitoringStatus(services),
      });
    }

    // Fallback to original health check
    const checks = {
      server: true,
      database: false,
      truenas: false,
      portainer: false,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env['NODE_ENV'],
    };

    // Database check
    try {
      db.prepare('SELECT 1').get();
      checks.database = true;
    } catch (error) {
      logger.error({ err: error }, 'Database health check failed');
    }

    // TrueNAS check (if monitor is initialized)
    const truenasMonitor = services.get<TrueNASMonitor>('truenasMonitor');
    checks.truenas = truenasMonitor !== undefined;

    // Portainer check (if docker monitor is initialized)
    const dockerMonitor = services.get<DockerMonitor>('dockerMonitor');
    if (dockerMonitor) {
      try {
        const containers = await dockerMonitor.getContainers();
        checks.portainer = Array.isArray(containers);
      } catch (error) {
        logger.error({ err: error }, 'Portainer health check failed');
      }
    } else {
      checks.portainer = true; // Skip if not configured
    }

    // Overall health
    const healthy = checks.database && checks.truenas && checks.portainer;

    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'healthy' : 'degraded',
      checks,
      monitoring: getMonitoringStatus(services),
    });
  });

  // Readiness check (for Kubernetes)
  fastify.get('/ready', () => {
    return {
      ready: true,
      timestamp: new Date().toISOString(),
    };
  });

  // Liveness check
  fastify.get('/live', () => {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  });

  // System info endpoint
  fastify.get('/api/system/info', () => {
    return {
      success: true,
      data: {
        name: 'Home Server Monitor',
        version: '0.1.0',
        uptime: process.uptime(),
        monitoring: getMonitoringStatus(services),
      },
      timestamp: new Date().toISOString(),
    };
  });
}

/**
 * Get status of all monitoring services
 */
function getMonitoringStatus(services: {
  get: <T>(name: string) => T | undefined;
}): Record<string, boolean> {
  return {
    truenas: services.get<TrueNASMonitor>('truenasMonitor') !== undefined,
    docker: services.get<DockerMonitor>('dockerMonitor') !== undefined,
    security: true,
    zfs: services.get<ZFSManager>('zfsManager') !== undefined,
    notifications: true,
    remediation: true,
    arr: services.get<ArrOptimizer>('arrOptimizer') !== undefined,
    infrastructure: services.get<InfrastructureManager>('infrastructureManager') !== undefined,
    security_orchestrator: services.get<SecurityOrchestrator>('securityOrchestrator') !== undefined,
    database: true,
    socketio: true,
  };
}

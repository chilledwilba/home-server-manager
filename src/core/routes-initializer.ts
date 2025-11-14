import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { FastifyWithServices } from './fastify-decorators.js';
import type { TrueNASMonitor } from '../services/monitoring/truenas-monitor.js';
import type { DockerMonitor } from '../services/monitoring/docker-monitor.js';
import type { DiskFailurePredictor } from '../services/monitoring/disk-predictor.js';
import type { SecurityScanner } from '../services/security/scanner.js';
import type { SecurityOrchestrator } from '../services/security/orchestrator.js';
import type { InfrastructureManager } from '../services/infrastructure/manager.js';
import { monitoringRoutes } from '../routes/monitoring.js';
import { dockerRoutes } from '../routes/docker.js';
import { securityRoutes } from '../routes/security.js';
import { zfsRoutes } from '../routes/zfs.js';
import { notificationRoutes } from '../routes/notifications.js';
import { remediationRoutes } from '../routes/remediation.js';
import { arrRoutes } from '../routes/arr.js';
import { infrastructureRoutes } from '../routes/infrastructure.js';
import { logger } from '../utils/logger.js';

/**
 * Register all application routes
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  const services = (fastify as FastifyWithServices).services;
  const db = (fastify as FastifyWithServices).db;

  // Monitoring routes (TrueNAS)
  const truenasMonitor = services.get<TrueNASMonitor>('truenasMonitor');
  const diskPredictor = services.get<DiskFailurePredictor>('diskPredictor');
  if (truenasMonitor && diskPredictor) {
    await fastify.register(monitoringRoutes, {
      monitor: truenasMonitor,
      predictor: diskPredictor,
    });
    logger.info('Monitoring routes registered');
  }

  // Docker routes
  const dockerMonitor = services.get<DockerMonitor>('dockerMonitor');
  if (dockerMonitor) {
    await fastify.register(dockerRoutes, { monitor: dockerMonitor });
    logger.info('Docker routes registered');
  }

  // Security routes
  const securityScanner = services.get<SecurityScanner>('securityScanner');
  const securityOrchestrator = services.get<SecurityOrchestrator>('securityOrchestrator');
  if (securityScanner) {
    await fastify.register(securityRoutes, {
      scanner: securityScanner,
      dockerMonitor: dockerMonitor || null,
      orchestrator: securityOrchestrator || undefined,
    });
    logger.info('Security routes registered');
  }

  // ZFS routes
  await fastify.register(zfsRoutes);
  logger.info('ZFS routes registered');

  // Notification routes
  await fastify.register(notificationRoutes);
  logger.info('Notification routes registered');

  // Remediation routes
  await fastify.register(remediationRoutes);
  logger.info('Remediation routes registered');

  // Arr routes
  await fastify.register(arrRoutes);
  logger.info('Arr routes registered');

  // Infrastructure routes
  const infrastructureManager = services.get<InfrastructureManager>('infrastructureManager');
  if (infrastructureManager) {
    await fastify.register(infrastructureRoutes, { manager: infrastructureManager });
    logger.info('Infrastructure routes registered');
  }

  // UPS routes (if enabled)
  await registerUPSRoutes(fastify);

  // AI insights routes (if enabled)
  await registerAIInsightsRoutes(fastify, db);

  logger.info('All routes registered successfully');
}

/**
 * Register UPS monitoring routes if enabled
 */
async function registerUPSRoutes(fastify: FastifyInstance): Promise<void> {
  const upsEnabled = process.env['UPS_ENABLED'] === 'true';

  if (!upsEnabled) {
    return;
  }

  try {
    const { NUTClient } = await import('../integrations/ups/nut-client.js');
    const { UPSMonitor } = await import('../services/ups/ups-monitor.js');
    const { upsRoutes } = await import('../routes/ups.js');

    const services = (fastify as FastifyWithServices).services;
    const db = (fastify as FastifyWithServices).db;
    const io = services.getIO();

    const upsClient = new NUTClient({
      host: process.env['UPS_HOST'] || 'localhost',
      port: parseInt(process.env['UPS_PORT'] || '3493', 10),
      upsName: process.env['UPS_NAME'] || 'ups',
      timeout: 5000,
    });

    // Test UPS availability
    const available = await upsClient.isAvailable();
    if (!available) {
      logger.warn('UPS configured but not available - skipping UPS monitoring');
      return;
    }

    // Initialize UPS monitor
    const upsMonitor = new UPSMonitor({
      client: upsClient,
      db,
      io,
      intervals: {
        polling: 30000,
        onBattery: 10000,
      },
      thresholds: {
        criticalRuntime: parseInt(process.env['UPS_CRITICAL_RUNTIME'] || '600', 10),
        warningRuntime: parseInt(process.env['UPS_WARNING_RUNTIME'] || '1800', 10),
        lowBattery: parseInt(process.env['UPS_LOW_BATTERY'] || '25', 10),
      },
      enableShutdown: process.env['UPS_ENABLE_SHUTDOWN'] === 'true',
    });

    upsMonitor.start();

    // Register UPS services for graceful shutdown
    services.register('upsClient', upsClient);
    services.register('upsMonitor', upsMonitor);

    await fastify.register(upsRoutes, {
      client: upsClient,
      monitor: upsMonitor,
    });

    logger.info('UPS routes registered successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize UPS monitoring');
  }
}

/**
 * Register AI insights routes (with or without Ollama)
 */
async function registerAIInsightsRoutes(
  fastify: FastifyInstance,
  db: Database.Database,
): Promise<void> {
  const ollamaEnabled = process.env['OLLAMA_ENABLED'] === 'true';

  try {
    const { aiInsightsRoutes } = await import('../routes/ai-insights.js');

    if (ollamaEnabled) {
      await fastify.register(aiInsightsRoutes, {
        db,
        ollamaEnabled: true,
        ollamaConfig: {
          host: process.env['OLLAMA_HOST'] || 'localhost',
          port: parseInt(process.env['OLLAMA_PORT'] || '11434', 10),
          model: process.env['OLLAMA_MODEL'] || 'llama2:13b',
        },
      });
      logger.info('AI insights routes registered with Ollama integration');
    } else {
      await fastify.register(aiInsightsRoutes, {
        db,
        ollamaEnabled: false,
      });
      logger.info('AI insights routes registered (statistical analysis only)');
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to register AI insights routes');
  }
}

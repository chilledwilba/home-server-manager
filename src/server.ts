import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import caching from '@fastify/caching';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { logger } from './utils/logger.js';
import { getDatabase, closeDatabase } from './db/connection.js';
import { register, httpRequestDuration, httpRequestCounter } from './utils/metrics.js';
import type Database from 'better-sqlite3';
import { TrueNASClient } from './integrations/truenas/client.js';
import { TrueNASMonitor } from './services/monitoring/truenas-monitor.js';
import { DiskFailurePredictor } from './services/monitoring/disk-predictor.js';
import { DockerMonitor } from './services/monitoring/docker-monitor.js';
import { PortainerClient } from './integrations/portainer/client.js';
import { ArrClient, PlexClient } from './integrations/arr-apps/client.js';
import { SecurityScanner } from './services/security/scanner.js';
import { ZFSManager } from './services/zfs/manager.js';
import { ZFSAssistant } from './services/zfs/assistant.js';
import { NotificationService } from './services/alerting/notification-service.js';
import { AutoRemediationService } from './services/remediation/auto-remediation.js';
import { ArrOptimizer } from './services/arr/arr-optimizer.js';
import { SecurityOrchestrator } from './services/security/orchestrator.js';
import { InfrastructureManager } from './services/infrastructure/manager.js';
import { monitoringRoutes } from './routes/monitoring.js';
import { dockerRoutes } from './routes/docker.js';
import { securityRoutes } from './routes/security.js';
import { zfsRoutes } from './routes/zfs.js';
import { notificationRoutes } from './routes/notifications.js';
import { remediationRoutes } from './routes/remediation.js';
import { arrRoutes } from './routes/arr.js';
import { infrastructureRoutes } from './routes/infrastructure.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let monitor: TrueNASMonitor | null = null;
let dockerMonitor: DockerMonitor | null = null;
let zfsManager: ZFSManager | null = null;
let arrOptimizer: ArrOptimizer | null = null;
let securityOrchestrator: SecurityOrchestrator | null = null;
let infrastructureManager: InfrastructureManager | null = null;

/**
 * Build and configure the Fastify server
 */
async function buildServer(): Promise<ReturnType<typeof Fastify>> {
  const fastify = Fastify({
    logger,
    trustProxy: true,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Register caching (for expensive API endpoints)
  await fastify.register(caching, {
    privacy: 'private',
    expiresIn: 30, // 30 seconds default
  });

  // Initialize database
  const db = getDatabase();

  // Initialize Socket.IO
  const io = new Server(fastify.server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on('join:system', () => {
      void socket.join('system');
      logger.info(`Client ${socket.id} joined system room`);
    });

    socket.on('join:storage', () => {
      void socket.join('storage');
      logger.info(`Client ${socket.id} joined storage room`);
    });

    socket.on('join:smart', () => {
      void socket.join('smart');
      logger.info(`Client ${socket.id} joined smart room`);
    });

    socket.on('join:docker', () => {
      void socket.join('docker');
      logger.info(`Client ${socket.id} joined docker room`);
    });

    socket.on('join:arr', () => {
      void socket.join('arr');
      logger.info(`Client ${socket.id} joined arr room`);
    });

    socket.on('join:plex', () => {
      void socket.join('plex');
      logger.info(`Client ${socket.id} joined plex room`);
    });

    socket.on('join:security', () => {
      void socket.join('security');
      logger.info(`Client ${socket.id} joined security room`);
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  // Initialize TrueNAS monitoring (if configured)
  const trueNASHost = process.env['TRUENAS_HOST'];
  const trueNASKey = process.env['TRUENAS_API_KEY'];

  if (trueNASHost && trueNASKey && trueNASKey !== 'mock-truenas-api-key-replace-on-deploy') {
    try {
      const client = new TrueNASClient({
        host: trueNASHost,
        apiKey: trueNASKey,
        timeout: 5000,
      });

      monitor = new TrueNASMonitor({
        client,
        db,
        io,
        intervals: {
          system: parseInt(process.env['POLL_SYSTEM_INTERVAL'] || '30000', 10),
          storage: 60000,
          smart: parseInt(process.env['POLL_SMART_INTERVAL'] || '3600000', 10),
        },
      });

      monitor.start();
      logger.info('TrueNAS monitoring started');
    } catch (error) {
      logger.error({ err: error }, 'Failed to start TrueNAS monitoring');
    }
  } else {
    logger.info('TrueNAS monitoring disabled (no API key configured or using mock credentials)');
  }

  // Initialize disk predictor
  const predictor = new DiskFailurePredictor(db);

  // Initialize Docker monitoring (if configured)
  const portainerHost = process.env['PORTAINER_HOST'];
  const portainerPort = parseInt(process.env['PORTAINER_PORT'] || '9000', 10);
  const portainerToken = process.env['PORTAINER_TOKEN'];

  if (
    portainerHost &&
    portainerToken &&
    portainerToken !== 'mock-portainer-token-replace-on-deploy'
  ) {
    try {
      const portainer = new PortainerClient({
        host: portainerHost,
        port: portainerPort,
        token: portainerToken,
        endpointId: 1,
      });

      // Initialize Arr clients
      const arrClients: ArrClient[] = [];

      if (process.env['SONARR_API_KEY']) {
        arrClients.push(
          new ArrClient('Sonarr', {
            host: process.env['SONARR_HOST'] || portainerHost,
            port: parseInt(process.env['SONARR_PORT'] || '8989', 10),
            apiKey: process.env['SONARR_API_KEY'],
          }),
        );
      }

      if (process.env['RADARR_API_KEY']) {
        arrClients.push(
          new ArrClient('Radarr', {
            host: process.env['RADARR_HOST'] || portainerHost,
            port: parseInt(process.env['RADARR_PORT'] || '7878', 10),
            apiKey: process.env['RADARR_API_KEY'],
          }),
        );
      }

      if (process.env['PROWLARR_API_KEY']) {
        arrClients.push(
          new ArrClient('Prowlarr', {
            host: process.env['PROWLARR_HOST'] || portainerHost,
            port: parseInt(process.env['PROWLARR_PORT'] || '9696', 10),
            apiKey: process.env['PROWLARR_API_KEY'],
          }),
        );
      }

      // Initialize Plex client if configured
      let plexClient: PlexClient | undefined;
      if (process.env['PLEX_TOKEN']) {
        plexClient = new PlexClient({
          host: process.env['PLEX_HOST'] || portainerHost,
          port: parseInt(process.env['PLEX_PORT'] || '32400', 10),
          token: process.env['PLEX_TOKEN'],
        });
      }

      dockerMonitor = new DockerMonitor({
        portainer,
        arrClients,
        plexClient,
        db,
        io,
        interval: parseInt(process.env['POLL_DOCKER_INTERVAL'] || '5000', 10),
      });

      dockerMonitor.start();
      logger.info('Docker monitoring started');

      // Initialize Arr optimizer if arr clients are configured
      if (arrClients.length > 0) {
        arrOptimizer = new ArrOptimizer(db, io);

        // Register each arr client with optimizer
        for (const arrClient of arrClients) {
          let type: 'sonarr' | 'radarr' | 'prowlarr' | 'lidarr' | 'readarr' | 'bazarr' = 'sonarr';

          if (arrClient.name.toLowerCase().includes('radarr')) {
            type = 'radarr';
          } else if (arrClient.name.toLowerCase().includes('prowlarr')) {
            type = 'prowlarr';
          }

          arrOptimizer.registerApp({
            name: arrClient.name,
            client: arrClient,
            type,
          });
        }

        await arrOptimizer.start();
        logger.info(`Arr optimizer started with ${arrClients.length} apps`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to start Docker monitoring');
    }
  } else {
    logger.info(
      'Docker monitoring disabled (no Portainer token configured or using mock credentials)',
    );
  }

  // Initialize security scanner
  const securityScanner = new SecurityScanner(db, io);
  logger.info('Security scanner initialized');

  // Initialize infrastructure manager
  infrastructureManager = new InfrastructureManager(db);
  logger.info('Infrastructure manager initialized');

  // Initialize security orchestrator (Phase 8)
  const securityConfig = {
    cloudflare: process.env['CLOUDFLARE_API_TOKEN']
      ? {
          accountId: process.env['CLOUDFLARE_ACCOUNT_ID'] || '',
          apiToken: process.env['CLOUDFLARE_API_TOKEN'],
          tunnelId: process.env['CLOUDFLARE_TUNNEL_ID'],
        }
      : undefined,
    authentik: process.env['AUTHENTIK_TOKEN']
      ? {
          url: process.env['AUTHENTIK_URL'] || '',
          token: process.env['AUTHENTIK_TOKEN'],
        }
      : undefined,
    fail2ban:
      process.env['FAIL2BAN_ENABLED'] === 'true'
        ? {
            containerName: process.env['FAIL2BAN_CONTAINER_NAME'],
            useDocker: process.env['FAIL2BAN_USE_DOCKER'] === 'true',
          }
        : undefined,
  };

  if (securityConfig.cloudflare || securityConfig.authentik || securityConfig.fail2ban) {
    securityOrchestrator = new SecurityOrchestrator(db, io, securityConfig);
    securityOrchestrator.start();
    logger.info({
      cloudflare: !!securityConfig.cloudflare,
      authentik: !!securityConfig.authentik,
      fail2ban: !!securityConfig.fail2ban,
    });
  } else {
    logger.info('Security orchestrator disabled (no security components configured)');
  }

  // Initialize ZFS manager (if TrueNAS is configured)
  const zfsAssistant = new ZFSAssistant();

  if (trueNASHost && trueNASKey && trueNASKey !== 'mock-truenas-api-key-replace-on-deploy') {
    try {
      const zfsClient = new TrueNASClient({
        host: trueNASHost,
        apiKey: trueNASKey,
        timeout: 5000,
      });

      zfsManager = new ZFSManager(zfsClient, db);
      zfsManager.start();
      logger.info('ZFS automation started');
    } catch (error) {
      logger.error({ err: error }, 'Failed to start ZFS automation');
    }
  } else {
    logger.info('ZFS automation disabled (TrueNAS not configured)');
  }

  // Initialize notification service
  const notificationService = new NotificationService(db);
  logger.info('Notification service initialized');

  // Initialize auto-remediation service
  const portainerForRemediation =
    portainerHost && portainerToken && portainerToken !== 'mock-portainer-token-replace-on-deploy'
      ? new PortainerClient({
          host: portainerHost,
          port: portainerPort,
          token: portainerToken,
          endpointId: 1,
        })
      : undefined;

  const remediationService = new AutoRemediationService(db, portainerForRemediation);
  logger.info('Auto-remediation service initialized');

  // Initialize UPS monitoring (if enabled - Phase 6)
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  type NUTClientType = (typeof import('./integrations/ups/nut-client.js'))['NUTClient'];
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  type UPSMonitorType = (typeof import('./services/ups/ups-monitor.js'))['UPSMonitor'];
  let upsClient: InstanceType<NUTClientType> | null = null;
  let upsMonitor: InstanceType<UPSMonitorType> | null = null;

  const upsEnabled = process.env['UPS_ENABLED'] === 'true';
  if (upsEnabled) {
    try {
      const { NUTClient } = await import('./integrations/ups/nut-client.js');
      const { UPSMonitor } = await import('./services/ups/ups-monitor.js');

      upsClient = new NUTClient({
        host: process.env['UPS_HOST'] || 'localhost',
        port: parseInt(process.env['UPS_PORT'] || '3493', 10),
        upsName: process.env['UPS_NAME'] || 'ups',
        timeout: 5000,
      });

      // Test UPS availability
      const available = await upsClient.isAvailable();
      if (!available) {
        logger.warn('UPS configured but not available - continuing without UPS monitoring');
        upsClient = null;
      } else {
        // Initialize UPS monitor
        upsMonitor = new UPSMonitor({
          client: upsClient,
          db,
          io,
          intervals: {
            polling: 30000, // 30 seconds normal
            onBattery: 10000, // 10 seconds on battery
          },
          thresholds: {
            criticalRuntime: parseInt(process.env['UPS_CRITICAL_RUNTIME'] || '600', 10),
            warningRuntime: parseInt(process.env['UPS_WARNING_RUNTIME'] || '1800', 10),
            lowBattery: parseInt(process.env['UPS_LOW_BATTERY'] || '25', 10),
          },
          enableShutdown: process.env['UPS_ENABLE_SHUTDOWN'] === 'true',
        });

        upsMonitor.start();
        logger.info('UPS monitoring started successfully');
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize UPS monitoring');
    }
  } else {
    logger.info('UPS monitoring disabled');
  }

  // Make services available to routes
  (fastify as { zfsManager?: ZFSManager | null; zfsAssistant?: ZFSAssistant }).zfsManager =
    zfsManager;
  (fastify as { zfsAssistant?: ZFSAssistant }).zfsAssistant = zfsAssistant;
  (fastify as { notificationService?: NotificationService }).notificationService =
    notificationService;
  (fastify as { remediationService?: AutoRemediationService }).remediationService =
    remediationService;
  (fastify as { arrOptimizer?: ArrOptimizer | null }).arrOptimizer = arrOptimizer;
  (fastify as { db?: Database.Database }).db = db;

  // Register routes
  if (monitor) {
    await fastify.register(monitoringRoutes, { monitor, predictor });
  }

  if (dockerMonitor) {
    await fastify.register(dockerRoutes, { monitor: dockerMonitor });
  }

  await fastify.register(securityRoutes, {
    scanner: securityScanner,
    dockerMonitor,
    orchestrator: securityOrchestrator || undefined,
  });
  await fastify.register(zfsRoutes);
  await fastify.register(notificationRoutes);
  await fastify.register(remediationRoutes);
  await fastify.register(arrRoutes);

  // Register infrastructure routes (Phase 8)
  if (infrastructureManager) {
    await fastify.register(infrastructureRoutes, { manager: infrastructureManager });
  }

  // Register UPS routes (Phase 6)
  if (upsClient) {
    const { upsRoutes } = await import('./routes/ups.js');
    await fastify.register(upsRoutes, { client: upsClient, monitor: upsMonitor || undefined });
    logger.info('UPS routes registered');
  }

  // Enhanced health check endpoint with actual connectivity tests
  fastify.get('/health', async (_request, reply) => {
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
    // Note: Monitor runs in background, so we just check if it's configured
    checks.truenas = monitor !== null;

    // Portainer check (if docker monitor is initialized)
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
      monitoring: {
        truenas: monitor !== null,
        docker: dockerMonitor !== null,
        security: true,
        zfs: zfsManager !== null,
        notifications: true,
        remediation: true,
        arr: arrOptimizer !== null,
        infrastructure: infrastructureManager !== null,
        security_orchestrator: securityOrchestrator !== null,
        database: true,
        socketio: true,
      },
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

  // Prometheus metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  // Request duration tracking hooks
  fastify.addHook('onRequest', (request, _reply, done) => {
    interface RequestWithTime extends FastifyRequest {
      startTime?: number;
    }
    (request as RequestWithTime).startTime = Date.now();
    done();
  });

  fastify.addHook('onResponse', (request, reply, done) => {
    interface RequestWithTime extends FastifyRequest {
      startTime?: number;
      routerPath?: string;
    }
    const duration = (Date.now() - ((request as RequestWithTime).startTime || Date.now())) / 1000;
    const route: string = (request as RequestWithTime).routerPath || request.url || 'unknown';
    const statusCode: string = String(reply.statusCode);

    httpRequestDuration.labels(request.method, route, statusCode).observe(duration);

    httpRequestCounter.labels(request.method, route, statusCode).inc();
    done();
  });

  // System info endpoint
  fastify.get('/api/system/info', () => {
    return {
      success: true,
      data: {
        name: 'Home Server Monitor',
        version: '0.1.0',
        uptime: process.uptime(),
        monitoring: {
          truenas: monitor !== null,
          docker: dockerMonitor !== null,
          security: true,
          zfs: zfsManager !== null,
          notifications: true,
          remediation: true,
          arr: arrOptimizer !== null,
          infrastructure: infrastructureManager !== null,
          security_orchestrator: securityOrchestrator !== null,
          mcp: false,
        },
      },
      timestamp: new Date().toISOString(),
    };
  });

  // Serve static files in production
  if (process.env['NODE_ENV'] === 'production') {
    const clientPath = path.join(__dirname, '../dist/client');

    await fastify.register(fastifyStatic, {
      root: clientPath,
      prefix: '/',
    });

    // SPA fallback for React Router
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/health')) {
        reply.status(404).send({ error: 'Not found' });
      } else {
        reply.sendFile('index.html');
      }
    });

    logger.info({ clientPath }, 'Serving static files');
  }

  return fastify;
}

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    const server = await buildServer();
    const port = parseInt(process.env['PORT'] || '3100', 10);
    const host = process.env['HOST'] || '0.0.0.0';

    await server.listen({ port, host });

    logger.info({
      msg: 'Server started successfully',
      port,
      host,
      env: process.env['NODE_ENV'],
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  if (monitor) {
    monitor.stop();
  }
  if (dockerMonitor) {
    dockerMonitor.stop();
  }
  if (zfsManager) {
    zfsManager.stop();
  }
  if (arrOptimizer) {
    arrOptimizer.stop();
  }
  if (securityOrchestrator) {
    securityOrchestrator.stop();
  }
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  if (monitor) {
    monitor.stop();
  }
  if (dockerMonitor) {
    dockerMonitor.stop();
  }
  if (zfsManager) {
    zfsManager.stop();
  }
  if (arrOptimizer) {
    arrOptimizer.stop();
  }
  if (securityOrchestrator) {
    securityOrchestrator.stop();
  }
  closeDatabase();
  process.exit(0);
});

// Start server
void start();

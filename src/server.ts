import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { logger } from './utils/logger.js';
import { getDatabase, closeDatabase } from './db/connection.js';
import { TrueNASClient } from './integrations/truenas/client.js';
import { TrueNASMonitor } from './services/monitoring/truenas-monitor.js';
import { DiskFailurePredictor } from './services/monitoring/disk-predictor.js';
import { DockerMonitor } from './services/monitoring/docker-monitor.js';
import { PortainerClient } from './integrations/portainer/client.js';
import { ArrClient, PlexClient } from './integrations/arr-apps/client.js';
import { SecurityScanner } from './services/security/scanner.js';
import { ZFSManager } from './services/zfs/manager.js';
import { ZFSAssistant } from './services/zfs/assistant.js';
import { monitoringRoutes } from './routes/monitoring.js';
import { dockerRoutes } from './routes/docker.js';
import { securityRoutes } from './routes/security.js';
import { zfsRoutes } from './routes/zfs.js';

let monitor: TrueNASMonitor | null = null;
let dockerMonitor: DockerMonitor | null = null;
let zfsManager: ZFSManager | null = null;

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
    logger.info(
      'TrueNAS monitoring disabled (no API key configured or using mock credentials)',
    );
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
    } catch (error) {
      logger.error({ err: error }, 'Failed to start Docker monitoring');
    }
  } else {
    logger.info('Docker monitoring disabled (no Portainer token configured or using mock credentials)');
  }

  // Initialize security scanner
  const securityScanner = new SecurityScanner(db, io);
  logger.info('Security scanner initialized');

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

  // Make ZFS manager and assistant available to routes
  (fastify as {zfsManager?: ZFSManager | null; zfsAssistant?: ZFSAssistant}).zfsManager = zfsManager;
  (fastify as {zfsAssistant?: ZFSAssistant}).zfsAssistant = zfsAssistant;

  // Register routes
  await fastify.register(monitoringRoutes, { monitor: monitor!, predictor });

  if (dockerMonitor) {
    await fastify.register(dockerRoutes, { monitor: dockerMonitor });
  }

  await fastify.register(securityRoutes, { scanner: securityScanner, dockerMonitor });
  await fastify.register(zfsRoutes);

  // Health check endpoint
  fastify.get('/health', () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env['NODE_ENV'],
      monitoring: {
        truenas: monitor !== null,
        docker: dockerMonitor !== null,
        security: true,
        zfs: zfsManager !== null,
        database: true,
        socketio: true,
      },
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
        monitoring: {
          truenas: monitor !== null,
          docker: dockerMonitor !== null,
          security: true,
          zfs: zfsManager !== null,
          mcp: false,
        },
      },
      timestamp: new Date().toISOString(),
    };
  });

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
    logger.error(error, 'Failed to start server');
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
  closeDatabase();
  process.exit(0);
});

// Start server
void start();

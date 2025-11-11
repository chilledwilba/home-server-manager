import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { logger } from './utils/logger.js';
import { getDatabase, closeDatabase } from './db/connection.js';
import { TrueNASClient } from './integrations/truenas/client.js';
import { TrueNASMonitor } from './services/monitoring/truenas-monitor.js';
import { DiskFailurePredictor } from './services/monitoring/disk-predictor.js';
import { monitoringRoutes } from './routes/monitoring.js';

let monitor: TrueNASMonitor | null = null;

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

  // Register routes
  await fastify.register(monitoringRoutes, { monitor: monitor!, predictor });

  // Health check endpoint
  fastify.get('/health', () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env['NODE_ENV'],
      monitoring: {
        truenas: monitor !== null,
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
          docker: false,
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
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  if (monitor) {
    monitor.stop();
  }
  closeDatabase();
  process.exit(0);
});

// Start server
void start();

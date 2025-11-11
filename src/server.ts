import Fastify from 'fastify';
import { logger } from './utils/logger.js';

/**
 * Build and configure the Fastify server
 */
async function buildServer(): Promise<ReturnType<typeof Fastify>> {
  const fastify = Fastify({
    logger,
    trustProxy: true,
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env['NODE_ENV'],
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
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

// Start server
void start();

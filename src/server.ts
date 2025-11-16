import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { swaggerConfig, swaggerUiConfig } from './config/swagger.js';
import { registerServiceDecorators } from './core/fastify-decorators.js';
import { registerHealthRoutes } from './core/health-routes.js';
import {
  registerErrorHandler,
  registerMetricsEndpoint,
  registerMiddleware,
  registerStaticFiles,
} from './core/middleware-initializer.js';
import { registerRoutes } from './core/routes-initializer.js';
import { ServiceContainer } from './core/service-container.js';
import { createSocketIOServer } from './core/socket-io.js';
import { closeDatabase, getDatabase } from './db/connection.js';
import { addFeatureFlagSupport } from './middleware/feature-flag.js';
import { HealthMonitor } from './middleware/health-monitor.js';
import { logger } from './utils/logger.js';

/**
 * Build and configure the Fastify server with dependency injection
 */
async function buildServer(): Promise<ReturnType<typeof Fastify>> {
  const fastify = Fastify({
    logger,
    trustProxy: true,
  });

  // Initialize core dependencies
  const db = getDatabase();
  const io = createSocketIOServer(fastify.server);

  // Initialize service container with dependency injection
  const services = new ServiceContainer({ db, io });
  await services.initialize();

  // Initialize health monitor with circuit breakers
  const healthMonitor = new HealthMonitor(services, db);

  // Register decorators for type-safe service access
  registerServiceDecorators(fastify, db, services);

  // Register feature flag support
  addFeatureFlagSupport(fastify);

  // Register middleware (CORS, caching, request logging, metrics)
  await registerMiddleware(fastify);

  // Register Swagger/OpenAPI documentation
  await fastify.register(fastifySwagger, swaggerConfig);
  await fastify.register(fastifySwaggerUi, swaggerUiConfig);

  // Register all application routes
  await registerRoutes(fastify);

  // Register health check and system info endpoints
  registerHealthRoutes(fastify, healthMonitor);

  // Register Prometheus metrics endpoint
  registerMetricsEndpoint(fastify);

  // Register error handler (must be after all routes)
  registerErrorHandler(fastify);

  // Register static file serving for production
  await registerStaticFiles(fastify);

  // Start monitoring services
  await services.start();

  // Start health monitor (with circuit breakers and automatic recovery)
  healthMonitor.start();

  // Setup graceful shutdown
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down gracefully...');
    healthMonitor.stop();
    services.shutdown();
    await fastify.close();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

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

// Start server
void start();

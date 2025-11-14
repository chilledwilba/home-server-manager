import type { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import caching from '@fastify/caching';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorHandler } from '../middleware/error-handler.js';
import { registerRequestLogging } from '../middleware/request-logger.js';
import { correlationIdMiddleware } from '../middleware/correlation-id.js';
import { register, httpRequestDuration, httpRequestCounter } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Register all middleware in the correct order
 */
export async function registerMiddleware(fastify: FastifyInstance): Promise<void> {
  // Register CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Register caching (for expensive API endpoints)
  await fastify.register(caching, {
    privacy: 'private',
    expiresIn: 30, // 30 seconds default
  });

  // Correlation ID tracking (must be first to ensure all requests have IDs)
  fastify.addHook('onRequest', correlationIdMiddleware);

  // Register request logging middleware
  registerRequestLogging(fastify);

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

  logger.info('Middleware registered');
}

/**
 * Register static file serving and SPA fallback for production
 */
export async function registerStaticFiles(fastify: FastifyInstance): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    const clientPath = path.join(__dirname, '../../dist/client');

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
}

/**
 * Register error handler (must be called after all routes are registered)
 */
export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler(errorHandler);
  logger.info('Error handler registered');
}

/**
 * Register Prometheus metrics endpoint
 */
export function registerMetricsEndpoint(fastify: FastifyInstance): void {
  fastify.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });
}

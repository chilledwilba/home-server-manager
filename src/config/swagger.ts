import type { SwaggerOptions } from '@fastify/swagger';
import type { FastifySwaggerUiOptions } from '@fastify/swagger-ui';

export const swaggerConfig: SwaggerOptions = {
  openapi: {
    info: {
      title: 'Home Server Manager API',
      description:
        'Enterprise-grade TrueNAS monitoring with AI assistance, Docker management, and comprehensive system health tracking',
      version: '0.1.0',
      contact: {
        name: 'Home Server Manager',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3100',
        description: 'Development server',
      },
      {
        url: 'https://home-server.local:3100',
        description: 'Production server',
      },
    ],
    tags: [
      { name: 'health', description: 'Health check and system information endpoints' },
      { name: 'metrics', description: 'Prometheus metrics' },
      { name: 'truenas', description: 'TrueNAS integration endpoints' },
      { name: 'docker', description: 'Docker container management' },
      { name: 'zfs', description: 'ZFS pool and snapshot management' },
      { name: 'monitoring', description: 'System monitoring and alerts' },
      { name: 'security', description: 'Security scanning and fail2ban' },
      { name: 'arr', description: 'Arr stack (Sonarr, Radarr, etc.) integration' },
      { name: 'ups', description: 'UPS/NUT monitoring' },
      { name: 'notifications', description: 'Notification management' },
      { name: 'remediation', description: 'Automated remediation actions' },
      { name: 'ai-insights', description: 'AI-powered insights and analysis' },
      { name: 'infrastructure', description: 'Infrastructure management' },
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API key for authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
            message: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            message: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
};

export const swaggerUiConfig: FastifySwaggerUiOptions = {
  routePrefix: '/api/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
  theme: {
    title: 'Home Server Manager API Documentation',
  },
};

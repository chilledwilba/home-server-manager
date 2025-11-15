import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Health check response schema
 */
export const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  checks: z.object({
    server: z.boolean().optional(),
    database: z.boolean(),
    truenas: z.boolean(),
    portainer: z.boolean(),
    timestamp: z.string().datetime(),
    uptime: z.number(),
    environment: z.string().optional(),
  }),
  monitoring: z.object({
    truenas: z.boolean(),
    docker: z.boolean(),
    security: z.boolean(),
    zfs: z.boolean(),
    notifications: z.boolean(),
    remediation: z.boolean(),
    arr: z.boolean(),
    infrastructure: z.boolean(),
    security_orchestrator: z.boolean(),
    database: z.boolean(),
    socketio: z.boolean(),
  }),
});

/**
 * Readiness check response schema
 */
export const readinessResponseSchema = z.object({
  ready: z.boolean(),
  timestamp: z.string().datetime(),
});

/**
 * Liveness check response schema
 */
export const livenessResponseSchema = z.object({
  alive: z.boolean(),
  timestamp: z.string().datetime(),
});

/**
 * System info response schema
 */
export const systemInfoResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    name: z.string(),
    version: z.string(),
    uptime: z.number(),
    monitoring: z.object({
      truenas: z.boolean(),
      docker: z.boolean(),
      security: z.boolean(),
      zfs: z.boolean(),
      notifications: z.boolean(),
      remediation: z.boolean(),
      arr: z.boolean(),
      infrastructure: z.boolean(),
      security_orchestrator: z.boolean(),
      database: z.boolean(),
      socketio: z.boolean(),
    }),
  }),
  timestamp: z.string().datetime(),
});

// Convert to JSON Schema for OpenAPI
export const healthResponseJsonSchema = zodToJsonSchema(healthResponseSchema, {
  name: 'HealthResponse',
  $refStrategy: 'none',
});

export const readinessResponseJsonSchema = zodToJsonSchema(readinessResponseSchema, {
  name: 'ReadinessResponse',
  $refStrategy: 'none',
});

export const livenessResponseJsonSchema = zodToJsonSchema(livenessResponseSchema, {
  name: 'LivenessResponse',
  $refStrategy: 'none',
});

export const systemInfoResponseJsonSchema = zodToJsonSchema(systemInfoResponseSchema, {
  name: 'SystemInfoResponse',
  $refStrategy: 'none',
});

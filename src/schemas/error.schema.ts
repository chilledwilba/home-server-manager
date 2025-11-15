import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Standard error response schema
 */
export const errorResponseSchema = z.object({
  success: z.boolean().default(false),
  error: z.string().optional(),
  message: z.string(),
  statusCode: z.number().optional(),
  timestamp: z.string().datetime().optional(),
  correlationId: z.string().optional(),
});

/**
 * Validation error response schema
 */
export const validationErrorResponseSchema = z.object({
  success: z.boolean().default(false),
  error: z.string(),
  message: z.string(),
  validation: z
    .array(
      z.object({
        field: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
  timestamp: z.string().datetime().optional(),
});

// Convert to JSON Schema for OpenAPI
export const errorResponseJsonSchema = zodToJsonSchema(errorResponseSchema, {
  name: 'ErrorResponse',
  $refStrategy: 'none',
});

export const validationErrorResponseJsonSchema = zodToJsonSchema(validationErrorResponseSchema, {
  name: 'ValidationErrorResponse',
  $refStrategy: 'none',
});

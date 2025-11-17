import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Settings, SettingsService } from '@/services/settings/settings-service.js';
import { extractBody, formatSuccess, withService } from '@/utils/route-helpers.js';

const settingsSchema = z.object({
  refreshInterval: z.number().min(10).max(300).optional(),
  alertNotifications: z
    .object({
      critical: z.boolean().optional(),
      warning: z.boolean().optional(),
      info: z.boolean().optional(),
    })
    .optional(),
  truenasUrl: z.string().optional(),
  truenasApiKey: z.string().optional(),
});

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/settings
  fastify.get(
    '/api/settings',
    {
      schema: {
        description: 'Get all settings',
        tags: ['settings'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  refreshInterval: { type: 'number' },
                  alertNotifications: {
                    type: 'object',
                    properties: {
                      critical: { type: 'boolean' },
                      warning: { type: 'boolean' },
                      info: { type: 'boolean' },
                    },
                  },
                  truenasUrl: { type: 'string' },
                  truenasApiKey: { type: 'string' },
                },
              },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    withService<SettingsService>('settings', async (settings) => {
      const allSettings = settings.getAll();
      return formatSuccess(allSettings);
    }),
  );

  // PUT /api/settings
  fastify.put(
    '/api/settings',
    {
      schema: {
        description: 'Update settings',
        tags: ['settings'],
        body: {
          type: 'object',
          properties: {
            refreshInterval: { type: 'number', minimum: 10, maximum: 300 },
            alertNotifications: {
              type: 'object',
              properties: {
                critical: { type: 'boolean' },
                warning: { type: 'boolean' },
                info: { type: 'boolean' },
              },
            },
            truenasUrl: { type: 'string' },
            truenasApiKey: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    withService<SettingsService>('settings', async (settings, request, reply) => {
      const body = extractBody(request.body);
      const parsed = settingsSchema.safeParse(body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid settings data',
          errors: parsed.error.issues,
          timestamp: new Date().toISOString(),
        });
      }

      // Only pass defined values to setMultiple
      const definedSettings: Partial<Settings> = {};
      if (parsed.data.refreshInterval !== undefined) {
        definedSettings.refreshInterval = parsed.data.refreshInterval;
      }
      if (parsed.data.alertNotifications !== undefined) {
        definedSettings.alertNotifications = {
          critical: parsed.data.alertNotifications.critical ?? true,
          warning: parsed.data.alertNotifications.warning ?? true,
          info: parsed.data.alertNotifications.info ?? false,
        };
      }
      if (parsed.data.truenasUrl !== undefined) {
        definedSettings.truenasUrl = parsed.data.truenasUrl;
      }
      if (parsed.data.truenasApiKey !== undefined) {
        definedSettings.truenasApiKey = parsed.data.truenasApiKey;
      }

      settings.setMultiple(definedSettings);

      return formatSuccess(null, 'Settings updated successfully');
    }),
  );
}

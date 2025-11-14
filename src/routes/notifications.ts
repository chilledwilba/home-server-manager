import type { FastifyInstance } from 'fastify';
import { ServiceUnavailableError, ExternalServiceError } from '../utils/error-types.js';

/**
 * Notification routes
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  // Get notification history
  fastify.get('/api/notifications/history', async () => {
    try {
      const notificationService = (
        fastify as { notificationService?: { getNotificationHistory: (limit?: number) => unknown } }
      ).notificationService;

      if (!notificationService) {
        throw new ServiceUnavailableError('Notification service not initialized');
      }

      const history = notificationService.getNotificationHistory();
      return { success: true, data: history, timestamp: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ExternalServiceError('Notifications', 'Failed to fetch notification history', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Test notification
  fastify.post('/api/notifications/test', async (request) => {
    try {
      const notificationService = (
        fastify as {
          notificationService?: {
            sendAlert: (alert: unknown, channels?: string[]) => Promise<void>;
          };
        }
      ).notificationService;

      if (!notificationService) {
        throw new ServiceUnavailableError('Notification service not initialized');
      }

      const { channel } = request.body as { channel?: string };

      await notificationService.sendAlert(
        {
          id: 0,
          type: 'test',
          severity: 'info',
          message: 'Test notification from Home Server Monitor',
        },
        channel ? [channel] : undefined,
      );

      return {
        success: true,
        message: 'Test notification sent',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ExternalServiceError('Notifications', 'Failed to send test notification', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

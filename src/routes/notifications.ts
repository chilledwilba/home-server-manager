import type { FastifyInstance } from 'fastify';
import type { NotificationService } from '../services/alerting/notification-service.js';
import { withService, formatSuccess, extractBody } from '../utils/route-helpers.js';
import { ExternalServiceError } from '../utils/error-types.js';

/**
 * Notification routes
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/notifications/history
   * Get notification history
   */
  fastify.get(
    '/api/notifications/history',
    withService<NotificationService>('notificationService', async (notificationService) => {
      try {
        const history = notificationService.getNotificationHistory();
        return formatSuccess(history);
      } catch (error) {
        throw new ExternalServiceError('Notifications', 'Failed to fetch notification history', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * POST /api/notifications/test
   * Send a test notification
   */
  fastify.post(
    '/api/notifications/test',
    withService<NotificationService>(
      'notificationService',
      async (notificationService, request) => {
        try {
          const { channel } = extractBody<{ channel?: string }>(request.body);

          await notificationService.sendAlert(
            {
              id: 0,
              type: 'test',
              severity: 'info',
              message: 'Test notification from Home Server Monitor',
            },
            channel ? [channel] : undefined,
          );

          return formatSuccess(null, 'Test notification sent');
        } catch (error) {
          throw new ExternalServiceError('Notifications', 'Failed to send test notification', {
            original: error instanceof Error ? error.message : String(error),
          });
        }
      },
    ),
  );
}

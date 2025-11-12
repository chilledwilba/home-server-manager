import type { FastifyInstance } from 'fastify';

/**
 * Notification routes
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  // Get notification history
  fastify.get('/api/notifications/history', async () => {
    const notificationService = (
      fastify as { notificationService?: { getNotificationHistory: (limit?: number) => unknown } }
    ).notificationService;

    if (!notificationService) {
      return { success: false, error: 'Notification service not initialized' };
    }

    const history = notificationService.getNotificationHistory();
    return { success: true, data: history, timestamp: new Date().toISOString() };
  });

  // Test notification
  fastify.post('/api/notifications/test', async (request) => {
    const notificationService = (
      fastify as {
        notificationService?: { sendAlert: (alert: unknown, channels?: string[]) => Promise<void> };
      }
    ).notificationService;

    if (!notificationService) {
      return { success: false, error: 'Notification service not initialized' };
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
  });
}

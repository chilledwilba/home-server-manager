import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { NotificationService } from '../../../src/services/alerting/notification-service.js';

// Mock fetch globally
// eslint-disable-next-line no-undef
const mockFetch = jest.fn<typeof fetch>();
// eslint-disable-next-line no-undef
global.fetch = mockFetch as never;

describe('NotificationService Integration', () => {
  let db: Database.Database;
  let service: NotificationService;
  const originalEnv = process.env;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create schema
    db.exec(`
      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        alert_id INTEGER,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        error TEXT
      );
    `);

    // Setup environment variables for test channels
    process.env = {
      ...originalEnv,
      DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/test',
      PUSHOVER_APP_TOKEN: 'test-app-token',
      PUSHOVER_USER_KEY: 'test-user-key',
      TELEGRAM_BOT_TOKEN: 'test-bot-token',
      TELEGRAM_CHAT_ID: 'test-chat-id',
    };

    // Reset fetch mock
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      // eslint-disable-next-line no-undef
    } as Response);

    service = new NotificationService(db);
  });

  afterEach(() => {
    db.close();
    process.env = originalEnv;
  });

  describe('Channel Initialization', () => {
    it('should initialize channels from environment variables', () => {
      const channels = (service as unknown as { channels: Map<string, unknown> }).channels;

      expect(channels.size).toBeGreaterThan(0);
      expect(channels.has('discord')).toBe(true);
      expect(channels.has('pushover')).toBe(true);
      expect(channels.has('telegram')).toBe(true);
    });

    it('should handle missing channel configuration gracefully', () => {
      process.env = { ...originalEnv };
      const newService = new NotificationService(db);
      const channels = (newService as unknown as { channels: Map<string, unknown> }).channels;

      expect(channels.size).toBe(0);
    });
  });

  describe('Send Alerts', () => {
    it('should send alert to Discord channel successfully', async () => {
      const alert = {
        id: 1,
        type: 'disk_failure',
        severity: 'critical',
        message: 'Disk sda is failing',
      };

      await service.sendAlert(alert, ['Discord']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      // Verify notification was recorded
      const notifications = db
        .prepare('SELECT * FROM notifications WHERE channel = ?')
        .all('Discord');
      expect(notifications).toHaveLength(1);
      expect((notifications[0] as { status: string }).status).toBe('sent');
    });

    it('should send alert to Pushover channel successfully', async () => {
      const alert = {
        id: 2,
        type: 'high_temperature',
        severity: 'warning',
        message: 'CPU temperature is 85°C',
      };

      await service.sendAlert(alert, ['Pushover']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pushover.net/1/messages.json',
        expect.objectContaining({
          method: 'POST',
        }),
      );

      const notifications = db
        .prepare('SELECT * FROM notifications WHERE channel = ?')
        .all('Pushover');
      expect(notifications).toHaveLength(1);
      expect((notifications[0] as { status: string }).status).toBe('sent');
    });

    it('should send alert to Telegram channel successfully', async () => {
      const alert = {
        id: 3,
        type: 'pool_degraded',
        severity: 'critical',
        message: 'Pool tank is degraded',
      };

      await service.sendAlert(alert, ['Telegram']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.telegram.org/bot'),
        expect.objectContaining({
          method: 'POST',
        }),
      );

      const notifications = db
        .prepare('SELECT * FROM notifications WHERE channel = ?')
        .all('Telegram');
      expect(notifications).toHaveLength(1);
    });

    it('should send alert to multiple channels', async () => {
      const alert = {
        id: 4,
        type: 'system_down',
        severity: 'critical',
        message: 'TrueNAS system is unreachable',
      };

      await service.sendAlert(alert, ['Discord', 'Pushover']);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const notifications = db.prepare('SELECT * FROM notifications').all();
      expect(notifications).toHaveLength(2);
    });

    it('should send to all enabled channels when none specified', async () => {
      const alert = {
        id: 5,
        type: 'test_alert',
        severity: 'info',
        message: 'Test notification',
      };

      await service.sendAlert(alert);

      // Should send to all configured channels (discord, pushover, telegram)
      expect(mockFetch).toHaveBeenCalledTimes(3);

      const notifications = db.prepare('SELECT * FROM notifications').all();
      expect(notifications).toHaveLength(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle webhook failures gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const alert = {
        id: 6,
        type: 'test_failure',
        severity: 'warning',
        message: 'This should fail',
      };

      // Should not throw
      await expect(service.sendAlert(alert, ['Discord'])).resolves.not.toThrow();

      // Should record the failure
      const notifications = db
        .prepare('SELECT * FROM notifications WHERE status = ?')
        .all('failed');
      expect(notifications).toHaveLength(1);
      expect((notifications[0] as { error: string }).error).toContain('Network error');
    });

    it('should continue sending to other channels if one fails', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Discord failed'))
        // eslint-disable-next-line no-undef
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      const alert = {
        id: 7,
        type: 'partial_failure',
        severity: 'warning',
        message: 'Test partial failure',
      };

      await service.sendAlert(alert, ['Discord', 'Pushover']);

      const notifications = db.prepare('SELECT * FROM notifications').all();
      expect(notifications).toHaveLength(2);

      const failed = notifications.filter((n) => (n as { status: string }).status === 'failed');
      const sent = notifications.filter((n) => (n as { status: string }).status === 'sent');

      expect(failed).toHaveLength(1);
      expect(sent).toHaveLength(1);
    });
  });

  describe('Alert Formatting', () => {
    it('should format critical alerts with correct color for Discord', async () => {
      const alert = {
        id: 8,
        type: 'critical_test',
        severity: 'critical',
        message: 'Critical alert message',
      };

      await service.sendAlert(alert, ['Discord']);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse((callArgs?.[1] as { body: string })?.body);

      expect(body.embeds[0].color).toBe(0xff0000); // Red for critical
      expect(body.embeds[0].title).toContain('CRITICAL_TEST');
    });

    it('should format warning alerts with correct color for Discord', async () => {
      const alert = {
        id: 9,
        type: 'warning_test',
        severity: 'warning',
        message: 'Warning alert message',
      };

      await service.sendAlert(alert, ['Discord']);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse((callArgs?.[1] as { body: string })?.body);

      expect(body.embeds[0].color).toBe(0xffa500); // Orange for warning
    });

    it('should include alert details in Discord embed', async () => {
      const alert = {
        id: 10,
        type: 'detailed_alert',
        severity: 'info',
        message: 'Alert with details',
        details: 'Additional information about the alert',
      };

      await service.sendAlert(alert, ['Discord']);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse((callArgs?.[1] as { body: string })?.body);

      expect(body.embeds[0].fields).toHaveLength(1);
      expect(body.embeds[0].fields[0].value).toContain('Additional information');
    });

    it('should set correct priority for Pushover critical alerts', async () => {
      const alert = {
        id: 11,
        type: 'pushover_critical',
        severity: 'critical',
        message: 'Critical pushover alert',
      };

      await service.sendAlert(alert, ['Pushover']);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse((callArgs?.[1] as { body: string })?.body);

      expect(body.priority).toBe(1); // Priority 1 for critical
    });

    it('should format Telegram messages with markdown', async () => {
      const alert = {
        id: 12,
        type: 'telegram_test',
        severity: 'warning',
        message: 'Telegram formatted message',
      };

      await service.sendAlert(alert, ['Telegram']);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse((callArgs?.[1] as { body: string })?.body);

      expect(body.parse_mode).toBe('Markdown');
      expect(body.text).toContain('🚨');
      expect(body.text).toContain('TELEGRAM_TEST');
    });
  });

  describe('Notification History', () => {
    it('should retrieve notification history', async () => {
      const alert1 = {
        id: 13,
        type: 'history_test_1',
        severity: 'info',
        message: 'First test alert',
      };

      const alert2 = {
        id: 14,
        type: 'history_test_2',
        severity: 'warning',
        message: 'Second test alert',
      };

      await service.sendAlert(alert1, ['Discord']);
      await service.sendAlert(alert2, ['Discord']);

      const history = service.getNotificationHistory();

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should limit notification history results', async () => {
      // Send multiple alerts
      for (let i = 0; i < 5; i++) {
        await service.sendAlert(
          {
            id: 100 + i,
            type: 'bulk_test',
            severity: 'info',
            message: `Alert ${i}`,
          },
          ['Discord'],
        );
      }

      const history = service.getNotificationHistory(3);

      expect(history.length).toBe(3);
    });
  });
});

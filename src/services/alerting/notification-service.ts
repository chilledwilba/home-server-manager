import { createLogger } from '../../utils/logger.js';
import type Database from 'better-sqlite3';

const logger = createLogger('notifications');

interface NotificationChannel {
  name: string;
  type: 'discord' | 'pushover' | 'telegram' | 'email' | 'webhook';
  enabled: boolean;
  config: Record<string, string>;
}

interface Alert {
  id: number;
  type: string;
  severity: string;
  message: string;
  details?: string;
}

/**
 * Multi-channel notification service
 * Supports Discord, Pushover, Telegram, Email, and custom webhooks
 */
export class NotificationService {
  private channels: Map<string, NotificationChannel> = new Map();

  constructor(private db: Database.Database) {
    this.initializeChannels();
  }

  private initializeChannels(): void {
    // Discord webhook
    const discordWebhook = process.env['DISCORD_WEBHOOK_URL'];
    if (discordWebhook) {
      this.channels.set('discord', {
        name: 'Discord',
        type: 'discord',
        enabled: true,
        config: { webhookUrl: discordWebhook },
      });
    }

    // Pushover
    const pushoverToken = process.env['PUSHOVER_APP_TOKEN'];
    const pushoverUser = process.env['PUSHOVER_USER_KEY'];
    if (pushoverToken && pushoverUser) {
      this.channels.set('pushover', {
        name: 'Pushover',
        type: 'pushover',
        enabled: true,
        config: { appToken: pushoverToken, userKey: pushoverUser },
      });
    }

    // Telegram
    const telegramToken = process.env['TELEGRAM_BOT_TOKEN'];
    const telegramChat = process.env['TELEGRAM_CHAT_ID'];
    if (telegramToken && telegramChat) {
      this.channels.set('telegram', {
        name: 'Telegram',
        type: 'telegram',
        enabled: true,
        config: { botToken: telegramToken, chatId: telegramChat },
      });
    }

    // Email (SMTP)
    const smtpHost = process.env['SMTP_HOST'];
    if (smtpHost) {
      this.channels.set('email', {
        name: 'Email',
        type: 'email',
        enabled: true,
        config: {
          host: smtpHost,
          port: process.env['SMTP_PORT'] || '587',
          user: process.env['SMTP_USER'] || '',
          password: process.env['SMTP_PASSWORD'] || '',
          from: process.env['SMTP_FROM'] || 'alerts@homeserver.local',
        },
      });
    }

    logger.info(`Initialized ${this.channels.size} notification channels`);
  }

  async sendAlert(alert: Alert, channels?: string[]): Promise<void> {
    const targetChannels = channels
      ? Array.from(this.channels.values()).filter((c) => channels.includes(c.name))
      : Array.from(this.channels.values()).filter((c) => c.enabled);

    for (const channel of targetChannels) {
      try {
        await this.sendToChannel(channel, alert);
        this.recordNotification(channel.name, alert.id, 'sent', '');
      } catch (error) {
        logger.error({ err: error }, `Failed to send to ${channel.name}`);
        this.recordNotification(
          channel.name,
          alert.id,
          'failed',
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }
  }

  private async sendToChannel(channel: NotificationChannel, alert: Alert): Promise<void> {
    switch (channel.type) {
      case 'discord':
        await this.sendDiscord(channel.config['webhookUrl'] || '', alert);
        break;
      case 'pushover':
        await this.sendPushover(channel.config, alert);
        break;
      case 'telegram':
        await this.sendTelegram(channel.config, alert);
        break;
      case 'email':
        logger.info('Email notification (implementation pending)');
        break;
      default:
        logger.warn(`Unknown channel type: ${channel.type}`);
    }
  }

  private async sendDiscord(webhookUrl: string, alert: Alert): Promise<void> {
    const color =
      alert.severity === 'critical' ? 0xff0000 : alert.severity === 'warning' ? 0xffa500 : 0x00ff00;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: `🚨 ${alert.type.toUpperCase()}`,
            description: alert.message,
            color,
            fields: alert.details
              ? [{ name: 'Details', value: alert.details.substring(0, 1024) }]
              : [],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  }

  private async sendPushover(config: Record<string, string>, alert: Alert): Promise<void> {
    const priority = alert.severity === 'critical' ? 1 : 0;

    await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: config['appToken'],
        user: config['userKey'],
        title: alert.type.toUpperCase(),
        message: alert.message,
        priority,
      }),
    });
  }

  private async sendTelegram(config: Record<string, string>, alert: Alert): Promise<void> {
    const text = `🚨 *${alert.type.toUpperCase()}*\n\n${alert.message}`;

    await fetch(`https://api.telegram.org/bot${config['botToken']}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config['chatId'],
        text,
        parse_mode: 'Markdown',
      }),
    });
  }

  private recordNotification(
    channel: string,
    alertId: number,
    status: string,
    error: string,
  ): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO notifications (channel, alert_id, status, message, error, sent_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(channel, alertId, status, `Alert ${alertId}`, error, new Date().toISOString());
    } catch (err) {
      logger.error({ err }, 'Failed to record notification');
    }
  }

  getNotificationHistory(limit: number = 50): Array<unknown> {
    return this.db
      .prepare(
        `
      SELECT * FROM notifications
      ORDER BY sent_at DESC
      LIMIT ?
    `,
      )
      .all(limit);
  }
}

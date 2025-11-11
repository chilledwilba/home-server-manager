# TODO-09: Smart Alerting System

> Intelligent notification system with priority routing and noise reduction

## 📋 Phase Overview

**Objective**: Implement smart alerting that notifies you of important issues without overwhelming you

**Duration**: 2-3 hours

**Prerequisites**:
- ✅ Phase 0-8 complete (security stack active)
- ✅ Notification channels configured (email, Discord, etc.)

## 🎯 Success Criteria

- [ ] Alert deduplication working (no spam)
- [ ] Priority-based routing active
- [ ] Quiet hours respected
- [ ] Alert history stored
- [ ] Acknowledgment system working
- [ ] Escalation chains configured

## 📚 Learning Context

### Smart Alerting Principles

After your port exposure incident, you need alerts that:

1. **Alert on what matters**: Not every log entry needs attention
2. **Reduce noise**: Group related alerts
3. **Respect your time**: Quiet hours for non-critical
4. **Provide context**: Include remediation steps
5. **Track acknowledgment**: Know what's been handled

## 🏗️ Architecture

```
Event → Classifier → Deduplicator → Router → Channel
          ↓              ↓            ↓         ↓
      Priority      Grouping    Schedule   Delivery
```

## 📁 File Structure

```bash
src/
├── alerting/
│   ├── alert-manager.ts          # Core alert manager
│   ├── classifiers/
│   │   ├── severity.ts           # Severity classification
│   │   ├── patterns.ts           # Pattern matching
│   │   └── ml-classifier.ts      # ML-based classification
│   ├── channels/
│   │   ├── email.ts              # Email notifications
│   │   ├── discord.ts            # Discord webhook
│   │   ├── pushover.ts           # Pushover mobile
│   │   ├── telegram.ts           # Telegram bot
│   │   └── webhook.ts            # Generic webhook
│   ├── deduplication.ts          # Alert deduplication
│   ├── scheduling.ts             # Quiet hours/scheduling
│   └── escalation.ts             # Escalation chains
├── routes/
│   └── alerts.ts                 # Alert API endpoints
└── types/
    └── alerts.ts                 # Alert types
```

## 📝 Implementation Tasks

### 1. Core Alert Manager

Create `src/alerting/alert-manager.ts`:

```typescript
import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '@/utils/logger';
import { db } from '@/db';
import { SeverityClassifier } from './classifiers/severity';
import { Deduplicator } from './deduplication';
import { Scheduler } from './scheduling';
import { EscalationManager } from './escalation';
import { ChannelManager } from './channels';

// Alert schema
export const AlertSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  source: z.string(),
  category: z.enum([
    'security',
    'performance',
    'availability',
    'capacity',
    'configuration',
    'backup'
  ]),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  title: z.string(),
  message: z.string(),
  details: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  remediation: z.string().optional(),
  relatedAlerts: z.array(z.string()).optional(),
  acknowledged: z.boolean().default(false),
  acknowledgedBy: z.string().optional(),
  acknowledgedAt: z.date().optional(),
  resolved: z.boolean().default(false),
  resolvedAt: z.date().optional()
});

export type Alert = z.infer<typeof AlertSchema>;

interface AlertRule {
  name: string;
  condition: (data: any) => boolean;
  severity: Alert['severity'];
  category: Alert['category'];
  title: string;
  message: (data: any) => string;
  remediation?: string;
  cooldown?: number; // Minutes
}

export class AlertManager extends EventEmitter {
  private classifier: SeverityClassifier;
  private deduplicator: Deduplicator;
  private scheduler: Scheduler;
  private escalation: EscalationManager;
  private channels: ChannelManager;
  private rules: Map<string, AlertRule> = new Map();
  private cooldowns: Map<string, Date> = new Map();

  constructor() {
    super();
    this.classifier = new SeverityClassifier();
    this.deduplicator = new Deduplicator();
    this.scheduler = new Scheduler();
    this.escalation = new EscalationManager();
    this.channels = new ChannelManager();
  }

  /**
   * Initialize alert manager
   */
  async initialize(): Promise<void> {
    logger.info('🔔 Initializing Alert Manager...');

    // Load alert rules
    this.loadAlertRules();

    // Initialize channels
    await this.channels.initialize();

    // Load quiet hours from config
    this.scheduler.loadSchedule();

    // Start processing loop
    this.startProcessing();

    logger.info('✅ Alert Manager active');
  }

  /**
   * Load alert rules
   */
  private loadAlertRules(): void {
    const rules: AlertRule[] = [
      // Security alerts
      {
        name: 'security.intrusion',
        condition: (data) => data.type === 'intrusion_detected',
        severity: 'critical',
        category: 'security',
        title: '🚨 Security Intrusion Detected',
        message: (data) => `Intrusion detected from ${data.sourceIP}. ${data.attempts} failed attempts.`,
        remediation: 'Check fail2ban logs. IP has been automatically banned.',
        cooldown: 5
      },
      {
        name: 'security.port_scan',
        condition: (data) => data.type === 'port_scan_detected',
        severity: 'high',
        category: 'security',
        title: '⚠️ Port Scan Detected',
        message: (data) => `Port scan detected from ${data.sourceIP}. Scanned ports: ${data.ports.join(', ')}`,
        remediation: 'Review firewall rules. Consider blocking source IP.',
        cooldown: 10
      },

      // Pool health alerts
      {
        name: 'pool.degraded',
        condition: (data) => data.poolStatus === 'DEGRADED',
        severity: 'critical',
        category: 'availability',
        title: '💾 Pool Degraded',
        message: (data) => `Pool "${data.poolName}" is degraded. Check disk health immediately.`,
        remediation: 'Run zpool status -v for details. May need disk replacement.',
        cooldown: 60
      },
      {
        name: 'pool.capacity',
        condition: (data) => data.poolUsage > 90,
        severity: 'high',
        category: 'capacity',
        title: '📊 Pool Near Capacity',
        message: (data) => `Pool "${data.poolName}" is ${data.poolUsage}% full.`,
        remediation: 'Delete unnecessary data or add storage.',
        cooldown: 120
      },
      {
        name: 'pool.capacity.warning',
        condition: (data) => data.poolUsage > 80 && data.poolUsage <= 90,
        severity: 'medium',
        category: 'capacity',
        title: '📈 Pool Space Warning',
        message: (data) => `Pool "${data.poolName}" is ${data.poolUsage}% full.`,
        remediation: 'Monitor usage trend. Plan for cleanup or expansion.',
        cooldown: 240
      },

      // Disk health alerts
      {
        name: 'disk.smart.failing',
        condition: (data) => data.smartStatus === 'FAILING',
        severity: 'critical',
        category: 'availability',
        title: '🔴 Disk Failure Imminent',
        message: (data) => `Disk ${data.diskName} SMART test indicates imminent failure!`,
        remediation: 'Order replacement disk immediately. Backup critical data.',
        cooldown: 30
      },
      {
        name: 'disk.temperature',
        condition: (data) => data.temperature > 50,
        severity: 'high',
        category: 'performance',
        title: '🌡️ Disk Overheating',
        message: (data) => `Disk ${data.diskName} temperature: ${data.temperature}°C`,
        remediation: 'Check cooling system. Improve airflow.',
        cooldown: 15
      },

      // Docker container alerts
      {
        name: 'container.crashed',
        condition: (data) => data.containerStatus === 'exited' && data.exitCode !== 0,
        severity: 'high',
        category: 'availability',
        title: '🐳 Container Crashed',
        message: (data) => `Container "${data.containerName}" crashed with exit code ${data.exitCode}`,
        remediation: 'Check container logs for error details.',
        cooldown: 5
      },
      {
        name: 'container.restarting',
        condition: (data) => data.restartCount > 5,
        severity: 'medium',
        category: 'availability',
        title: '🔄 Container Restart Loop',
        message: (data) => `Container "${data.containerName}" restarted ${data.restartCount} times`,
        remediation: 'Check container configuration and logs.',
        cooldown: 10
      },

      // Arr suite alerts
      {
        name: 'arr.queue.stalled',
        condition: (data) => data.stalledCount > 10,
        severity: 'medium',
        category: 'performance',
        title: '📥 Download Queue Stalled',
        message: (data) => `${data.appName} has ${data.stalledCount} stalled downloads`,
        remediation: 'Check indexers and download client status.',
        cooldown: 30
      },
      {
        name: 'arr.indexer.failed',
        condition: (data) => data.indexerFailures > 3,
        severity: 'medium',
        category: 'availability',
        title: '🔍 Indexer Failures',
        message: (data) => `${data.indexerName} has failed ${data.indexerFailures} times`,
        remediation: 'Check indexer configuration and API limits.',
        cooldown: 60
      },

      // Backup alerts
      {
        name: 'backup.failed',
        condition: (data) => data.backupStatus === 'failed',
        severity: 'high',
        category: 'backup',
        title: '💾 Backup Failed',
        message: (data) => `Backup "${data.backupName}" failed: ${data.error}`,
        remediation: 'Check backup logs and destination availability.',
        cooldown: 60
      },
      {
        name: 'backup.missing',
        condition: (data) => data.daysSinceLastBackup > 7,
        severity: 'medium',
        category: 'backup',
        title: '⏰ Backup Overdue',
        message: (data) => `No backup for ${data.daysSinceLastBackup} days`,
        remediation: 'Run manual backup or check schedule.',
        cooldown: 1440 // Daily
      },

      // Performance alerts
      {
        name: 'cpu.high',
        condition: (data) => data.cpuUsage > 90,
        severity: 'medium',
        category: 'performance',
        title: '🔥 High CPU Usage',
        message: (data) => `CPU usage at ${data.cpuUsage}% for ${data.duration} minutes`,
        remediation: 'Identify resource-intensive processes.',
        cooldown: 15
      },
      {
        name: 'memory.high',
        condition: (data) => data.memoryUsage > 90,
        severity: 'medium',
        category: 'performance',
        title: '💾 High Memory Usage',
        message: (data) => `Memory usage at ${data.memoryUsage}%`,
        remediation: 'Check for memory leaks or increase RAM.',
        cooldown: 15
      }
    ];

    // Register rules
    for (const rule of rules) {
      this.rules.set(rule.name, rule);
    }

    logger.info(`Loaded ${rules.length} alert rules`);
  }

  /**
   * Process incoming event
   */
  async processEvent(source: string, data: any): Promise<void> {
    // Check all rules
    for (const [name, rule] of this.rules) {
      try {
        // Check if rule condition is met
        if (!rule.condition(data)) continue;

        // Check cooldown
        if (this.isInCooldown(name)) continue;

        // Create alert
        const alert: Alert = {
          id: this.generateId(),
          timestamp: new Date(),
          source,
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          message: typeof rule.message === 'function'
            ? rule.message(data)
            : rule.message,
          details: data,
          remediation: rule.remediation,
          tags: [name],
          acknowledged: false,
          resolved: false
        };

        // Process alert
        await this.processAlert(alert);

        // Set cooldown
        if (rule.cooldown) {
          this.setCooldown(name, rule.cooldown);
        }
      } catch (error) {
        logger.error(`Error processing rule ${name}:`, error);
      }
    }
  }

  /**
   * Process alert through pipeline
   */
  private async processAlert(alert: Alert): Promise<void> {
    // 1. Classify severity (can be adjusted by ML)
    alert.severity = await this.classifier.classify(alert);

    // 2. Check for deduplication
    if (await this.deduplicator.isDuplicate(alert)) {
      logger.debug(`Alert deduplicated: ${alert.title}`);
      return;
    }

    // 3. Store alert
    await this.storeAlert(alert);

    // 4. Check scheduling (quiet hours)
    if (!this.scheduler.shouldSendNow(alert)) {
      logger.debug(`Alert scheduled for later: ${alert.title}`);
      return;
    }

    // 5. Send through channels
    await this.sendAlert(alert);

    // 6. Start escalation timer if needed
    if (alert.severity === 'critical' || alert.severity === 'high') {
      this.escalation.startEscalation(alert);
    }

    // Emit event
    this.emit('alert', alert);
  }

  /**
   * Send alert through appropriate channels
   */
  private async sendAlert(alert: Alert): Promise<void> {
    // Route based on severity and category
    const channels = this.getChannelsForAlert(alert);

    for (const channel of channels) {
      try {
        await this.channels.send(channel, alert);
        logger.info(`Alert sent via ${channel}: ${alert.title}`);
      } catch (error) {
        logger.error(`Failed to send alert via ${channel}:`, error);
      }
    }
  }

  /**
   * Determine which channels to use
   */
  private getChannelsForAlert(alert: Alert): string[] {
    const channels: string[] = [];

    // Critical: All channels
    if (alert.severity === 'critical') {
      channels.push('email', 'pushover', 'discord', 'telegram');
    }
    // High: Email and mobile
    else if (alert.severity === 'high') {
      channels.push('email', 'pushover');
    }
    // Medium: Email and Discord
    else if (alert.severity === 'medium') {
      channels.push('email', 'discord');
    }
    // Low/Info: Discord only
    else {
      channels.push('discord');
    }

    // Security alerts also go to Telegram
    if (alert.category === 'security') {
      channels.push('telegram');
    }

    return [...new Set(channels)]; // Remove duplicates
  }

  /**
   * Store alert in database
   */
  private async storeAlert(alert: Alert): Promise<void> {
    const stmt = db.prepare(`
      INSERT INTO alerts (
        id, timestamp, source, category, severity,
        title, message, details, tags, remediation,
        acknowledged, resolved
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      )
    `);

    stmt.run(
      alert.id,
      alert.timestamp.toISOString(),
      alert.source,
      alert.category,
      alert.severity,
      alert.title,
      alert.message,
      JSON.stringify(alert.details || {}),
      JSON.stringify(alert.tags || []),
      alert.remediation || null,
      alert.acknowledged ? 1 : 0,
      alert.resolved ? 1 : 0
    );
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(
    alertId: string,
    userId: string
  ): Promise<void> {
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE alerts
      SET acknowledged = 1,
          acknowledgedBy = ?,
          acknowledgedAt = ?
      WHERE id = ?
    `).run(userId, now, alertId);

    // Stop escalation
    this.escalation.stopEscalation(alertId);

    logger.info(`Alert ${alertId} acknowledged by ${userId}`);
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE alerts
      SET resolved = 1,
          resolvedAt = ?
      WHERE id = ?
    `).run(now, alertId);

    // Stop escalation
    this.escalation.stopEscalation(alertId);

    logger.info(`Alert ${alertId} resolved`);
  }

  /**
   * Check if rule is in cooldown
   */
  private isInCooldown(ruleName: string): boolean {
    const cooldownUntil = this.cooldowns.get(ruleName);
    if (!cooldownUntil) return false;

    return new Date() < cooldownUntil;
  }

  /**
   * Set cooldown for rule
   */
  private setCooldown(ruleName: string, minutes: number): void {
    const cooldownUntil = new Date();
    cooldownUntil.setMinutes(cooldownUntil.getMinutes() + minutes);
    this.cooldowns.set(ruleName, cooldownUntil);
  }

  /**
   * Generate unique alert ID
   */
  private generateId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start processing loop
   */
  private startProcessing(): void {
    // Process scheduled alerts every minute
    setInterval(async () => {
      await this.scheduler.processPendingAlerts();
    }, 60000);

    // Clean old alerts daily
    setInterval(async () => {
      await this.cleanOldAlerts();
    }, 86400000);
  }

  /**
   * Clean old resolved alerts
   */
  private async cleanOldAlerts(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    db.prepare(`
      DELETE FROM alerts
      WHERE resolved = 1
        AND resolvedAt < ?
    `).run(thirtyDaysAgo.toISOString());
  }

  /**
   * Get alert statistics
   */
  async getStatistics(): Promise<any> {
    const stats = db.prepare(`
      SELECT
        severity,
        category,
        COUNT(*) as count,
        SUM(CASE WHEN acknowledged = 1 THEN 1 ELSE 0 END) as acknowledged,
        SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved
      FROM alerts
      WHERE timestamp > datetime('now', '-7 days')
      GROUP BY severity, category
    `).all();

    return stats;
  }
}
```

### 2. Alert Channels

Create `src/alerting/channels/discord.ts`:

```typescript
import axios from 'axios';
import { Alert } from '../alert-manager';
import { logger } from '@/utils/logger';
import { config } from '@/config';

export class DiscordChannel {
  private webhookUrl: string;

  constructor() {
    this.webhookUrl = config.DISCORD_WEBHOOK_URL;
  }

  /**
   * Send alert to Discord
   */
  async send(alert: Alert): Promise<void> {
    if (!this.webhookUrl) {
      logger.warn('Discord webhook URL not configured');
      return;
    }

    const embed = {
      title: alert.title,
      description: alert.message,
      color: this.getColor(alert.severity),
      fields: [
        {
          name: 'Severity',
          value: alert.severity.toUpperCase(),
          inline: true
        },
        {
          name: 'Category',
          value: alert.category,
          inline: true
        },
        {
          name: 'Source',
          value: alert.source,
          inline: true
        }
      ],
      timestamp: alert.timestamp.toISOString(),
      footer: {
        text: 'Home Server Monitor'
      }
    };

    // Add remediation if present
    if (alert.remediation) {
      embed.fields.push({
        name: '🔧 Remediation',
        value: alert.remediation,
        inline: false
      });
    }

    // Add details if present
    if (alert.details && Object.keys(alert.details).length > 0) {
      const detailsStr = Object.entries(alert.details)
        .slice(0, 3) // Limit to 3 fields
        .map(([k, v]) => `**${k}**: ${v}`)
        .join('\n');

      embed.fields.push({
        name: '📋 Details',
        value: detailsStr,
        inline: false
      });
    }

    try {
      await axios.post(this.webhookUrl, {
        username: 'Server Monitor',
        avatar_url: 'https://example.com/avatar.png',
        embeds: [embed]
      });
    } catch (error) {
      logger.error('Failed to send Discord alert:', error);
      throw error;
    }
  }

  /**
   * Get color based on severity
   */
  private getColor(severity: Alert['severity']): number {
    const colors = {
      critical: 0xFF0000, // Red
      high: 0xFF9900,     // Orange
      medium: 0xFFFF00,   // Yellow
      low: 0x00FF00,      // Green
      info: 0x0099FF      // Blue
    };

    return colors[severity] || 0x808080;
  }
}
```

Create `src/alerting/channels/pushover.ts`:

```typescript
import axios from 'axios';
import { Alert } from '../alert-manager';
import { logger } from '@/utils/logger';
import { config } from '@/config';

export class PushoverChannel {
  private appToken: string;
  private userKey: string;

  constructor() {
    this.appToken = config.PUSHOVER_APP_TOKEN;
    this.userKey = config.PUSHOVER_USER_KEY;
  }

  /**
   * Send alert to Pushover (mobile notifications)
   */
  async send(alert: Alert): Promise<void> {
    if (!this.appToken || !this.userKey) {
      logger.warn('Pushover not configured');
      return;
    }

    const priority = this.getPriority(alert.severity);

    const payload = {
      token: this.appToken,
      user: this.userKey,
      title: alert.title,
      message: alert.message,
      priority,
      timestamp: Math.floor(alert.timestamp.getTime() / 1000),
      sound: this.getSound(alert.severity)
    };

    // Add URL for critical alerts
    if (alert.severity === 'critical') {
      payload.url = `${config.BASE_URL}/alerts/${alert.id}`;
      payload.url_title = 'View Alert';
    }

    // Add retry for emergency priority
    if (priority === 2) {
      payload.retry = 60; // Retry every 60 seconds
      payload.expire = 3600; // Expire after 1 hour
    }

    try {
      await axios.post(
        'https://api.pushover.net/1/messages.json',
        payload
      );
    } catch (error) {
      logger.error('Failed to send Pushover alert:', error);
      throw error;
    }
  }

  /**
   * Get Pushover priority based on severity
   */
  private getPriority(severity: Alert['severity']): number {
    const priorities = {
      critical: 2,  // Emergency (requires acknowledgment)
      high: 1,      // High priority
      medium: 0,    // Normal
      low: -1,      // Low priority
      info: -2      // Lowest (no notification)
    };

    return priorities[severity] || 0;
  }

  /**
   * Get sound based on severity
   */
  private getSound(severity: Alert['severity']): string {
    const sounds = {
      critical: 'siren',
      high: 'persistent',
      medium: 'echo',
      low: 'mechanical',
      info: 'pushover'
    };

    return sounds[severity] || 'pushover';
  }
}
```

### 3. Alert Deduplication

Create `src/alerting/deduplication.ts`:

```typescript
import crypto from 'crypto';
import { Alert } from './alert-manager';
import { logger } from '@/utils/logger';

interface AlertHash {
  hash: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

export class Deduplicator {
  private alertHashes: Map<string, AlertHash> = new Map();
  private windowMs: number = 300000; // 5 minutes

  /**
   * Check if alert is duplicate
   */
  async isDuplicate(alert: Alert): Promise<boolean> {
    const hash = this.generateHash(alert);
    const now = new Date();

    // Check if we've seen this alert recently
    const existing = this.alertHashes.get(hash);

    if (existing) {
      const timeSinceLast = now.getTime() - existing.lastSeen.getTime();

      if (timeSinceLast < this.windowMs) {
        // Update count and last seen
        existing.count++;
        existing.lastSeen = now;

        logger.debug(
          `Duplicate alert detected: ${alert.title} (count: ${existing.count})`
        );

        // Send summary every 10 duplicates
        if (existing.count % 10 === 0) {
          await this.sendDuplicateSummary(alert, existing);
        }

        return true;
      }
    }

    // Not a duplicate, store hash
    this.alertHashes.set(hash, {
      hash,
      count: 1,
      firstSeen: now,
      lastSeen: now
    });

    // Clean old hashes
    this.cleanOldHashes();

    return false;
  }

  /**
   * Generate hash for alert
   */
  private generateHash(alert: Alert): string {
    const data = {
      source: alert.source,
      category: alert.category,
      severity: alert.severity,
      title: alert.title
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Send summary of duplicate alerts
   */
  private async sendDuplicateSummary(
    alert: Alert,
    hash: AlertHash
  ): Promise<void> {
    const duration = hash.lastSeen.getTime() - hash.firstSeen.getTime();
    const durationMin = Math.round(duration / 60000);

    logger.info(
      `Alert "${alert.title}" occurred ${hash.count} times in ${durationMin} minutes`
    );

    // TODO: Send summary notification
  }

  /**
   * Clean old hashes
   */
  private cleanOldHashes(): void {
    const now = new Date().getTime();
    const expired: string[] = [];

    for (const [hash, data] of this.alertHashes) {
      if (now - data.lastSeen.getTime() > this.windowMs * 2) {
        expired.push(hash);
      }
    }

    for (const hash of expired) {
      this.alertHashes.delete(hash);
    }
  }

  /**
   * Get deduplication statistics
   */
  getStatistics(): any {
    const stats = {
      totalHashes: this.alertHashes.size,
      duplicates: Array.from(this.alertHashes.values())
        .filter(h => h.count > 1)
        .map(h => ({
          count: h.count,
          firstSeen: h.firstSeen,
          lastSeen: h.lastSeen
        }))
    };

    return stats;
  }
}
```

### 4. Alert API Routes

Create `src/routes/alerts.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { AlertManager, AlertSchema } from '@/alerting/alert-manager';
import { z } from 'zod';

export async function alertRoutes(fastify: FastifyInstance) {
  const alertManager = new AlertManager();
  await alertManager.initialize();

  // Store reference for other services
  fastify.decorate('alertManager', alertManager);

  /**
   * Get active alerts
   */
  fastify.get('/api/v1/alerts', async (request, reply) => {
    const query = z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
      category: z.string().optional(),
      acknowledged: z.boolean().optional(),
      resolved: z.boolean().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0)
    }).parse(request.query);

    const alerts = await fastify.db.prepare(`
      SELECT * FROM alerts
      WHERE 1=1
        ${query.severity ? 'AND severity = ?' : ''}
        ${query.category ? 'AND category = ?' : ''}
        ${query.acknowledged !== undefined ? 'AND acknowledged = ?' : ''}
        ${query.resolved !== undefined ? 'AND resolved = ?' : ''}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(
      ...[
        query.severity,
        query.category,
        query.acknowledged,
        query.resolved
      ].filter(v => v !== undefined),
      query.limit,
      query.offset
    );

    return {
      alerts: alerts.map(a => ({
        ...a,
        details: JSON.parse(a.details || '{}'),
        tags: JSON.parse(a.tags || '[]')
      })),
      total: alerts.length
    };
  });

  /**
   * Get alert by ID
   */
  fastify.get('/api/v1/alerts/:id', async (request, reply) => {
    const params = z.object({
      id: z.string()
    }).parse(request.params);

    const alert = fastify.db.prepare(
      'SELECT * FROM alerts WHERE id = ?'
    ).get(params.id);

    if (!alert) {
      return reply.status(404).send({ error: 'Alert not found' });
    }

    return {
      ...alert,
      details: JSON.parse(alert.details || '{}'),
      tags: JSON.parse(alert.tags || '[]')
    };
  });

  /**
   * Acknowledge alert
   */
  fastify.post('/api/v1/alerts/:id/acknowledge', async (request, reply) => {
    const params = z.object({
      id: z.string()
    }).parse(request.params);

    const body = z.object({
      userId: z.string()
    }).parse(request.body);

    await alertManager.acknowledgeAlert(params.id, body.userId);

    return { success: true };
  });

  /**
   * Resolve alert
   */
  fastify.post('/api/v1/alerts/:id/resolve', async (request, reply) => {
    const params = z.object({
      id: z.string()
    }).parse(request.params);

    await alertManager.resolveAlert(params.id);

    return { success: true };
  });

  /**
   * Get alert statistics
   */
  fastify.get('/api/v1/alerts/stats', async (request, reply) => {
    const stats = await alertManager.getStatistics();

    return stats;
  });

  /**
   * Test alert
   */
  fastify.post('/api/v1/alerts/test', async (request, reply) => {
    const body = z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      channel: z.string().optional()
    }).parse(request.body);

    const testAlert = AlertSchema.parse({
      id: 'test_' + Date.now(),
      timestamp: new Date(),
      source: 'test',
      category: 'configuration',
      severity: body.severity,
      title: `Test ${body.severity} Alert`,
      message: `This is a test ${body.severity} alert to verify notification delivery.`,
      remediation: 'No action needed - this is a test.',
      tags: ['test'],
      acknowledged: false,
      resolved: false
    });

    await alertManager.processEvent('test', {
      type: 'test_alert',
      severity: body.severity
    });

    return {
      success: true,
      message: 'Test alert sent'
    };
  });

  /**
   * Configure quiet hours
   */
  fastify.post('/api/v1/alerts/quiet-hours', async (request, reply) => {
    const body = z.object({
      enabled: z.boolean(),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      days: z.array(z.number().min(0).max(6))
    }).parse(request.body);

    // TODO: Update scheduler configuration

    return {
      success: true,
      message: 'Quiet hours configured'
    };
  });

  // WebSocket: Real-time alerts
  fastify.io.on('connection', (socket) => {
    // Send new alerts in real-time
    alertManager.on('alert', (alert) => {
      socket.emit('alert:new', alert);
    });
  });
}
```

### 5. Database Schema

Add to `src/db/migrations/002_alerts.sql`:

```sql
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  timestamp DATETIME NOT NULL,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  tags TEXT,
  remediation TEXT,
  acknowledged BOOLEAN DEFAULT 0,
  acknowledgedBy TEXT,
  acknowledgedAt DATETIME,
  resolved BOOLEAN DEFAULT 0,
  resolvedAt DATETIME,
  INDEX idx_alerts_timestamp (timestamp),
  INDEX idx_alerts_severity (severity),
  INDEX idx_alerts_acknowledged (acknowledged),
  INDEX idx_alerts_resolved (resolved)
);

CREATE TABLE IF NOT EXISTS alert_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alertId TEXT NOT NULL,
  action TEXT NOT NULL,
  userId TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  FOREIGN KEY (alertId) REFERENCES alerts(id)
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS escalation_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  severity TEXT NOT NULL,
  delayMinutes INTEGER NOT NULL,
  channels TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1
);
```

### 6. Environment Variables

Add to `.env.example`:

```env
# Alert Channels
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=
SMTP_FROM=HomeServer Monitor <alerts@yourdomain.com>
ALERT_EMAIL_TO=admin@yourdomain.com

DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

PUSHOVER_APP_TOKEN=
PUSHOVER_USER_KEY=

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Alert Settings
ALERT_DEDUP_WINDOW_MS=300000
ALERT_RETENTION_DAYS=30
ALERT_QUIET_HOURS_ENABLED=true
ALERT_QUIET_HOURS_START=22:00
ALERT_QUIET_HOURS_END=08:00
```

## 🧪 Testing

### Test Alert System

```bash
# Test different severity levels
curl -X POST http://localhost:3100/api/v1/alerts/test \
  -H "Content-Type: application/json" \
  -d '{"severity": "critical"}'

# Check active alerts
curl http://localhost:3100/api/v1/alerts

# Acknowledge alert
curl -X POST http://localhost:3100/api/v1/alerts/{alertId}/acknowledge \
  -H "Content-Type: application/json" \
  -d '{"userId": "admin"}'
```

## 📚 Additional Resources

- [Discord Webhooks](https://discord.com/developers/docs/resources/webhook)
- [Pushover API](https://pushover.net/api)
- [Telegram Bot API](https://core.telegram.org/bots/api)

## 🎓 Learning Notes

### Alert Fatigue Prevention

1. **Deduplication**: Group similar alerts
2. **Severity Levels**: Route appropriately
3. **Quiet Hours**: Respect personal time
4. **Smart Grouping**: Related alerts together
5. **Acknowledgment**: Track what's handled

## ✅ Completion Checklist

- [ ] Alert manager initialized
- [ ] All channels configured and tested
- [ ] Deduplication working
- [ ] Quiet hours implemented
- [ ] Escalation chains configured
- [ ] Database schema created
- [ ] API endpoints tested
- [ ] WebSocket broadcasting working
- [ ] Test alerts sent successfully
- [ ] Documentation updated

## 🚀 Next Steps

After completing this phase:

1. **Test Channels**: Send test alerts to all channels
2. **Configure Rules**: Fine-tune alert rules
3. **Set Quiet Hours**: Configure your schedule
4. **Monitor**: Watch for false positives
5. **Proceed to Phase 10**: Auto-remediation

---

**Remember**: Good alerting is about signal, not noise. Alert on what matters, when it matters.
import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import type { ArrClient, PlexClient } from '../../integrations/arr-apps/client.js';
import type { ContainerStats, PortainerClient } from '../../integrations/portainer/client.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('docker-monitor');

interface DockerMonitorConfig {
  portainer: PortainerClient;
  arrClients: ArrClient[];
  plexClient?: PlexClient;
  db: Database.Database;
  io: SocketServer;
  interval: number;
}

export class DockerMonitor {
  private portainer: PortainerClient;
  private arrClients: ArrClient[];
  private plexClient?: PlexClient;
  private db: Database.Database;
  private io: SocketServer;
  private interval: NodeJS.Timeout | null = null;
  private monitorInterval: number;

  constructor(config: DockerMonitorConfig) {
    this.portainer = config.portainer;
    this.arrClients = config.arrClients;
    this.plexClient = config.plexClient;
    this.db = config.db;
    this.io = config.io;
    this.monitorInterval = config.interval;
  }

  start(): void {
    logger.info('Starting Docker monitoring...');

    // Start monitoring
    this.interval = setInterval(() => {
      void this.monitorContainers();
    }, this.monitorInterval);

    // Initial fetch
    void this.fetchAllData();
  }

  stop(): void {
    logger.info('Stopping Docker monitoring...');

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async monitorContainers(): Promise<void> {
    try {
      const containers = await this.portainer.getContainers();

      for (const container of containers) {
        // Only monitor running containers
        if (container.state !== 'running') {
          continue;
        }

        try {
          const stats = await this.portainer.getContainerStats(container.id);

          // Store in database
          this.storeContainerMetrics(container.id, container.name, container.state, stats);

          // Check for alerts
          this.checkContainerAlerts(container, stats);

          // Emit real-time stats
          this.io.to('docker').emit('docker:container:stats', {
            id: container.id,
            name: container.name,
            stats,
          });
        } catch (error) {
          logger.warn({ err: error, container: container.name }, 'Failed to get container stats');
        }
      }

      // Emit container list
      this.io.to('docker').emit('docker:containers', containers);
    } catch (error) {
      logger.error({ err: error }, 'Container monitoring error');
    }
  }

  private async monitorArrApps(): Promise<void> {
    for (const client of this.arrClients) {
      try {
        const [status, health, queue] = await Promise.all([
          client.getSystemStatus(),
          client.getHealth(),
          client.getQueue(),
        ]);

        // Emit to clients
        this.io.to('arr').emit('arr:status', {
          app: client.name,
          status,
          health,
          queue,
        });

        // Check for health issues
        for (const issue of health) {
          if (issue.severity === 'error') {
            this.createAlert({
              type: 'arr_health',
              severity: 'warning',
              message: `${client.name}: ${issue.message}`,
              details: JSON.stringify(issue),
            });
          }
        }

        // Alert on stuck downloads
        const stuckItems = queue.items.filter(
          (item) => item.status === 'warning' || item.errorMessage,
        );

        if (stuckItems.length > 0) {
          this.createAlert({
            type: 'arr_queue_stuck',
            severity: 'warning',
            message: `${client.name} has ${stuckItems.length} stuck downloads`,
            details: JSON.stringify(stuckItems),
          });
        }
      } catch (error) {
        logger.warn({ err: error, app: client.name }, 'Failed to monitor arr app');
      }
    }
  }

  private async monitorPlex(): Promise<void> {
    if (!this.plexClient) {
      return;
    }

    try {
      const [status, sessions] = await Promise.all([
        this.plexClient.getStatus(),
        this.plexClient.getSessions(),
      ]);

      this.io.to('plex').emit('plex:status', {
        status,
        sessions,
      });

      // Alert on high bandwidth usage
      const totalBandwidth = sessions.sessions.reduce((sum, s) => sum + s.bandwidth, 0);
      if (totalBandwidth > 20000) {
        // 20 Mbps
        this.createAlert({
          type: 'plex_bandwidth',
          severity: 'info',
          message: `Plex high bandwidth usage: ${(totalBandwidth / 1000).toFixed(1)} Mbps`,
          details: JSON.stringify(sessions),
        });
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to monitor Plex');
    }
  }

  private async fetchAllData(): Promise<void> {
    logger.info('Fetching initial Docker data...');
    await this.monitorContainers();
    await this.monitorArrApps();
    await this.monitorPlex();
    logger.info('Initial Docker data fetch complete');
  }

  private storeContainerMetrics(
    id: string,
    name: string,
    state: string,
    stats: ContainerStats,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO container_metrics (
        timestamp, container_id, container_name, state,
        cpu_percent, memory_used_mb, memory_limit_mb,
        network_rx_mb, network_tx_mb
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      new Date().toISOString(),
      id,
      name,
      state,
      stats.cpu.percentage,
      stats.memory.used / 1024 / 1024,
      stats.memory.limit / 1024 / 1024,
      stats.network.rx / 1024 / 1024,
      stats.network.tx / 1024 / 1024,
    );
  }

  private checkContainerAlerts(
    container: { name: string; isCritical: boolean },
    stats: ContainerStats,
  ): void {
    // Alert on high CPU usage for critical containers
    if (container.isCritical && stats.cpu.percentage > 90) {
      this.createAlert({
        type: 'container_cpu',
        severity: 'warning',
        message: `${container.name} CPU usage is ${stats.cpu.percentage.toFixed(1)}%`,
        details: JSON.stringify(stats.cpu),
      });
    }

    // Alert on high memory usage
    if (stats.memory.percentage > 90) {
      this.createAlert({
        type: 'container_memory',
        severity: 'warning',
        message: `${container.name} memory usage is ${stats.memory.percentage.toFixed(1)}%`,
        details: JSON.stringify(stats.memory),
      });
    }
  }

  private createAlert(alert: {
    type: string;
    severity: string;
    message: string;
    details: string;
  }): void {
    // Check if similar alert exists in last hour
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const existing = this.db
      .prepare(
        `
      SELECT id FROM alerts
      WHERE type = ? AND message = ? AND triggered_at > ?
    `,
      )
      .get(alert.type, alert.message, oneHourAgo.toISOString());

    if (existing) {
      return; // Don't create duplicate alert
    }

    const stmt = this.db.prepare(`
      INSERT INTO alerts (type, severity, message, details)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(alert.type, alert.severity, alert.message, alert.details);

    logger.warn(`Alert created: [${alert.severity}] ${alert.message}`);

    // Broadcast alert
    this.io.emit('alert:new', {
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get container list
   */
  async getContainers(): Promise<unknown[]> {
    return await this.portainer.getContainers();
  }

  /**
   * Get container stats
   */
  async getContainerStats(containerId: string): Promise<ContainerStats> {
    return await this.portainer.getContainerStats(containerId);
  }

  /**
   * Get Arr app status
   */
  async getArrStatus(appName: string): Promise<unknown> {
    const client = this.arrClients.find((c) => c.name.toLowerCase() === appName.toLowerCase());

    if (!client) {
      throw new Error(`Arr app ${appName} not configured`);
    }

    const [status, health, queue] = await Promise.all([
      client.getSystemStatus(),
      client.getHealth(),
      client.getQueue(),
    ]);

    return { status, health, queue };
  }
}

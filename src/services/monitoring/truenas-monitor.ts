import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import type { TrueNASClient } from '../../integrations/truenas/client.js';
import { createLogger } from '../../utils/logger.js';
import { DiskFailurePredictor } from './disk-predictor.js';

const logger = createLogger('truenas-monitor');

interface MonitorConfig {
  client: TrueNASClient;
  db: Database.Database;
  io: SocketServer;
  intervals: {
    system: number;
    storage: number;
    smart: number;
  };
}

export class TrueNASMonitor {
  private client: TrueNASClient;
  private db: Database.Database;
  private io: SocketServer;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private config: MonitorConfig;
  private predictor: DiskFailurePredictor;

  constructor(config: MonitorConfig) {
    this.client = config.client;
    this.db = config.db;
    this.io = config.io;
    this.config = config;
    this.predictor = new DiskFailurePredictor(this.db);
  }

  start(): void {
    logger.info('Starting TrueNAS monitoring...');

    // System stats monitoring
    this.startSystemMonitoring();

    // Pool monitoring
    this.startPoolMonitoring();

    // SMART data monitoring
    this.startSmartMonitoring();

    // Initial data fetch
    void this.fetchAllData();
  }

  stop(): void {
    logger.info('Stopping TrueNAS monitoring...');

    for (const [name, interval] of this.intervals) {
      clearInterval(interval);
      logger.info(`Stopped ${name} monitoring`);
    }

    this.intervals.clear();
  }

  private startSystemMonitoring(): void {
    const interval = setInterval(() => {
      void this.monitorSystem();
    }, this.config.intervals.system);

    this.intervals.set('system', interval);
  }

  private async monitorSystem(): Promise<void> {
    try {
      const stats = await this.client.getSystemStats();

      // Store in database
      const stmt = this.db.prepare(`
        INSERT INTO metrics (
          timestamp, cpu_percent, cpu_temp, ram_used_gb, ram_total_gb,
          ram_percent, network_rx_mbps, network_tx_mbps, arc_size_gb
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        new Date().toISOString(),
        stats.cpu.usage,
        stats.cpu.temperature,
        stats.memory.used,
        64,
        stats.memory.percentage,
        stats.network.rxRate,
        stats.network.txRate,
        stats.memory.arc / 1024 / 1024 / 1024,
      );

      // Broadcast to connected clients
      this.io.to('system').emit('system:stats', stats);

      // Check for alerts
      this.checkSystemAlerts(stats);
    } catch (error) {
      logger.error({ err: error }, 'System monitoring error');
    }
  }

  private startPoolMonitoring(): void {
    const interval = setInterval(() => {
      void this.monitorPools();
    }, this.config.intervals.storage);

    this.intervals.set('pools', interval);
  }

  private async monitorPools(): Promise<void> {
    try {
      const pools = await this.client.getPools();

      // Store pool status
      for (const pool of pools) {
        const stmt = this.db.prepare(`
          INSERT INTO pool_metrics (
            timestamp, pool_name, pool_type, status, health,
            used_bytes, total_bytes, percent_used, scrub_errors
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          new Date().toISOString(),
          pool.name,
          pool.type,
          pool.status,
          pool.health,
          pool.capacity.used,
          pool.capacity.total,
          pool.capacity.percent,
          pool.scrubErrors,
        );

        // Alert on capacity
        if (pool.type === 'personal' && pool.capacity.percent > 80) {
          this.createAlert({
            type: 'pool_capacity',
            severity: 'warning',
            message: `Personal data pool ${pool.name} is ${pool.capacity.percent.toFixed(1)}% full`,
            details: JSON.stringify(pool),
          });
        }

        // Alert on health
        if (pool.health !== 'HEALTHY') {
          this.createAlert({
            type: 'pool_health',
            severity: 'critical',
            message: `Pool ${pool.name} health is ${pool.health}`,
            details: JSON.stringify(pool),
          });
        }
      }

      this.io.to('storage').emit('storage:pools', pools);
    } catch (error) {
      logger.error({ err: error }, 'Pool monitoring error');
    }
  }

  private startSmartMonitoring(): void {
    const interval = setInterval(() => {
      void this.monitorSmart();
    }, this.config.intervals.smart);

    this.intervals.set('smart', interval);
  }

  private async monitorSmart(): Promise<void> {
    try {
      const disks = await this.client.getDisks();

      // Monitor IronWolf drives with extra attention
      for (const disk of disks.filter((d) => d.isIronWolf || d.isCritical)) {
        const smart = await this.client.getSmartData(disk.name);

        if (smart) {
          // Store SMART data
          const stmt = this.db.prepare(`
            INSERT INTO smart_metrics (
              timestamp, disk_name, model, temperature,
              power_on_hours, reallocated_sectors, pending_sectors,
              health_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          stmt.run(
            new Date().toISOString(),
            disk.name,
            disk.model,
            smart.temperature,
            smart.powerOnHours,
            smart.reallocatedSectors,
            smart.pendingSectors,
            smart.healthStatus,
          );

          // Alert on concerning SMART values
          if (smart.reallocatedSectors > 0) {
            this.createAlert({
              type: 'smart_reallocated_sectors',
              severity: 'critical',
              message: `Disk ${disk.name} has ${smart.reallocatedSectors} reallocated sectors`,
              details: JSON.stringify(smart),
            });
          }

          if (smart.temperature > 55) {
            this.createAlert({
              type: 'smart_temperature',
              severity: 'warning',
              message: `Disk ${disk.name} temperature is ${smart.temperature}°C`,
              details: JSON.stringify(smart),
            });
          }

          // Run failure prediction
          const prediction = await this.predictor.predictFailure(disk.name);

          if (prediction.failureProbability > 40) {
            this.createAlert({
              type: 'disk_failure_prediction',
              severity: prediction.failureProbability > 70 ? 'critical' : 'warning',
              message: `Disk ${disk.name} has ${prediction.failureProbability.toFixed(1)}% failure probability`,
              details: JSON.stringify(prediction),
              suggestedAction: prediction.recommendedAction,
            });
          }

          this.io.to('smart').emit('smart:prediction', prediction);
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'SMART monitoring error');
    }
  }

  private async fetchAllData(): Promise<void> {
    logger.info('Fetching initial data...');
    await this.monitorSystem();
    await this.monitorPools();
    await this.monitorSmart();
    logger.info('Initial data fetch complete');
  }

  private checkSystemAlerts(stats: {
    cpu: { usage: number; temperature: number };
    memory: { percentage: number };
  }): void {
    if (stats.cpu.usage > 90) {
      this.createAlert({
        type: 'cpu_usage',
        severity: 'warning',
        message: `CPU usage is ${stats.cpu.usage.toFixed(1)}%`,
        details: JSON.stringify(stats.cpu),
      });
    }

    if (stats.cpu.temperature > 80) {
      this.createAlert({
        type: 'cpu_temperature',
        severity: 'critical',
        message: `CPU temperature is ${stats.cpu.temperature}°C`,
        details: JSON.stringify(stats.cpu),
      });
    }

    if (stats.memory.percentage > 90) {
      this.createAlert({
        type: 'memory_usage',
        severity: 'warning',
        message: `Memory usage is ${stats.memory.percentage.toFixed(1)}%`,
        details: JSON.stringify(stats.memory),
      });
    }
  }

  private createAlert(alert: {
    type: string;
    severity: string;
    message: string;
    details: string;
    suggestedAction?: string;
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
      INSERT INTO alerts (
        type, severity, message, details, actionable, suggested_action
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      alert.type,
      alert.severity,
      alert.message,
      alert.details,
      alert.suggestedAction ? 1 : 0,
      alert.suggestedAction || null,
    );

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
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 50): Array<{
    id: number;
    type: string;
    severity: string;
    message: string;
    triggeredAt: string;
    acknowledged: boolean;
    resolved: boolean;
  }> {
    const stmt = this.db.prepare(`
      SELECT id, type, severity, message, triggered_at as triggeredAt,
             acknowledged, resolved
      FROM alerts
      ORDER BY triggered_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Array<{
      id: number;
      type: string;
      severity: string;
      message: string;
      triggeredAt: string;
      acknowledged: boolean;
      resolved: boolean;
    }>;
  }
}

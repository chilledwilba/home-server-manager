import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '../../utils/logger.js';
import type { NUTClient, UPSStatus } from '../../integrations/ups/nut-client.js';

const execAsync = promisify(exec);
const logger = createLogger('ups-monitor');

/**
 * Configuration thresholds for UPS monitoring
 */
export interface UPSThresholds {
  criticalRuntime: number; // Seconds - initiate emergency shutdown
  warningRuntime: number; // Seconds - start graceful service shutdown
  lowBattery: number; // Percentage - low battery alert
}

/**
 * Polling intervals for UPS monitoring
 */
export interface UPSIntervals {
  polling: number; // Normal polling interval (ms)
  onBattery: number; // Faster polling when on battery (ms)
}

/**
 * Configuration for UPS monitor
 */
export interface UPSMonitorConfig {
  client: NUTClient;
  db: Database.Database;
  io: SocketServer;
  intervals: UPSIntervals;
  thresholds: UPSThresholds;
  enableShutdown?: boolean; // Safety flag to enable actual shutdown actions
}

/**
 * UPS monitor service
 * Monitors UPS status and handles power events with graceful shutdown
 */
export class UPSMonitor {
  private client: NUTClient;
  private db: Database.Database;
  private io: SocketServer;
  private config: UPSMonitorConfig;
  private interval?: NodeJS.Timeout;
  private onBattery = false;
  private shutdownInitiated = false;
  private gracefulShutdownInitiated = false;

  constructor(config: UPSMonitorConfig) {
    this.client = config.client;
    this.db = config.db;
    this.io = config.io;
    this.config = {
      ...config,
      enableShutdown: config.enableShutdown ?? false,
    };

    logger.info(
      {
        intervals: this.config.intervals,
        thresholds: this.config.thresholds,
        shutdownEnabled: this.config.enableShutdown,
      },
      'UPS monitor initialized',
    );
  }

  /**
   * Start UPS monitoring
   */
  start(): void {
    logger.info('Starting UPS monitoring...');
    this.startMonitoring();
  }

  /**
   * Monitor UPS status with periodic polling
   */
  private startMonitoring(): void {
    const poll = async (): Promise<void> => {
      try {
        const status = await this.client.getStatus();

        // Store metrics
        this.storeMetrics(status);

        // Broadcast to connected clients
        this.io.to('ups').emit('ups:status', status);

        // Check for power events
        await this.checkPowerEvents(status);

        // Adjust polling interval based on power state
        if (status.onBattery && !this.onBattery) {
          // Switched to battery - poll faster
          logger.warn('⚠️ POWER OUTAGE - Switched to battery power');
          this.logPowerEvent('power_loss', status);
          this.onBattery = true;
          this.restartMonitoring(this.config.intervals.onBattery);
        } else if (!status.onBattery && this.onBattery) {
          // Power restored
          logger.info('✅ Power restored - Back to AC power');
          this.logPowerEvent('power_restored', status);
          this.onBattery = false;
          this.shutdownInitiated = false;
          this.gracefulShutdownInitiated = false;
          this.restartMonitoring(this.config.intervals.polling);
        }
      } catch (error) {
        logger.error({ err: error }, 'UPS monitoring error');
      }
    };

    // Initial poll
    void poll();

    // Set up interval
    this.interval = setInterval(() => {
      void poll();
    }, this.config.intervals.polling);
  }

  /**
   * Restart monitoring with new interval
   */
  private restartMonitoring(newInterval: number): void {
    if (this.interval) {
      clearInterval(this.interval);
    }

    logger.debug({ interval: newInterval }, 'Restarting monitoring with new interval');

    this.interval = setInterval(async () => {
      try {
        const status = await this.client.getStatus();
        this.storeMetrics(status);
        this.io.to('ups').emit('ups:status', status);
        await this.checkPowerEvents(status);
      } catch (error) {
        logger.error({ err: error }, 'UPS monitoring error');
      }
    }, newInterval);
  }

  /**
   * Check for critical power events and take action
   */
  private async checkPowerEvents(status: UPSStatus): Promise<void> {
    if (!status.onBattery) {
      return;
    }

    const runtimeSeconds = status.batteryRuntime;
    const batteryPercent = status.batteryCharge;

    // CRITICAL: Less than threshold remaining - emergency shutdown
    if (runtimeSeconds < this.config.thresholds.criticalRuntime && !this.shutdownInitiated) {
      logger.error(
        {
          runtime: runtimeSeconds,
          battery: batteryPercent,
        },
        `🚨 CRITICAL: Only ${Math.floor(runtimeSeconds / 60)} minutes of battery remaining`,
      );

      this.shutdownInitiated = true;
      await this.emergencyShutdown(status);
    }
    // WARNING: Less than warning threshold - graceful shutdown
    else if (
      runtimeSeconds < this.config.thresholds.warningRuntime &&
      !this.gracefulShutdownInitiated
    ) {
      logger.warn(
        {
          runtime: runtimeSeconds,
          battery: batteryPercent,
        },
        `⚠️ WARNING: ${Math.floor(runtimeSeconds / 60)} minutes of battery remaining`,
      );

      this.gracefulShutdownInitiated = true;
      await this.gracefulServiceShutdown(status);
    }
    // LOW BATTERY: Less than threshold percentage
    else if (
      batteryPercent < this.config.thresholds.lowBattery &&
      !this.gracefulShutdownInitiated
    ) {
      logger.warn(
        {
          battery: batteryPercent,
        },
        `⚠️ Low battery: ${batteryPercent}%`,
      );

      this.createAlert({
        type: 'ups_low_battery',
        severity: 'warning',
        message: `UPS battery at ${batteryPercent}%`,
        details: status,
      });
    }
  }

  /**
   * Graceful service shutdown (preserve critical services)
   */
  async gracefulServiceShutdown(status: UPSStatus): Promise<void> {
    logger.warn('⚠️ UPS on battery - initiating graceful service shutdown');

    // Create alert
    this.createAlert({
      type: 'ups_graceful_shutdown',
      severity: 'high',
      message: 'Starting graceful shutdown due to low battery',
      details: { action: 'graceful_shutdown', status },
    });

    // Log event
    this.logPowerEvent('graceful_shutdown_initiated', status);

    if (!this.config.enableShutdown) {
      logger.warn('Shutdown actions disabled (safety mode) - would execute graceful shutdown');
      return;
    }

    try {
      // 1. Create emergency snapshots of critical pools
      logger.info('Creating emergency snapshots...');
      await this.createEmergencySnapshots();

      // 2. Stop non-essential containers
      logger.info('Stopping non-essential containers...');
      await this.stopNonEssentialContainers();

      logger.info('Graceful service shutdown complete - monitoring for power restoration');
    } catch (error) {
      logger.error({ err: error }, 'Error during graceful shutdown');
    }
  }

  /**
   * Emergency shutdown (imminent power loss)
   */
  async emergencyShutdown(status: UPSStatus): Promise<void> {
    logger.error('🚨 EMERGENCY SHUTDOWN - Battery critical');

    this.createAlert({
      type: 'ups_emergency_shutdown',
      severity: 'critical',
      message: 'EMERGENCY: Initiating system shutdown - battery critical',
      details: { action: 'emergency_shutdown', status },
    });

    // Log event
    this.logPowerEvent('emergency_shutdown_initiated', status);

    if (!this.config.enableShutdown) {
      logger.warn('Shutdown actions disabled (safety mode) - would execute emergency shutdown');
      return;
    }

    try {
      // 1. Stop all Docker containers
      logger.info('Stopping all Docker containers...');
      await this.stopAllContainers();

      // 2. Create final snapshots if time permits
      logger.info('Creating final emergency snapshots...');
      await this.createEmergencySnapshots();

      // 3. Sync filesystems
      logger.info('Syncing filesystems...');
      await execAsync('sync');

      logger.error('Emergency shutdown sequence complete - system should shutdown now');
    } catch (error) {
      logger.error({ err: error }, 'Error during emergency shutdown');
    }
  }

  /**
   * Create emergency snapshots of critical pools
   */
  private async createEmergencySnapshots(): Promise<void> {
    // Get all pools from database
    const stmt = this.db.prepare('SELECT name FROM pools WHERE status = ?');
    const pools = stmt.all('ONLINE') as Array<{ name: string }>;

    for (const pool of pools) {
      try {
        const snapshotName = `${pool.name}@emergency-${Date.now()}`;
        await execAsync(`zfs snapshot ${snapshotName}`, { timeout: 30000 });
        logger.info({ pool: pool.name, snapshot: snapshotName }, 'Created emergency snapshot');
      } catch (error) {
        logger.error({ err: error, pool: pool.name }, 'Failed to create emergency snapshot');
      }
    }
  }

  /**
   * Stop non-essential containers
   */
  private async stopNonEssentialContainers(): Promise<void> {
    // Get non-essential containers from database
    // For now, we'll use a predefined list
    const nonEssential = ['sonarr', 'radarr', 'prowlarr', 'transmission', 'qbittorrent'];

    for (const container of nonEssential) {
      try {
        await execAsync(`docker stop ${container}`, { timeout: 30000 });
        logger.info({ container }, 'Stopped non-essential container');
      } catch (error) {
        // Container might not exist, that's okay
        logger.debug({ err: error, container }, 'Failed to stop container (may not exist)');
      }
    }
  }

  /**
   * Stop all containers
   */
  private async stopAllContainers(): Promise<void> {
    try {
      const { stdout } = await execAsync('docker ps -q', { timeout: 5000 });
      const containers = stdout
        .trim()
        .split('\n')
        .filter((id) => id.length > 0);

      if (containers.length === 0) {
        logger.info('No running containers to stop');
        return;
      }

      await execAsync(`docker stop ${containers.join(' ')}`, { timeout: 60000 });
      logger.info({ count: containers.length }, 'Stopped all Docker containers');
    } catch (error) {
      logger.error({ err: error }, 'Failed to stop all containers');
    }
  }

  /**
   * Store UPS metrics in database
   */
  private storeMetrics(status: UPSStatus): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO ups_metrics (
          timestamp, on_battery, battery_charge, battery_runtime,
          input_voltage, output_voltage, load, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        status.timestamp,
        status.onBattery ? 1 : 0,
        status.batteryCharge,
        status.batteryRuntime,
        status.inputVoltage,
        status.outputVoltage,
        status.load,
        status.status,
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to store UPS metrics');
    }
  }

  /**
   * Log power event to database
   */
  private logPowerEvent(eventType: string, status: UPSStatus): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO ups_events (
          timestamp, event_type, battery_percent, runtime_remaining, details
        ) VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        status.timestamp,
        eventType,
        status.batteryCharge,
        status.batteryRuntime,
        JSON.stringify(status),
      );

      logger.info({ eventType }, 'Logged power event');
    } catch (error) {
      logger.error({ err: error, eventType }, 'Failed to log power event');
    }
  }

  /**
   * Create alert
   */
  private createAlert(alert: {
    type: string;
    severity: string;
    message: string;
    details: unknown;
  }): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO alerts (type, severity, message, details, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        alert.type,
        alert.severity,
        alert.message,
        JSON.stringify(alert.details),
        new Date().toISOString(),
      );

      const fullAlert = {
        id: result.lastInsertRowid,
        ...alert,
        triggeredAt: new Date().toISOString(),
      };

      this.io.to('alerts').emit('alert:triggered', fullAlert);
      logger.warn({ alert: fullAlert }, `Alert: ${alert.message}`);
    } catch (error) {
      logger.error({ err: error, alert }, 'Failed to create alert');
    }
  }

  /**
   * Get current monitoring status
   */
  getMonitoringStatus(): {
    running: boolean;
    onBattery: boolean;
    shutdownInitiated: boolean;
    gracefulShutdownInitiated: boolean;
  } {
    return {
      running: this.interval !== undefined,
      onBattery: this.onBattery,
      shutdownInitiated: this.shutdownInitiated,
      gracefulShutdownInitiated: this.gracefulShutdownInitiated,
    };
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    logger.info('UPS monitoring stopped');
  }
}

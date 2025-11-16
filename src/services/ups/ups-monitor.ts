import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import type { NUTClient, UPSStatus } from '../../integrations/ups/nut-client.js';
import { createLogger } from '../../utils/logger.js';
import { ShutdownManager } from './shutdown-manager.js';
import { UPSPersistence } from './ups-persistence.js';

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
  private shutdownManager: ShutdownManager;
  private persistence: UPSPersistence;

  constructor(config: UPSMonitorConfig) {
    this.client = config.client;
    this.db = config.db;
    this.io = config.io;
    this.config = {
      ...config,
      enableShutdown: config.enableShutdown ?? false,
    };

    // Initialize helper services
    this.shutdownManager = new ShutdownManager(this.db, this.config.enableShutdown ?? false);
    this.persistence = new UPSPersistence(this.db, this.io);

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
        this.persistence.storeMetrics(status);

        // Broadcast to connected clients
        this.io.to('ups').emit('ups:status', status);

        // Check for power events
        await this.checkPowerEvents(status);

        // Adjust polling interval based on power state
        if (status.onBattery && !this.onBattery) {
          // Switched to battery - poll faster
          logger.warn('⚠️ POWER OUTAGE - Switched to battery power');
          this.persistence.logPowerEvent('power_loss', status);
          this.onBattery = true;
          this.restartMonitoring(this.config.intervals.onBattery);
        } else if (!status.onBattery && this.onBattery) {
          // Power restored
          logger.info('✅ Power restored - Back to AC power');
          this.persistence.logPowerEvent('power_restored', status);
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
        this.persistence.storeMetrics(status);
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

      // Create alert and log event
      this.persistence.createAlert({
        type: 'ups_emergency_shutdown',
        severity: 'critical',
        message: 'EMERGENCY: Initiating system shutdown - battery critical',
        details: { action: 'emergency_shutdown', status },
      });
      this.persistence.logPowerEvent('emergency_shutdown_initiated', status);

      await this.shutdownManager.emergencyShutdown(status);
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

      // Create alert and log event
      this.persistence.createAlert({
        type: 'ups_graceful_shutdown',
        severity: 'high',
        message: 'Starting graceful shutdown due to low battery',
        details: { action: 'graceful_shutdown', status },
      });
      this.persistence.logPowerEvent('graceful_shutdown_initiated', status);

      await this.shutdownManager.gracefulServiceShutdown(status);
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

      this.persistence.createAlert({
        type: 'ups_low_battery',
        severity: 'warning',
        message: `UPS battery at ${batteryPercent}%`,
        details: status,
      });
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

import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import type { UPSStatus } from '../../integrations/ups/nut-client.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ups-persistence');

/**
 * Handles UPS data persistence and alert creation
 * Manages database operations for UPS metrics, events, and alerts
 */
export class UPSPersistence {
  constructor(
    private db: Database.Database,
    private io: SocketServer,
  ) {}

  /**
   * Store UPS metrics in database
   */
  storeMetrics(status: UPSStatus): void {
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
  logPowerEvent(eventType: string, status: UPSStatus): void {
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
  createAlert(alert: { type: string; severity: string; message: string; details: unknown }): void {
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
}

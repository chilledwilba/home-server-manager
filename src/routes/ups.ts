import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { NUTClient } from '../integrations/ups/nut-client.js';
import type { UPSMonitor } from '../services/ups/ups-monitor.js';

/**
 * UPS monitoring and management routes
 */
export function upsRoutes(
  fastify: FastifyInstance,
  options: {
    client: NUTClient;
    monitor?: UPSMonitor;
  },
): void {
  const { client, monitor } = options;

  /**
   * Get current UPS status
   */
  fastify.get('/api/ups/status', async () => {
    const status = await client.getStatus();
    return {
      success: true,
      data: status,
    };
  });

  /**
   * Get UPS variables (detailed info)
   */
  fastify.get('/api/ups/variables', async () => {
    const variables = await client.getVariables();
    return {
      success: true,
      data: variables,
    };
  });

  /**
   * List available UPS devices
   */
  fastify.get('/api/ups/devices', async () => {
    const devices = await client.listDevices();
    return {
      success: true,
      data: devices,
    };
  });

  /**
   * Check if UPS is available
   */
  fastify.get('/api/ups/availability', async () => {
    const available = await client.isAvailable();
    return {
      success: true,
      data: { available },
    };
  });

  /**
   * Get UPS metrics history
   */
  fastify.get<{
    Querystring: { hours?: number };
  }>('/api/ups/metrics', async (request) => {
    const { hours = 24 } = request.query;

    const db = (fastify as { db?: Database.Database }).db;
    if (!db) {
      return { success: false, error: 'Database not available' };
    }
    const stmt = db.prepare(`SELECT * FROM ups_metrics
      WHERE timestamp > datetime('now', '-${hours} hours')
      ORDER BY timestamp DESC
      LIMIT 1000`);

    const metrics = stmt.all();

    return {
      success: true,
      data: metrics,
      meta: {
        count: metrics.length,
        hours,
      },
    };
  });

  /**
   * Get power outage/event history
   */
  fastify.get<{
    Querystring: { days?: number };
  }>('/api/ups/events', async (request) => {
    const { days = 30 } = request.query;

    const db = (fastify as { db?: Database.Database }).db;
    if (!db) {
      return { success: false, error: 'Database not available' };
    }
    const stmt = db.prepare(`SELECT * FROM ups_events
      WHERE timestamp > datetime('now', '-${days} days')
      ORDER BY timestamp DESC`);

    const events = stmt.all();

    return {
      success: true,
      data: events,
      meta: {
        count: events.length,
        days,
      },
    };
  });

  /**
   * Get battery health trend (last 30 days)
   */
  fastify.get('/api/ups/battery-health', async () => {
    const db = (fastify as { db?: Database.Database }).db;
    if (!db) {
      return { success: false, error: 'Database not available' };
    }
    const stmt = db.prepare(`SELECT
        DATE(timestamp) as date,
        AVG(battery_charge) as avg_charge,
        MIN(battery_charge) as min_charge,
        MAX(battery_charge) as max_charge,
        AVG(battery_runtime) as avg_runtime
      FROM ups_metrics
      WHERE timestamp > datetime('now', '-30 days')
      GROUP BY DATE(timestamp)
      ORDER BY date ASC`);

    const healthTrend = stmt.all();

    return {
      success: true,
      data: healthTrend,
    };
  });

  /**
   * Get UPS statistics summary
   */
  fastify.get('/api/ups/statistics', async () => {
    const currentStatus = await client.getStatus();
    const db = (fastify as { db?: Database.Database }).db;
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

    // Get total power outages in last 30 days
    const outagesStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM ups_events
      WHERE event_type = 'power_loss'
      AND timestamp > datetime('now', '-30 days')
    `);
    const outages = outagesStmt.get() as { count: number };

    // Get average battery charge over last 7 days
    const avgChargeStmt = db.prepare(`
      SELECT AVG(battery_charge) as avg_charge
      FROM ups_metrics
      WHERE timestamp > datetime('now', '-7 days')
    `);
    const avgCharge = avgChargeStmt.get() as { avg_charge: number };

    // Get total time on battery (last 30 days)
    const batteryTimeStmt = db.prepare(`
      SELECT
        SUM(CASE WHEN on_battery = 1 THEN 1 ELSE 0 END) as battery_samples,
        COUNT(*) as total_samples
      FROM ups_metrics
      WHERE timestamp > datetime('now', '-30 days')
    `);
    const batteryTime = batteryTimeStmt.get() as {
      battery_samples: number;
      total_samples: number;
    };

    // Calculate approximate time on battery (assuming 30s polling interval)
    const timeOnBatteryMinutes =
      batteryTime.battery_samples && batteryTime.total_samples
        ? Math.round((batteryTime.battery_samples * 30) / 60)
        : 0;

    return {
      success: true,
      data: {
        current: currentStatus,
        statistics: {
          outages_last_30_days: outages.count,
          avg_battery_charge_last_7_days: avgCharge.avg_charge
            ? Math.round(avgCharge.avg_charge * 10) / 10
            : null,
          time_on_battery_last_30_days_minutes: timeOnBatteryMinutes,
        },
      },
    };
  });

  /**
   * Get monitoring status (if monitor is enabled)
   */
  if (monitor) {
    fastify.get('/api/ups/monitor/status', async () => {
      const status = monitor.getMonitoringStatus();
      return {
        success: true,
        data: status,
      };
    });
  }

  /**
   * Healthcheck endpoint for UPS
   */
  fastify.get('/api/ups/health', async () => {
    const available = await client.isAvailable();

    if (!available) {
      return {
        success: false,
        healthy: false,
        message: 'UPS not available',
      };
    }

    const status = await client.getStatus();
    const healthy = status.status.includes('OL') || status.status.includes('OB');

    return {
      success: true,
      healthy,
      data: {
        status: status.status,
        onBattery: status.onBattery,
        batteryCharge: status.batteryCharge,
        batteryRuntime: status.batteryRuntime,
      },
    };
  });
}

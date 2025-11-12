import promClient from 'prom-client';

// Create registry
export const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({
  register,
  prefix: 'home_server_',
});

// HTTP request duration histogram
export const httpRequestDuration = new promClient.Histogram({
  name: 'home_server_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// HTTP request counter
export const httpRequestCounter = new promClient.Counter({
  name: 'home_server_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// ZFS pool health gauge
export const poolHealthGauge = new promClient.Gauge({
  name: 'home_server_zfs_pool_health',
  help: 'ZFS pool health status (1=healthy, 0=degraded)',
  labelNames: ['pool_name', 'status'],
  registers: [register],
});

// ZFS pool capacity gauge
export const poolCapacityGauge = new promClient.Gauge({
  name: 'home_server_zfs_pool_capacity_bytes',
  help: 'ZFS pool capacity in bytes',
  labelNames: ['pool_name', 'type'], // type: size, used, available
  registers: [register],
});

// Docker container status gauge
export const containerStatusGauge = new promClient.Gauge({
  name: 'home_server_docker_container_status',
  help: 'Docker container status (1=running, 0=stopped)',
  labelNames: ['container_name', 'container_id', 'image', 'status'],
  registers: [register],
});

// Docker container resource usage
export const containerCpuUsage = new promClient.Gauge({
  name: 'home_server_docker_container_cpu_percent',
  help: 'Docker container CPU usage percentage',
  labelNames: ['container_name', 'container_id'],
  registers: [register],
});

export const containerMemoryUsage = new promClient.Gauge({
  name: 'home_server_docker_container_memory_bytes',
  help: 'Docker container memory usage in bytes',
  labelNames: ['container_name', 'container_id', 'type'], // type: usage, limit
  registers: [register],
});

// Disk failure prediction gauge
export const diskFailurePrediction = new promClient.Gauge({
  name: 'home_server_disk_failure_prediction_score',
  help: 'Disk failure prediction score (0-1, higher is worse)',
  labelNames: ['disk_name', 'pool_name', 'risk_level'],
  registers: [register],
});

// SMART metrics
export const diskTemperature = new promClient.Gauge({
  name: 'home_server_disk_temperature_celsius',
  help: 'Disk temperature in Celsius',
  labelNames: ['disk_name', 'pool_name'],
  registers: [register],
});

export const diskReallocatedSectors = new promClient.Gauge({
  name: 'home_server_disk_reallocated_sectors_total',
  help: 'Total number of reallocated sectors',
  labelNames: ['disk_name', 'pool_name'],
  registers: [register],
});

export const diskPowerOnHours = new promClient.Gauge({
  name: 'home_server_disk_power_on_hours_total',
  help: 'Total number of power-on hours',
  labelNames: ['disk_name', 'pool_name'],
  registers: [register],
});

// Alert metrics
export const activeAlertsGauge = new promClient.Gauge({
  name: 'home_server_active_alerts_total',
  help: 'Total number of active alerts',
  labelNames: ['severity', 'source'],
  registers: [register],
});

// Snapshot metrics
export const snapshotCount = new promClient.Gauge({
  name: 'home_server_snapshots_total',
  help: 'Total number of ZFS snapshots',
  labelNames: ['dataset'],
  registers: [register],
});

export const snapshotAge = new promClient.Gauge({
  name: 'home_server_snapshot_age_seconds',
  help: 'Age of the oldest snapshot in seconds',
  labelNames: ['dataset'],
  registers: [register],
});

// Service availability gauge
export const serviceAvailabilityGauge = new promClient.Gauge({
  name: 'home_server_service_available',
  help: 'Service availability (1=available, 0=unavailable)',
  labelNames: ['service_name'],
  registers: [register],
});

// Database query duration
export const dbQueryDuration = new promClient.Histogram({
  name: 'home_server_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// WebSocket connection counter
export const wsConnectionsGauge = new promClient.Gauge({
  name: 'home_server_websocket_connections_total',
  help: 'Total number of active WebSocket connections',
  labelNames: ['room'],
  registers: [register],
});

/**
 * Update metrics based on system state
 */
export function updateSystemMetrics(data: {
  pools?: Array<{ name: string; health: string; size?: number; used?: number; available?: number }>;
  containers?: Array<{
    id: string;
    name: string;
    image?: string;
    status?: string;
    cpu_percent?: number;
    memory_usage?: number;
    memory_limit?: number;
  }>;
  disks?: Array<{
    name: string;
    pool?: string;
    temperature?: number;
    reallocated_sectors?: number;
    power_on_hours?: number;
  }>;
  alerts?: Array<{ severity: string; source: string }>;
}): void {
  // Update pool metrics
  if (data.pools) {
    for (const pool of data.pools) {
      poolHealthGauge.set(
        { pool_name: pool.name, status: pool.health },
        pool.health === 'ONLINE' ? 1 : 0,
      );

      if (pool.size) {
        poolCapacityGauge.set({ pool_name: pool.name, type: 'size' }, pool.size);
      }
      if (pool.used) {
        poolCapacityGauge.set({ pool_name: pool.name, type: 'used' }, pool.used);
      }
      if (pool.available) {
        poolCapacityGauge.set({ pool_name: pool.name, type: 'available' }, pool.available);
      }
    }
  }

  // Update container metrics
  if (data.containers) {
    for (const container of data.containers) {
      const isRunning = container.status?.toLowerCase() === 'running' ? 1 : 0;
      containerStatusGauge.set(
        {
          container_name: container.name,
          container_id: container.id,
          image: container.image || 'unknown',
          status: container.status || 'unknown',
        },
        isRunning,
      );

      if (container.cpu_percent !== undefined) {
        containerCpuUsage.set(
          { container_name: container.name, container_id: container.id },
          container.cpu_percent,
        );
      }

      if (container.memory_usage !== undefined) {
        containerMemoryUsage.set(
          { container_name: container.name, container_id: container.id, type: 'usage' },
          container.memory_usage,
        );
      }

      if (container.memory_limit !== undefined) {
        containerMemoryUsage.set(
          { container_name: container.name, container_id: container.id, type: 'limit' },
          container.memory_limit,
        );
      }
    }
  }

  // Update disk metrics
  if (data.disks) {
    for (const disk of data.disks) {
      const poolName = disk.pool || 'unknown';

      if (disk.temperature !== undefined) {
        diskTemperature.set({ disk_name: disk.name, pool_name: poolName }, disk.temperature);
      }

      if (disk.reallocated_sectors !== undefined) {
        diskReallocatedSectors.set(
          { disk_name: disk.name, pool_name: poolName },
          disk.reallocated_sectors,
        );
      }

      if (disk.power_on_hours !== undefined) {
        diskPowerOnHours.set({ disk_name: disk.name, pool_name: poolName }, disk.power_on_hours);
      }
    }
  }

  // Update alert metrics
  if (data.alerts) {
    // Group alerts by severity and source
    const alertCounts = new Map<string, number>();

    for (const alert of data.alerts) {
      const key = `${alert.severity}:${alert.source}`;
      alertCounts.set(key, (alertCounts.get(key) || 0) + 1);
    }

    // Update gauges
    for (const [key, count] of alertCounts) {
      const [severity, source] = key.split(':');
      activeAlertsGauge.set({ severity, source }, count);
    }
  }
}

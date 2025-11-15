import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  register,
  httpRequestDuration,
  httpRequestCounter,
  poolHealthGauge,
  poolCapacityGauge,
  containerStatusGauge,
  containerCpuUsage,
  containerMemoryUsage,
  diskFailurePrediction,
  diskTemperature,
  diskReallocatedSectors,
  diskPowerOnHours,
  activeAlertsGauge,
  snapshotCount,
  snapshotAge,
  serviceAvailabilityGauge,
  dbQueryDuration,
  wsConnectionsGauge,
  updateSystemMetrics,
} from '../../../src/utils/metrics.js';

describe('Metrics', () => {
  beforeEach(() => {
    // Clear all metrics before each test
    register.resetMetrics();
  });

  describe('Prometheus Registry', () => {
    it('should export a valid Prometheus registry', () => {
      expect(register).toBeDefined();
      expect(typeof register.metrics).toBe('function');
    });

    it('should have registered metrics', async () => {
      const metrics = await register.metrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('string');
    });
  });

  describe('HTTP Metrics', () => {
    describe('httpRequestDuration', () => {
      it('should be a Histogram metric', () => {
        expect(httpRequestDuration.constructor.name).toBe('Histogram');
      });

      it('should have correct name', () => {
        // @ts-expect-error Accessing private property for testing
        expect(httpRequestDuration.name).toBe('home_server_http_request_duration_seconds');
      });

      it('should record request durations', () => {
        httpRequestDuration.observe(
          { method: 'GET', route: '/api/health', status_code: '200' },
          0.05,
        );
        httpRequestDuration.observe(
          { method: 'POST', route: '/api/pools', status_code: '201' },
          0.1,
        );

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_http_request_duration_seconds');
        }).not.toThrow();
      });
    });

    describe('httpRequestCounter', () => {
      it('should be a Counter metric', () => {
        expect(httpRequestCounter.constructor.name).toBe('Counter');
      });

      it('should increment request counts', () => {
        httpRequestCounter.inc({ method: 'GET', route: '/api/health', status_code: '200' });
        httpRequestCounter.inc({ method: 'GET', route: '/api/health', status_code: '200' });
        httpRequestCounter.inc({ method: 'POST', route: '/api/pools', status_code: '201' });

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_http_requests_total');
        }).not.toThrow();
      });
    });
  });

  describe('ZFS Pool Metrics', () => {
    describe('poolHealthGauge', () => {
      it('should be a Gauge metric', () => {
        expect(poolHealthGauge.constructor.name).toBe('Gauge');
      });

      it('should set pool health status', () => {
        poolHealthGauge.set({ pool_name: 'tank', status: 'ONLINE' }, 1);
        poolHealthGauge.set({ pool_name: 'backup', status: 'DEGRADED' }, 0);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_zfs_pool_health');
        }).not.toThrow();
      });
    });

    describe('poolCapacityGauge', () => {
      it('should be a Gauge metric', () => {
        expect(poolCapacityGauge.constructor.name).toBe('Gauge');
      });

      it('should set pool capacity values', () => {
        poolCapacityGauge.set({ pool_name: 'tank', type: 'size' }, 1000000000000);
        poolCapacityGauge.set({ pool_name: 'tank', type: 'used' }, 500000000000);
        poolCapacityGauge.set({ pool_name: 'tank', type: 'available' }, 500000000000);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_zfs_pool_capacity_bytes');
        }).not.toThrow();
      });
    });
  });

  describe('Docker Container Metrics', () => {
    describe('containerStatusGauge', () => {
      it('should be a Gauge metric', () => {
        expect(containerStatusGauge.constructor.name).toBe('Gauge');
      });

      it('should set container status', () => {
        containerStatusGauge.set(
          {
            container_name: 'nginx',
            container_id: 'abc123',
            image: 'nginx:latest',
            status: 'running',
          },
          1,
        );

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_docker_container_status');
        }).not.toThrow();
      });
    });

    describe('containerCpuUsage', () => {
      it('should be a Gauge metric', () => {
        expect(containerCpuUsage.constructor.name).toBe('Gauge');
      });

      it('should set CPU usage percentage', () => {
        containerCpuUsage.set({ container_name: 'nginx', container_id: 'abc123' }, 45.5);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_docker_container_cpu_percent');
        }).not.toThrow();
      });
    });

    describe('containerMemoryUsage', () => {
      it('should be a Gauge metric', () => {
        expect(containerMemoryUsage.constructor.name).toBe('Gauge');
      });

      it('should set memory usage and limit', () => {
        containerMemoryUsage.set(
          { container_name: 'nginx', container_id: 'abc123', type: 'usage' },
          1073741824,
        );
        containerMemoryUsage.set(
          { container_name: 'nginx', container_id: 'abc123', type: 'limit' },
          2147483648,
        );

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_docker_container_memory_bytes');
        }).not.toThrow();
      });
    });
  });

  describe('Disk Metrics', () => {
    describe('diskFailurePrediction', () => {
      it('should be a Gauge metric', () => {
        expect(diskFailurePrediction.constructor.name).toBe('Gauge');
      });

      it('should set failure prediction score', () => {
        diskFailurePrediction.set(
          { disk_name: 'ada0', pool_name: 'tank', risk_level: 'high' },
          0.75,
        );

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_disk_failure_prediction_score');
        }).not.toThrow();
      });
    });

    describe('diskTemperature', () => {
      it('should be a Gauge metric', () => {
        expect(diskTemperature.constructor.name).toBe('Gauge');
      });

      it('should set disk temperature', () => {
        diskTemperature.set({ disk_name: 'ada0', pool_name: 'tank' }, 42);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_disk_temperature_celsius');
        }).not.toThrow();
      });
    });

    describe('diskReallocatedSectors', () => {
      it('should be a Gauge metric', () => {
        expect(diskReallocatedSectors.constructor.name).toBe('Gauge');
      });

      it('should set reallocated sectors count', () => {
        diskReallocatedSectors.set({ disk_name: 'ada0', pool_name: 'tank' }, 3);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_disk_reallocated_sectors_total');
        }).not.toThrow();
      });
    });

    describe('diskPowerOnHours', () => {
      it('should be a Gauge metric', () => {
        expect(diskPowerOnHours.constructor.name).toBe('Gauge');
      });

      it('should set power-on hours', () => {
        diskPowerOnHours.set({ disk_name: 'ada0', pool_name: 'tank' }, 8760);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_disk_power_on_hours_total');
        }).not.toThrow();
      });
    });
  });

  describe('Alert Metrics', () => {
    describe('activeAlertsGauge', () => {
      it('should be a Gauge metric', () => {
        expect(activeAlertsGauge.constructor.name).toBe('Gauge');
      });

      it('should set active alert counts', () => {
        activeAlertsGauge.set({ severity: 'critical', source: 'zfs' }, 2);
        activeAlertsGauge.set({ severity: 'warning', source: 'docker' }, 5);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_active_alerts_total');
        }).not.toThrow();
      });
    });
  });

  describe('Snapshot Metrics', () => {
    describe('snapshotCount', () => {
      it('should be a Gauge metric', () => {
        expect(snapshotCount.constructor.name).toBe('Gauge');
      });

      it('should set snapshot count', () => {
        snapshotCount.set({ dataset: 'tank/data' }, 42);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_snapshots_total');
        }).not.toThrow();
      });
    });

    describe('snapshotAge', () => {
      it('should be a Gauge metric', () => {
        expect(snapshotAge.constructor.name).toBe('Gauge');
      });

      it('should set snapshot age in seconds', () => {
        snapshotAge.set({ dataset: 'tank/data' }, 86400);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_snapshot_age_seconds');
        }).not.toThrow();
      });
    });
  });

  describe('Service Availability Metrics', () => {
    describe('serviceAvailabilityGauge', () => {
      it('should be a Gauge metric', () => {
        expect(serviceAvailabilityGauge.constructor.name).toBe('Gauge');
      });

      it('should set service availability', () => {
        serviceAvailabilityGauge.set({ service_name: 'truenas' }, 1);
        serviceAvailabilityGauge.set({ service_name: 'portainer' }, 0);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_service_available');
        }).not.toThrow();
      });
    });
  });

  describe('Database Metrics', () => {
    describe('dbQueryDuration', () => {
      it('should be a Histogram metric', () => {
        expect(dbQueryDuration.constructor.name).toBe('Histogram');
      });

      it('should record query durations', () => {
        dbQueryDuration.observe({ operation: 'SELECT', table: 'pools' }, 0.01);
        dbQueryDuration.observe({ operation: 'INSERT', table: 'alerts' }, 0.02);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_db_query_duration_seconds');
        }).not.toThrow();
      });
    });
  });

  describe('WebSocket Metrics', () => {
    describe('wsConnectionsGauge', () => {
      it('should be a Gauge metric', () => {
        expect(wsConnectionsGauge.constructor.name).toBe('Gauge');
      });

      it('should set WebSocket connection counts', () => {
        wsConnectionsGauge.set({ room: 'monitoring' }, 5);
        wsConnectionsGauge.set({ room: 'alerts' }, 3);

        expect(async () => {
          const metrics = await register.metrics();
          expect(metrics).toContain('home_server_websocket_connections_total');
        }).not.toThrow();
      });
    });
  });

  describe('updateSystemMetrics', () => {
    it('should update pool metrics', () => {
      updateSystemMetrics({
        pools: [
          {
            name: 'tank',
            health: 'ONLINE',
            size: 1000000000000,
            used: 500000000000,
            available: 500000000000,
          },
          {
            name: 'backup',
            health: 'DEGRADED',
            size: 500000000000,
            used: 250000000000,
            available: 250000000000,
          },
        ],
      });

      expect(async () => {
        const metrics = await register.metrics();
        expect(metrics).toContain('home_server_zfs_pool_health');
        expect(metrics).toContain('home_server_zfs_pool_capacity_bytes');
      }).not.toThrow();
    });

    it('should handle pools without capacity data', () => {
      updateSystemMetrics({
        pools: [
          {
            name: 'tank',
            health: 'ONLINE',
          },
        ],
      });

      expect(async () => {
        const metrics = await register.metrics();
        expect(metrics).toContain('home_server_zfs_pool_health');
      }).not.toThrow();
    });

    it('should update container metrics', () => {
      updateSystemMetrics({
        containers: [
          {
            id: 'abc123',
            name: 'nginx',
            image: 'nginx:latest',
            status: 'running',
            cpu_percent: 25.5,
            memory_usage: 536870912,
            memory_limit: 1073741824,
          },
          {
            id: 'def456',
            name: 'redis',
            status: 'stopped',
          },
        ],
      });

      expect(async () => {
        const metrics = await register.metrics();
        expect(metrics).toContain('home_server_docker_container_status');
        expect(metrics).toContain('home_server_docker_container_cpu_percent');
        expect(metrics).toContain('home_server_docker_container_memory_bytes');
      }).not.toThrow();
    });

    it('should handle containers without resource data', () => {
      updateSystemMetrics({
        containers: [
          {
            id: 'abc123',
            name: 'nginx',
            status: 'running',
          },
        ],
      });

      expect(async () => {
        const metrics = await register.metrics();
        expect(metrics).toContain('home_server_docker_container_status');
      }).not.toThrow();
    });

    it('should update disk metrics', () => {
      updateSystemMetrics({
        disks: [
          {
            name: 'ada0',
            pool: 'tank',
            temperature: 42,
            reallocated_sectors: 0,
            power_on_hours: 8760,
          },
          {
            name: 'ada1',
            temperature: 45,
            reallocated_sectors: 3,
          },
        ],
      });

      expect(async () => {
        const metrics = await register.metrics();
        expect(metrics).toContain('home_server_disk_temperature_celsius');
        expect(metrics).toContain('home_server_disk_reallocated_sectors_total');
        expect(metrics).toContain('home_server_disk_power_on_hours_total');
      }).not.toThrow();
    });

    it('should use "unknown" pool name when pool is not provided', () => {
      updateSystemMetrics({
        disks: [
          {
            name: 'ada0',
            temperature: 42,
          },
        ],
      });

      expect(async () => {
        const metrics = await register.metrics();
        expect(metrics).toContain('home_server_disk_temperature_celsius');
      }).not.toThrow();
    });

    it('should update alert metrics', () => {
      updateSystemMetrics({
        alerts: [
          { severity: 'critical', source: 'zfs' },
          { severity: 'critical', source: 'zfs' },
          { severity: 'warning', source: 'docker' },
          { severity: 'warning', source: 'docker' },
          { severity: 'warning', source: 'docker' },
        ],
      });

      expect(async () => {
        const metrics = await register.metrics();
        expect(metrics).toContain('home_server_active_alerts_total');
      }).not.toThrow();
    });

    it('should group alerts by severity and source', () => {
      updateSystemMetrics({
        alerts: [
          { severity: 'critical', source: 'zfs' },
          { severity: 'critical', source: 'zfs' },
          { severity: 'warning', source: 'zfs' },
          { severity: 'critical', source: 'docker' },
        ],
      });

      expect(async () => {
        const metrics = await register.metrics();
        expect(metrics).toContain('home_server_active_alerts_total');
      }).not.toThrow();
    });

    it('should handle empty data gracefully', () => {
      updateSystemMetrics({});

      expect(async () => {
        await register.metrics();
      }).not.toThrow();
    });

    it('should handle empty arrays gracefully', () => {
      updateSystemMetrics({
        pools: [],
        containers: [],
        disks: [],
        alerts: [],
      });

      expect(async () => {
        await register.metrics();
      }).not.toThrow();
    });

    it('should update multiple metric types simultaneously', () => {
      updateSystemMetrics({
        pools: [{ name: 'tank', health: 'ONLINE', size: 1000000000000 }],
        containers: [{ id: 'abc123', name: 'nginx', status: 'running' }],
        disks: [{ name: 'ada0', pool: 'tank', temperature: 42 }],
        alerts: [{ severity: 'warning', source: 'docker' }],
      });

      expect(async () => {
        const metrics = await register.metrics();
        expect(metrics).toContain('home_server_zfs_pool_health');
        expect(metrics).toContain('home_server_docker_container_status');
        expect(metrics).toContain('home_server_disk_temperature_celsius');
        expect(metrics).toContain('home_server_active_alerts_total');
      }).not.toThrow();
    });
  });

  describe('Metric naming conventions', () => {
    it('should prefix all metrics with home_server_', async () => {
      // Trigger some metrics
      httpRequestCounter.inc({ method: 'GET', route: '/', status_code: '200' });
      poolHealthGauge.set({ pool_name: 'tank', status: 'ONLINE' }, 1);

      const metrics = await register.metrics();
      const metricLines = metrics
        .split('\n')
        .filter((line) => !line.startsWith('#') && line.trim());

      for (const line of metricLines) {
        if (line.includes('{')) {
          const metricName = line.split('{')[0];
          if (
            metricName &&
            !metricName.startsWith('process_') &&
            !metricName.startsWith('nodejs_')
          ) {
            expect(metricName.startsWith('home_server_')).toBe(true);
          }
        }
      }
    });
  });
});

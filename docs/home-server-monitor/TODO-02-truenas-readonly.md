# TODO-02: TrueNAS Integration (Read-Only)

## Goal
Connect to your TrueNAS Scale 24.04.2.4 system and monitor your specific pool configuration safely.

## Your Pool Configuration
Based on your hardware:
- **Personal Pool**: 2x 4TB IronWolf (mirror?) - Critical data
- **Media Pool**: 1x 8TB IronWolf Pro - Media storage
- **Apps Pool**: 1TB NVMe SSD - Docker/Apps (blazing fast!)
- **Boot Pool**: 240GB Kingston SSD

## Phase 1: TrueNAS API Client

### Create `src/integrations/truenas/client.ts`
```typescript
import { logger } from '../../utils/logger';

interface TrueNASConfig {
  host: string;
  apiKey: string;
  timeout?: number;
}

export class TrueNASClient {
  private baseUrl: string;
  private headers: HeadersInit;
  private timeout: number;

  constructor(config: TrueNASConfig) {
    this.baseUrl = `http://${config.host}/api/v2.0`;
    this.headers = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };
    this.timeout = config.timeout || 5000;
  }

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        headers: this.headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`TrueNAS API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error(`TrueNAS API request failed: ${path}`, error);
      throw error;
    }
  }

  // System Information
  async getSystemInfo() {
    const info = await this.request('/system/info');
    return {
      hostname: info.hostname,
      version: info.version,
      uptime: info.uptime_seconds,
      cpuModel: 'Intel Core i5-12400', // Your CPU
      cpuCores: info.cores,
      ramTotal: 64, // Your 64GB RAM
      bootTime: new Date(info.boottime * 1000),
    };
  }

  // Pool Information - Tailored for your setup
  async getPools() {
    const pools = await this.request('/pool');

    return pools.map((pool: any) => {
      // Identify pool type based on your setup
      let poolType = 'unknown';
      if (pool.name.toLowerCase().includes('boot')) {
        poolType = 'boot';
      } else if (pool.name.toLowerCase().includes('app')) {
        poolType = 'apps';
      } else if (pool.name.toLowerCase().includes('media')) {
        poolType = 'media';
      } else if (pool.name.toLowerCase().includes('personal')) {
        poolType = 'personal';
      }

      return {
        name: pool.name,
        type: poolType,
        status: pool.status,
        health: pool.healthy ? 'HEALTHY' : 'UNHEALTHY',
        capacity: {
          used: pool.size,
          available: pool.free,
          total: pool.size + pool.free,
          percent: (pool.size / (pool.size + pool.free)) * 100,
        },
        topology: pool.topology,
        lastScrub: pool.scan?.end_time ? new Date(pool.scan.end_time * 1000) : null,
        scrubErrors: pool.scan?.errors || 0,
        encryption: pool.encrypt > 0,
        autotrim: pool.autotrim?.value === 'on', // Important for your SSDs
      };
    });
  }

  // Disk Information - Monitor your IronWolf drives
  async getDisks() {
    const disks = await this.request('/disk');

    return disks.map((disk: any) => ({
      identifier: disk.identifier,
      name: disk.name,
      model: disk.model,
      serial: disk.serial,
      size: disk.size,
      type: disk.type, // HDD or SSD
      temperature: disk.temperature,
      smartStatus: disk.smarttestresults,
      // Special attention to your drives
      isNVMe: disk.model?.includes('SN850X'),
      isIronWolf: disk.model?.includes('IronWolf'),
      isCritical: disk.model?.includes('ST4000VN008'), // Your personal data drives
    }));
  }

  // SMART data - Critical for your IronWolf drives
  async getSmartData(diskName: string) {
    try {
      const smart = await this.request(`/disk/smart/test/results?disk=${diskName}`);
      return {
        diskName,
        temperature: smart.temperature?.current,
        powerOnHours: smart.power_on_time?.hours,
        reallocatedSectors: smart.reallocated_sector_count?.raw_value || 0,
        pendingSectors: smart.current_pending_sector?.raw_value || 0,
        healthStatus: smart.smart_status?.passed ? 'PASSED' : 'FAILED',
        // IronWolf specific monitoring
        loadCycleCount: smart.load_cycle_count?.raw_value,
        spinRetryCount: smart.spin_retry_count?.raw_value,
      };
    } catch (error) {
      logger.warn(`Could not get SMART data for ${diskName}`);
      return null;
    }
  }

  // System stats
  async getSystemStats() {
    const stats = await this.request('/reporting/get_data', {
      method: 'POST',
      body: JSON.stringify({
        graphs: [
          { name: 'cpu' },
          { name: 'memory' },
          { name: 'network' },
          { name: 'disk' },
        ],
        reporting_query: {
          start: Math.floor(Date.now() / 1000) - 300, // Last 5 minutes
          end: Math.floor(Date.now() / 1000),
          aggregate: true,
        },
      }),
    });

    return {
      cpu: {
        usage: stats.cpu?.average || 0,
        temperature: stats.cputemp?.average || 0, // Watch your i5-12400 temps
      },
      memory: {
        used: stats.memory?.used_percentage || 0,
        arc: stats.memory?.arc_size || 0, // ZFS ARC cache
        available: 64 - (stats.memory?.used || 0), // Your 64GB
      },
      network: {
        rxRate: stats.interface?.rx_rate || 0,
        txRate: stats.interface?.tx_rate || 0,
      },
    };
  }

  // Datasets - Monitor your specific use cases
  async getDatasets() {
    const datasets = await this.request('/pool/dataset');

    return datasets.map((dataset: any) => ({
      name: dataset.name,
      used: dataset.used.value,
      available: dataset.available.value,
      mountpoint: dataset.mountpoint,
      compression: dataset.compression.value,
      compressRatio: dataset.compressratio.value,
      // Identify dataset purpose
      isAppData: dataset.mountpoint?.includes('/apps'),
      isMedia: dataset.mountpoint?.includes('/media'),
      isPersonal: dataset.mountpoint?.includes('/personal'),
    }));
  }

  // Snapshots - Critical for your personal data
  async getSnapshots() {
    const snapshots = await this.request('/zfs/snapshot');

    return snapshots.map((snap: any) => ({
      name: snap.name,
      dataset: snap.dataset,
      created: new Date(snap.properties.creation.parsed * 1000),
      referenced: snap.properties.referenced.value,
      used: snap.properties.used.value,
      // Flag important snapshots
      isPersonalData: snap.dataset?.includes('personal'),
    }));
  }

  // Services status
  async getServices() {
    const services = await this.request('/service');

    return services.map((service: any) => ({
      name: service.service,
      state: service.state,
      enabled: service.enable,
      // Services you might be running
      isCritical: ['ssh', 'nfs', 'smb', 'docker'].includes(service.service),
    }));
  }
}
```

### Create `src/services/monitoring/truenas-monitor.ts`
```typescript
import { TrueNASClient } from '../../integrations/truenas/client';
import { logger } from '../../utils/logger';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';

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

  constructor(config: MonitorConfig) {
    this.client = config.client;
    this.db = config.db;
    this.io = config.io;
    this.config = config;
  }

  start() {
    logger.info('Starting TrueNAS monitoring...');

    // System stats - every 30 seconds
    this.startSystemMonitoring();

    // Pool status - every minute
    this.startPoolMonitoring();

    // SMART data - every hour (don't hammer the drives)
    this.startSmartMonitoring();

    // Initial data fetch
    this.fetchAllData();
  }

  private startSystemMonitoring() {
    const interval = setInterval(async () => {
      try {
        const stats = await this.client.getSystemStats();

        // Store in database
        const stmt = this.db.prepare(`
          INSERT INTO metrics (
            timestamp, cpu_percent, ram_used_gb, ram_total_gb,
            network_rx_mbps, network_tx_mbps, arc_size_gb
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          new Date().toISOString(),
          stats.cpu.usage,
          stats.memory.used,
          64, // Your RAM
          stats.network.rxRate,
          stats.network.txRate,
          stats.memory.arc / 1024 / 1024 / 1024 // Convert to GB
        );

        // Broadcast to connected clients
        this.io.to('system').emit('system:stats', stats);

        // Check for alerts
        this.checkSystemAlerts(stats);

      } catch (error) {
        logger.error('System monitoring error:', error);
      }
    }, this.config.intervals.system);

    this.intervals.set('system', interval);
  }

  private startPoolMonitoring() {
    const interval = setInterval(async () => {
      try {
        const pools = await this.client.getPools();

        // Store pool status
        pools.forEach(pool => {
          const stmt = this.db.prepare(`
            INSERT INTO pool_metrics (
              timestamp, pool_name, status, health,
              used_bytes, total_bytes, percent_used
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          stmt.run(
            new Date().toISOString(),
            pool.name,
            pool.status,
            pool.health,
            pool.capacity.used,
            pool.capacity.total,
            pool.capacity.percent
          );

          // Special attention to your personal data pool
          if (pool.type === 'personal' && pool.capacity.percent > 80) {
            this.createAlert({
              type: 'pool_capacity',
              severity: 'warning',
              message: `Personal data pool ${pool.name} is ${pool.capacity.percent.toFixed(1)}% full`,
              details: pool,
            });
          }
        });

        this.io.to('storage').emit('storage:pools', pools);

      } catch (error) {
        logger.error('Pool monitoring error:', error);
      }
    }, this.config.intervals.storage);

    this.intervals.set('pools', interval);
  }

  private startSmartMonitoring() {
    const interval = setInterval(async () => {
      try {
        const disks = await this.client.getDisks();

        // Focus on your IronWolf drives
        for (const disk of disks.filter(d => d.isIronWolf)) {
          const smart = await this.client.getSmartData(disk.name);

          if (smart) {
            // Store SMART data
            const stmt = this.db.prepare(`
              INSERT INTO smart_metrics (
                timestamp, disk_name, temperature,
                power_on_hours, reallocated_sectors,
                health_status
              ) VALUES (?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
              new Date().toISOString(),
              disk.name,
              smart.temperature,
              smart.powerOnHours,
              smart.reallocatedSectors,
              smart.healthStatus
            );

            // Alert on concerning SMART values
            if (smart.reallocatedSectors > 0) {
              this.createAlert({
                type: 'smart_warning',
                severity: 'critical',
                message: `Drive ${disk.model} has ${smart.reallocatedSectors} reallocated sectors`,
                details: smart,
              });
            }

            if (smart.temperature > 50) {
              this.createAlert({
                type: 'disk_temperature',
                severity: 'warning',
                message: `Drive ${disk.model} temperature is ${smart.temperature}°C`,
                details: smart,
              });
            }
          }
        }

      } catch (error) {
        logger.error('SMART monitoring error:', error);
      }
    }, this.config.intervals.smart || 3600000); // Default 1 hour

    this.intervals.set('smart', interval);
  }

  private checkSystemAlerts(stats: any) {
    // CPU temperature alert for your i5-12400
    if (stats.cpu.temperature > 80) {
      this.createAlert({
        type: 'cpu_temperature',
        severity: 'warning',
        message: `CPU temperature is ${stats.cpu.temperature}°C`,
        details: stats.cpu,
      });
    }

    // RAM usage alert (you have 64GB, so this is quite high)
    if (stats.memory.used > 58) {
      this.createAlert({
        type: 'memory_high',
        severity: 'warning',
        message: `Memory usage is ${stats.memory.used}GB of 64GB`,
        details: stats.memory,
      });
    }
  }

  private createAlert(alert: any) {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (type, severity, message, details)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      alert.type,
      alert.severity,
      alert.message,
      JSON.stringify(alert.details)
    );

    const fullAlert = {
      id: result.lastInsertRowid,
      ...alert,
      triggeredAt: new Date(),
    };

    this.io.to('alerts').emit('alert:triggered', fullAlert);
    logger.warn(`Alert: ${alert.message}`);
  }

  private async fetchAllData() {
    try {
      const [info, pools, disks] = await Promise.all([
        this.client.getSystemInfo(),
        this.client.getPools(),
        this.client.getDisks(),
      ]);

      logger.info('Initial TrueNAS data fetched', {
        hostname: info.hostname,
        pools: pools.length,
        disks: disks.length,
      });

    } catch (error) {
      logger.error('Initial data fetch failed:', error);
    }
  }

  stop() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    logger.info('TrueNAS monitoring stopped');
  }
}
```

## Phase 2: Add Routes

### Create `src/routes/truenas.ts`
```typescript
import { FastifyInstance } from 'fastify';
import { TrueNASClient } from '../integrations/truenas/client';

export async function truenasRoutes(fastify: FastifyInstance) {
  const client = new TrueNASClient(fastify.config.truenas);

  // System info
  fastify.get('/api/system/info', async (request, reply) => {
    const info = await client.getSystemInfo();
    return info;
  });

  // System stats
  fastify.get('/api/system/stats', async (request, reply) => {
    const stats = await client.getSystemStats();
    return stats;
  });

  // Storage pools
  fastify.get('/api/storage/pools', async (request, reply) => {
    const pools = await client.getPools();
    return pools;
  });

  // Disks
  fastify.get('/api/storage/disks', async (request, reply) => {
    const disks = await client.getDisks();
    return disks;
  });

  // SMART data for specific disk
  fastify.get('/api/storage/smart/:disk', async (request, reply) => {
    const { disk } = request.params as { disk: string };
    const smart = await client.getSmartData(disk);
    return smart;
  });

  // Datasets
  fastify.get('/api/storage/datasets', async (request, reply) => {
    const datasets = await client.getDatasets();
    return datasets;
  });

  // Snapshots
  fastify.get('/api/storage/snapshots', async (request, reply) => {
    const snapshots = await client.getSnapshots();
    return snapshots;
  });

  // Historical metrics from database
  fastify.get('/api/metrics/system', async (request, reply) => {
    const { hours = 24 } = request.query as { hours?: number };

    const stmt = fastify.db.prepare(`
      SELECT * FROM metrics
      WHERE timestamp > datetime('now', '-${hours} hours')
      ORDER BY timestamp DESC
    `);

    const metrics = stmt.all();
    return metrics;
  });

  // Alerts
  fastify.get('/api/alerts', async (request, reply) => {
    const stmt = fastify.db.prepare(`
      SELECT * FROM alerts
      WHERE resolved = 0
      ORDER BY triggered_at DESC
      LIMIT 50
    `);

    const alerts = stmt.all();
    return alerts;
  });
}
```

## Phase 3: Update Database Schema

### Update `src/db/migrations/002_truenas_tables.sql`
```sql
-- Pool metrics
CREATE TABLE IF NOT EXISTS pool_metrics (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  pool_name TEXT NOT NULL,
  status TEXT,
  health TEXT,
  used_bytes INTEGER,
  total_bytes INTEGER,
  percent_used REAL
);
CREATE INDEX IF NOT EXISTS idx_pool_metrics_time ON pool_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_pool_metrics_name ON pool_metrics(pool_name);

-- SMART metrics
CREATE TABLE IF NOT EXISTS smart_metrics (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  disk_name TEXT NOT NULL,
  temperature INTEGER,
  power_on_hours INTEGER,
  reallocated_sectors INTEGER,
  pending_sectors INTEGER,
  health_status TEXT
);
CREATE INDEX IF NOT EXISTS idx_smart_disk ON smart_metrics(disk_name);

-- Update metrics table for ARC
ALTER TABLE metrics ADD COLUMN arc_size_gb REAL;
```

## Phase 4: Update Main Server

### Update `src/server.ts`
```typescript
// Add after database initialization
import { TrueNASClient } from './integrations/truenas/client';
import { TrueNASMonitor } from './services/monitoring/truenas-monitor';
import { truenasRoutes } from './routes/truenas';

// In buildServer function, after database init:

// Initialize TrueNAS monitoring
const truenasClient = new TrueNASClient(config.truenas);
const monitor = new TrueNASMonitor({
  client: truenasClient,
  db,
  io,
  intervals: {
    system: 30000,    // 30 seconds
    storage: 60000,   // 1 minute
    smart: 3600000,   // 1 hour
  },
});

// Start monitoring
monitor.start();

// Register routes
await fastify.register(truenasRoutes);
```

## Phase 5: Test TrueNAS Integration

### Test API endpoints
```bash
# System info
curl http://localhost:3100/api/system/info

# Current stats
curl http://localhost:3100/api/system/stats

# Your pools
curl http://localhost:3100/api/storage/pools

# Your disks (should show IronWolf drives)
curl http://localhost:3100/api/storage/disks

# Check for alerts
curl http://localhost:3100/api/alerts
```

### Monitor Socket.IO events
```javascript
// Connect and watch real-time updates
const socket = io('http://localhost:3100');

socket.emit('subscribe', ['system', 'storage', 'alerts']);

socket.on('system:stats', (stats) => {
  console.log('System stats:', stats);
});

socket.on('storage:pools', (pools) => {
  console.log('Pool status:', pools);
});

socket.on('alert:triggered', (alert) => {
  console.log('ALERT:', alert.message);
});
```

## Phase 6: Disk Health Prediction (Prevent Failures)

### Why This Matters
Your IronWolf drives are mechanical and WILL fail eventually. This system predicts failures **before they happen** so you can order replacements early.

### Create `src/services/monitoring/disk-health-predictor.ts`
```typescript
import { logger } from '../../utils/logger';
import Database from 'better-sqlite3';

interface SMARTTrend {
  average: number;
  slope: number;  // Positive = getting worse
  variance: number;
}

interface FailurePrediction {
  disk: string;
  failureProbability: number;  // 0-100
  recommendation: string;
  estimatedDaysRemaining: number | null;
  trends: {
    temperature: SMARTTrend;
    reallocatedSectors: SMARTTrend;
    pendingSectors: SMARTTrend;
    powerOnHours: number;
  };
  riskFactors: string[];
}

export class DiskHealthPredictor {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Predict disk failure based on SMART trends
   * This is critical for your personal data pool (2x4TB mirror)
   */
  async predictFailure(diskName: string): Promise<FailurePrediction> {
    // Get SMART history for last 90 days
    const history = await this.getSMARTHistory(diskName, 90);

    if (history.length < 7) {
      logger.warn(`Insufficient SMART history for ${diskName} (${history.length} days)`);
      return {
        disk: diskName,
        failureProbability: 0,
        recommendation: 'Need at least 7 days of data for prediction',
        estimatedDaysRemaining: null,
        trends: {} as any,
        riskFactors: ['Insufficient data']
      };
    }

    // Analyze trends
    const trends = {
      temperature: this.analyzeTrend(history.map(h => h.temperature)),
      reallocatedSectors: this.analyzeTrend(history.map(h => h.reallocated_sectors)),
      pendingSectors: this.analyzeTrend(history.map(h => h.pending_sectors)),
      powerOnHours: history[history.length - 1].power_on_hours
    };

    // Calculate failure probability
    let failureScore = 0;
    const riskFactors: string[] = [];

    // CRITICAL: Reallocated sectors increasing
    if (trends.reallocatedSectors.slope > 0) {
      failureScore += 40;
      riskFactors.push(`Reallocated sectors increasing (${trends.reallocatedSectors.slope.toFixed(2)}/day)`);
    }
    if (trends.reallocatedSectors.average > 0) {
      failureScore += 20;
      riskFactors.push(`${trends.reallocatedSectors.average} reallocated sectors detected`);
    }

    // CRITICAL: Pending sectors (imminent failure)
    if (trends.pendingSectors.slope > 0) {
      failureScore += 30;
      riskFactors.push(`Pending sectors increasing (${trends.pendingSectors.slope.toFixed(2)}/day)`);
    }
    if (trends.pendingSectors.average > 0) {
      failureScore += 25;
      riskFactors.push(`${trends.pendingSectors.average} pending sectors detected`);
    }

    // HIGH: Temperature (IronWolf rated for 60°C max)
    if (trends.temperature.average > 50) {
      failureScore += 20;
      riskFactors.push(`High average temperature (${trends.temperature.average}°C)`);
    }
    if (trends.temperature.average > 55) {
      failureScore += 10;
      riskFactors.push('Temperature approaching maximum rating');
    }

    // MEDIUM: Power-on hours (IronWolf MTBF ~1M hours)
    if (trends.powerOnHours > 50000) {
      failureScore += 10;
      riskFactors.push(`High power-on hours (${trends.powerOnHours}h)`);
    }
    if (trends.powerOnHours > 70000) {
      failureScore += 5;
      riskFactors.push('Approaching end of expected lifespan');
    }

    // Determine recommendation
    let recommendation: string;
    if (failureScore > 70) {
      recommendation = '🚨 ORDER REPLACEMENT DISK NOW - FAILURE IMMINENT';
    } else if (failureScore > 50) {
      recommendation = '⚠️ Order replacement disk soon - High failure risk';
    } else if (failureScore > 30) {
      recommendation = '⚡ Consider ordering replacement disk';
    } else if (failureScore > 15) {
      recommendation = '👀 Monitor closely - Some risk detected';
    } else {
      recommendation = '✅ Disk healthy - Continue monitoring';
    }

    // Estimate days remaining (rough estimate based on trends)
    const estimatedDaysRemaining = this.estimateLifespan(trends, failureScore);

    return {
      disk: diskName,
      failureProbability: Math.min(100, failureScore),
      recommendation,
      estimatedDaysRemaining,
      trends,
      riskFactors
    };
  }

  /**
   * Get SMART data history for trend analysis
   */
  private async getSMARTHistory(diskName: string, days: number) {
    const stmt = this.db.prepare(`
      SELECT
        timestamp,
        temperature,
        power_on_hours,
        reallocated_sectors,
        pending_sectors,
        health_status
      FROM smart_metrics
      WHERE disk_name = ?
        AND timestamp > datetime('now', '-${days} days')
      ORDER BY timestamp ASC
    `);

    return stmt.all(diskName) as Array<{
      timestamp: string;
      temperature: number;
      power_on_hours: number;
      reallocated_sectors: number;
      pending_sectors: number;
      health_status: string;
    }>;
  }

  /**
   * Analyze trend (slope, average, variance)
   */
  private analyzeTrend(values: number[]): SMARTTrend {
    const n = values.length;
    const average = values.reduce((a, b) => a + b, 0) / n;

    // Calculate slope (simple linear regression)
    const xMean = (n - 1) / 2;
    const yMean = average;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) ** 2;
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Calculate variance
    const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / n;

    return { average, slope, variance };
  }

  /**
   * Estimate remaining lifespan based on trends
   */
  private estimateLifespan(trends: any, failureScore: number): number | null {
    // If reallocated sectors are increasing, calculate time to critical level
    if (trends.reallocatedSectors.slope > 0) {
      const currentSectors = trends.reallocatedSectors.average;
      const criticalLevel = 100; // Conservative threshold
      const daysUntilCritical = (criticalLevel - currentSectors) / trends.reallocatedSectors.slope;

      if (daysUntilCritical < 365 && daysUntilCritical > 0) {
        return Math.floor(daysUntilCritical);
      }
    }

    // If pending sectors exist, failure is imminent
    if (trends.pendingSectors.average > 0) {
      return 30; // Assume 30 days max
    }

    // Based on failure score
    if (failureScore > 70) return 30;
    if (failureScore > 50) return 90;
    if (failureScore > 30) return 180;

    return null; // Healthy disk
  }

  /**
   * Get predictions for all monitored disks
   */
  async predictAllDisks(): Promise<FailurePrediction[]> {
    // Get list of all disks we're monitoring
    const stmt = this.db.prepare(`
      SELECT DISTINCT disk_name
      FROM smart_metrics
      WHERE timestamp > datetime('now', '-7 days')
    `);

    const disks = stmt.all() as Array<{ disk_name: string }>;

    const predictions: FailurePrediction[] = [];

    for (const disk of disks) {
      try {
        const prediction = await this.predictFailure(disk.disk_name);
        predictions.push(prediction);

        // Log high-risk disks
        if (prediction.failureProbability > 50) {
          logger.warn(`High failure risk for ${disk.disk_name}`, {
            probability: prediction.failureProbability,
            recommendation: prediction.recommendation
          });
        }
      } catch (error) {
        logger.error(`Prediction failed for ${disk.disk_name}`, error);
      }
    }

    return predictions.sort((a, b) => b.failureProbability - a.failureProbability);
  }
}
```

### Update `src/routes/truenas.ts` with prediction endpoints
```typescript
// Add to the existing truenasRoutes function

import { DiskHealthPredictor } from '../services/monitoring/disk-health-predictor';

// Initialize predictor
const predictor = new DiskHealthPredictor(fastify.db);

// Predict failure for specific disk
fastify.get('/api/storage/predict/:disk', async (request, reply) => {
  const { disk } = request.params as { disk: string };
  const prediction = await predictor.predictFailure(disk);
  return prediction;
});

// Predict failures for all disks
fastify.get('/api/storage/predict', async (request, reply) => {
  const predictions = await predictor.predictAllDisks();
  return predictions;
});
```

### Add scheduled prediction check to monitor
```typescript
// In src/services/monitoring/truenas-monitor.ts
// Add to constructor:

import { DiskHealthPredictor } from './disk-health-predictor';

export class TrueNASMonitor {
  private predictor: DiskHealthPredictor;

  constructor(config: MonitorConfig) {
    // ... existing code ...
    this.predictor = new DiskHealthPredictor(config.db);
  }

  start() {
    // ... existing monitoring ...

    // Daily disk health prediction check
    this.startPredictionMonitoring();
  }

  private startPredictionMonitoring() {
    const interval = setInterval(async () => {
      try {
        logger.info('Running daily disk health predictions...');

        const predictions = await this.predictor.predictAllDisks();

        // Alert on high-risk disks
        for (const prediction of predictions) {
          if (prediction.failureProbability > 70) {
            this.createAlert({
              type: 'disk_failure_imminent',
              severity: 'critical',
              message: `${prediction.disk}: ${prediction.recommendation}`,
              details: prediction,
            });
          } else if (prediction.failureProbability > 50) {
            this.createAlert({
              type: 'disk_failure_likely',
              severity: 'high',
              message: `${prediction.disk}: ${prediction.recommendation}`,
              details: prediction,
            });
          }
        }

        // Broadcast predictions to connected clients
        this.io.to('storage').emit('storage:predictions', predictions);

      } catch (error) {
        logger.error('Prediction monitoring error:', error);
      }
    }, 86400000); // Run once per day (24 hours)

    this.intervals.set('predictions', interval);
  }
}
```

### Test disk health predictions
```bash
# Get prediction for specific disk
curl http://localhost:3100/api/storage/predict/sda

# Example response:
{
  "disk": "sda",
  "failureProbability": 35,
  "recommendation": "⚡ Consider ordering replacement disk",
  "estimatedDaysRemaining": 180,
  "trends": {
    "temperature": {
      "average": 42,
      "slope": 0.02,
      "variance": 2.5
    },
    "reallocatedSectors": {
      "average": 5,
      "slope": 0.1,
      "variance": 0.3
    },
    "pendingSectors": {
      "average": 0,
      "slope": 0,
      "variance": 0
    },
    "powerOnHours": 45000
  },
  "riskFactors": [
    "Reallocated sectors increasing (0.10/day)",
    "5 reallocated sectors detected"
  ]
}

# Get predictions for all disks
curl http://localhost:3100/api/storage/predict
```

### Why This Matters for Your Setup

**Your Personal Pool (2x4TB Mirror)**:
- This is your CRITICAL data
- If one drive fails, you're still safe (mirror)
- But if both fail, you lose everything
- **This system alerts you to order a replacement BEFORE failure**

**Real-World Scenario**:
```
Day 1:   SMART shows 0 reallocated sectors ✅
Day 30:  SMART shows 2 reallocated sectors ⚠️
Day 45:  SMART shows 8 reallocated sectors (System: "failureProbability: 65%")
Day 46:  You order replacement disk from Amazon ($120)
Day 48:  Replacement arrives
Day 50:  You resilver to new disk
Day 55:  Original disk fails completely

Result: Zero data loss, zero downtime, $120 cost
Without prediction: Data loss, panic, expensive recovery services ($2000+)
```

## Validation Checklist

- [ ] Can connect to TrueNAS API
- [ ] Shows all your pools (personal, media, apps)
- [ ] Monitors your IronWolf drives specifically
- [ ] SMART data collected for critical drives
- [ ] **Disk health predictions running daily**
- [ ] **Alerts trigger for high failure probability**
- [ ] Alerts trigger for high pool usage
- [ ] Real-time stats broadcast via Socket.IO
- [ ] Historical metrics stored in database
- [ ] No write operations (read-only mode confirmed)

## Common Issues

### API Connection Failed
- Check TrueNAS API key is correct
- Verify TrueNAS host IP (should be local network)
- Ensure API is enabled in TrueNAS settings

### Missing Pool Data
- Check pool names in TrueNAS match expected patterns
- Verify API key has read permissions

### High Memory Usage Alerts
- Normal with ZFS (ARC cache uses available RAM)
- 64GB is plenty, but monitor if consistently >58GB

## Questions for Claude

As you test this:
- "Why monitor SMART data specifically for IronWolf drives?"
- "What's the optimal ZFS ARC size for my 64GB RAM?"
- "Should I set up RAIDZ or mirror for my 2x4TB drives?"
- "How can I enable Intel QuickSync for Plex?"

## Next Steps

With TrueNAS monitoring working:
- ✅ All pools monitored
- ✅ SMART data tracked
- ✅ System resources graphed
- ✅ Alerts for critical conditions

**Proceed to TODO-03-docker-monitoring.md** to monitor your arr suite!

---

*Note: Your i5-12400 with QuickSync + 64GB RAM + NVMe apps pool is an excellent setup. We're monitoring the critical aspects while staying read-only for safety.*
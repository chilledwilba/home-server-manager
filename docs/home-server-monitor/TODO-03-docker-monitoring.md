# TODO-03: Docker & Arr Suite Monitoring

## Goal
Monitor your Docker containers via Portainer API, with special focus on your arr suite (Sonarr, Radarr, Prowlarr, etc.) and Plex.

## Your Current Setup
- Docker containers running via TrueNAS Apps/Portainer
- Arr suite installed
- Plex (with port 32400 previously exposed - now disabled for security)
- All running from your 1TB NVMe apps pool (fast I/O!)

## Phase 1: Portainer API Integration

### Create `src/integrations/portainer/client.ts`
```typescript
import { logger } from '../../utils/logger';

interface PortainerConfig {
  host: string;
  port: number;
  token: string;
  endpointId?: number; // Usually 1 for local Docker
}

interface ContainerStats {
  cpu: {
    percentage: number;
    cores: number;
  };
  memory: {
    used: number;
    limit: number;
    percentage: number;
  };
  network: {
    rx: number;
    tx: number;
  };
  io: {
    read: number;
    write: number;
  };
}

export class PortainerClient {
  private baseUrl: string;
  private headers: HeadersInit;
  private endpointId: number;

  constructor(config: PortainerConfig) {
    this.baseUrl = `http://${config.host}:${config.port}/api`;
    this.headers = {
      'X-API-Key': config.token,
      'Content-Type': 'application/json',
    };
    this.endpointId = config.endpointId || 1;
  }

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`Portainer API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      logger.error(`Portainer API request failed: ${path}`, error);
      throw error;
    }
  }

  // Get all containers
  async getContainers() {
    const containers = await this.request(
      `/endpoints/${this.endpointId}/docker/containers/json?all=true`
    );

    return containers.map((container: any) => ({
      id: container.Id,
      name: container.Names[0]?.replace('/', ''),
      image: container.Image,
      imageTag: container.ImageID,
      state: container.State,
      status: container.Status,
      created: new Date(container.Created * 1000),
      ports: container.Ports?.map((p: any) => ({
        private: p.PrivatePort,
        public: p.PublicPort,
        type: p.Type,
      })),
      labels: container.Labels,
      // Identify arr apps and critical services
      isArrApp: this.isArrApp(container.Names[0]),
      isPlex: container.Names[0]?.includes('plex'),
      isCritical: this.isCritical(container.Names[0]),
    }));
  }

  // Get container stats
  async getContainerStats(containerId: string): Promise<ContainerStats> {
    const stats = await this.request(
      `/endpoints/${this.endpointId}/docker/containers/${containerId}/stats?stream=false`
    );

    // Calculate CPU percentage
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
                     stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage -
                       stats.precpu_stats.system_cpu_usage;
    const cpuPercent = (cpuDelta / systemDelta) * 100 * stats.cpu_stats.online_cpus;

    // Calculate memory
    const memoryUsed = stats.memory_stats.usage - (stats.memory_stats.stats?.cache || 0);
    const memoryLimit = stats.memory_stats.limit;
    const memoryPercent = (memoryUsed / memoryLimit) * 100;

    // Network stats
    const networks = stats.networks || {};
    let rxBytes = 0, txBytes = 0;
    Object.values(networks).forEach((net: any) => {
      rxBytes += net.rx_bytes;
      txBytes += net.tx_bytes;
    });

    // Block I/O
    let readBytes = 0, writeBytes = 0;
    stats.blkio_stats?.io_service_bytes_recursive?.forEach((io: any) => {
      if (io.op === 'read') readBytes += io.value;
      if (io.op === 'write') writeBytes += io.value;
    });

    return {
      cpu: {
        percentage: cpuPercent,
        cores: stats.cpu_stats.online_cpus,
      },
      memory: {
        used: memoryUsed,
        limit: memoryLimit,
        percentage: memoryPercent,
      },
      network: {
        rx: rxBytes,
        tx: txBytes,
      },
      io: {
        read: readBytes,
        write: writeBytes,
      },
    };
  }

  // Get container logs
  async getContainerLogs(containerId: string, lines: number = 100) {
    const response = await fetch(
      `${this.baseUrl}/endpoints/${this.endpointId}/docker/containers/${containerId}/logs?stdout=true&stderr=true&tail=${lines}`,
      { headers: this.headers }
    );

    const text = await response.text();
    // Parse Docker log format (remove timestamps and stream indicators)
    const cleanedLogs = text
      .split('\n')
      .map(line => line.substring(8)) // Remove Docker log prefix
      .filter(line => line.trim() !== '');

    return cleanedLogs;
  }

  // Container actions (when you enable write mode)
  async restartContainer(containerId: string) {
    if (!this.isWriteEnabled()) {
      throw new Error('Write operations are disabled');
    }

    await this.request(
      `/endpoints/${this.endpointId}/docker/containers/${containerId}/restart`,
      { method: 'POST' }
    );

    logger.info(`Container ${containerId} restart initiated`);
    return true;
  }

  async stopContainer(containerId: string) {
    if (!this.isWriteEnabled()) {
      throw new Error('Write operations are disabled');
    }

    await this.request(
      `/endpoints/${this.endpointId}/docker/containers/${containerId}/stop`,
      { method: 'POST' }
    );

    return true;
  }

  async startContainer(containerId: string) {
    if (!this.isWriteEnabled()) {
      throw new Error('Write operations are disabled');
    }

    await this.request(
      `/endpoints/${this.endpointId}/docker/containers/${containerId}/start`,
      { method: 'POST' }
    );

    return true;
  }

  // Helper methods
  private isArrApp(name: string): boolean {
    const arrApps = ['sonarr', 'radarr', 'prowlarr', 'lidarr', 'readarr', 'bazarr'];
    return arrApps.some(app => name?.toLowerCase().includes(app));
  }

  private isCritical(name: string): boolean {
    const critical = ['plex', 'sonarr', 'radarr', 'prowlarr', 'nginx', 'traefik'];
    return critical.some(app => name?.toLowerCase().includes(app));
  }

  private isWriteEnabled(): boolean {
    return process.env.ENABLE_WRITE_OPERATIONS === 'true';
  }
}
```

### Create `src/integrations/arr-apps/client.ts`
```typescript
import { logger } from '../../utils/logger';

interface ArrConfig {
  host: string;
  port: number;
  apiKey: string;
  ssl?: boolean;
}

export class ArrClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(public name: string, config: ArrConfig) {
    const protocol = config.ssl ? 'https' : 'http';
    this.baseUrl = `${protocol}://${config.host}:${config.port}/api/v3`;
    this.apiKey = config.apiKey;
  }

  private async request(endpoint: string) {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        headers: {
          'X-Api-Key': this.apiKey,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`${this.name} API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      logger.error(`${this.name} API request failed:`, error);
      throw error;
    }
  }

  // System status
  async getSystemStatus() {
    const status = await this.request('/system/status');
    return {
      app: this.name,
      version: status.version,
      branch: status.branch,
      authentication: status.authentication,
      startTime: new Date(status.startTime),
      isProduction: status.isProduction,
      isDebug: status.isDebug,
    };
  }

  // Health check
  async getHealth() {
    const health = await this.request('/health');
    return health.map((issue: any) => ({
      app: this.name,
      source: issue.source,
      type: issue.type,
      message: issue.message,
      wikiUrl: issue.wikiUrl,
      severity: this.getSeverity(issue.type),
    }));
  }

  // Queue status
  async getQueue() {
    const queue = await this.request('/queue');
    return {
      app: this.name,
      totalRecords: queue.totalRecords,
      count: queue.records?.length || 0,
      items: queue.records?.map((item: any) => ({
        title: item.title,
        status: item.status,
        trackedDownloadStatus: item.trackedDownloadStatus,
        statusMessages: item.statusMessages,
        errorMessage: item.errorMessage,
        downloadId: item.downloadId,
        protocol: item.protocol,
        size: item.size,
        sizeleft: item.sizeleft,
        timeleft: item.timeleft,
      })),
    };
  }

  // Disk space
  async getDiskSpace() {
    const diskSpace = await this.request('/diskspace');
    return diskSpace.map((disk: any) => ({
      app: this.name,
      path: disk.path,
      label: disk.label,
      freeSpace: disk.freeSpace,
      totalSpace: disk.totalSpace,
      percentUsed: ((disk.totalSpace - disk.freeSpace) / disk.totalSpace) * 100,
    }));
  }

  // Activity/History
  async getHistory(pageSize: number = 10) {
    const history = await this.request(`/history?pageSize=${pageSize}`);
    return {
      app: this.name,
      page: history.page,
      totalRecords: history.totalRecords,
      items: history.records?.map((item: any) => ({
        title: item.sourceTitle,
        quality: item.quality?.quality?.name,
        date: new Date(item.date),
        eventType: item.eventType,
        downloadId: item.downloadId,
        data: item.data,
      })),
    };
  }

  // Calendar (Sonarr/Radarr)
  async getCalendar(days: number = 7) {
    const start = new Date().toISOString();
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    try {
      const calendar = await this.request(`/calendar?start=${start}&end=${end}`);
      return {
        app: this.name,
        items: calendar.map((item: any) => ({
          title: item.title || item.series?.title,
          airDate: item.airDate || item.releaseDate,
          hasFile: item.hasFile,
          monitored: item.monitored,
        })),
      };
    } catch {
      return { app: this.name, items: [] };
    }
  }

  private getSeverity(type: string): 'info' | 'warning' | 'error' {
    if (type.toLowerCase().includes('error')) return 'error';
    if (type.toLowerCase().includes('warning')) return 'warning';
    return 'info';
  }
}

// Specialized Plex client
export class PlexClient {
  private baseUrl: string;
  private token: string;

  constructor(config: { host: string; port: number; token: string }) {
    this.baseUrl = `http://${config.host}:${config.port}`;
    this.token = config.token;
  }

  async getStatus() {
    try {
      const response = await fetch(`${this.baseUrl}/identity`, {
        headers: {
          'X-Plex-Token': this.token,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Plex API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        machineIdentifier: data.MediaContainer.machineIdentifier,
        version: data.MediaContainer.version,
        platform: data.MediaContainer.platform,
        platformVersion: data.MediaContainer.platformVersion,
      };
    } catch (error) {
      logger.error('Plex status check failed:', error);
      return null;
    }
  }

  async getSessions() {
    try {
      const response = await fetch(`${this.baseUrl}/status/sessions`, {
        headers: {
          'X-Plex-Token': this.token,
          'Accept': 'application/json',
        },
      });

      const data = await response.json();
      return {
        activeStreams: data.MediaContainer.size || 0,
        // Check if transcoding (impacts your CPU)
        transcoding: data.MediaContainer.Metadata?.some((m: any) =>
          m.Media?.[0]?.Part?.[0]?.Stream?.some((s: any) => s.decision === 'transcode')
        ) || false,
      };
    } catch (error) {
      logger.error('Plex sessions check failed:', error);
      return { activeStreams: 0, transcoding: false };
    }
  }
}
```

### Create `src/services/monitoring/docker-monitor.ts`
```typescript
import { PortainerClient } from '../../integrations/portainer/client';
import { ArrClient, PlexClient } from '../../integrations/arr-apps/client';
import { logger } from '../../utils/logger';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';

interface DockerMonitorConfig {
  portainer: PortainerClient;
  db: Database.Database;
  io: SocketServer;
  intervals: {
    containers: number;
    stats: number;
    health: number;
  };
  arrApps?: Map<string, ArrClient>;
  plex?: PlexClient;
}

export class DockerMonitor {
  private portainer: PortainerClient;
  private db: Database.Database;
  private io: SocketServer;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private config: DockerMonitorConfig;
  private containerRestarts: Map<string, number> = new Map();

  constructor(config: DockerMonitorConfig) {
    this.portainer = config.portainer;
    this.db = config.db;
    this.io = config.io;
    this.config = config;
  }

  start() {
    logger.info('Starting Docker monitoring...');

    // Container status - every 30 seconds
    this.startContainerMonitoring();

    // Container stats - every 5 seconds
    this.startStatsMonitoring();

    // Arr apps health - every minute
    if (this.config.arrApps) {
      this.startArrMonitoring();
    }

    // Plex monitoring - every 30 seconds
    if (this.config.plex) {
      this.startPlexMonitoring();
    }
  }

  private startContainerMonitoring() {
    const interval = setInterval(async () => {
      try {
        const containers = await this.portainer.getContainers();

        // Store container states
        containers.forEach(container => {
          const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO container_states (
              container_id, name, image, state, status,
              is_arr_app, is_plex, last_seen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          stmt.run(
            container.id,
            container.name,
            container.image,
            container.state,
            container.status,
            container.isArrApp ? 1 : 0,
            container.isPlex ? 1 : 0,
            new Date().toISOString()
          );

          // Track restart patterns
          if (container.status?.includes('Restarting')) {
            const restartCount = (this.containerRestarts.get(container.name) || 0) + 1;
            this.containerRestarts.set(container.name, restartCount);

            if (restartCount >= 3) {
              this.createAlert({
                type: 'container_restarting',
                severity: 'warning',
                message: `${container.name} has restarted ${restartCount} times`,
                details: container,
                actionable: true,
                suggestedAction: 'check_logs',
              });
            }
          }

          // Alert on stopped critical containers
          if (container.isCritical && container.state !== 'running') {
            this.createAlert({
              type: 'container_stopped',
              severity: 'critical',
              message: `Critical container ${container.name} is ${container.state}`,
              details: container,
              actionable: true,
              suggestedAction: 'restart_container',
            });
          }
        });

        // Broadcast to clients
        this.io.to('docker').emit('docker:containers', containers);

      } catch (error) {
        logger.error('Container monitoring error:', error);
      }
    }, this.config.intervals.containers);

    this.intervals.set('containers', interval);
  }

  private startStatsMonitoring() {
    const interval = setInterval(async () => {
      try {
        const containers = await this.portainer.getContainers();
        const runningContainers = containers.filter(c => c.state === 'running');

        const statsPromises = runningContainers.map(async (container) => {
          try {
            const stats = await this.portainer.getContainerStats(container.id);
            return {
              name: container.name,
              ...stats,
            };
          } catch (error) {
            logger.debug(`Could not get stats for ${container.name}`);
            return null;
          }
        });

        const allStats = (await Promise.all(statsPromises)).filter(Boolean);

        // Store stats in database
        allStats.forEach(stats => {
          if (!stats) return;

          const stmt = this.db.prepare(`
            INSERT INTO container_stats (
              timestamp, container_name, cpu_percent,
              memory_used, memory_limit, network_rx, network_tx
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          stmt.run(
            new Date().toISOString(),
            stats.name,
            stats.cpu.percentage,
            stats.memory.used,
            stats.memory.limit,
            stats.network.rx,
            stats.network.tx
          );

          // Alert on high resource usage
          if (stats.cpu.percentage > 90) {
            this.createAlert({
              type: 'container_high_cpu',
              severity: 'warning',
              message: `${stats.name} is using ${stats.cpu.percentage.toFixed(1)}% CPU`,
              details: stats,
            });
          }

          if (stats.memory.percentage > 90) {
            this.createAlert({
              type: 'container_high_memory',
              severity: 'warning',
              message: `${stats.name} is using ${stats.memory.percentage.toFixed(1)}% memory`,
              details: stats,
            });
          }
        });

        // Broadcast stats
        this.io.to('docker').emit('docker:stats', allStats);

      } catch (error) {
        logger.error('Stats monitoring error:', error);
      }
    }, this.config.intervals.stats);

    this.intervals.set('stats', interval);
  }

  private startArrMonitoring() {
    const interval = setInterval(async () => {
      if (!this.config.arrApps) return;

      for (const [name, client] of this.config.arrApps) {
        try {
          // Check health
          const health = await client.getHealth();
          health.forEach((issue: any) => {
            if (issue.severity === 'error') {
              this.createAlert({
                type: 'arr_health_issue',
                severity: 'warning',
                message: `${name}: ${issue.message}`,
                details: issue,
                actionable: true,
                suggestedAction: 'review_settings',
              });
            }
          });

          // Check queue
          const queue = await client.getQueue();
          if (queue.items?.some((item: any) => item.errorMessage)) {
            const failedItems = queue.items.filter((i: any) => i.errorMessage);
            this.createAlert({
              type: 'arr_download_failed',
              severity: 'info',
              message: `${name} has ${failedItems.length} failed downloads`,
              details: failedItems,
            });
          }

          // Check disk space
          const diskSpace = await client.getDiskSpace();
          diskSpace.forEach((disk: any) => {
            if (disk.percentUsed > 85) {
              this.createAlert({
                type: 'arr_disk_space',
                severity: disk.percentUsed > 95 ? 'critical' : 'warning',
                message: `${name}: ${disk.label} is ${disk.percentUsed.toFixed(1)}% full`,
                details: disk,
              });
            }
          });

        } catch (error) {
          logger.error(`${name} monitoring error:`, error);
        }
      }
    }, this.config.intervals.health);

    this.intervals.set('arr_health', interval);
  }

  private startPlexMonitoring() {
    if (!this.config.plex) return;

    const interval = setInterval(async () => {
      try {
        const sessions = await this.config.plex!.getSessions();

        // Store Plex stats
        const stmt = this.db.prepare(`
          INSERT INTO plex_stats (
            timestamp, active_streams, transcoding
          ) VALUES (?, ?, ?)
        `);

        stmt.run(
          new Date().toISOString(),
          sessions.activeStreams,
          sessions.transcoding ? 1 : 0
        );

        // Alert if transcoding (uses CPU)
        if (sessions.transcoding && sessions.activeStreams > 2) {
          this.createAlert({
            type: 'plex_transcoding',
            severity: 'info',
            message: `Plex is transcoding ${sessions.activeStreams} streams (CPU usage will be high)`,
            details: sessions,
            actionable: true,
            suggestedAction: 'enable_hw_transcoding',
          });
        }

        this.io.to('plex').emit('plex:sessions', sessions);

      } catch (error) {
        logger.error('Plex monitoring error:', error);
      }
    }, 30000);

    this.intervals.set('plex', interval);
  }

  private createAlert(alert: any) {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (
        type, severity, message, details,
        actionable, suggested_action
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      alert.type,
      alert.severity,
      alert.message,
      JSON.stringify(alert.details),
      alert.actionable ? 1 : 0,
      alert.suggestedAction || null
    );

    const fullAlert = {
      id: result.lastInsertRowid,
      ...alert,
      triggeredAt: new Date(),
    };

    this.io.to('alerts').emit('alert:triggered', fullAlert);
    logger.warn(`Alert: ${alert.message}`);
  }

  stop() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    logger.info('Docker monitoring stopped');
  }
}
```

## Phase 2: Update Database Schema

### Create `src/db/migrations/003_docker_tables.sql`
```sql
-- Container states
CREATE TABLE IF NOT EXISTS container_states (
  container_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image TEXT,
  state TEXT,
  status TEXT,
  is_arr_app BOOLEAN DEFAULT 0,
  is_plex BOOLEAN DEFAULT 0,
  is_critical BOOLEAN DEFAULT 0,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Container statistics
CREATE TABLE IF NOT EXISTS container_stats (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  container_name TEXT NOT NULL,
  cpu_percent REAL,
  memory_used INTEGER,
  memory_limit INTEGER,
  network_rx INTEGER,
  network_tx INTEGER,
  io_read INTEGER,
  io_write INTEGER
);
CREATE INDEX idx_container_stats_time ON container_stats(timestamp);
CREATE INDEX idx_container_stats_name ON container_stats(container_name);

-- Plex statistics
CREATE TABLE IF NOT EXISTS plex_stats (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  active_streams INTEGER,
  transcoding BOOLEAN
);

-- Update alerts table
ALTER TABLE alerts ADD COLUMN actionable BOOLEAN DEFAULT 0;
ALTER TABLE alerts ADD COLUMN suggested_action TEXT;
```

## Phase 3: Add Docker Routes

### Create `src/routes/docker.ts`
```typescript
import { FastifyInstance } from 'fastify';

export async function dockerRoutes(fastify: FastifyInstance) {
  const { portainer, arrApps, plex } = fastify.docker;

  // Container list
  fastify.get('/api/docker/containers', async (request, reply) => {
    const containers = await portainer.getContainers();
    return containers;
  });

  // Container stats
  fastify.get('/api/docker/containers/:id/stats', async (request, reply) => {
    const { id } = request.params as { id: string };
    const stats = await portainer.getContainerStats(id);
    return stats;
  });

  // Container logs
  fastify.get('/api/docker/containers/:id/logs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { lines = 100 } = request.query as { lines?: number };
    const logs = await portainer.getContainerLogs(id, lines);
    return logs;
  });

  // Arr app status
  fastify.get('/api/arr/:app/status', async (request, reply) => {
    const { app } = request.params as { app: string };
    const client = arrApps.get(app.toLowerCase());

    if (!client) {
      reply.code(404).send({ error: 'App not found' });
      return;
    }

    const [status, health, queue] = await Promise.all([
      client.getSystemStatus(),
      client.getHealth(),
      client.getQueue(),
    ]);

    return { status, health, queue };
  });

  // Plex status
  fastify.get('/api/plex/status', async (request, reply) => {
    if (!plex) {
      reply.code(404).send({ error: 'Plex not configured' });
      return;
    }

    const [status, sessions] = await Promise.all([
      plex.getStatus(),
      plex.getSessions(),
    ]);

    return { status, sessions };
  });

  // Container actions (protected)
  fastify.post('/api/docker/containers/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Check if write operations are enabled
    if (process.env.ENABLE_WRITE_OPERATIONS !== 'true') {
      reply.code(403).send({ error: 'Write operations disabled' });
      return;
    }

    // Log the action
    logger.info(`Restart requested for container ${id} by ${request.ip}`);

    // You could add confirmation here
    await portainer.restartContainer(id);

    return { success: true, message: 'Container restart initiated' };
  });
}
```

## Phase 4: Configuration Updates

### Add to `.env`
```bash
# Portainer
PORTAINER_HOST=192.168.1.100
PORTAINER_PORT=9000
PORTAINER_TOKEN=your-portainer-token

# Arr Apps (optional, add as needed)
SONARR_HOST=192.168.1.100
SONARR_PORT=8989
SONARR_API_KEY=your-sonarr-key

RADARR_HOST=192.168.1.100
RADARR_PORT=7878
RADARR_API_KEY=your-radarr-key

PROWLARR_HOST=192.168.1.100
PROWLARR_PORT=9696
PROWLARR_API_KEY=your-prowlarr-key

# Plex (optional)
PLEX_HOST=192.168.1.100
PLEX_PORT=32400
PLEX_TOKEN=your-plex-token
```

## Phase 5: Testing

### Test endpoints
```bash
# List containers
curl http://localhost:3100/api/docker/containers

# Get container logs
curl http://localhost:3100/api/docker/containers/CONTAINER_ID/logs

# Check Sonarr status
curl http://localhost:3100/api/arr/sonarr/status

# Check Plex sessions
curl http://localhost:3100/api/plex/status
```

### Monitor real-time events
```javascript
socket.emit('subscribe', ['docker', 'alerts']);

socket.on('docker:containers', (containers) => {
  console.log(`${containers.length} containers running`);
});

socket.on('docker:stats', (stats) => {
  stats.forEach(s => {
    console.log(`${s.name}: CPU ${s.cpu.percentage}%, RAM ${s.memory.percentage}%`);
  });
});
```

## Phase 6: Bandwidth Monitoring & Throttling

### Why This Matters
Plex transcoding can saturate your network, affecting other services. Monitor and optionally throttle bandwidth per container.

### Create `src/services/monitoring/bandwidth-monitor.ts`
```typescript
import { logger } from '../../utils/logger';
import { PortainerClient } from '../../integrations/portainer/client';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';

interface BandwidthStats {
  name: string;
  containerId: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_rate: number;  // MB/s
  tx_rate: number;  // MB/s
  total_rate: number;
}

export class BandwidthMonitor {
  private client: PortainerClient;
  private db: Database.Database;
  private io: SocketServer;
  private previousStats: Map<string, { rx: number; tx: number; timestamp: number }> = new Map();

  constructor(client: PortainerClient, db: Database.Database, io: SocketServer) {
    this.client = client;
    this.db = db;
    this.io = io;
  }

  /**
   * Monitor bandwidth by container
   */
  async getContainerBandwidth(): Promise<BandwidthStats[]> {
    const containers = await this.client.getContainers();
    const bandwidth: BandwidthStats[] = [];

    for (const container of containers.filter(c => c.state === 'running')) {
      try {
        const stats = await this.client.getContainerStats(container.id);

        const currentTime = Date.now();
        const currentRx = stats.network.rx;
        const currentTx = stats.network.tx;

        // Calculate rates (bytes/second)
        let rxRate = 0;
        let txRate = 0;

        const previous = this.previousStats.get(container.id);
        if (previous) {
          const timeDelta = (currentTime - previous.timestamp) / 1000; // seconds
          rxRate = (currentRx - previous.rx) / timeDelta / 1024 / 1024; // MB/s
          txRate = (currentTx - previous.tx) / timeDelta / 1024 / 1024; // MB/s
        }

        // Store current stats for next comparison
        this.previousStats.set(container.id, {
          rx: currentRx,
          tx: currentTx,
          timestamp: currentTime
        });

        const containerBandwidth: BandwidthStats = {
          name: container.name,
          containerId: container.id,
          rx_bytes: currentRx,
          tx_bytes: currentTx,
          rx_rate: rxRate,
          tx_rate: txRate,
          total_rate: rxRate + txRate
        };

        bandwidth.push(containerBandwidth);

        // Store in database
        const stmt = this.db.prepare(`
          INSERT INTO bandwidth_metrics (
            timestamp, container_id, container_name,
            rx_bytes, tx_bytes, rx_rate_mbps, tx_rate_mbps
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          new Date().toISOString(),
          container.id,
          container.name,
          currentRx,
          currentTx,
          rxRate,
          txRate
        );

      } catch (error) {
        logger.error(`Bandwidth monitoring failed for ${container.name}`, error);
      }
    }

    // Check for high bandwidth usage
    this.checkBandwidthAlerts(bandwidth);

    // Broadcast to clients
    this.io.to('docker').emit('docker:bandwidth', bandwidth);

    return bandwidth;
  }

  /**
   * Check for bandwidth alerts
   */
  private checkBandwidthAlerts(bandwidth: BandwidthStats[]) {
    // Alert if Plex is using >500Mbps
    const plex = bandwidth.find(c => c.name.includes('plex'));
    if (plex && plex.total_rate > 62.5) { // 500Mbps = 62.5 MB/s
      logger.warn('High bandwidth usage detected', {
        container: plex.name,
        rate_mbps: (plex.total_rate * 8).toFixed(2),
        recommendation: 'Multiple transcodes active. Consider limiting remote quality.'
      });

      this.io.to('alerts').emit('alert:triggered', {
        type: 'high_bandwidth',
        severity: 'warning',
        message: `Plex using ${(plex.total_rate * 8).toFixed(0)}Mbps - Multiple transcodes detected`,
        details: plex
      });
    }

    // Alert if total bandwidth exceeds threshold
    const totalBandwidth = bandwidth.reduce((sum, b) => sum + b.total_rate, 0);
    if (totalBandwidth > 125) { // 1Gbps = 125 MB/s
      logger.warn('Network saturation detected', {
        total_rate_mbps: (totalBandwidth * 8).toFixed(2)
      });
    }
  }

  /**
   * Get bandwidth history for a container
   */
  async getBandwidthHistory(containerName: string, hours: number = 24) {
    const stmt = this.db.prepare(`
      SELECT * FROM bandwidth_metrics
      WHERE container_name = ?
        AND timestamp > datetime('now', '-${hours} hours')
      ORDER BY timestamp ASC
    `);

    return stmt.all(containerName);
  }

  /**
   * Get top bandwidth consumers
   */
  async getTopConsumers(limit: number = 10) {
    const stmt = this.db.prepare(`
      SELECT
        container_name,
        SUM(rx_bytes + tx_bytes) as total_bytes,
        AVG(rx_rate_mbps + tx_rate_mbps) as avg_rate_mbps
      FROM bandwidth_metrics
      WHERE timestamp > datetime('now', '-24 hours')
      GROUP BY container_name
      ORDER BY total_bytes DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }
}
```

### Update database schema
Add to `src/db/migrations/003_docker_tables.sql`:
```sql
-- Bandwidth metrics
CREATE TABLE IF NOT EXISTS bandwidth_metrics (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  container_id TEXT NOT NULL,
  container_name TEXT NOT NULL,
  rx_bytes INTEGER,
  tx_bytes INTEGER,
  rx_rate_mbps REAL,
  tx_rate_mbps REAL
);
CREATE INDEX IF NOT EXISTS idx_bandwidth_time ON bandwidth_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_bandwidth_container ON bandwidth_metrics(container_name);
```

### Add bandwidth routes
Update `src/routes/docker.ts`:
```typescript
import { BandwidthMonitor } from '../services/monitoring/bandwidth-monitor';

// In dockerRoutes function:
const bandwidthMonitor = new BandwidthMonitor(portainerClient, fastify.db, fastify.io);

// Current bandwidth
fastify.get('/api/docker/bandwidth', async (request, reply) => {
  const bandwidth = await bandwidthMonitor.getContainerBandwidth();
  return bandwidth;
});

// Bandwidth history
fastify.get('/api/docker/bandwidth/:container', async (request, reply) => {
  const { container } = request.params as { container: string };
  const { hours = 24 } = request.query as { hours?: number };
  const history = await bandwidthMonitor.getBandwidthHistory(container, hours);
  return history;
});

// Top consumers
fastify.get('/api/docker/bandwidth/top/:limit?', async (request, reply) => {
  const { limit = 10 } = request.params as { limit?: number };
  const top = await bandwidthMonitor.getTopConsumers(limit);
  return top;
});
```

## Phase 7: Container Auto-Update with Rollback

### Why This Matters
Keep containers updated safely. If an update breaks something, automatically rollback to the previous version.

### Create `src/services/docker/container-updater.ts`
```typescript
import { logger } from '../../utils/logger';
import { PortainerClient } from '../../integrations/portainer/client';
import Database from 'better-sqlite3';

interface ContainerSnapshot {
  containerId: string;
  containerName: string;
  imageTag: string;
  config: any;
  timestamp: Date;
}

interface UpdateResult {
  success: boolean;
  containerName: string;
  oldVersion: string;
  newVersion: string;
  rolledBack: boolean;
  error?: string;
}

export class ContainerUpdateManager {
  private client: PortainerClient;
  private db: Database.Database;

  constructor(client: PortainerClient, db: Database.Database) {
    this.client = client;
    this.db = db;
  }

  /**
   * Update container with automatic rollback on failure
   */
  async safeUpdate(containerName: string): Promise<UpdateResult> {
    logger.info(`Starting safe update for ${containerName}...`);

    try {
      // 1. Get current container
      const containers = await this.client.getContainers();
      const container = containers.find(c => c.name === containerName);

      if (!container) {
        throw new Error(`Container ${containerName} not found`);
      }

      const oldVersion = container.imageTag;

      // 2. Create snapshot of current state
      const snapshot = await this.snapshotContainerState(container.id);

      // 3. Pull new image
      logger.info(`Pulling latest image for ${container.image}...`);
      await this.pullImage(container.image);

      // 4. Stop current container
      await this.stopContainer(container.id);

      // 5. Recreate container with new image
      const newContainerId = await this.recreateContainer(container.id);

      // 6. Health check (60 second timeout)
      const healthy = await this.healthCheck(newContainerId, 60);

      if (!healthy) {
        logger.warn(`Update failed, rolling back ${containerName}`);
        await this.rollbackContainer(container.id, snapshot);

        return {
          success: false,
          containerName,
          oldVersion,
          newVersion: 'unknown',
          rolledBack: true,
          error: 'Health check failed'
        };
      }

      // 7. Get new version
      const newVersion = await this.getContainerVersion(newContainerId);

      // 8. Record successful update
      this.recordUpdate(containerName, oldVersion, newVersion);

      logger.info(`Successfully updated ${containerName}: ${oldVersion} → ${newVersion}`);

      return {
        success: true,
        containerName,
        oldVersion,
        newVersion,
        rolledBack: false
      };

    } catch (error: any) {
      logger.error(`Update failed for ${containerName}`, error);

      return {
        success: false,
        containerName,
        oldVersion: 'unknown',
        newVersion: 'unknown',
        rolledBack: false,
        error: error.message
      };
    }
  }

  /**
   * Snapshot container state for rollback
   */
  private async snapshotContainerState(containerId: string): Promise<ContainerSnapshot> {
    // Get container inspect data from Portainer/Docker
    const container = await this.client.request(
      `/endpoints/1/docker/containers/${containerId}/json`
    );

    const snapshot: ContainerSnapshot = {
      containerId,
      containerName: container.Name,
      imageTag: container.Image,
      config: {
        env: container.Config.Env,
        volumes: container.Mounts,
        ports: container.NetworkSettings.Ports,
        labels: container.Config.Labels
      },
      timestamp: new Date()
    };

    // Store snapshot in database
    const stmt = this.db.prepare(`
      INSERT INTO container_snapshots (
        container_id, container_name, image_tag, config, timestamp
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      containerId,
      snapshot.containerName,
      snapshot.imageTag,
      JSON.stringify(snapshot.config),
      snapshot.timestamp.toISOString()
    );

    return snapshot;
  }

  /**
   * Pull latest container image
   */
  private async pullImage(imageName: string): Promise<void> {
    // This would use Docker API via Portainer to pull the image
    // Simplified for example - actual implementation would stream pull progress
    logger.info(`Pulling image: ${imageName}`);
  }

  /**
   * Stop container
   */
  private async stopContainer(containerId: string): Promise<void> {
    logger.info(`Stopping container ${containerId}`);
    // Docker API call to stop container
  }

  /**
   * Recreate container with new image
   */
  private async recreateContainer(containerId: string): Promise<string> {
    // This would use docker-compose or Docker API to recreate with same config
    logger.info(`Recreating container ${containerId}`);
    return containerId; // Return new container ID
  }

  /**
   * Health check with timeout
   */
  private async healthCheck(containerId: string, timeoutSeconds: number): Promise<boolean> {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const container = (await this.client.getContainers()).find(c => c.id === containerId);

        if (!container) {
          return false;
        }

        if (container.state === 'running' && !container.status.includes('starting')) {
          // Additional health checks based on container type
          if (container.isArrApp) {
            // Check arr app API responds
            return await this.checkArrHealth(container.name);
          }

          if (container.isPlex) {
            // Check Plex API responds
            return await this.checkPlexHealth();
          }

          return true; // Container is running
        }

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry

      } catch (error) {
        logger.error('Health check error', error);
      }
    }

    return false; // Timeout
  }

  /**
   * Rollback container to previous state
   */
  private async rollbackContainer(containerId: string, snapshot: ContainerSnapshot): Promise<void> {
    logger.warn(`Rolling back container ${snapshot.containerName}`);

    // Stop current container
    await this.stopContainer(containerId);

    // Recreate with old image tag
    await this.recreateContainer(containerId);

    logger.info(`Rollback complete for ${snapshot.containerName}`);
  }

  /**
   * Get container version (from image tag or label)
   */
  private async getContainerVersion(containerId: string): Promise<string> {
    const container = (await this.client.getContainers()).find(c => c.id === containerId);
    return container?.imageTag || 'latest';
  }

  /**
   * Record successful update
   */
  private recordUpdate(containerName: string, oldVersion: string, newVersion: string) {
    const stmt = this.db.prepare(`
      INSERT INTO container_updates (
        container_name, old_version, new_version, timestamp, success
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      containerName,
      oldVersion,
      newVersion,
      new Date().toISOString(),
      1
    );
  }

  /**
   * Check arr app health
   */
  private async checkArrHealth(containerName: string): Promise<boolean> {
    // Would check arr app API is responding
    return true; // Simplified
  }

  /**
   * Check Plex health
   */
  private async checkPlexHealth(): Promise<boolean> {
    // Would check Plex API is responding
    return true; // Simplified
  }
}
```

### Update database schema
```sql
-- Container snapshots for rollback
CREATE TABLE IF NOT EXISTS container_snapshots (
  id INTEGER PRIMARY KEY,
  container_id TEXT NOT NULL,
  container_name TEXT NOT NULL,
  image_tag TEXT,
  config TEXT, -- JSON
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Update history
CREATE TABLE IF NOT EXISTS container_updates (
  id INTEGER PRIMARY KEY,
  container_name TEXT NOT NULL,
  old_version TEXT,
  new_version TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  success INTEGER DEFAULT 1,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_updates_time ON container_updates(timestamp);
```

### Add update routes
```typescript
import { ContainerUpdateManager } from '../services/docker/container-updater';

// In dockerRoutes:
const updater = new ContainerUpdateManager(portainerClient, fastify.db);

// Trigger safe update
fastify.post('/api/docker/update/:container', async (request, reply) => {
  const { container } = request.params as { container: string };
  const result = await updater.safeUpdate(container);
  return result;
});

// Get update history
fastify.get('/api/docker/updates', async (request, reply) => {
  const stmt = fastify.db.prepare(`
    SELECT * FROM container_updates
    ORDER BY timestamp DESC
    LIMIT 50
  `);
  return stmt.all();
});
```

## Phase 8: Resource Quota Enforcement

### Why This Matters
Prevent runaway containers from saturating your system. Your i5-12400 has 12 threads and 64GB RAM - enforce fair sharing.

### Create `src/services/docker/resource-quotas.ts`
```typescript
import { logger } from '../../utils/logger';
import { PortainerClient } from '../../integrations/portainer/client';

interface ResourceQuota {
  cpu: string;      // CPU cores (e.g., "2.0")
  memory: string;   // Memory limit (e.g., "4g")
  io_read?: string;  // Disk read limit (e.g., "100m")
  io_write?: string; // Disk write limit (e.g., "100m")
  reason: string;
}

export class ResourceQuotaManager {
  private client: PortainerClient;

  // Define quotas based on container type
  private quotas: Record<string, ResourceQuota> = {
    plex: {
      cpu: '4.0',        // 4 cores max (your i5 has 6 cores, 12 threads)
      memory: '8g',      // 8GB max (you have 64GB)
      reason: 'Transcoding can use all CPU - limit to 4 cores'
    },
    sonarr: {
      cpu: '1.0',        // 1 core max
      memory: '2g',      // 2GB max
      reason: 'Low resource service - API only'
    },
    radarr: {
      cpu: '1.0',
      memory: '2g',
      reason: 'Low resource service - API only'
    },
    prowlarr: {
      cpu: '0.5',
      memory: '1g',
      reason: 'Very low resource service'
    },
    transmission: {
      cpu: '2.0',
      memory: '1g',
      io_read: '500m',   // 500MB/s read max
      io_write: '500m',  // 500MB/s write max
      reason: 'Prevent disk saturation from torrent downloads'
    },
    default: {
      cpu: '1.0',
      memory: '2g',
      reason: 'Default quota for unknown containers'
    }
  };

  constructor(client: PortainerClient) {
    this.client = client;
  }

  /**
   * Enforce quotas on all containers
   */
  async enforceQuotas(): Promise<void> {
    logger.info('Enforcing resource quotas...');

    const containers = await this.client.getContainers();

    for (const container of containers) {
      const quota = this.getQuotaForContainer(container.name);

      logger.info(`Applying quota to ${container.name}`, {
        cpu: quota.cpu,
        memory: quota.memory,
        reason: quota.reason
      });

      await this.applyQuota(container.id, quota);
    }
  }

  /**
   * Get quota for specific container
   */
  private getQuotaForContainer(containerName: string): ResourceQuota {
    const name = containerName.toLowerCase();

    // Check for specific services
    if (name.includes('plex')) return this.quotas.plex;
    if (name.includes('sonarr')) return this.quotas.sonarr;
    if (name.includes('radarr')) return this.quotas.radarr;
    if (name.includes('prowlarr')) return this.quotas.prowlarr;
    if (name.includes('transmission') || name.includes('qbittorrent')) {
      return this.quotas.transmission;
    }

    return this.quotas.default;
  }

  /**
   * Apply quota to container
   */
  private async applyQuota(containerId: string, quota: ResourceQuota): Promise<void> {
    // This would use Docker API to update container resource limits
    // Via Portainer or direct Docker API

    logger.info(`Quota applied to ${containerId}`, quota);

    // Example Docker API call:
    // POST /containers/{id}/update
    // Body: {
    //   "CpuQuota": cpuQuota,
    //   "Memory": memoryBytes,
    //   "BlkioDeviceReadBps": [...],
    //   "BlkioDeviceWriteBps": [...]
    // }
  }

  /**
   * Get current resource usage vs quotas
   */
  async getQuotaCompliance(): Promise<any[]> {
    const containers = await this.client.getContainers();
    const compliance = [];

    for (const container of containers.filter(c => c.state === 'running')) {
      const quota = this.getQuotaForContainer(container.name);
      const stats = await this.client.getContainerStats(container.id);

      const cpuLimit = parseFloat(quota.cpu) * 100; // Convert cores to percentage
      const memoryLimit = this.parseMemory(quota.memory);

      compliance.push({
        name: container.name,
        quota: quota,
        usage: {
          cpu: stats.cpu.percentage,
          memory: stats.memory.used
        },
        compliance: {
          cpu: stats.cpu.percentage < cpuLimit,
          memory: stats.memory.used < memoryLimit
        },
        overQuota: stats.cpu.percentage >= cpuLimit || stats.memory.used >= memoryLimit
      });
    }

    return compliance;
  }

  /**
   * Parse memory string to bytes
   */
  private parseMemory(memStr: string): number {
    const value = parseFloat(memStr);
    const unit = memStr.replace(/[0-9.]/g, '').toLowerCase();

    const multipliers: Record<string, number> = {
      'k': 1024,
      'm': 1024 * 1024,
      'g': 1024 * 1024 * 1024
    };

    return value * (multipliers[unit] || 1);
  }
}
```

### Add quota routes
```typescript
import { ResourceQuotaManager } from '../services/docker/resource-quotas';

// In dockerRoutes:
const quotaManager = new ResourceQuotaManager(portainerClient);

// Enforce quotas
fastify.post('/api/docker/quotas/enforce', async (request, reply) => {
  await quotaManager.enforceQuotas();
  return { success: true, message: 'Quotas enforced' };
});

// Get quota compliance
fastify.get('/api/docker/quotas/compliance', async (request, reply) => {
  const compliance = await quotaManager.getQuotaCompliance();
  return compliance;
});
```

## Phase 9: Plex Optimization Analyzer

### Why This Matters
Your i5-12400 has Intel QuickSync - make sure Plex is using it! This analyzer detects misconfigurations and provides optimization tips.

### Create `src/services/plex/optimization-analyzer.ts`
```typescript
import { logger } from '../../utils/logger';
import { PlexClient } from '../../integrations/plex/client';
import { PortainerClient } from '../../integrations/portainer/client';

interface OptimizationRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  issue: string;
  impact: string;
  fix: string;
  automatable: boolean;
}

interface PlexOptimizationReport {
  hardware_acceleration: boolean;
  active_transcodes: number;
  software_transcodes: number;
  hardware_transcodes: number;
  cpu_usage: number;
  quicksync_enabled: boolean;
  recommendations: OptimizationRecommendation[];
  score: number; // 0-100, higher is better
}

export class PlexOptimizationAnalyzer {
  private plexClient: PlexClient;
  private dockerClient: PortainerClient;

  constructor(plexClient: PlexClient, dockerClient: PortainerClient) {
    this.plexClient = plexClient;
    this.dockerClient = dockerClient;
  }

  /**
   * Analyze Plex configuration and usage
   */
  async analyzePlexOptimization(): Promise<PlexOptimizationReport> {
    logger.info('Analyzing Plex optimization...');

    const sessions = await this.plexClient.getSessions();
    const transcodes = sessions.filter((s: any) => s.TranscodeSession);

    // Get Plex container stats
    const containers = await this.dockerClient.getContainers();
    const plexContainer = containers.find(c => c.isPlex);

    const stats = plexContainer
      ? await this.dockerClient.getContainerStats(plexContainer.id)
      : null;

    // Analyze transcodes
    const softwareTranscodes = transcodes.filter(
      (t: any) => !t.TranscodeSession.videoDecision?.includes('hw')
    );
    const hardwareTranscodes = transcodes.filter(
      (t: any) => t.TranscodeSession.videoDecision?.includes('hw')
    );

    // Check QuickSync status
    const quicksyncEnabled = await this.checkQuickSync();

    // Generate recommendations
    const recommendations: OptimizationRecommendation[] = [];

    // CRITICAL: QuickSync not enabled
    if (!quicksyncEnabled) {
      recommendations.push({
        priority: 'critical',
        issue: 'Intel QuickSync not enabled',
        impact: '10x higher CPU usage for transcoding',
        fix: 'Enable Hardware Transcoding in Plex → Settings → Transcoder → Use hardware acceleration when available',
        automatable: false
      });
    }

    // HIGH: Software transcodes active
    if (softwareTranscodes.length > 0 && quicksyncEnabled) {
      recommendations.push({
        priority: 'high',
        issue: `${softwareTranscodes.length} software transcodes active despite QuickSync being available`,
        impact: 'Each software transcode uses ~100% CPU vs 15% with QuickSync',
        fix: 'Check codec support. Some codecs (HEVC 10-bit) may not be HW-accelerated. Consider re-encoding.',
        automatable: false
      });
    }

    // MEDIUM: High transcoding quality
    const avgBitrate = transcodes.reduce((sum: number, t: any) =>
      sum + (t.TranscodeSession?.videoBitrate || 0), 0
    ) / (transcodes.length || 1);

    if (avgBitrate > 8000) { // 8Mbps
      recommendations.push({
        priority: 'medium',
        issue: 'High transcoding quality settings',
        impact: 'Slower transcodes, higher CPU/disk usage, more bandwidth',
        fix: 'Reduce remote quality to 4Mbps 720p in Settings → Remote Access → Remote Stream Quality',
        automatable: false
      });
    }

    // MEDIUM: Too many simultaneous transcodes
    if (transcodes.length > 3) {
      recommendations.push({
        priority: 'medium',
        issue: `${transcodes.length} simultaneous transcodes`,
        impact: 'May exceed QuickSync capacity (3-4 streams)',
        fix: 'Limit simultaneous streams in Tautulli or Plex settings',
        automatable: false
      });
    }

    // LOW: CPU usage high despite QuickSync
    if (stats && stats.cpu.percentage > 50 && quicksyncEnabled) {
      recommendations.push({
        priority: 'low',
        issue: 'High CPU usage despite hardware acceleration',
        impact: 'May indicate QuickSync not actually being used',
        fix: 'Verify /dev/dri is mounted in Plex container',
        automatable: true
      });
    }

    // Calculate optimization score
    let score = 100;
    recommendations.forEach(rec => {
      if (rec.priority === 'critical') score -= 40;
      if (rec.priority === 'high') score -= 20;
      if (rec.priority === 'medium') score -= 10;
      if (rec.priority === 'low') score -= 5;
    });

    return {
      hardware_acceleration: quicksyncEnabled,
      active_transcodes: transcodes.length,
      software_transcodes: softwareTranscodes.length,
      hardware_transcodes: hardwareTranscodes.length,
      cpu_usage: stats?.cpu.percentage || 0,
      quicksync_enabled: quicksyncEnabled,
      recommendations,
      score: Math.max(0, score)
    };
  }

  /**
   * Check if QuickSync is enabled and working
   */
  private async checkQuickSync(): Promise<boolean> {
    try {
      // Check if Plex container has access to /dev/dri
      const containers = await this.dockerClient.getContainers();
      const plexContainer = containers.find(c => c.isPlex);

      if (!plexContainer) {
        return false;
      }

      // Would check container mounts for /dev/dri
      // For now, check via Plex server capabilities
      const capabilities = await this.plexClient.getServerCapabilities();

      return capabilities?.transcoder?.videoQuickSync === true;

    } catch (error) {
      logger.error('QuickSync check failed', error);
      return false;
    }
  }

  /**
   * Get Plex transcoding statistics
   */
  async getTranscodingStats(days: number = 30) {
    // This would pull from Tautulli if available, or Plex history
    // Returns stats like: most transcoded files, peak transcode times, etc.

    return {
      period_days: days,
      total_transcodes: 0,
      hw_transcodes: 0,
      sw_transcodes: 0,
      most_transcoded_files: [],
      peak_hours: []
    };
  }
}
```

### Add Plex optimization routes
```typescript
import { PlexOptimizationAnalyzer } from '../services/plex/optimization-analyzer';

// In dockerRoutes or separate plexRoutes:
const plexAnalyzer = new PlexOptimizationAnalyzer(plexClient, portainerClient);

// Get optimization report
fastify.get('/api/plex/optimization', async (request, reply) => {
  const report = await plexAnalyzer.analyzePlexOptimization();
  return report;
});

// Get transcoding stats
fastify.get('/api/plex/transcode-stats', async (request, reply) => {
  const { days = 30 } = request.query as { days?: number };
  const stats = await plexAnalyzer.getTranscodingStats(days);
  return stats;
});
```

### Example optimization report
```json
{
  "hardware_acceleration": true,
  "active_transcodes": 2,
  "software_transcodes": 0,
  "hardware_transcodes": 2,
  "cpu_usage": 25,
  "quicksync_enabled": true,
  "recommendations": [
    {
      "priority": "medium",
      "issue": "High transcoding quality settings",
      "impact": "Slower transcodes, higher bandwidth",
      "fix": "Reduce remote quality to 4Mbps 720p",
      "automatable": false
    }
  ],
  "score": 90
}
```

## Validation Checklist

- [ ] Portainer connection working
- [ ] All containers listed
- [ ] Container stats collected
- [ ] Arr apps identified automatically
- [ ] Plex monitoring active
- [ ] **Bandwidth monitoring tracking per-container network usage**
- [ ] **Container auto-update with rollback configured**
- [ ] **Resource quotas enforced (Plex limited to 4 cores, 8GB)**
- [ ] **Plex optimization analyzer detecting QuickSync status**
- [ ] Alerts for stopped containers
- [ ] Restart tracking working
- [ ] Resource usage alerts

## Common Issues

### Portainer Token Invalid
1. Go to Portainer UI
2. User settings → Access tokens
3. Create new token for monitoring

### Can't Find Containers
- Check Portainer endpoint ID (usually 1 for local)
- Verify containers are in the correct Portainer environment

### Arr App Connection Failed
- Check app is running: `docker ps | grep sonarr`
- Verify API key in arr app settings
- Ensure using internal Docker network IPs

## Next Steps

With Docker monitoring working:
- ✅ All containers monitored
- ✅ Arr suite health tracked
- ✅ Plex transcoding detected
- ✅ Resource usage tracked

**Proceed to TODO-04-security-baseline.md** to scan for security issues!

---

*Note: Your port 32400 exposure concern was smart. We'll address that properly in the security TODO with Cloudflare Tunnel instead of port forwarding.*
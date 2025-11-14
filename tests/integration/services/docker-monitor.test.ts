import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { DockerMonitor } from '../../../src/services/monitoring/docker-monitor.js';
import type { PortainerClient } from '../../../src/integrations/portainer/client.js';

describe('DockerMonitor Integration', () => {
  let db: Database.Database;
  let io: SocketIOServer;
  let httpServer: ReturnType<typeof createServer>;
  let monitor: DockerMonitor;
  let mockPortainer: jest.Mocked<PortainerClient>;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Run schema
    db.exec(`
      CREATE TABLE container_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        container_id TEXT NOT NULL,
        container_name TEXT NOT NULL,
        state TEXT,
        cpu_percent REAL,
        memory_used_mb REAL,
        memory_limit_mb REAL,
        network_rx_mb REAL,
        network_tx_mb REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        acknowledged INTEGER DEFAULT 0,
        resolved INTEGER DEFAULT 0,
        actionable INTEGER DEFAULT 0,
        suggested_action TEXT
      );
    `);

    // Create mock Socket.IO server
    httpServer = createServer();
    io = new SocketIOServer(httpServer);

    // Create mock Portainer client
    mockPortainer = {
      getContainers: jest.fn<typeof mockPortainer.getContainers>(),
      getContainerStats: jest.fn<typeof mockPortainer.getContainerStats>(),
    } as unknown as jest.Mocked<PortainerClient>;

    // Initialize monitor
    monitor = new DockerMonitor({
      portainer: mockPortainer,
      arrClients: [],
      db,
      io,
      interval: 30000,
    });
  });

  afterEach(() => {
    monitor.stop();
    db.close();
    io.close();
    httpServer.close();
  });

  describe('Container Monitoring', () => {
    it('should successfully monitor running containers', async () => {
      mockPortainer.getContainers.mockResolvedValueOnce([
        {
          id: 'container-123',
          name: 'plex',
          image: 'plexinc/pms-docker',
          imageTag: 'latest',
          state: 'running',
          status: 'Up 5 days',
          created: new Date('2024-01-01'),
          ports: [],
          labels: {},
          isArrApp: false,
          isPlex: true,
          isCritical: true,
        },
      ]);

      mockPortainer.getContainerStats.mockResolvedValueOnce({
        cpu: { percentage: 15.5, cores: 4 },
        memory: { used: 1073741824, limit: 4294967296, percentage: 25 },
        network: { rx: 105553116, tx: 52691558 },
        io: { read: 1000000, write: 500000 },
      });

      await (monitor as unknown as { monitorContainers: () => Promise<void> }).monitorContainers();

      const metrics = db
        .prepare('SELECT * FROM container_metrics WHERE container_name = ?')
        .all('plex');
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        container_id: 'container-123',
        container_name: 'plex',
        state: 'running',
        cpu_percent: 15.5,
      });
    });

    it('should skip stopped containers', async () => {
      mockPortainer.getContainers.mockResolvedValueOnce([
        {
          id: 'container-456',
          name: 'stopped-app',
          image: 'nginx:latest',
          imageTag: 'latest',
          state: 'exited',
          status: 'Exited (0) 2 days ago',
          created: new Date('2024-01-01'),
          ports: [],
          labels: {},
          isArrApp: false,
          isPlex: false,
          isCritical: false,
        },
      ]);

      await (monitor as unknown as { monitorContainers: () => Promise<void> }).monitorContainers();

      // Should not call getContainerStats for stopped containers
      expect(mockPortainer.getContainerStats).not.toHaveBeenCalled();

      const metrics = db.prepare('SELECT * FROM container_metrics').all();
      expect(metrics).toHaveLength(0);
    });

    it('should handle Portainer API errors gracefully', async () => {
      mockPortainer.getContainers.mockRejectedValueOnce(new Error('Connection refused'));

      // Should not throw
      await expect(
        (monitor as unknown as { monitorContainers: () => Promise<void> }).monitorContainers(),
      ).resolves.not.toThrow();
    });
  });

  describe('Alert Generation', () => {
    it('should create alert for high CPU usage', async () => {
      mockPortainer.getContainers.mockResolvedValueOnce([
        {
          id: 'container-789',
          name: 'cpu-intensive-app',
          image: 'my-app:latest',
          imageTag: 'latest',
          state: 'running',
          status: 'Up 1 hour',
          created: new Date('2024-01-01'),
          ports: [],
          labels: {},
          isArrApp: false,
          isPlex: false,
          isCritical: true,
        },
      ]);

      mockPortainer.getContainerStats.mockResolvedValueOnce({
        cpu: { percentage: 95.5, cores: 4 },
        memory: { used: 536870912, limit: 2147483648, percentage: 25 },
        network: { rx: 11010048, tx: 5505024 },
        io: { read: 500000, write: 250000 },
      });

      await (monitor as unknown as { monitorContainers: () => Promise<void> }).monitorContainers();

      const alerts = db.prepare('SELECT * FROM alerts WHERE type = ?').all('container_cpu');

      expect(alerts.length).toBeGreaterThan(0);
      expect((alerts[0] as { severity: string }).severity).toBe('warning');
      expect((alerts[0] as { message: string }).message).toContain('cpu-intensive-app');
    });

    it('should create alert for high memory usage', async () => {
      mockPortainer.getContainers.mockResolvedValueOnce([
        {
          id: 'container-abc',
          name: 'memory-hungry-app',
          image: 'memory-app:latest',
          imageTag: 'latest',
          state: 'running',
          status: 'Up 2 hours',
          created: new Date('2024-01-01'),
          ports: [],
          labels: {},
          isArrApp: false,
          isPlex: false,
          isCritical: false,
        },
      ]);

      mockPortainer.getContainerStats.mockResolvedValueOnce({
        cpu: { percentage: 10.0, cores: 4 },
        memory: { used: 3984588390, limit: 4294967296, percentage: 92.8 },
        network: { rx: 20971520, tx: 10485760 },
        io: { read: 1000000, write: 500000 },
      });

      await (monitor as unknown as { monitorContainers: () => Promise<void> }).monitorContainers();

      const alerts = db.prepare('SELECT * FROM alerts WHERE type = ?').all('container_memory');

      expect(alerts.length).toBeGreaterThan(0);
      expect((alerts[0] as { severity: string }).severity).toBe('warning');
      expect((alerts[0] as { message: string }).message).toContain('memory-hungry-app');
    });
  });

  describe('WebSocket Events', () => {
    it('should emit container stats via Socket.IO', async () => {
      const emitSpy = jest.fn();
      const toSpy = jest.spyOn(io, 'to').mockReturnValue({ emit: emitSpy } as never);

      mockPortainer.getContainers.mockResolvedValueOnce([
        {
          id: 'container-def',
          name: 'test-app',
          image: 'test:latest',
          imageTag: 'latest',
          state: 'running',
          status: 'Up 30 minutes',
          created: new Date('2024-01-01'),
          ports: [],
          labels: {},
          isArrApp: false,
          isPlex: false,
          isCritical: false,
        },
      ]);

      mockPortainer.getContainerStats.mockResolvedValueOnce({
        cpu: { percentage: 25.0, cores: 4 },
        memory: { used: 536870912, limit: 1073741824, percentage: 50 },
        network: { rx: 5242880, tx: 2621440 },
        io: { read: 100000, write: 50000 },
      });

      await (monitor as unknown as { monitorContainers: () => Promise<void> }).monitorContainers();

      expect(toSpy).toHaveBeenCalledWith('docker');
      expect(emitSpy).toHaveBeenCalled();
    });

    it('should emit container list via Socket.IO', async () => {
      const emitSpy = jest.fn();
      const toSpy = jest.spyOn(io, 'to').mockReturnValue({ emit: emitSpy } as never);

      mockPortainer.getContainers.mockResolvedValueOnce([
        {
          id: 'container-1',
          name: 'app-1',
          image: 'app1:latest',
          imageTag: 'latest',
          state: 'running',
          status: 'Up 1 day',
          created: new Date('2024-01-01'),
          ports: [],
          labels: {},
          isArrApp: false,
          isPlex: false,
          isCritical: false,
        },
        {
          id: 'container-2',
          name: 'app-2',
          image: 'app2:latest',
          imageTag: 'latest',
          state: 'running',
          status: 'Up 2 days',
          created: new Date('2024-01-01'),
          ports: [],
          labels: {},
          isArrApp: false,
          isPlex: false,
          isCritical: false,
        },
      ]);

      mockPortainer.getContainerStats
        .mockResolvedValueOnce({
          cpu: { percentage: 10.0, cores: 4 },
          memory: { used: 268435456, limit: 536870912, percentage: 50 },
          network: { rx: 1048576, tx: 524288 },
          io: { read: 50000, write: 25000 },
        })
        .mockResolvedValueOnce({
          cpu: { percentage: 20.0, cores: 4 },
          memory: { used: 536870912, limit: 1073741824, percentage: 50 },
          network: { rx: 2097152, tx: 1048576 },
          io: { read: 100000, write: 50000 },
        });

      await (monitor as unknown as { monitorContainers: () => Promise<void> }).monitorContainers();

      expect(toSpy).toHaveBeenCalledWith('docker');
      expect(emitSpy).toHaveBeenCalledWith(
        'docker:containers',
        expect.arrayContaining([
          expect.objectContaining({ name: 'app-1' }),
          expect.objectContaining({ name: 'app-2' }),
        ]),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle container stats fetch errors gracefully', async () => {
      mockPortainer.getContainers.mockResolvedValueOnce([
        {
          id: 'container-error',
          name: 'problematic-app',
          image: 'problem:latest',
          imageTag: 'latest',
          state: 'running',
          status: 'Up 1 hour',
          created: new Date('2024-01-01'),
          ports: [],
          labels: {},
          isArrApp: false,
          isPlex: false,
          isCritical: false,
        },
      ]);

      mockPortainer.getContainerStats.mockRejectedValueOnce(new Error('Stats not available'));

      // Should not throw, should continue
      await expect(
        (monitor as unknown as { monitorContainers: () => Promise<void> }).monitorContainers(),
      ).resolves.not.toThrow();

      // No metrics should be stored for this container
      const metrics = db
        .prepare('SELECT * FROM container_metrics WHERE container_name = ?')
        .all('problematic-app');
      expect(metrics).toHaveLength(0);
    });
  });

  describe('Lifecycle Management', () => {
    it('should start and stop monitoring', () => {
      // eslint-disable-next-line no-undef
      const interval = (monitor as unknown as { interval: NodeJS.Timeout | null }).interval;

      // Should be null before start
      expect(interval).toBeNull();

      // Start monitoring
      monitor.start();

      // eslint-disable-next-line no-undef
      const intervalAfterStart = (monitor as unknown as { interval: NodeJS.Timeout | null })
        .interval;
      expect(intervalAfterStart).not.toBeNull();

      // Stop monitoring
      monitor.stop();

      const intervalAfterStop = (monitor as unknown as { interval: NodeJS.Timeout | null }).interval;
      // eslint-disable-next-line no-undef
      expect(intervalAfterStop).toBeNull();
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { TrueNASMonitor } from '../../../src/services/monitoring/truenas-monitor.js';
import type { TrueNASClient } from '../../../src/integrations/truenas/client.js';

describe('TrueNASMonitor Integration', () => {
  let db: Database.Database;
  let io: SocketIOServer;
  let httpServer: ReturnType<typeof createServer>;
  let monitor: TrueNASMonitor;
  let mockClient: jest.Mocked<TrueNASClient>;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Run schema - matching production schema
    db.exec(`
      CREATE TABLE metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        cpu_percent REAL,
        cpu_temp REAL,
        ram_used_gb REAL,
        ram_total_gb REAL,
        ram_percent REAL,
        network_rx_mbps REAL,
        network_tx_mbps REAL,
        arc_size_gb REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE pool_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        pool_name TEXT NOT NULL,
        pool_type TEXT,
        status TEXT,
        health TEXT,
        used_bytes INTEGER,
        total_bytes INTEGER,
        percent_used REAL,
        scrub_errors INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE smart_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        disk_name TEXT NOT NULL,
        model TEXT,
        temperature REAL,
        power_on_hours INTEGER,
        reallocated_sectors INTEGER,
        pending_sectors INTEGER,
        health_status TEXT,
        load_cycle_count INTEGER,
        spin_retry_count INTEGER,
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

      CREATE TABLE disk_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        disk_name TEXT NOT NULL,
        prediction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        failure_probability REAL,
        days_until_failure INTEGER,
        confidence REAL,
        contributing_factors TEXT,
        recommended_action TEXT
      );
    `);

    // Create mock Socket.IO server
    httpServer = createServer();
    io = new SocketIOServer(httpServer);

    // Create mock TrueNAS client with all required methods
    mockClient = {
      getPools: jest.fn<typeof mockClient.getPools>(),
      getSystemInfo: jest.fn<typeof mockClient.getSystemInfo>(),
      getSystemStats: jest.fn<typeof mockClient.getSystemStats>(),
      getDisks: jest.fn<typeof mockClient.getDisks>(),
      getSmartData: jest.fn<typeof mockClient.getSmartData>(),
    } as unknown as jest.Mocked<TrueNASClient>;

    // Initialize monitor
    monitor = new TrueNASMonitor({
      client: mockClient,
      db,
      io,
      intervals: {
        system: 30000,
        storage: 60000,
        smart: 120000,
      },
    });
  });

  afterEach(() => {
    monitor.stop();
    db.close();
    io.close();
    httpServer.close();
  });

  describe('Pool Monitoring', () => {
    it('should successfully monitor pools and update database', async () => {
      // Mock API response
      mockClient.getPools.mockResolvedValueOnce([
        {
          name: 'tank',
          status: 'ONLINE',
          health: 'HEALTHY',
          type: 'personal',
          capacity: {
            used: 500000000000,
            available: 500000000000,
            total: 1000000000000,
            percent: 50,
          },
          scrubErrors: 0,
          topology: {},
          lastScrub: null,
          encryption: false,
          autotrim: false,
        },
      ]);

      // Trigger monitoring cycle
      await (monitor as unknown as { monitorPools: () => Promise<void> }).monitorPools();

      // Verify database was updated
      const pools = db.prepare('SELECT * FROM pool_metrics WHERE pool_name = ?').all('tank');
      expect(pools).toHaveLength(1);
      expect(pools[0]).toMatchObject({
        pool_name: 'tank',
        status: 'ONLINE',
        health: 'HEALTHY',
        pool_type: 'personal',
        percent_used: 50,
      });
    });

    it('should create alert when pool capacity exceeds threshold', async () => {
      mockClient.getPools.mockResolvedValueOnce([
        {
          name: 'tank',
          status: 'ONLINE',
          health: 'HEALTHY',
          type: 'personal',
          capacity: {
            used: 850000000000,
            available: 150000000000,
            total: 1000000000000,
            percent: 85,
          },
          scrubErrors: 0,
          topology: {},
          lastScrub: null,
          encryption: false,
          autotrim: false,
        },
      ]);

      await (monitor as unknown as { monitorPools: () => Promise<void> }).monitorPools();

      const alerts = db
        .prepare('SELECT * FROM alerts WHERE type = ? AND severity = ?')
        .all('pool_capacity', 'warning');

      expect(alerts.length).toBeGreaterThan(0);
      expect((alerts[0] as { message: string }).message).toContain('85.0%');
      expect((alerts[0] as { message: string }).message).toContain('tank');
    });

    it('should create critical alert when pool health is degraded', async () => {
      mockClient.getPools.mockResolvedValueOnce([
        {
          name: 'tank',
          status: 'DEGRADED',
          health: 'CRITICAL',
          type: 'personal',
          capacity: {
            used: 500000000000,
            available: 500000000000,
            total: 1000000000000,
            percent: 50,
          },
          scrubErrors: 5,
          topology: {},
          lastScrub: null,
          encryption: false,
          autotrim: false,
        },
      ]);

      await (monitor as unknown as { monitorPools: () => Promise<void> }).monitorPools();

      const alerts = db
        .prepare('SELECT * FROM alerts WHERE type = ? AND severity = ?')
        .all('pool_health', 'critical');

      expect(alerts.length).toBeGreaterThan(0);
      expect((alerts[0] as { message: string }).message).toContain('CRITICAL');
      expect((alerts[0] as { message: string }).message).toContain('tank');
    });

    it('should handle TrueNAS API errors gracefully', async () => {
      mockClient.getPools.mockRejectedValueOnce(new Error('Connection timeout'));

      // Should not throw
      await expect(
        (monitor as unknown as { monitorPools: () => Promise<void> }).monitorPools(),
      ).resolves.not.toThrow();
    });
  });

  describe('System Monitoring', () => {
    it('should store system metrics in database', async () => {
      mockClient.getSystemStats.mockResolvedValueOnce({
        cpu: {
          usage: 45.5,
          temperature: 55,
          perCore: [40, 45, 50, 46],
        },
        memory: {
          used: 32,
          available: 32,
          percentage: 50,
          arc: 16 * 1024 * 1024 * 1024,
        },
        network: {
          rxRate: 10.5,
          txRate: 5.2,
        },
        loadAverage: [1.5, 1.3, 1.2],
      });

      await (monitor as unknown as { monitorSystem: () => Promise<void> }).monitorSystem();

      const metrics = db.prepare('SELECT * FROM metrics ORDER BY id DESC LIMIT 1').get();
      expect(metrics).toBeDefined();
      expect(metrics).toMatchObject({
        cpu_percent: 45.5,
        cpu_temp: 55,
        ram_percent: 50,
        network_rx_mbps: 10.5,
        network_tx_mbps: 5.2,
      });
    });

    it('should create alert for high CPU usage', async () => {
      mockClient.getSystemStats.mockResolvedValueOnce({
        cpu: {
          usage: 95,
          temperature: 65,
          perCore: [93, 97, 94, 96],
        },
        memory: {
          used: 32,
          available: 32,
          percentage: 50,
          arc: 16 * 1024 * 1024 * 1024,
        },
        network: {
          rxRate: 10.5,
          txRate: 5.2,
        },
        loadAverage: [4.5, 4.3, 4.2],
      });

      await (monitor as unknown as { monitorSystem: () => Promise<void> }).monitorSystem();

      const alerts = db
        .prepare('SELECT * FROM alerts WHERE type = ? AND severity = ?')
        .all('cpu_usage', 'warning');

      expect(alerts.length).toBeGreaterThan(0);
      expect((alerts[0] as { message: string }).message).toContain('95.0%');
    });

    it('should create critical alert for high CPU temperature', async () => {
      mockClient.getSystemStats.mockResolvedValueOnce({
        cpu: {
          usage: 50,
          temperature: 85,
          perCore: [48, 52, 50, 50],
        },
        memory: {
          used: 32,
          available: 32,
          percentage: 50,
          arc: 16 * 1024 * 1024 * 1024,
        },
        network: {
          rxRate: 10.5,
          txRate: 5.2,
        },
        loadAverage: [2.5, 2.3, 2.2],
      });

      await (monitor as unknown as { monitorSystem: () => Promise<void> }).monitorSystem();

      const alerts = db
        .prepare('SELECT * FROM alerts WHERE type = ? AND severity = ?')
        .all('cpu_temperature', 'critical');

      expect(alerts.length).toBeGreaterThan(0);
      expect((alerts[0] as { message: string }).message).toContain('85°C');
    });
  });

  describe('Disk Health Monitoring', () => {
    it('should store disk SMART data in database', async () => {
      mockClient.getDisks.mockResolvedValueOnce([
        {
          identifier: 'sda-123',
          name: 'sda',
          model: 'ST8000VN004',
          serial: 'WCT123456',
          size: 8000000000000,
          type: 'HDD',
          temperature: 38,
          smartStatus: 'PASSED',
          isNVMe: false,
          isIronWolf: true,
          isCritical: true,
        },
      ]);

      mockClient.getSmartData.mockResolvedValueOnce({
        diskName: 'sda',
        temperature: 38,
        powerOnHours: 12345,
        reallocatedSectors: 0,
        pendingSectors: 0,
        healthStatus: 'PASSED',
      });

      await (monitor as unknown as { monitorSmart: () => Promise<void> }).monitorSmart();

      const disks = db.prepare('SELECT * FROM smart_metrics WHERE disk_name = ?').all('sda');
      expect(disks).toHaveLength(1);
      expect(disks[0]).toMatchObject({
        disk_name: 'sda',
        model: 'ST8000VN004',
        temperature: 38,
        power_on_hours: 12345,
        reallocated_sectors: 0,
        pending_sectors: 0,
        health_status: 'PASSED',
      });
    });

    it('should create critical alert for reallocated sectors', async () => {
      mockClient.getDisks.mockResolvedValueOnce([
        {
          identifier: 'sdb-456',
          name: 'sdb',
          model: 'ST8000VN004',
          serial: 'WCT654321',
          size: 8000000000000,
          type: 'HDD',
          temperature: 40,
          smartStatus: 'PASSED',
          isNVMe: false,
          isIronWolf: true,
          isCritical: true,
        },
      ]);

      mockClient.getSmartData.mockResolvedValueOnce({
        diskName: 'sdb',
        temperature: 40,
        powerOnHours: 15000,
        reallocatedSectors: 5,
        pendingSectors: 0,
        healthStatus: 'PASSED',
      });

      await (monitor as unknown as { monitorSmart: () => Promise<void> }).monitorSmart();

      const alerts = db
        .prepare('SELECT * FROM alerts WHERE type = ? AND severity = ?')
        .all('smart_reallocated_sectors', 'critical');

      expect(alerts.length).toBeGreaterThan(0);
      expect((alerts[0] as { message: string }).message).toContain('sdb');
      expect((alerts[0] as { message: string }).message).toContain('5 reallocated sectors');
    });

    it('should create warning alert for high disk temperature', async () => {
      mockClient.getDisks.mockResolvedValueOnce([
        {
          identifier: 'sdc-789',
          name: 'sdc',
          model: 'ST8000VN004',
          serial: 'WCT789012',
          size: 8000000000000,
          type: 'HDD',
          temperature: 58,
          smartStatus: 'PASSED',
          isNVMe: false,
          isIronWolf: true,
          isCritical: true,
        },
      ]);

      mockClient.getSmartData.mockResolvedValueOnce({
        diskName: 'sdc',
        temperature: 58,
        powerOnHours: 10000,
        reallocatedSectors: 0,
        pendingSectors: 0,
        healthStatus: 'PASSED',
      });

      await (monitor as unknown as { monitorSmart: () => Promise<void> }).monitorSmart();

      const alerts = db
        .prepare('SELECT * FROM alerts WHERE type = ? AND severity = ?')
        .all('smart_temperature', 'warning');

      expect(alerts.length).toBeGreaterThan(0);
      expect((alerts[0] as { message: string }).message).toContain('58°C');
      expect((alerts[0] as { message: string }).message).toContain('sdc');
    });

    it('should skip non-critical disks', async () => {
      mockClient.getDisks.mockResolvedValueOnce([
        {
          identifier: 'nvme0n1-abc',
          name: 'nvme0n1',
          model: 'Samsung SSD 980 PRO',
          serial: 'S5P2NG0R123456',
          size: 1000000000000,
          type: 'NVMe',
          temperature: 45,
          smartStatus: 'PASSED',
          isNVMe: true,
          isIronWolf: false,
          isCritical: false,
        },
      ]);

      await (monitor as unknown as { monitorSmart: () => Promise<void> }).monitorSmart();

      // Should not call getSmartData for non-critical disks
      expect(mockClient.getSmartData).not.toHaveBeenCalled();

      const disks = db.prepare('SELECT * FROM smart_metrics').all();
      expect(disks).toHaveLength(0);
    });
  });

  describe('WebSocket Events', () => {
    it('should emit pool status updates via Socket.IO', async () => {
      const emitSpy = jest.fn();
      const toSpy = jest.spyOn(io, 'to').mockReturnValue({ emit: emitSpy } as never);

      mockClient.getPools.mockResolvedValueOnce([
        {
          name: 'tank',
          status: 'ONLINE',
          health: 'HEALTHY',
          type: 'personal',
          capacity: {
            used: 500000000000,
            available: 500000000000,
            total: 1000000000000,
            percent: 50,
          },
          scrubErrors: 0,
          topology: {},
          lastScrub: null,
          encryption: false,
          autotrim: false,
        },
      ]);

      await (monitor as unknown as { monitorPools: () => Promise<void> }).monitorPools();

      expect(toSpy).toHaveBeenCalledWith('storage');
      expect(emitSpy).toHaveBeenCalled();
    });

    it('should emit system stats updates via Socket.IO', async () => {
      const emitSpy = jest.fn();
      const toSpy = jest.spyOn(io, 'to').mockReturnValue({ emit: emitSpy } as never);

      mockClient.getSystemStats.mockResolvedValueOnce({
        cpu: {
          usage: 45.5,
          temperature: 55,
          perCore: [40, 45, 50, 46],
        },
        memory: {
          used: 32,
          available: 32,
          percentage: 50,
          arc: 16 * 1024 * 1024 * 1024,
        },
        network: {
          rxRate: 10.5,
          txRate: 5.2,
        },
        loadAverage: [1.5, 1.3, 1.2],
      });

      await (monitor as unknown as { monitorSystem: () => Promise<void> }).monitorSystem();

      expect(toSpy).toHaveBeenCalledWith('system');
      expect(emitSpy).toHaveBeenCalled();
    });
  });

  describe('Alert Creation', () => {
    it('should create alerts for critical pool conditions', async () => {
      mockClient.getPools.mockResolvedValueOnce([
        {
          name: 'tank',
          status: 'DEGRADED',
          health: 'CRITICAL',
          type: 'personal',
          capacity: {
            used: 500000000000,
            available: 500000000000,
            total: 1000000000000,
            percent: 50,
          },
          scrubErrors: 0,
          topology: {},
          lastScrub: null,
          encryption: false,
          autotrim: false,
        },
      ]);

      await (monitor as unknown as { monitorPools: () => Promise<void> }).monitorPools();

      const alerts = db.prepare('SELECT * FROM alerts WHERE type = ?').all('pool_health');
      expect(alerts.length).toBeGreaterThan(0);
      expect((alerts[0] as { severity: string }).severity).toBe('critical');
    });
  });

  describe('Lifecycle Management', () => {
    it('should start and stop monitoring intervals', () => {
      // eslint-disable-next-line no-undef
      const intervals = (monitor as unknown as { intervals: Map<string, NodeJS.Timeout> })
        .intervals;

      // Start monitoring
      monitor.start();

      // Should have 3 intervals registered
      expect(intervals.size).toBe(3);
      expect(intervals.has('system')).toBe(true);
      expect(intervals.has('pools')).toBe(true);
      expect(intervals.has('smart')).toBe(true);

      // Stop monitoring
      monitor.stop();

      // Should clear all intervals
      expect(intervals.size).toBe(0);
    });
  });
});

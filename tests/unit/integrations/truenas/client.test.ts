/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-undef */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TrueNASClient } from '../../../../src/integrations/truenas/client.js';

describe('TrueNASClient', () => {
  let client: TrueNASClient;
  let originalFetch: typeof global.fetch;
  let originalSetTimeout: typeof global.setTimeout;
  let originalClearTimeout: typeof global.clearTimeout;

  beforeEach(() => {
    // Save original fetch and timers
    originalFetch = global.fetch;
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;

    // Create client instance
    client = new TrueNASClient({
      host: 'truenas.local',
      apiKey: 'test-api-key',
      timeout: 5000,
    });
  });

  afterEach(() => {
    // Restore original fetch and timers
    global.fetch = originalFetch;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct baseUrl', () => {
      const testClient = new TrueNASClient({
        host: 'nas.example.com',
        apiKey: 'my-key',
      });

      expect((testClient as any).baseUrl).toBe('http://nas.example.com/api/v2.0');
    });

    it('should set correct headers with API key', () => {
      const testClient = new TrueNASClient({
        host: 'truenas.local',
        apiKey: 'secret-key',
      });

      expect((testClient as any).headers).toEqual({
        Authorization: 'Bearer secret-key',
        'Content-Type': 'application/json',
      });
    });

    it('should use default timeout of 5000ms', () => {
      const testClient = new TrueNASClient({
        host: 'truenas.local',
        apiKey: 'key',
      });

      expect((testClient as any).timeout).toBe(5000);
    });

    it('should use custom timeout when provided', () => {
      const testClient = new TrueNASClient({
        host: 'truenas.local',
        apiKey: 'key',
        timeout: 10000,
      });

      expect((testClient as any).timeout).toBe(10000);
    });
  });

  describe('getSystemInfo', () => {
    it('should retrieve and transform system information', async () => {
      const mockResponse = {
        hostname: 'truenas-server',
        version: 'TrueNAS-SCALE-22.12.3',
        uptime_seconds: 86400,
        cores: 6,
        boottime: 1699000000,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response) as any;

      const info = await client.getSystemInfo();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://truenas.local/api/v2.0/system/info',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          },
        }),
      );

      expect(info).toEqual({
        hostname: 'truenas-server',
        version: 'TrueNAS-SCALE-22.12.3',
        uptime: 86400,
        cpuModel: 'Intel Core i5-12400',
        cpuCores: 6,
        ramTotal: 64,
        bootTime: new Date(1699000000 * 1000),
      });
    });

    it('should throw error when API request fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response) as any;

      await expect(client.getSystemInfo()).rejects.toThrow(
        'TrueNAS API error: 500 Internal Server Error',
      );
    });
  });

  describe('getPools', () => {
    it('should retrieve and transform pool list', async () => {
      const mockPools = [
        {
          name: 'media-pool',
          status: 'ONLINE',
          healthy: true,
          size: 8000000000000,
          free: 2000000000000,
          topology: { data: [] },
          scan: {
            end_time: 1699000000,
            errors: 0,
          },
          encrypt: 1,
          autotrim: { value: 'on' },
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPools,
      } as Response) as any;

      const pools = await client.getPools();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://truenas.local/api/v2.0/pool',
        expect.any(Object),
      );

      expect(pools).toHaveLength(1);
      expect(pools[0]).toEqual({
        name: 'media-pool',
        type: 'media',
        status: 'ONLINE',
        health: 'HEALTHY',
        capacity: {
          used: 8000000000000,
          available: 2000000000000,
          total: 10000000000000,
          percent: 80,
        },
        topology: { data: [] },
        lastScrub: new Date(1699000000 * 1000),
        scrubErrors: 0,
        encryption: true,
        autotrim: true,
      });
    });

    it('should identify pool types correctly', async () => {
      const mockPools = [
        {
          name: 'boot-pool',
          status: 'ONLINE',
          healthy: true,
          size: 100,
          free: 50,
          topology: {},
          encrypt: 0,
        },
        {
          name: 'apps-pool',
          status: 'ONLINE',
          healthy: true,
          size: 200,
          free: 100,
          topology: {},
          encrypt: 0,
        },
        {
          name: 'personal-pool',
          status: 'ONLINE',
          healthy: true,
          size: 300,
          free: 150,
          topology: {},
          encrypt: 0,
        },
        {
          name: 'unknown-pool',
          status: 'ONLINE',
          healthy: true,
          size: 400,
          free: 200,
          topology: {},
          encrypt: 0,
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPools,
      } as Response) as any;

      const pools = await client.getPools();

      expect(pools[0]?.type).toBe('boot');
      expect(pools[1]?.type).toBe('apps');
      expect(pools[2]?.type).toBe('personal');
      expect(pools[3]?.type).toBe('unknown');
    });

    it('should mark unhealthy pools as WARNING', async () => {
      const mockPools = [
        {
          name: 'degraded-pool',
          status: 'DEGRADED',
          healthy: false,
          size: 1000,
          free: 500,
          topology: {},
          encrypt: 0,
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPools,
      } as Response) as any;

      const pools = await client.getPools();

      expect(pools[0]?.health).toBe('WARNING');
    });

    it('should handle pools without scan data', async () => {
      const mockPools = [
        {
          name: 'new-pool',
          status: 'ONLINE',
          healthy: true,
          size: 1000,
          free: 500,
          topology: {},
          encrypt: 0,
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPools,
      } as Response) as any;

      const pools = await client.getPools();

      expect(pools[0]?.lastScrub).toBeNull();
      expect(pools[0]?.scrubErrors).toBe(0);
    });

    it('should handle pools without autotrim', async () => {
      const mockPools = [
        {
          name: 'legacy-pool',
          status: 'ONLINE',
          healthy: true,
          size: 1000,
          free: 500,
          topology: {},
          encrypt: 0,
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPools,
      } as Response) as any;

      const pools = await client.getPools();

      expect(pools[0]?.autotrim).toBe(false);
    });

    it('should calculate capacity percentage correctly', async () => {
      const mockPools = [
        {
          name: 'test-pool',
          status: 'ONLINE',
          healthy: true,
          size: 7500,
          free: 2500,
          topology: {},
          encrypt: 0,
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPools,
      } as Response) as any;

      const pools = await client.getPools();

      expect(pools[0]?.capacity.percent).toBe(75);
    });
  });

  describe('getDisks', () => {
    it('should retrieve and transform disk list', async () => {
      const mockDisks = [
        {
          identifier: 'nvme0',
          name: 'nvme0n1',
          model: 'WD Black SN850X',
          serial: 'WD123456',
          size: 1000000000000,
          type: 'SSD',
          temperature: 45,
          smarttestresults: 'PASSED',
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockDisks,
      } as Response) as any;

      const disks = await client.getDisks();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://truenas.local/api/v2.0/disk',
        expect.any(Object),
      );

      expect(disks).toHaveLength(1);
      expect(disks[0]).toEqual({
        identifier: 'nvme0',
        name: 'nvme0n1',
        model: 'WD Black SN850X',
        serial: 'WD123456',
        size: 1000000000000,
        type: 'NVMe',
        temperature: 45,
        smartStatus: 'PASSED',
        isNVMe: true,
        isIronWolf: false,
        isCritical: false,
      });
    });

    it('should identify disk types correctly', async () => {
      const mockDisks = [
        {
          identifier: 'nvme0',
          name: 'nvme0n1',
          model: 'Samsung NVMe SSD',
          serial: 'S1',
          size: 1000,
          type: 'SSD',
          temperature: 40,
          smarttestresults: 'PASSED',
        },
        {
          identifier: 'sda',
          name: 'sda',
          model: 'Samsung 870 EVO',
          serial: 'S2',
          size: 1000,
          type: 'SSD',
          temperature: 35,
          smarttestresults: 'PASSED',
        },
        {
          identifier: 'sdb',
          name: 'sdb',
          model: 'Seagate IronWolf',
          serial: 'S3',
          size: 4000,
          type: 'HDD',
          temperature: 30,
          smarttestresults: 'PASSED',
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockDisks,
      } as Response) as any;

      const disks = await client.getDisks();

      expect(disks[0]?.type).toBe('NVMe');
      expect(disks[1]?.type).toBe('SSD');
      expect(disks[2]?.type).toBe('HDD');
    });

    it('should identify IronWolf disks', async () => {
      const mockDisks = [
        {
          identifier: 'sda',
          name: 'sda',
          model: 'Seagate IronWolf Pro',
          serial: 'S1',
          size: 8000,
          type: 'HDD',
          temperature: 32,
          smarttestresults: 'PASSED',
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockDisks,
      } as Response) as any;

      const disks = await client.getDisks();

      expect(disks[0]?.isIronWolf).toBe(true);
    });

    it('should identify critical ST4000VN008 disks', async () => {
      const mockDisks = [
        {
          identifier: 'sda',
          name: 'sda',
          model: 'ST4000VN008-2DR166',
          serial: 'S1',
          size: 4000,
          type: 'HDD',
          temperature: 38,
          smarttestresults: 'PASSED',
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockDisks,
      } as Response) as any;

      const disks = await client.getDisks();

      expect(disks[0]?.isCritical).toBe(true);
    });
  });

  describe('getSmartData', () => {
    it('should retrieve SMART data for disk', async () => {
      const mockSmart = {
        temperature: { current: 42 },
        power_on_time: { hours: 5000 },
        reallocated_sector_count: { raw_value: 0 },
        current_pending_sector: { raw_value: 0 },
        smart_status: { passed: true },
        load_cycle_count: { raw_value: 1234 },
        spin_retry_count: { raw_value: 0 },
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockSmart,
      } as Response) as any;

      const smart = await client.getSmartData('sda');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://truenas.local/api/v2.0/disk/smart/test/results?disk=sda',
        expect.any(Object),
      );

      expect(smart).toEqual({
        diskName: 'sda',
        temperature: 42,
        powerOnHours: 5000,
        reallocatedSectors: 0,
        pendingSectors: 0,
        healthStatus: 'PASSED',
        loadCycleCount: 1234,
        spinRetryCount: 0,
      });
    });

    it('should handle SMART test failure', async () => {
      const mockSmart = {
        temperature: { current: 55 },
        power_on_time: { hours: 10000 },
        reallocated_sector_count: { raw_value: 5 },
        current_pending_sector: { raw_value: 2 },
        smart_status: { passed: false },
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockSmart,
      } as Response) as any;

      const smart = await client.getSmartData('sda');

      expect(smart?.healthStatus).toBe('FAILED');
      expect(smart?.reallocatedSectors).toBe(5);
      expect(smart?.pendingSectors).toBe(2);
    });

    it('should handle missing SMART attributes', async () => {
      const mockSmart = {};

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockSmart,
      } as Response) as any;

      const smart = await client.getSmartData('sda');

      expect(smart).toEqual({
        diskName: 'sda',
        temperature: 0,
        powerOnHours: 0,
        reallocatedSectors: 0,
        pendingSectors: 0,
        healthStatus: 'FAILED',
        loadCycleCount: undefined,
        spinRetryCount: undefined,
      });
    });

    it('should return null on API error', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response) as any;

      const smart = await client.getSmartData('invalid-disk');

      expect(smart).toBeNull();
    });
  });

  describe('getSystemStats', () => {
    it('should retrieve and transform system stats', async () => {
      const mockStats = {
        cpu: { average: 45 },
        cputemp: { average: 65 },
        memory: {
          used_percentage: 75,
          arc_size: 32,
          used: 48,
        },
        interface: {
          rx_rate: 1000000,
          tx_rate: 500000,
        },
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      } as Response) as any;

      const stats = await client.getSystemStats();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://truenas.local/api/v2.0/reporting/get_data',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('cpu'),
        }),
      );

      expect(stats).toEqual({
        cpu: {
          usage: 45,
          temperature: 65,
          perCore: [],
        },
        memory: {
          used: 48,
          available: 16,
          arc: 32,
          percentage: 75,
        },
        network: {
          rxRate: 1000000,
          txRate: 500000,
        },
        loadAverage: [0, 0, 0],
      });
    });

    it('should handle missing stats gracefully', async () => {
      const mockStats = {};

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      } as Response) as any;

      const stats = await client.getSystemStats();

      expect(stats).toEqual({
        cpu: {
          usage: 0,
          temperature: 0,
          perCore: [],
        },
        memory: {
          used: 0,
          available: 64,
          arc: 0,
          percentage: 0,
        },
        network: {
          rxRate: 0,
          txRate: 0,
        },
        loadAverage: [0, 0, 0],
      });
    });

    it('should calculate memory percentage correctly', async () => {
      const mockStats = {
        memory: {
          used: 32,
        },
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      } as Response) as any;

      const stats = await client.getSystemStats();

      expect(stats.memory.percentage).toBe(50);
    });
  });

  describe('Request timeout', () => {
    it('should abort request after timeout', async () => {
      const abortController = {
        abort: jest.fn(),
        signal: { aborted: false } as AbortSignal,
      };

      let timeoutCallback: (() => void) | null = null;

      // Mock setTimeout to capture the callback
      global.setTimeout = jest.fn((callback: () => void, timeout: number) => {
        timeoutCallback = callback;
        return 123 as any;
      }) as any;

      global.clearTimeout = jest.fn() as any;

      // Mock fetch to simulate a long request
      global.fetch = jest.fn<typeof fetch>().mockImplementation(async () => {
        // Simulate timeout occurring
        if (timeoutCallback) {
          timeoutCallback();
        }
        throw new Error('Aborted');
      }) as any;

      await expect(client.getSystemInfo()).rejects.toThrow();

      expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    });
  });
});

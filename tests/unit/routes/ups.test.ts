/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { upsRoutes } from '../../../src/routes/ups.js';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('UPS Routes', () => {
  let app: FastifyInstance;
  let mockNUTClient: any;
  let mockUPSMonitor: any;
  let mockDb: any;

  beforeEach(async () => {
    app = Fastify();

    // Create mock NUT client
    mockNUTClient = {
      getStatus: jest.fn(),
      getVariables: jest.fn(),
      listDevices: jest.fn(),
      isAvailable: jest.fn(),
    };

    // Create mock UPS monitor
    mockUPSMonitor = {
      getMonitoringStatus: jest.fn(),
    };

    // Create mock database
    mockDb = {
      prepare: jest.fn(),
    };

    // Decorate Fastify instance
    (app as any).db = mockDb;
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /api/ups/status', () => {
    beforeEach(() => {
      upsRoutes(app, { client: mockNUTClient });
    });

    it('should return UPS status', async () => {
      const mockStatus = {
        status: 'OL',
        onBattery: false,
        batteryCharge: 100,
        batteryRuntime: 1800,
        inputVoltage: 120.5,
        outputVoltage: 120.0,
        load: 25,
      };

      mockNUTClient.getStatus.mockResolvedValue(mockStatus);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockStatus);
    });
  });

  describe('GET /api/ups/variables', () => {
    beforeEach(() => {
      upsRoutes(app, { client: mockNUTClient });
    });

    it('should return UPS variables', async () => {
      const mockVariables = {
        'battery.charge': '100',
        'battery.runtime': '1800',
        'input.voltage': '120.5',
        'output.voltage': '120.0',
        'ups.load': '25',
      };

      mockNUTClient.getVariables.mockResolvedValue(mockVariables);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/variables',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockVariables);
    });
  });

  describe('GET /api/ups/devices', () => {
    beforeEach(() => {
      upsRoutes(app, { client: mockNUTClient });
    });

    it('should return list of UPS devices', async () => {
      const mockDevices = [
        { name: 'ups1', description: 'Main UPS' },
        { name: 'ups2', description: 'Backup UPS' },
      ];

      mockNUTClient.listDevices.mockResolvedValue(mockDevices);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/devices',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockDevices);
    });
  });

  describe('GET /api/ups/availability', () => {
    beforeEach(() => {
      upsRoutes(app, { client: mockNUTClient });
    });

    it('should return UPS availability as true', async () => {
      mockNUTClient.isAvailable.mockResolvedValue(true);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/availability',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.available).toBe(true);
    });

    it('should return UPS availability as false', async () => {
      mockNUTClient.isAvailable.mockResolvedValue(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/availability',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.available).toBe(false);
    });
  });

  describe('GET /api/ups/metrics', () => {
    beforeEach(() => {
      upsRoutes(app, { client: mockNUTClient });
    });

    it('should return UPS metrics with default 24 hours', async () => {
      const mockMetrics = [
        {
          id: 1,
          timestamp: '2024-01-01T12:00:00Z',
          battery_charge: 100,
          battery_runtime: 1800,
        },
        {
          id: 2,
          timestamp: '2024-01-01T11:30:00Z',
          battery_charge: 98,
          battery_runtime: 1750,
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockMetrics),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/metrics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockMetrics);
      expect(body.meta.hours).toBe(24);
      expect(body.meta.count).toBe(2);
    });

    it('should return UPS metrics with custom hours', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([]),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/metrics?hours=48',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.meta.hours).toBe('48'); // Query params are strings
    });

    it('should handle missing database', async () => {
      (app as any).db = undefined;

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/metrics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Database not available');
    });
  });

  describe('GET /api/ups/events', () => {
    beforeEach(() => {
      upsRoutes(app, { client: mockNUTClient });
    });

    it('should return UPS events with default 30 days', async () => {
      const mockEvents = [
        {
          id: 1,
          timestamp: '2024-01-01T10:00:00Z',
          event_type: 'power_loss',
          description: 'Power outage detected',
        },
        {
          id: 2,
          timestamp: '2024-01-01T10:05:00Z',
          event_type: 'power_restored',
          description: 'Power restored',
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockEvents),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/events',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockEvents);
      expect(body.meta.days).toBe(30);
      expect(body.meta.count).toBe(2);
    });

    it('should return UPS events with custom days', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([]),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/events?days=7',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.meta.days).toBe('7');
    });

    it('should handle missing database', async () => {
      (app as any).db = undefined;

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/events',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Database not available');
    });
  });

  describe('GET /api/ups/battery-health', () => {
    beforeEach(() => {
      upsRoutes(app, { client: mockNUTClient });
    });

    it('should return battery health trend', async () => {
      const mockHealthTrend = [
        {
          date: '2024-01-01',
          avg_charge: 98.5,
          min_charge: 95,
          max_charge: 100,
          avg_runtime: 1780,
        },
        {
          date: '2024-01-02',
          avg_charge: 99.2,
          min_charge: 97,
          max_charge: 100,
          avg_runtime: 1795,
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockHealthTrend),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/battery-health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockHealthTrend);
    });

    it('should handle missing database', async () => {
      (app as any).db = undefined;

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/battery-health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Database not available');
    });
  });

  describe('GET /api/ups/statistics', () => {
    beforeEach(() => {
      upsRoutes(app, { client: mockNUTClient });
    });

    it('should return UPS statistics summary', async () => {
      const mockStatus = {
        status: 'OL',
        onBattery: false,
        batteryCharge: 100,
        batteryRuntime: 1800,
      };

      mockNUTClient.getStatus.mockResolvedValue(mockStatus);

      const outagesStmt = { get: jest.fn().mockReturnValue({ count: 3 }) };
      const avgChargeStmt = { get: jest.fn().mockReturnValue({ avg_charge: 98.5 }) };
      const batteryTimeStmt = {
        get: jest.fn().mockReturnValue({ battery_samples: 120, total_samples: 2880 }),
      };

      mockDb.prepare
        .mockReturnValueOnce(outagesStmt)
        .mockReturnValueOnce(avgChargeStmt)
        .mockReturnValueOnce(batteryTimeStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/statistics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.current).toEqual(mockStatus);
      expect(body.data.statistics.outages_last_30_days).toBe(3);
      expect(body.data.statistics.avg_battery_charge_last_7_days).toBe(98.5);
      expect(body.data.statistics.time_on_battery_last_30_days_minutes).toBe(60);
    });

    it('should handle null average charge', async () => {
      mockNUTClient.getStatus.mockResolvedValue({ status: 'OL' });

      const outagesStmt = { get: jest.fn().mockReturnValue({ count: 0 }) };
      const avgChargeStmt = { get: jest.fn().mockReturnValue({ avg_charge: null }) };
      const batteryTimeStmt = {
        get: jest.fn().mockReturnValue({ battery_samples: 0, total_samples: 0 }),
      };

      mockDb.prepare
        .mockReturnValueOnce(outagesStmt)
        .mockReturnValueOnce(avgChargeStmt)
        .mockReturnValueOnce(batteryTimeStmt);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/statistics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.statistics.avg_battery_charge_last_7_days).toBeNull();
      expect(body.data.statistics.time_on_battery_last_30_days_minutes).toBe(0);
    });

    it('should handle missing database', async () => {
      mockNUTClient.getStatus.mockResolvedValue({ status: 'OL' });
      (app as any).db = undefined;

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/statistics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Database not available');
    });
  });

  describe('GET /api/ups/monitor/status', () => {
    it('should return monitor status when monitor is enabled', async () => {
      const mockMonitorStatus = {
        enabled: true,
        lastCheck: '2024-01-01T12:00:00Z',
        status: 'running',
      };

      mockUPSMonitor.getMonitoringStatus.mockReturnValue(mockMonitorStatus);

      upsRoutes(app, { client: mockNUTClient, monitor: mockUPSMonitor });

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/monitor/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockMonitorStatus);
    });

    it('should not register route when monitor is not provided', async () => {
      upsRoutes(app, { client: mockNUTClient });

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/monitor/status',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/ups/health', () => {
    beforeEach(() => {
      upsRoutes(app, { client: mockNUTClient });
    });

    it('should return healthy when UPS is online', async () => {
      mockNUTClient.isAvailable.mockResolvedValue(true);
      mockNUTClient.getStatus.mockResolvedValue({
        status: 'OL',
        onBattery: false,
        batteryCharge: 100,
        batteryRuntime: 1800,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.healthy).toBe(true);
      expect(body.data.status).toBe('OL');
      expect(body.data.onBattery).toBe(false);
    });

    it('should return healthy when UPS is on battery', async () => {
      mockNUTClient.isAvailable.mockResolvedValue(true);
      mockNUTClient.getStatus.mockResolvedValue({
        status: 'OB',
        onBattery: true,
        batteryCharge: 95,
        batteryRuntime: 1500,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.healthy).toBe(true);
      expect(body.data.status).toBe('OB');
    });

    it('should return unhealthy when UPS is not available', async () => {
      mockNUTClient.isAvailable.mockResolvedValue(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ups/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.healthy).toBe(false);
      expect(body.message).toBe('UPS not available');
    });
  });
});

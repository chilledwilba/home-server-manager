/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { exec } from 'node:child_process';

// Mock logger
jest.mock('../../../../src/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock exec from child_process
jest.mock('node:child_process', () => ({
  exec: jest.fn(),
}));

const mockedExec = exec as jest.MockedFunction<typeof exec>;

describe('NUTClient', () => {
  let NUTClient: typeof import('../../../../src/integrations/ups/nut-client.js').NUTClient;
  let client: InstanceType<
    typeof import('../../../../src/integrations/ups/nut-client.js').NUTClient
  >;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Dynamically import after mocks are set up
    const module = await import('../../../../src/integrations/ups/nut-client.js');
    NUTClient = module.NUTClient;

    client = new NUTClient({
      host: 'localhost',
      port: 3493,
      upsName: 'ups',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(client).toBeDefined();
    });

    it('should use default timeout if not provided', () => {
      const testClient = new NUTClient({
        host: 'localhost',
        port: 3493,
        upsName: 'ups',
      });
      expect(testClient).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should parse UPS status correctly when online', async () => {
      const mockOutput = `battery.charge: 100
battery.runtime: 3600
battery.voltage: 27.0
input.voltage: 120.0
output.voltage: 120.0
ups.load: 35
ups.status: OL
ups.model: Back-UPS ES 750G
ups.mfr: APC
ups.serial: ABC123XYZ`;

      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      }) as any);

      const status = await client.getStatus();

      expect(status).toBeDefined();
      expect(status.onBattery).toBe(false);
      expect(status.batteryCharge).toBe(100);
      expect(status.batteryRuntime).toBe(3600);
      expect(status.status).toBe('OL');
      expect(status.model).toBe('Back-UPS ES 750G');
      expect(status.manufacturer).toBe('APC');
      expect(status.load).toBe(35);
    });

    it('should parse UPS status correctly when on battery', async () => {
      const mockOutput = `battery.charge: 75
battery.runtime: 1800
battery.voltage: 26.5
input.voltage: 0
output.voltage: 120.0
ups.load: 40
ups.status: OB
ups.model: Back-UPS ES 750G
ups.mfr: APC
ups.serial: ABC123XYZ`;

      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      }) as any);

      const status = await client.getStatus();

      expect(status.onBattery).toBe(true);
      expect(status.batteryCharge).toBe(75);
      expect(status.batteryRuntime).toBe(1800);
      expect(status.status).toBe('OB');
      expect(status.inputVoltage).toBe(0);
    });

    it('should handle missing values gracefully', async () => {
      const mockOutput = `ups.status: OL
ups.model: Unknown UPS`;

      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      }) as any);

      const status = await client.getStatus();

      expect(status.batteryCharge).toBe(0);
      expect(status.batteryRuntime).toBe(0);
      expect(status.batteryVoltage).toBe(0);
      expect(status.model).toBe('Unknown UPS');
      expect(status.manufacturer).toBe('Unknown');
    });

    it('should throw error on command failure', async () => {
      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(new Error('Connection failed'));
        return {} as any;
      }) as any);

      await expect(client.getStatus()).rejects.toThrow('UPS communication failed');
    });
  });

  describe('listDevices', () => {
    it('should list available UPS devices', async () => {
      const mockOutput = `ups
ups2
backup-ups`;

      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      }) as any);

      const devices = await client.listDevices();

      expect(devices).toEqual(['ups', 'ups2', 'backup-ups']);
    });

    it('should return empty array on error', async () => {
      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(new Error('No devices'));
        return {} as any;
      }) as any);

      const devices = await client.listDevices();

      expect(devices).toEqual([]);
    });

    it('should filter empty lines', async () => {
      const mockOutput = `ups

ups2
`;

      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      }) as any);

      const devices = await client.listDevices();

      expect(devices).toEqual(['ups', 'ups2']);
    });
  });

  describe('getVariables', () => {
    it('should retrieve all UPS variables', async () => {
      const mockOutput = `battery.charge: 100
battery.runtime: 3600
ups.status: OL
ups.model: Test UPS`;

      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      }) as any);

      const variables = await client.getVariables();

      expect(variables['battery.charge']).toBe('100');
      expect(variables['battery.runtime']).toBe('3600');
      expect(variables['ups.status']).toBe('OL');
      expect(variables['ups.model']).toBe('Test UPS');
    });

    it('should handle values with colons', async () => {
      const mockOutput = `device.serial: ABC:123:XYZ
ups.model: Test: UPS Model`;

      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      }) as any);

      const variables = await client.getVariables();

      expect(variables['device.serial']).toBe('ABC:123:XYZ');
      expect(variables['ups.model']).toBe('Test: UPS Model');
    });

    it('should throw error on failure', async () => {
      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(new Error('Failed to fetch'));
        return {} as any;
      }) as any);

      await expect(client.getVariables()).rejects.toThrow('Failed to retrieve UPS variables');
    });
  });

  describe('isAvailable', () => {
    it('should return true when UPS is available', async () => {
      const mockOutput = `ups.status: OL`;

      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      }) as any);

      const available = await client.isAvailable();

      expect(available).toBe(true);
    });

    it('should return false when UPS is not available', async () => {
      mockedExec.mockImplementationOnce(((_cmd: string, _options: any, callback: any) => {
        callback(new Error('Connection failed'));
        return {} as any;
      }) as any);

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('formatRuntime', () => {
    it('should format runtime in hours and minutes', () => {
      const formatted = NUTClient.formatRuntime(7320); // 2 hours 2 minutes
      expect(formatted).toBe('2h 2m');
    });

    it('should format runtime in minutes and seconds', () => {
      const formatted = NUTClient.formatRuntime(150); // 2 minutes 30 seconds
      expect(formatted).toBe('2m 30s');
    });

    it('should format runtime in seconds only', () => {
      const formatted = NUTClient.formatRuntime(45); // 45 seconds
      expect(formatted).toBe('45s');
    });

    it('should handle zero runtime', () => {
      const formatted = NUTClient.formatRuntime(0);
      expect(formatted).toBe('0s');
    });
  });
});

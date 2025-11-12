/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the logger
jest.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock exec as an async function
const mockExec = jest.fn() as jest.MockedFunction<
  () => Promise<{ stdout: string; stderr?: string }>
>;

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('util', () => ({
  promisify: () => mockExec,
}));

describe('Fail2banClient', () => {
  let Fail2banClient: typeof import('../../../../src/integrations/fail2ban/client.js').Fail2banClient;
  let client: InstanceType<
    typeof import('../../../../src/integrations/fail2ban/client.js').Fail2banClient
  >;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Import the class after mocks are set up
    const module = await import('../../../../src/integrations/fail2ban/client.js');
    Fail2banClient = module.Fail2banClient;

    client = new Fail2banClient({
      containerName: 'fail2ban',
      useDocker: true,
    });
  });

  describe('Constructor', () => {
    it('should initialize with default values', () => {
      const defaultClient = new Fail2banClient();

      expect((defaultClient as any).containerName).toBe('fail2ban');
      expect((defaultClient as any).useDocker).toBe(true);
    });

    it('should initialize with custom values', () => {
      const customClient = new Fail2banClient({
        containerName: 'custom-fail2ban',
        useDocker: false,
      });

      expect((customClient as any).containerName).toBe('custom-fail2ban');
      expect((customClient as any).useDocker).toBe(false);
    });
  });

  describe('Get Version', () => {
    it('should get fail2ban version', async () => {
      mockExec.mockResolvedValue({ stdout: 'Fail2Ban v1.0.2\n' });

      const version = await client.getVersion();

      expect(version).toBe('Fail2Ban v1.0.2');
    });

    it('should return unknown on error', async () => {
      mockExec.mockRejectedValue(new Error('Command failed'));

      const version = await client.getVersion();

      expect(version).toBe('unknown');
    });
  });

  describe('Is Running', () => {
    it('should return true when fail2ban is running', async () => {
      mockExec.mockResolvedValue({ stdout: 'pong' });

      const running = await client.isRunning();

      expect(running).toBe(true);
    });

    it('should return false when fail2ban is not running', async () => {
      mockExec.mockRejectedValue(new Error('Connection refused'));

      const running = await client.isRunning();

      expect(running).toBe(false);
    });
  });

  describe('Ban/Unban IP', () => {
    it('should ban IP address successfully', async () => {
      mockExec.mockResolvedValue({ stdout: '' });

      const result = await client.banIP('192.168.1.100', 'sshd');

      expect(result).toBe(true);
    });

    it('should return false on ban error', async () => {
      mockExec.mockRejectedValue(new Error('Ban failed'));

      const result = await client.banIP('192.168.1.100');

      expect(result).toBe(false);
    });

    it('should unban IP address successfully', async () => {
      mockExec.mockResolvedValue({ stdout: '' });

      const result = await client.unbanIP('192.168.1.100', 'sshd');

      expect(result).toBe(true);
    });

    it('should return false on unban error', async () => {
      mockExec.mockRejectedValue(new Error('Unban failed'));

      const result = await client.unbanIP('192.168.1.100');

      expect(result).toBe(false);
    });
  });

  describe('Reload', () => {
    it('should reload fail2ban successfully', async () => {
      mockExec.mockResolvedValue({ stdout: 'OK' });

      const result = await client.reload();

      expect(result).toBe(true);
    });

    it('should return false on reload error', async () => {
      mockExec.mockRejectedValue(new Error('Reload failed'));

      const result = await client.reload();

      expect(result).toBe(false);
    });
  });
});

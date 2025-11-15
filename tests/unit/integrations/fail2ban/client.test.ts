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

  describe('Get Status', () => {
    it('should get overall status with jails', async () => {
      mockExec
        .mockResolvedValueOnce({ stdout: 'Fail2Ban v1.0.2' }) // getVersion
        .mockResolvedValueOnce({
          stdout: 'Status\n|- Number of jail: 2\n`- Jail list: sshd, nginx',
        }) // status
        .mockResolvedValueOnce({
          stdout: `Status for the jail: sshd
|- Currently failed: 5
|- Total failed: 42
|- Currently banned: 2
|- Total banned: 15
\`- Banned IP list: 192.168.1.100 10.0.0.50`,
        }) // sshd jail status
        .mockResolvedValueOnce({
          stdout: `Status for the jail: nginx
|- Currently failed: 1
|- Total failed: 8
|- Currently banned: 1
|- Total banned: 3
\`- Banned IP list: 172.16.0.20`,
        }); // nginx jail status

      const status = await client.getStatus();

      expect(status.version).toBe('Fail2Ban v1.0.2');
      expect(status.jails).toHaveLength(2);
      expect(status.totalBanned).toBe(3);
      expect(status.jails.length).toBeGreaterThan(1);
      expect(status.jails[0]?.name).toBe('sshd');
      expect(status.jails[0]?.currentlyBanned).toBe(2);
      expect(status.jails[1]?.name).toBe('nginx');
    });

    it('should return empty status on error', async () => {
      mockExec.mockRejectedValue(new Error('Connection failed'));

      const status = await client.getStatus();

      expect(status.version).toBe('unknown');
      expect(status.jails).toEqual([]);
      expect(status.totalBanned).toBe(0);
    });

    it('should handle empty jail list', async () => {
      mockExec
        .mockResolvedValueOnce({ stdout: 'Fail2Ban v1.0.2' })
        .mockResolvedValueOnce({ stdout: 'Status\n|- Number of jail: 0\n`- Jail list: ' });

      const status = await client.getStatus();

      expect(status.jails).toEqual([]);
      expect(status.totalBanned).toBe(0);
    });

    it('should skip null jail statuses', async () => {
      mockExec
        .mockResolvedValueOnce({ stdout: 'Fail2Ban v1.0.2' })
        .mockResolvedValueOnce({
          stdout: 'Status\n|- Number of jail: 1\n`- Jail list: sshd',
        })
        .mockRejectedValueOnce(new Error('Jail error')); // Jail status fails

      const status = await client.getStatus();

      expect(status.jails).toEqual([]);
    });
  });

  describe('Get Jail Status', () => {
    it('should get jail status with banned IPs', async () => {
      const mockOutput = `Status for the jail: sshd
|- Currently failed: 5
|- Total failed: 42
|- Currently banned: 2
|- Total banned: 15
\`- Banned IP list: 192.168.1.100 10.0.0.50`;

      mockExec.mockResolvedValue({ stdout: mockOutput });

      const jailStatus = await client.getJailStatus('sshd');

      expect(jailStatus).not.toBeNull();
      expect(jailStatus?.name).toBe('sshd');
      expect(jailStatus?.currentlyFailed).toBe(5);
      expect(jailStatus?.totalFailed).toBe(42);
      expect(jailStatus?.currentlyBanned).toBe(2);
      expect(jailStatus?.totalBanned).toBe(15);
      expect(jailStatus?.bannedIPs).toEqual(['192.168.1.100', '10.0.0.50']);
    });

    it('should handle jail with no banned IPs', async () => {
      mockExec.mockResolvedValue({
        stdout: `Status for the jail: nginx
|- Currently failed: 0
|- Total failed: 5
|- Currently banned: 0
|- Total banned: 1
\`- Banned IP list: none`,
      });

      const jailStatus = await client.getJailStatus('nginx');

      expect(jailStatus).not.toBeNull();
      expect(jailStatus?.currentlyBanned).toBe(0);
      expect(jailStatus?.bannedIPs).toEqual([]);
    });

    it('should return null on error', async () => {
      mockExec.mockRejectedValue(new Error('Jail not found'));

      const jailStatus = await client.getJailStatus('nonexistent');

      expect(jailStatus).toBeNull();
    });

    it('should handle missing fields gracefully', async () => {
      mockExec.mockResolvedValue({
        stdout: 'Status for the jail: test\n`- Banned IP list: ',
      });

      const jailStatus = await client.getJailStatus('test');

      expect(jailStatus).not.toBeNull();
      expect(jailStatus?.currentlyFailed).toBe(0);
      expect(jailStatus?.totalFailed).toBe(0);
      expect(jailStatus?.currentlyBanned).toBe(0);
      expect(jailStatus?.totalBanned).toBe(0);
    });
  });

  describe('Get All Banned IPs', () => {
    it('should return all unique banned IPs across jails', async () => {
      mockExec
        .mockResolvedValueOnce({ stdout: 'Fail2Ban v1.0.2' })
        .mockResolvedValueOnce({
          stdout: 'Status\n|- Number of jail: 2\n`- Jail list: sshd, nginx',
        })
        .mockResolvedValueOnce({
          stdout: `Status for the jail: sshd
|- Currently failed: 5
|- Total failed: 42
|- Currently banned: 2
|- Total banned: 15
\`- Banned IP list: 192.168.1.100 10.0.0.50`,
        })
        .mockResolvedValueOnce({
          stdout: `Status for the jail: nginx
|- Currently failed: 1
|- Total failed: 8
|- Currently banned: 2
|- Total banned: 3
\`- Banned IP list: 192.168.1.100 172.16.0.20`,
        });

      const bannedIPs = await client.getAllBannedIPs();

      expect(bannedIPs).toHaveLength(3);
      expect(bannedIPs).toContain('192.168.1.100');
      expect(bannedIPs).toContain('10.0.0.50');
      expect(bannedIPs).toContain('172.16.0.20');
    });

    it('should return empty array on error', async () => {
      mockExec.mockRejectedValue(new Error('Failed to get status'));

      const bannedIPs = await client.getAllBannedIPs();

      expect(bannedIPs).toEqual([]);
    });

    it('should return empty array when no IPs are banned', async () => {
      mockExec
        .mockResolvedValueOnce({ stdout: 'Fail2Ban v1.0.2' })
        .mockResolvedValueOnce({
          stdout: 'Status\n|- Number of jail: 1\n`- Jail list: sshd',
        })
        .mockResolvedValueOnce({
          stdout: `Status for the jail: sshd
|- Currently failed: 0
|- Total failed: 0
|- Currently banned: 0
|- Total banned: 0
\`- Banned IP list: none`,
        });

      const bannedIPs = await client.getAllBannedIPs();

      expect(bannedIPs).toEqual([]);
    });
  });
});

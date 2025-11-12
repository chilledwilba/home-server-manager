/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the logger
jest.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('CloudflareTunnelClient', () => {
  let CloudflareTunnelClient: typeof import('../../../../src/integrations/cloudflare/tunnel-client.js').CloudflareTunnelClient;
  let client: InstanceType<
    typeof import('../../../../src/integrations/cloudflare/tunnel-client.js').CloudflareTunnelClient
  >;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Import the class after mocks are set up
    const module = await import('../../../../src/integrations/cloudflare/tunnel-client.js');
    CloudflareTunnelClient = module.CloudflareTunnelClient;

    client = new CloudflareTunnelClient({
      accountId: 'test-account-id',
      apiToken: 'test-api-token',
      tunnelId: 'test-tunnel-id',
    });
  });

  describe('Constructor', () => {
    it('should initialize with correct configuration', () => {
      expect((client as any).config.accountId).toBe('test-account-id');
      expect((client as any).config.apiToken).toBe('test-api-token');
      expect((client as any).tunnelId).toBe('test-tunnel-id');
    });

    it('should work without tunnel ID', () => {
      const noTunnelClient = new CloudflareTunnelClient({
        accountId: 'test-account',
        apiToken: 'test-token',
      });

      expect((noTunnelClient as any).tunnelId).toBeUndefined();
    });
  });

  describe('List Tunnels', () => {
    it('should list all tunnels for account', async () => {
      const mockTunnels = [
        {
          id: 'tunnel-1',
          name: 'home-tunnel',
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
          connections: [],
        },
        {
          id: 'tunnel-2',
          name: 'backup-tunnel',
          status: 'inactive',
          created_at: '2024-01-02T00:00:00Z',
          connections: [],
        },
      ];

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnels }),
      } as Response);

      const tunnels = await client.listTunnels();

      expect(tunnels).toEqual(mockTunnels);
      expect(tunnels.length).toBe(2);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/test-account-id/cfd_tunnel'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-token',
          }),
        }),
      );
    });

    it('should throw error when API request fails', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response);

      await expect(client.listTunnels()).rejects.toThrow('Failed to list tunnels');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error'),
      );

      await expect(client.listTunnels()).rejects.toThrow('Network error');
    });
  });

  describe('Get Tunnel', () => {
    it('should get tunnel by ID', async () => {
      const mockTunnel = {
        id: 'tunnel-1',
        name: 'home-tunnel',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-1',
            opened_at: '2024-01-01T10:00:00Z',
            origin_ip: '192.168.1.100',
          },
        ],
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnel }),
      } as Response);

      const tunnel = await client.getTunnel('tunnel-1');

      expect(tunnel).toEqual(mockTunnel);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cfd_tunnel/tunnel-1'),
        expect.any(Object),
      );
    });

    it('should use default tunnel ID from constructor', async () => {
      const mockTunnel = {
        id: 'test-tunnel-id',
        name: 'default-tunnel',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        connections: [],
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnel }),
      } as Response);

      const tunnel = await client.getTunnel();

      expect(tunnel.id).toBe('test-tunnel-id');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cfd_tunnel/test-tunnel-id'),
        expect.any(Object),
      );
    });

    it('should throw error when no tunnel ID provided', async () => {
      const noIdClient = new CloudflareTunnelClient({
        accountId: 'test-account',
        apiToken: 'test-token',
      });

      await expect(noIdClient.getTunnel()).rejects.toThrow('No tunnel ID provided');
    });

    it('should throw error when tunnel not found', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      } as Response);

      await expect(client.getTunnel('nonexistent')).rejects.toThrow('Failed to get tunnel');
    });
  });

  describe('Get Tunnel Connections', () => {
    it('should get tunnel connections', async () => {
      const mockConnections = [
        {
          id: 'conn-1',
          client_id: 'client-1',
          opened_at: '2024-01-01T10:00:00Z',
          origin_ip: '192.168.1.100',
        },
        {
          id: 'conn-2',
          client_id: 'client-2',
          opened_at: '2024-01-01T11:00:00Z',
          origin_ip: '192.168.1.101',
        },
      ];

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            id: 'tunnel-1',
            name: 'test',
            status: 'active',
            created_at: '2024-01-01',
            connections: mockConnections,
          },
        }),
      } as Response);

      const connections = await client.getTunnelConnections('tunnel-1');

      expect(connections).toEqual(mockConnections);
      expect(connections.length).toBe(2);
    });

    it('should return empty array when no connections', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            id: 'tunnel-1',
            name: 'test',
            status: 'inactive',
            created_at: '2024-01-01',
            connections: [],
          },
        }),
      } as Response);

      const connections = await client.getTunnelConnections('tunnel-1');

      expect(connections).toEqual([]);
    });
  });

  describe('Health Check', () => {
    it('should return true for active tunnel with connections', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            id: 'tunnel-1',
            name: 'test',
            status: 'active',
            created_at: '2024-01-01',
            connections: [{ id: 'conn-1' }],
          },
        }),
      } as Response);

      const healthy = await client.isHealthy('tunnel-1');

      expect(healthy).toBe(true);
    });

    it('should return false for active tunnel without connections', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            id: 'tunnel-1',
            name: 'test',
            status: 'active',
            created_at: '2024-01-01',
            connections: [],
          },
        }),
      } as Response);

      const healthy = await client.isHealthy('tunnel-1');

      expect(healthy).toBe(false);
    });

    it('should return false for inactive tunnel', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            id: 'tunnel-1',
            name: 'test',
            status: 'inactive',
            created_at: '2024-01-01',
            connections: [{ id: 'conn-1' }],
          },
        }),
      } as Response);

      const healthy = await client.isHealthy('tunnel-1');

      expect(healthy).toBe(false);
    });

    it('should return false when tunnel fetch fails', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const healthy = await client.isHealthy('tunnel-1');

      expect(healthy).toBe(false);
    });
  });

  describe('Delete Tunnel', () => {
    it('should delete tunnel successfully', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
      } as Response);

      await expect(client.deleteTunnel('tunnel-1')).resolves.toBeUndefined();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cfd_tunnel/tunnel-1'),
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('should use default tunnel ID', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
      } as Response);

      await expect(client.deleteTunnel()).resolves.toBeUndefined();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cfd_tunnel/test-tunnel-id'),
        expect.any(Object),
      );
    });

    it('should throw error when no tunnel ID provided', async () => {
      const noIdClient = new CloudflareTunnelClient({
        accountId: 'test-account',
        apiToken: 'test-token',
      });

      await expect(noIdClient.deleteTunnel()).rejects.toThrow('No tunnel ID provided');
    });

    it('should throw error when deletion fails', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
      } as Response);

      await expect(client.deleteTunnel('tunnel-1')).rejects.toThrow('Failed to delete tunnel');
    });
  });

  describe('Get Metrics', () => {
    it('should return metrics for healthy tunnel', async () => {
      // getMetrics calls getTunnel twice (once directly, once via isHealthy)
      const mockTunnel = {
        id: 'tunnel-1',
        name: 'test',
        status: 'active',
        created_at: '2024-01-01',
        connections: [{ id: 'conn-1' }, { id: 'conn-2' }],
      };

      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTunnel }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTunnel }),
        } as Response);

      const metrics = await client.getMetrics('tunnel-1');

      expect(metrics).toEqual({
        active_connections: 2,
        status: 'active',
        healthy: true,
      });
    });

    it('should return unhealthy metrics when tunnel has no connections', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            id: 'tunnel-1',
            name: 'test',
            status: 'active',
            created_at: '2024-01-01',
            connections: [],
          },
        }),
      } as Response);

      const metrics = await client.getMetrics('tunnel-1');

      expect(metrics).toEqual({
        active_connections: 0,
        status: 'active',
        healthy: false,
      });
    });

    it('should return default metrics on error', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const metrics = await client.getMetrics('tunnel-1');

      expect(metrics).toEqual({
        active_connections: 0,
        status: 'unknown',
        healthy: false,
      });
    });

    it('should use default tunnel ID when not provided', async () => {
      const mockTunnel = {
        id: 'test-tunnel-id',
        name: 'test',
        status: 'active',
        created_at: '2024-01-01',
        connections: [{ id: 'conn-1' }],
      };

      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTunnel }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTunnel }),
        } as Response);

      const metrics = await client.getMetrics();

      expect(metrics.healthy).toBe(true);
    });
  });
});

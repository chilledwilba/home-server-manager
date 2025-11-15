/* eslint-disable @typescript-eslint/no-explicit-any, no-undef */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { CloudflareTunnelClient } from '../../../../src/integrations/cloudflare/tunnel-client.js';

describe('CloudflareTunnelClient', () => {
  let client: CloudflareTunnelClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Save original fetch
    originalFetch = global.fetch;

    // Create client instance
    client = new CloudflareTunnelClient({
      accountId: 'test-account-id',
      apiToken: 'test-api-token',
      tunnelId: 'test-tunnel-id',
    });
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with tunnel ID', () => {
      const testClient = new CloudflareTunnelClient({
        accountId: 'acc-123',
        apiToken: 'token-456',
        tunnelId: 'tunnel-789',
      });

      expect((testClient as any).tunnelId).toBe('tunnel-789');
      expect((testClient as any).config.accountId).toBe('acc-123');
      expect((testClient as any).config.apiToken).toBe('token-456');
    });

    it('should initialize without tunnel ID', () => {
      const testClient = new CloudflareTunnelClient({
        accountId: 'acc-123',
        apiToken: 'token-456',
      });

      expect((testClient as any).tunnelId).toBeUndefined();
    });
  });

  describe('listTunnels', () => {
    it('should list all tunnels', async () => {
      const mockTunnels = [
        {
          id: 'tunnel-1',
          name: 'home-tunnel',
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
          connections: [
            {
              id: 'conn-1',
              client_id: 'client-1',
              opened_at: '2024-01-01T01:00:00Z',
              origin_ip: '192.168.1.100',
            },
          ],
        },
        {
          id: 'tunnel-2',
          name: 'backup-tunnel',
          status: 'inactive',
          created_at: '2024-01-02T00:00:00Z',
          connections: [],
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnels }),
      } as Response) as any;

      const tunnels = await client.listTunnels();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/cfd_tunnel',
        {
          headers: {
            Authorization: 'Bearer test-api-token',
            'Content-Type': 'application/json',
          },
        },
      );

      expect(tunnels).toEqual(mockTunnels);
      expect(tunnels).toHaveLength(2);
    });

    it('should throw error when API request fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response) as any;

      await expect(client.listTunnels()).rejects.toThrow('Failed to list tunnels: Unauthorized');
    });

    it('should throw error on network failure', async () => {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('Network error')) as any;

      await expect(client.listTunnels()).rejects.toThrow('Network error');
    });
  });

  describe('getTunnel', () => {
    it('should get tunnel details using constructor tunnel ID', async () => {
      const mockTunnel = {
        id: 'test-tunnel-id',
        name: 'home-tunnel',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-1',
            opened_at: '2024-01-01T01:00:00Z',
            origin_ip: '192.168.1.100',
          },
        ],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnel }),
      } as Response) as any;

      const tunnel = await client.getTunnel();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/cfd_tunnel/test-tunnel-id',
        {
          headers: {
            Authorization: 'Bearer test-api-token',
            'Content-Type': 'application/json',
          },
        },
      );

      expect(tunnel).toEqual(mockTunnel);
    });

    it('should get tunnel details using provided tunnel ID', async () => {
      const mockTunnel = {
        id: 'custom-tunnel-id',
        name: 'custom-tunnel',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        connections: [],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnel }),
      } as Response) as any;

      const tunnel = await client.getTunnel('custom-tunnel-id');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/cfd_tunnel/custom-tunnel-id',
        expect.any(Object),
      );

      expect(tunnel).toEqual(mockTunnel);
    });

    it('should throw error when no tunnel ID provided', async () => {
      const clientWithoutId = new CloudflareTunnelClient({
        accountId: 'test-account-id',
        apiToken: 'test-api-token',
      });

      await expect(clientWithoutId.getTunnel()).rejects.toThrow('No tunnel ID provided');
    });

    it('should throw error when API request fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      } as Response) as any;

      await expect(client.getTunnel()).rejects.toThrow('Failed to get tunnel: Not Found');
    });
  });

  describe('getTunnelConnections', () => {
    it('should get tunnel connections', async () => {
      const mockConnections = [
        {
          id: 'conn-1',
          client_id: 'client-1',
          opened_at: '2024-01-01T01:00:00Z',
          origin_ip: '192.168.1.100',
        },
        {
          id: 'conn-2',
          client_id: 'client-2',
          opened_at: '2024-01-01T02:00:00Z',
          origin_ip: '192.168.1.101',
        },
      ];

      const mockTunnel = {
        id: 'test-tunnel-id',
        name: 'home-tunnel',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        connections: mockConnections,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnel }),
      } as Response) as any;

      const connections = await client.getTunnelConnections();

      expect(connections).toEqual(mockConnections);
      expect(connections).toHaveLength(2);
    });

    it('should return empty array when tunnel has no connections', async () => {
      const mockTunnel = {
        id: 'test-tunnel-id',
        name: 'home-tunnel',
        status: 'inactive',
        created_at: '2024-01-01T00:00:00Z',
        connections: [],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnel }),
      } as Response) as any;

      const connections = await client.getTunnelConnections();

      expect(connections).toEqual([]);
    });

    it('should throw error when no tunnel ID provided', async () => {
      const clientWithoutId = new CloudflareTunnelClient({
        accountId: 'test-account-id',
        apiToken: 'test-api-token',
      });

      await expect(clientWithoutId.getTunnelConnections()).rejects.toThrow('No tunnel ID provided');
    });

    it('should throw error on API failure', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      } as Response) as any;

      await expect(client.getTunnelConnections()).rejects.toThrow();
    });
  });

  describe('isHealthy', () => {
    it('should return true when tunnel is active with connections', async () => {
      const mockTunnel = {
        id: 'test-tunnel-id',
        name: 'home-tunnel',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-1',
            opened_at: '2024-01-01T01:00:00Z',
            origin_ip: '192.168.1.100',
          },
        ],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnel }),
      } as Response) as any;

      const healthy = await client.isHealthy();

      expect(healthy).toBe(true);
    });

    it('should return false when tunnel status is not active', async () => {
      const mockTunnel = {
        id: 'test-tunnel-id',
        name: 'home-tunnel',
        status: 'inactive',
        created_at: '2024-01-01T00:00:00Z',
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-1',
            opened_at: '2024-01-01T01:00:00Z',
            origin_ip: '192.168.1.100',
          },
        ],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnel }),
      } as Response) as any;

      const healthy = await client.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false when tunnel has no connections', async () => {
      const mockTunnel = {
        id: 'test-tunnel-id',
        name: 'home-tunnel',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        connections: [],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTunnel }),
      } as Response) as any;

      const healthy = await client.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false on API error', async () => {
      global.fetch = jest.fn<typeof fetch>().mockRejectedValueOnce(new Error('API Error')) as any;

      const healthy = await client.isHealthy();

      expect(healthy).toBe(false);
    });
  });

  describe('deleteTunnel', () => {
    it('should delete tunnel using constructor tunnel ID', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
      } as Response) as any;

      await client.deleteTunnel();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/cfd_tunnel/test-tunnel-id',
        {
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer test-api-token',
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('should delete tunnel using provided tunnel ID', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
      } as Response) as any;

      await client.deleteTunnel('custom-tunnel-id');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/cfd_tunnel/custom-tunnel-id',
        {
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer test-api-token',
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('should throw error when no tunnel ID provided', async () => {
      const clientWithoutId = new CloudflareTunnelClient({
        accountId: 'test-account-id',
        apiToken: 'test-api-token',
      });

      await expect(clientWithoutId.deleteTunnel()).rejects.toThrow('No tunnel ID provided');
    });

    it('should throw error when delete fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
      } as Response) as any;

      await expect(client.deleteTunnel()).rejects.toThrow('Failed to delete tunnel: Forbidden');
    });
  });

  describe('getMetrics', () => {
    it('should return metrics for healthy tunnel', async () => {
      const mockTunnel = {
        id: 'test-tunnel-id',
        name: 'home-tunnel',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-1',
            opened_at: '2024-01-01T01:00:00Z',
            origin_ip: '192.168.1.100',
          },
          {
            id: 'conn-2',
            client_id: 'client-2',
            opened_at: '2024-01-01T02:00:00Z',
            origin_ip: '192.168.1.101',
          },
        ],
      };

      // Mock getTunnel and isHealthy calls
      global.fetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTunnel }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTunnel }),
        } as Response) as any;

      const metrics = await client.getMetrics();

      expect(metrics).toEqual({
        active_connections: 2,
        status: 'active',
        healthy: true,
      });
    });

    it('should return default metrics on error', async () => {
      global.fetch = jest.fn<typeof fetch>().mockRejectedValueOnce(new Error('API Error')) as any;

      const metrics = await client.getMetrics();

      expect(metrics).toEqual({
        active_connections: 0,
        status: 'unknown',
        healthy: false,
      });
    });

    it('should handle tunnel with no connections', async () => {
      const mockTunnel = {
        id: 'test-tunnel-id',
        name: 'home-tunnel',
        status: 'inactive',
        created_at: '2024-01-01T00:00:00Z',
        connections: [],
      };

      global.fetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTunnel }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTunnel }),
        } as Response) as any;

      const metrics = await client.getMetrics();

      expect(metrics.active_connections).toBe(0);
      expect(metrics.status).toBe('inactive');
      expect(metrics.healthy).toBe(false);
    });
  });
});

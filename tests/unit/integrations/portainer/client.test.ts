/* eslint-disable @typescript-eslint/no-explicit-any, no-undef */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PortainerClient } from '../../../../src/integrations/portainer/client.js';

describe('PortainerClient', () => {
  let client: PortainerClient;
  let originalFetch: typeof global.fetch;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original fetch and env
    originalFetch = global.fetch;
    originalEnv = process.env;

    // Create client instance
    client = new PortainerClient({
      host: 'localhost',
      port: 9000,
      token: 'test-token',
      endpointId: 1,
    });

    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original fetch and env
    global.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct baseUrl', () => {
      const testClient = new PortainerClient({
        host: 'portainer.local',
        port: 9443,
        token: 'my-token',
      });

      // Access via any to check private properties
      expect((testClient as any).baseUrl).toBe('http://portainer.local:9443/api');
    });

    it('should set correct headers with API token', () => {
      const testClient = new PortainerClient({
        host: 'localhost',
        port: 9000,
        token: 'secret-token',
      });

      expect((testClient as any).headers).toEqual({
        'X-API-Key': 'secret-token',
        'Content-Type': 'application/json',
      });
    });

    it('should use default endpointId of 1', () => {
      const testClient = new PortainerClient({
        host: 'localhost',
        port: 9000,
        token: 'token',
      });

      expect((testClient as any).endpointId).toBe(1);
    });

    it('should use custom endpointId when provided', () => {
      const testClient = new PortainerClient({
        host: 'localhost',
        port: 9000,
        token: 'token',
        endpointId: 5,
      });

      expect((testClient as any).endpointId).toBe(5);
    });
  });

  describe('getContainers', () => {
    it('should retrieve and transform container list', async () => {
      const mockResponse = [
        {
          Id: 'abc123',
          Names: ['/plex'],
          Image: 'plexinc/pms-docker:latest',
          ImageID: 'sha256:xyz789',
          State: 'running',
          Status: 'Up 2 days',
          Created: 1699000000,
          Ports: [
            { PrivatePort: 32400, PublicPort: 32400, Type: 'tcp' },
            { PrivatePort: 8080, Type: 'tcp' },
          ],
          Labels: { 'com.docker.compose.service': 'plex' },
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response) as any;

      const containers = await client.getContainers();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9000/api/endpoints/1/docker/containers/json?all=true',
        {
          headers: {
            'X-API-Key': 'test-token',
            'Content-Type': 'application/json',
          },
        },
      );

      expect(containers).toHaveLength(1);
      expect(containers[0]).toEqual({
        id: 'abc123',
        name: 'plex',
        image: 'plexinc/pms-docker:latest',
        imageTag: 'sha256:xyz789',
        state: 'running',
        status: 'Up 2 days',
        created: new Date(1699000000 * 1000),
        ports: [
          { private: 32400, public: 32400, type: 'tcp' },
          { private: 8080, public: undefined, type: 'tcp' },
        ],
        labels: { 'com.docker.compose.service': 'plex' },
        isArrApp: false,
        isPlex: true,
        isCritical: true,
      });
    });

    it('should identify Arr apps correctly', async () => {
      const mockResponse = [
        {
          Id: '1',
          Names: ['/sonarr'],
          Image: 'img',
          ImageID: 'id',
          State: 'running',
          Status: 'Up',
          Created: 1699000000,
          Labels: {},
        },
        {
          Id: '2',
          Names: ['/radarr'],
          Image: 'img',
          ImageID: 'id',
          State: 'running',
          Status: 'Up',
          Created: 1699000000,
          Labels: {},
        },
        {
          Id: '3',
          Names: ['/prowlarr'],
          Image: 'img',
          ImageID: 'id',
          State: 'running',
          Status: 'Up',
          Created: 1699000000,
          Labels: {},
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response) as any;

      const containers = await client.getContainers();

      expect(containers[0]?.isArrApp).toBe(true);
      expect(containers[1]?.isArrApp).toBe(true);
      expect(containers[2]?.isArrApp).toBe(true);
    });

    it('should handle containers without ports', async () => {
      const mockResponse = [
        {
          Id: 'abc123',
          Names: ['/nginx'],
          Image: 'nginx:latest',
          ImageID: 'sha256:xyz',
          State: 'running',
          Status: 'Up',
          Created: 1699000000,
          Labels: {},
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response) as any;

      const containers = await client.getContainers();

      expect(containers[0]?.ports).toEqual([]);
    });

    it('should throw error when API request fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response) as any;

      await expect(client.getContainers()).rejects.toThrow('Portainer API error: 500');
    });
  });

  describe('getContainerStats', () => {
    it('should retrieve and calculate container stats', async () => {
      const mockStats = {
        cpu_stats: {
          cpu_usage: { total_usage: 2000000000 },
          system_cpu_usage: 10000000000,
          online_cpus: 4,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000000 },
          system_cpu_usage: 8000000000,
        },
        memory_stats: {
          usage: 524288000,
          limit: 1073741824,
          stats: { cache: 104857600 },
        },
        networks: {
          eth0: { rx_bytes: 1048576, tx_bytes: 2097152 },
        },
        blkio_stats: {
          io_service_bytes_recursive: [
            { op: 'read', value: 4194304 },
            { op: 'write', value: 8388608 },
          ],
        },
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      } as Response) as any;

      const stats = await client.getContainerStats('abc123');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9000/api/endpoints/1/docker/containers/abc123/stats?stream=false',
        {
          headers: {
            'X-API-Key': 'test-token',
            'Content-Type': 'application/json',
          },
        },
      );

      expect(stats.cpu.cores).toBe(4);
      expect(stats.cpu.percentage).toBeGreaterThan(0);
      expect(stats.memory.used).toBe(419430400); // 524288000 - 104857600
      expect(stats.memory.limit).toBe(1073741824);
      expect(stats.memory.percentage).toBeGreaterThan(0);
      expect(stats.network.rx).toBe(1048576);
      expect(stats.network.tx).toBe(2097152);
      expect(stats.io.read).toBe(4194304);
      expect(stats.io.write).toBe(8388608);
    });

    it('should handle missing network stats', async () => {
      const mockStats = {
        cpu_stats: {
          cpu_usage: { total_usage: 2000000000 },
          system_cpu_usage: 10000000000,
          online_cpus: 2,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000000 },
          system_cpu_usage: 8000000000,
        },
        memory_stats: {
          usage: 524288000,
          limit: 1073741824,
        },
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      } as Response) as any;

      const stats = await client.getContainerStats('abc123');

      expect(stats.network.rx).toBe(0);
      expect(stats.network.tx).toBe(0);
    });

    it('should handle missing blkio stats', async () => {
      const mockStats = {
        cpu_stats: {
          cpu_usage: { total_usage: 2000000000 },
          system_cpu_usage: 10000000000,
          online_cpus: 2,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000000 },
          system_cpu_usage: 8000000000,
        },
        memory_stats: {
          usage: 524288000,
          limit: 1073741824,
        },
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      } as Response) as any;

      const stats = await client.getContainerStats('abc123');

      expect(stats.io.read).toBe(0);
      expect(stats.io.write).toBe(0);
    });
  });

  describe('getContainerLogs', () => {
    it('should retrieve and parse container logs', async () => {
      const mockLogs =
        '\x00\x00\x00\x00\x00\x00\x00\x14Log line 1\n\x00\x00\x00\x00\x00\x00\x00\x14Log line 2\n';

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        text: async () => mockLogs,
      } as Response) as any;

      const logs = await client.getContainerLogs('abc123', 50);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9000/api/endpoints/1/docker/containers/abc123/logs?stdout=true&stderr=true&tail=50',
        {
          headers: {
            'X-API-Key': 'test-token',
            'Content-Type': 'application/json',
          },
        },
      );

      expect(logs).toHaveLength(2);
      expect(logs[0]).toBe('Log line 1');
      expect(logs[1]).toBe('Log line 2');
    });

    it('should use default line count of 100', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        text: async () => '',
      } as Response) as any;

      await client.getContainerLogs('abc123');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('tail=100'),
        expect.any(Object),
      );
    });

    it('should filter empty lines', async () => {
      const mockLogs =
        '\x00\x00\x00\x00\x00\x00\x00\x14Log line 1\n\n\x00\x00\x00\x00\x00\x00\x00\x14Log line 2\n';

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        text: async () => mockLogs,
      } as Response) as any;

      const logs = await client.getContainerLogs('abc123');

      expect(logs).toHaveLength(2);
      expect(logs).not.toContain('');
    });
  });

  describe('restartContainer', () => {
    it('should restart container when write operations enabled', async () => {
      process.env['ENABLE_WRITE_OPERATIONS'] = 'true';

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response) as any;

      const result = await client.restartContainer('abc123');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9000/api/endpoints/1/docker/containers/abc123/restart',
        {
          method: 'POST',
          headers: {
            'X-API-Key': 'test-token',
            'Content-Type': 'application/json',
          },
        },
      );

      expect(result).toBe(true);
    });

    it('should throw error when write operations disabled', async () => {
      process.env['ENABLE_WRITE_OPERATIONS'] = 'false';

      await expect(client.restartContainer('abc123')).rejects.toThrow(
        'Write operations are disabled',
      );
    });
  });

  describe('stopContainer', () => {
    it('should stop container when write operations enabled', async () => {
      process.env['ENABLE_WRITE_OPERATIONS'] = 'true';

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response) as any;

      const result = await client.stopContainer('abc123');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9000/api/endpoints/1/docker/containers/abc123/stop',
        {
          method: 'POST',
          headers: {
            'X-API-Key': 'test-token',
            'Content-Type': 'application/json',
          },
        },
      );

      expect(result).toBe(true);
    });

    it('should throw error when write operations disabled', async () => {
      process.env['ENABLE_WRITE_OPERATIONS'] = 'false';

      await expect(client.stopContainer('abc123')).rejects.toThrow('Write operations are disabled');
    });
  });

  describe('startContainer', () => {
    it('should start container when write operations enabled', async () => {
      process.env['ENABLE_WRITE_OPERATIONS'] = 'true';

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response) as any;

      const result = await client.startContainer('abc123');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9000/api/endpoints/1/docker/containers/abc123/start',
        {
          method: 'POST',
          headers: {
            'X-API-Key': 'test-token',
            'Content-Type': 'application/json',
          },
        },
      );

      expect(result).toBe(true);
    });

    it('should throw error when write operations disabled', async () => {
      process.env['ENABLE_WRITE_OPERATIONS'] = 'false';

      await expect(client.startContainer('abc123')).rejects.toThrow(
        'Write operations are disabled',
      );
    });
  });

  describe('getStacks', () => {
    it('should retrieve stack list', async () => {
      const mockStacks = [
        {
          Id: 1,
          Name: 'media-stack',
          Type: 2,
          Status: 1,
          EndpointId: 1,
          Env: [{ name: 'TZ', value: 'UTC' }],
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockStacks,
      } as Response) as any;

      const stacks = await client.getStacks();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:9000/api/stacks', {
        headers: {
          'X-API-Key': 'test-token',
          'Content-Type': 'application/json',
        },
      });

      expect(stacks).toEqual(mockStacks);
    });

    it('should throw error on API failure', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response) as any;

      await expect(client.getStacks()).rejects.toThrow('Portainer API error: 500');
    });
  });

  describe('deployStack', () => {
    it('should deploy new stack', async () => {
      const mockResponse = {
        Id: 1,
        Name: 'test-stack',
        Type: 2,
        EndpointId: 1,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response) as any;

      const result = await client.deployStack(
        'test-stack',
        'version: "3"\nservices:\n  nginx:\n    image: nginx',
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9000/api/stacks/create/standalone/string?endpointId=1',
        {
          method: 'POST',
          headers: {
            'X-API-Key': 'test-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'test-stack',
            stackFileContent: 'version: "3"\nservices:\n  nginx:\n    image: nginx',
            env: [],
          }),
        },
      );

      expect(result).toEqual(mockResponse);
    });

    it('should deploy stack with custom endpoint and env vars', async () => {
      const mockResponse = {
        Id: 2,
        Name: 'custom-stack',
        Type: 2,
        EndpointId: 5,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response) as any;

      const env = [{ name: 'TZ', value: 'America/New_York' }];
      await client.deployStack('custom-stack', 'version: "3"', 5, env);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('endpointId=5'),
        expect.objectContaining({
          body: expect.stringContaining('"env":[{"name":"TZ","value":"America/New_York"}]'),
        }),
      );
    });
  });

  describe('deleteStack', () => {
    it('should delete stack', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response) as any;

      await client.deleteStack(1);

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:9000/api/stacks/1?endpointId=1', {
        method: 'DELETE',
        headers: {
          'X-API-Key': 'test-token',
          'Content-Type': 'application/json',
        },
      });
    });

    it('should delete stack with custom endpoint', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response) as any;

      await client.deleteStack(2, 5);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9000/api/stacks/2?endpointId=5',
        expect.any(Object),
      );
    });
  });

  describe('updateStack', () => {
    it('should update stack', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response) as any;

      await client.updateStack(1, 'version: "3"\nservices:\n  nginx:\n    image: nginx:alpine');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:9000/api/stacks/1?endpointId=1', {
        method: 'PUT',
        headers: {
          'X-API-Key': 'test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stackFileContent: 'version: "3"\nservices:\n  nginx:\n    image: nginx:alpine',
          env: [],
          prune: false,
        }),
      });
    });

    it('should update stack with env vars and custom endpoint', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response) as any;

      const env = [{ name: 'DEBUG', value: 'true' }];
      await client.updateStack(2, 'version: "3"', env, 5);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('endpointId=5'),
        expect.objectContaining({
          body: expect.stringContaining('"env":[{"name":"DEBUG","value":"true"}]'),
        }),
      );
    });
  });

  describe('getStack', () => {
    it('should retrieve stack details', async () => {
      const mockStack = {
        Id: 1,
        Name: 'test-stack',
        Type: 2,
        Status: 1,
        EndpointId: 1,
        Env: [{ name: 'TZ', value: 'UTC' }],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockStack,
      } as Response) as any;

      const stack = await client.getStack(1);

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:9000/api/stacks/1', {
        headers: {
          'X-API-Key': 'test-token',
          'Content-Type': 'application/json',
        },
      });

      expect(stack).toEqual(mockStack);
    });

    it('should throw error when stack not found', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response) as any;

      await expect(client.getStack(999)).rejects.toThrow('Portainer API error: 404');
    });
  });
});

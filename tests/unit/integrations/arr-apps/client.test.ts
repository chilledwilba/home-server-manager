/* eslint-disable @typescript-eslint/no-explicit-any, no-undef */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ArrClient, PlexClient } from '../../../../src/integrations/arr-apps/client.js';

describe('ArrClient', () => {
  let client: ArrClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    client = new ArrClient('sonarr', {
      host: 'localhost',
      port: 8989,
      apiKey: 'test-api-key',
      ssl: false,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with HTTP when SSL is false', () => {
      const testClient = new ArrClient('radarr', {
        host: 'radarr.local',
        port: 7878,
        apiKey: 'api-key-123',
        ssl: false,
      });

      expect((testClient as any).baseUrl).toBe('http://radarr.local:7878/api/v3');
      expect((testClient as any).apiKey).toBe('api-key-123');
      expect(testClient.name).toBe('radarr');
    });

    it('should initialize with HTTPS when SSL is true', () => {
      const testClient = new ArrClient('sonarr', {
        host: 'sonarr.local',
        port: 8989,
        apiKey: 'secure-key',
        ssl: true,
      });

      expect((testClient as any).baseUrl).toBe('https://sonarr.local:8989/api/v3');
    });

    it('should default to HTTP when SSL is not specified', () => {
      const testClient = new ArrClient('prowlarr', {
        host: 'prowlarr.local',
        port: 9696,
        apiKey: 'prowlarr-key',
      });

      expect((testClient as any).baseUrl).toBe('http://prowlarr.local:9696/api/v3');
    });
  });

  describe('getSystemStatus', () => {
    it('should get system status successfully', async () => {
      const mockStatus = {
        version: '3.0.10.1567',
        branch: 'main',
        authentication: 'forms',
        startTime: '2024-01-01T00:00:00Z',
        isProduction: true,
        isDebug: false,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatus,
      } as Response) as any;

      const status = await client.getSystemStatus();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8989/api/v3/system/status',
        expect.objectContaining({
          headers: {
            'X-Api-Key': 'test-api-key',
            Accept: 'application/json',
          },
        }),
      );

      expect(status).toEqual({
        app: 'sonarr',
        version: '3.0.10.1567',
        branch: 'main',
        authentication: 'forms',
        startTime: new Date('2024-01-01T00:00:00Z'),
        isProduction: true,
        isDebug: false,
      });
    });

    it('should throw error when API request fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response) as any;

      await expect(client.getSystemStatus()).rejects.toThrow('sonarr API error: 401');
    });

    it('should throw error on network failure', async () => {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('Network error')) as any;

      await expect(client.getSystemStatus()).rejects.toThrow('Network error');
    });
  });

  describe('getHealth', () => {
    it('should get health checks with severity mapping', async () => {
      const mockHealth = [
        {
          source: 'IndexerRssCheck',
          type: 'error',
          message: 'All indexers are unavailable',
          wikiUrl: 'https://wiki.servarr.com/sonarr/system#indexers-are-unavailable',
        },
        {
          source: 'UpdateCheck',
          type: 'warning',
          message: 'New update is available',
        },
        {
          source: 'ApplicationCheck',
          type: 'info',
          message: 'All systems operational',
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealth,
      } as Response) as any;

      const health = await client.getHealth();

      expect(health).toHaveLength(3);
      expect(health[0]).toEqual({
        app: 'sonarr',
        source: 'IndexerRssCheck',
        type: 'error',
        message: 'All indexers are unavailable',
        wikiUrl: 'https://wiki.servarr.com/sonarr/system#indexers-are-unavailable',
        severity: 'error',
      });
      expect(health[1]?.severity).toBe('warning');
      expect(health[2]?.severity).toBe('info');
    });

    it('should handle empty health checks', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response) as any;

      const health = await client.getHealth();

      expect(health).toEqual([]);
    });

    it('should throw error when health check fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response) as any;

      await expect(client.getHealth()).rejects.toThrow('sonarr API error: 500');
    });
  });

  describe('getQueue', () => {
    it('should get queue with items', async () => {
      const mockQueue = {
        totalRecords: 2,
        records: [
          {
            title: 'Series S01E01',
            status: 'downloading',
            trackedDownloadStatus: 'ok',
            statusMessages: [],
            downloadId: 'download-1',
            protocol: 'torrent',
            size: 1073741824,
            sizeleft: 536870912,
            timeleft: '00:15:30',
          },
          {
            title: 'Series S01E02',
            status: 'queued',
            downloadId: 'download-2',
            protocol: 'usenet',
            size: 2147483648,
            sizeleft: 2147483648,
            errorMessage: 'Paused',
          },
        ],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockQueue,
      } as Response) as any;

      const queue = await client.getQueue();

      expect(queue.app).toBe('sonarr');
      expect(queue.totalRecords).toBe(2);
      expect(queue.count).toBe(2);
      expect(queue.items).toHaveLength(2);
      expect(queue.items[0]).toMatchObject({
        title: 'Series S01E01',
        status: 'downloading',
        protocol: 'torrent',
      });
    });

    it('should handle empty queue', async () => {
      const mockQueue = {
        totalRecords: 0,
        records: [],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockQueue,
      } as Response) as any;

      const queue = await client.getQueue();

      expect(queue.totalRecords).toBe(0);
      expect(queue.count).toBe(0);
      expect(queue.items).toEqual([]);
    });

    it('should handle queue without records field', async () => {
      const mockQueue = {
        totalRecords: 0,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockQueue,
      } as Response) as any;

      const queue = await client.getQueue();

      expect(queue.count).toBe(0);
      expect(queue.items).toEqual([]);
    });

    it('should throw error when queue request fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response) as any;

      await expect(client.getQueue()).rejects.toThrow('sonarr API error: 403');
    });
  });

  describe('getDiskSpace', () => {
    it('should get disk space with percentage calculations', async () => {
      const mockDiskSpace = [
        {
          path: '/mnt/media',
          label: 'Media',
          freeSpace: 500000000000,
          totalSpace: 1000000000000,
        },
        {
          path: '/mnt/downloads',
          label: 'Downloads',
          freeSpace: 100000000000,
          totalSpace: 200000000000,
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockDiskSpace,
      } as Response) as any;

      const diskSpace = await client.getDiskSpace();

      expect(diskSpace).toHaveLength(2);
      expect(diskSpace[0]).toEqual({
        app: 'sonarr',
        path: '/mnt/media',
        label: 'Media',
        freeSpace: 500000000000,
        totalSpace: 1000000000000,
        percentUsed: 50,
      });
      expect(diskSpace[1]?.percentUsed).toBe(50);
    });

    it('should handle zero total space', async () => {
      const mockDiskSpace = [
        {
          path: '/mnt/empty',
          label: 'Empty',
          freeSpace: 0,
          totalSpace: 0,
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockDiskSpace,
      } as Response) as any;

      const diskSpace = await client.getDiskSpace();

      expect(diskSpace[0]?.percentUsed).toBe(0);
    });

    it('should throw error when disk space request fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response) as any;

      await expect(client.getDiskSpace()).rejects.toThrow('sonarr API error: 500');
    });
  });

  describe('getHistory', () => {
    it('should get history with default page size', async () => {
      const mockHistory = {
        page: 1,
        totalRecords: 50,
        records: [
          {
            sourceTitle: 'Series.S01E01.1080p',
            quality: { quality: { name: '1080p WEBDL' } },
            date: '2024-01-01T12:00:00Z',
            eventType: 'grabbed',
            downloadId: 'download-1',
            data: { indexer: 'Test Indexer' },
          },
        ],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistory,
      } as Response) as any;

      const history = await client.getHistory();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8989/api/v3/history?pageSize=10',
        expect.any(Object),
      );

      expect(history.app).toBe('sonarr');
      expect(history.page).toBe(1);
      expect(history.totalRecords).toBe(50);
      expect(history.items).toHaveLength(1);
      expect(history.items[0]).toMatchObject({
        title: 'Series.S01E01.1080p',
        quality: '1080p WEBDL',
        eventType: 'grabbed',
      });
    });

    it('should get history with custom page size', async () => {
      const mockHistory = {
        page: 1,
        totalRecords: 100,
        records: [],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistory,
      } as Response) as any;

      await client.getHistory(25);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8989/api/v3/history?pageSize=25',
        expect.any(Object),
      );
    });

    it('should handle empty history', async () => {
      const mockHistory = {
        page: 1,
        totalRecords: 0,
        records: [],
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistory,
      } as Response) as any;

      const history = await client.getHistory();

      expect(history.items).toEqual([]);
    });

    it('should handle history without records field', async () => {
      const mockHistory = {
        page: 1,
        totalRecords: 0,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistory,
      } as Response) as any;

      const history = await client.getHistory();

      expect(history.items).toEqual([]);
    });

    it('should throw error when history request fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response) as any;

      await expect(client.getHistory()).rejects.toThrow('sonarr API error: 404');
    });
  });

  describe('getCalendar', () => {
    it('should get calendar with default days', async () => {
      const mockCalendar = [
        {
          title: 'Series Name',
          airDate: '2024-01-05',
          hasFile: true,
          monitored: true,
        },
        {
          series: { title: 'Another Series' },
          airDate: '2024-01-06',
          hasFile: false,
          monitored: true,
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalendar,
      } as Response) as any;

      const calendar = await client.getCalendar();

      expect(calendar.app).toBe('sonarr');
      expect(calendar.items).toHaveLength(2);
      expect(calendar.items[0]).toMatchObject({
        title: 'Series Name',
        airDate: '2024-01-05',
        hasFile: true,
      });
      expect(calendar.items[1]?.title).toBe('Another Series');
    });

    it('should get calendar with custom days', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response) as any;

      await client.getCalendar(14);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0] as any;
      const url = callArgs[0] as string;
      expect(url).toContain('/calendar?start=');
      expect(url).toContain('&end=');
    });

    it('should handle calendar with release date instead of air date', async () => {
      const mockCalendar = [
        {
          title: 'Movie Title',
          releaseDate: '2024-01-10',
          hasFile: false,
          monitored: true,
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalendar,
      } as Response) as any;

      const calendar = await client.getCalendar();

      expect(calendar.items[0]?.airDate).toBe('2024-01-10');
    });

    it('should handle calendar with unknown title', async () => {
      const mockCalendar = [
        {
          airDate: '2024-01-10',
          hasFile: false,
          monitored: true,
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalendar,
      } as Response) as any;

      const calendar = await client.getCalendar();

      expect(calendar.items[0]?.title).toBe('Unknown');
    });

    it('should return empty items on error', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response) as any;

      const calendar = await client.getCalendar();

      expect(calendar.app).toBe('sonarr');
      expect(calendar.items).toEqual([]);
    });

    it('should return empty items on network error', async () => {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('Network error')) as any;

      const calendar = await client.getCalendar();

      expect(calendar.items).toEqual([]);
    });
  });

  describe('getSeverity', () => {
    it('should return error for error type', () => {
      const severity = (client as any).getSeverity('IndexerError');
      expect(severity).toBe('error');
    });

    it('should return error for ERROR in uppercase', () => {
      const severity = (client as any).getSeverity('DOWNLOAD_ERROR');
      expect(severity).toBe('error');
    });

    it('should return warning for warning type', () => {
      const severity = (client as any).getSeverity('IndexerWarning');
      expect(severity).toBe('warning');
    });

    it('should return warning for WARNING in uppercase', () => {
      const severity = (client as any).getSeverity('UPDATE_WARNING');
      expect(severity).toBe('warning');
    });

    it('should return info for other types', () => {
      const severity = (client as any).getSeverity('IndexerCheck');
      expect(severity).toBe('info');
    });

    it('should return info for empty string', () => {
      const severity = (client as any).getSeverity('');
      expect(severity).toBe('info');
    });
  });
});

describe('PlexClient', () => {
  let client: PlexClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    client = new PlexClient({
      host: 'localhost',
      port: 32400,
      token: 'test-plex-token',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct baseUrl', () => {
      const testClient = new PlexClient({
        host: 'plex.local',
        port: 32400,
        token: 'my-token',
      });

      expect((testClient as any).baseUrl).toBe('http://plex.local:32400');
      expect((testClient as any).token).toBe('my-token');
    });
  });

  describe('getStatus', () => {
    it('should return online status when Plex is available', async () => {
      const mockIdentity = {
        version: '1.32.5.7516',
        machineIdentifier: 'plex-server-1',
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockIdentity,
      } as Response) as any;

      const status = await client.getStatus();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:32400/identity',
        expect.objectContaining({
          headers: {
            'X-Plex-Token': 'test-plex-token',
          },
        }),
      );

      expect(status).toEqual({
        online: true,
        version: '1.32.5.7516',
        name: 'plex-server-1',
      });
    });

    it('should return offline when API request fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response) as any;

      const status = await client.getStatus();

      expect(status).toEqual({ online: false });
    });

    it('should return offline on network error', async () => {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('Connection refused')) as any;

      const status = await client.getStatus();

      expect(status).toEqual({ online: false });
    });
  });

  describe('getSessions', () => {
    it('should get active sessions', async () => {
      const mockSessions = {
        MediaContainer: {
          size: 2,
          Metadata: [
            {
              User: { title: 'User1' },
              title: 'Movie Title',
              Player: { state: 'playing' },
              Session: { bandwidth: 8000 },
            },
            {
              User: { title: 'User2' },
              title: 'TV Show S01E01',
              Player: { state: 'paused' },
              Session: { bandwidth: 4000 },
            },
          ],
        },
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockSessions,
      } as Response) as any;

      const sessions = await client.getSessions();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:32400/status/sessions',
        expect.objectContaining({
          headers: {
            'X-Plex-Token': 'test-plex-token',
            Accept: 'application/json',
          },
        }),
      );

      expect(sessions.active).toBe(2);
      expect(sessions.sessions).toHaveLength(2);
      expect(sessions.sessions[0]).toEqual({
        user: 'User1',
        title: 'Movie Title',
        state: 'playing',
        bandwidth: 8000,
      });
    });

    it('should handle empty sessions', async () => {
      const mockSessions = {
        MediaContainer: {
          size: 0,
          Metadata: [],
        },
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockSessions,
      } as Response) as any;

      const sessions = await client.getSessions();

      expect(sessions.active).toBe(0);
      expect(sessions.sessions).toEqual([]);
    });

    it('should handle missing MediaContainer', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response) as any;

      const sessions = await client.getSessions();

      expect(sessions.active).toBe(0);
      expect(sessions.sessions).toEqual([]);
    });

    it('should handle sessions with missing optional fields', async () => {
      const mockSessions = {
        MediaContainer: {
          size: 1,
          Metadata: [
            {
              title: 'Unknown User Stream',
            },
          ],
        },
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockSessions,
      } as Response) as any;

      const sessions = await client.getSessions();

      expect(sessions.sessions[0]).toEqual({
        user: 'Unknown',
        title: 'Unknown User Stream',
        state: 'unknown',
        bandwidth: 0,
      });
    });

    it('should return empty sessions on API error', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response) as any;

      const sessions = await client.getSessions();

      expect(sessions.active).toBe(0);
      expect(sessions.sessions).toEqual([]);
    });

    it('should return empty sessions on network error', async () => {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('Network timeout')) as any;

      const sessions = await client.getSessions();

      expect(sessions.active).toBe(0);
      expect(sessions.sessions).toEqual([]);
    });
  });
});

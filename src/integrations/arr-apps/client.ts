import { createLogger } from '../../utils/logger.js';

const logger = createLogger('arr-client');

interface ArrConfig {
  host: string;
  port: number;
  apiKey: string;
  ssl?: boolean;
}

export class ArrClient {
  private baseUrl: string;
  private apiKey: string;
  public name: string;

  constructor(name: string, config: ArrConfig) {
    this.name = name;
    const protocol = config.ssl ? 'https' : 'http';
    this.baseUrl = `${protocol}://${config.host}:${config.port}/api/v3`;
    this.apiKey = config.apiKey;
  }

  private async request<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        headers: {
          'X-Api-Key': this.apiKey,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`${this.name} API error: ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      logger.error({ err: error, app: this.name }, 'Arr API request failed');
      throw error;
    }
  }

  async getSystemStatus(): Promise<{
    app: string;
    version: string;
    branch: string;
    authentication: string;
    startTime: Date;
    isProduction: boolean;
    isDebug: boolean;
  }> {
    const status = await this.request<{
      version: string;
      branch: string;
      authentication: string;
      startTime: string;
      isProduction: boolean;
      isDebug: boolean;
    }>('/system/status');

    return {
      app: this.name,
      version: status.version,
      branch: status.branch,
      authentication: status.authentication,
      startTime: new Date(status.startTime),
      isProduction: status.isProduction,
      isDebug: status.isDebug,
    };
  }

  async getHealth(): Promise<
    Array<{
      app: string;
      source: string;
      type: string;
      message: string;
      wikiUrl?: string;
      severity: 'info' | 'warning' | 'error';
    }>
  > {
    const health = await this.request<
      Array<{
        source: string;
        type: string;
        message: string;
        wikiUrl?: string;
      }>
    >('/health');

    return health.map((issue) => ({
      app: this.name,
      source: issue.source,
      type: issue.type,
      message: issue.message,
      wikiUrl: issue.wikiUrl,
      severity: this.getSeverity(issue.type),
    }));
  }

  async getQueue(): Promise<{
    app: string;
    totalRecords: number;
    count: number;
    items: Array<{
      title: string;
      status: string;
      trackedDownloadStatus?: string;
      statusMessages?: unknown[];
      errorMessage?: string;
      downloadId: string;
      protocol: string;
      size: number;
      sizeleft: number;
      timeleft?: string;
    }>;
  }> {
    const queue = await this.request<{
      totalRecords: number;
      records?: Array<{
        title: string;
        status: string;
        trackedDownloadStatus?: string;
        statusMessages?: unknown[];
        errorMessage?: string;
        downloadId: string;
        protocol: string;
        size: number;
        sizeleft: number;
        timeleft?: string;
      }>;
    }>('/queue');

    return {
      app: this.name,
      totalRecords: queue.totalRecords,
      count: queue.records?.length || 0,
      items:
        queue.records?.map((item) => ({
          title: item.title,
          status: item.status,
          trackedDownloadStatus: item.trackedDownloadStatus,
          statusMessages: item.statusMessages,
          errorMessage: item.errorMessage,
          downloadId: item.downloadId,
          protocol: item.protocol,
          size: item.size,
          sizeleft: item.sizeleft,
          timeleft: item.timeleft,
        })) || [],
    };
  }

  async getDiskSpace(): Promise<
    Array<{
      app: string;
      path: string;
      label: string;
      freeSpace: number;
      totalSpace: number;
      percentUsed: number;
    }>
  > {
    const diskSpace = await this.request<
      Array<{
        path: string;
        label: string;
        freeSpace: number;
        totalSpace: number;
      }>
    >('/diskspace');

    return diskSpace.map((disk) => ({
      app: this.name,
      path: disk.path,
      label: disk.label,
      freeSpace: disk.freeSpace,
      totalSpace: disk.totalSpace,
      percentUsed: disk.totalSpace > 0 ? ((disk.totalSpace - disk.freeSpace) / disk.totalSpace) * 100 : 0,
    }));
  }

  async getHistory(pageSize: number = 10): Promise<{
    app: string;
    page: number;
    totalRecords: number;
    items: Array<{
      title: string;
      quality?: string;
      date: Date;
      eventType: string;
      downloadId: string;
      data?: unknown;
    }>;
  }> {
    const history = await this.request<{
      page: number;
      totalRecords: number;
      records?: Array<{
        sourceTitle: string;
        quality?: { quality?: { name: string } };
        date: string;
        eventType: string;
        downloadId: string;
        data?: unknown;
      }>;
    }>(`/history?pageSize=${pageSize}`);

    return {
      app: this.name,
      page: history.page,
      totalRecords: history.totalRecords,
      items:
        history.records?.map((item) => ({
          title: item.sourceTitle,
          quality: item.quality?.quality?.name,
          date: new Date(item.date),
          eventType: item.eventType,
          downloadId: item.downloadId,
          data: item.data,
        })) || [],
    };
  }

  async getCalendar(days: number = 7): Promise<{
    app: string;
    items: Array<{
      title: string;
      airDate: string;
      hasFile: boolean;
      monitored: boolean;
    }>;
  }> {
    const start = new Date().toISOString();
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    try {
      const calendar = await this.request<
        Array<{
          title?: string;
          series?: { title: string };
          airDate?: string;
          releaseDate?: string;
          hasFile: boolean;
          monitored: boolean;
        }>
      >(`/calendar?start=${start}&end=${end}`);

      return {
        app: this.name,
        items: calendar.map((item) => ({
          title: item.title || item.series?.title || 'Unknown',
          airDate: item.airDate || item.releaseDate || '',
          hasFile: item.hasFile,
          monitored: item.monitored,
        })),
      };
    } catch {
      return { app: this.name, items: [] };
    }
  }

  private getSeverity(type: string): 'info' | 'warning' | 'error' {
    if (type.toLowerCase().includes('error')) {
      return 'error';
    }
    if (type.toLowerCase().includes('warning')) {
      return 'warning';
    }
    return 'info';
  }
}

// Specialized Plex client
export class PlexClient {
  private baseUrl: string;
  private token: string;

  constructor(config: { host: string; port: number; token: string }) {
    this.baseUrl = `http://${config.host}:${config.port}`;
    this.token = config.token;
  }

  async getStatus(): Promise<{
    online: boolean;
    version?: string;
    name?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/identity`, {
        headers: {
          'X-Plex-Token': this.token,
        },
      });

      if (!response.ok) {
        return { online: false };
      }

      const data = (await response.json()) as {
        version?: string;
        machineIdentifier?: string;
      };

      return {
        online: true,
        version: data.version,
        name: data.machineIdentifier,
      };
    } catch {
      return { online: false };
    }
  }

  async getSessions(): Promise<{
    active: number;
    sessions: Array<{
      user: string;
      title: string;
      state: string;
      bandwidth: number;
    }>;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/status/sessions`, {
        headers: {
          'X-Plex-Token': this.token,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return { active: 0, sessions: [] };
      }

      const data = (await response.json()) as {
        MediaContainer?: {
          size?: number;
          Metadata?: Array<{
            User?: { title: string };
            title: string;
            Player?: { state: string };
            Session?: { bandwidth: number };
          }>;
        };
      };

      const sessions =
        data.MediaContainer?.Metadata?.map((session) => ({
          user: session.User?.title || 'Unknown',
          title: session.title,
          state: session.Player?.state || 'unknown',
          bandwidth: session.Session?.bandwidth || 0,
        })) || [];

      return {
        active: data.MediaContainer?.size || 0,
        sessions,
      };
    } catch {
      return { active: 0, sessions: [] };
    }
  }
}

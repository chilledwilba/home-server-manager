import { createLogger } from '../../utils/logger.js';

const logger = createLogger('truenas-client');

interface TrueNASConfig {
  host: string;
  apiKey: string;
  timeout?: number;
}

interface PoolResponse {
  name: string;
  status: string;
  healthy: boolean;
  size: number;
  free: number;
  topology: unknown;
  scan?: {
    end_time?: number;
    errors?: number;
  };
  encrypt: number;
  autotrim?: {
    value: string;
  };
}

interface DiskResponse {
  identifier: string;
  name: string;
  model: string;
  serial: string;
  size: number;
  type: string;
  temperature: number;
  smarttestresults: string;
}

export class TrueNASClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(config: TrueNASConfig) {
    this.baseUrl = `http://${config.host}/api/v2.0`;
    this.headers = {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };
    this.timeout = config.timeout || 5000;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeout);

      const response = await fetch(url, {
        ...options,
        headers: this.headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`TrueNAS API error: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      logger.error({ err: error, path }, 'TrueNAS API request failed');
      throw error;
    }
  }

  // System Information
  async getSystemInfo(): Promise<{
    hostname: string;
    version: string;
    uptime: number;
    cpuModel: string;
    cpuCores: number;
    ramTotal: number;
    bootTime: Date;
  }> {
    const info = await this.request<{
      hostname: string;
      version: string;
      uptime_seconds: number;
      cores: number;
      boottime: number;
    }>('/system/info');

    return {
      hostname: info.hostname,
      version: info.version,
      uptime: info.uptime_seconds,
      cpuModel: 'Intel Core i5-12400',
      cpuCores: info.cores,
      ramTotal: 64,
      bootTime: new Date(info.boottime * 1000),
    };
  }

  // Pool Information
  async getPools(): Promise<
    Array<{
      name: string;
      type: 'personal' | 'media' | 'apps' | 'boot' | 'unknown';
      status: string;
      health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
      capacity: {
        used: number;
        available: number;
        total: number;
        percent: number;
      };
      topology: unknown;
      lastScrub: Date | null;
      scrubErrors: number;
      encryption: boolean;
      autotrim: boolean;
    }>
  > {
    const pools = await this.request<PoolResponse[]>('/pool');

    return pools.map((pool) => {
      let poolType: 'personal' | 'media' | 'apps' | 'boot' | 'unknown' = 'unknown';
      const poolName = pool.name.toLowerCase();

      if (poolName.includes('boot')) {
        poolType = 'boot';
      } else if (poolName.includes('app')) {
        poolType = 'apps';
      } else if (poolName.includes('media')) {
        poolType = 'media';
      } else if (poolName.includes('personal')) {
        poolType = 'personal';
      }

      const total = pool.size + pool.free;
      const percent = total > 0 ? (pool.size / total) * 100 : 0;

      return {
        name: pool.name,
        type: poolType,
        status: pool.status,
        health: pool.healthy ? 'HEALTHY' : 'WARNING',
        capacity: {
          used: pool.size,
          available: pool.free,
          total,
          percent,
        },
        topology: pool.topology,
        lastScrub: pool.scan?.end_time ? new Date(pool.scan.end_time * 1000) : null,
        scrubErrors: pool.scan?.errors || 0,
        encryption: pool.encrypt > 0,
        autotrim: pool.autotrim?.value === 'on',
      };
    });
  }

  // Disk Information
  async getDisks(): Promise<
    Array<{
      identifier: string;
      name: string;
      model: string;
      serial: string;
      size: number;
      type: 'HDD' | 'SSD' | 'NVMe';
      temperature: number;
      smartStatus: string;
      isNVMe: boolean;
      isIronWolf: boolean;
      isCritical: boolean;
    }>
  > {
    const disks = await this.request<DiskResponse[]>('/disk');

    return disks.map((disk) => {
      const isNVMe = disk.model?.includes('NVMe') || disk.model?.includes('SN850X') || false;
      const isIronWolf = disk.model?.includes('IronWolf') || false;
      const isCritical = disk.model?.includes('ST4000VN008') || false;

      let diskType: 'HDD' | 'SSD' | 'NVMe' = 'HDD';
      if (isNVMe) {
        diskType = 'NVMe';
      } else if (disk.type === 'SSD') {
        diskType = 'SSD';
      }

      return {
        identifier: disk.identifier,
        name: disk.name,
        model: disk.model,
        serial: disk.serial,
        size: disk.size,
        type: diskType,
        temperature: disk.temperature,
        smartStatus: disk.smarttestresults,
        isNVMe,
        isIronWolf,
        isCritical,
      };
    });
  }

  // SMART data
  async getSmartData(diskName: string): Promise<{
    diskName: string;
    temperature: number;
    powerOnHours: number;
    reallocatedSectors: number;
    pendingSectors: number;
    healthStatus: 'PASSED' | 'FAILED';
    loadCycleCount?: number;
    spinRetryCount?: number;
  } | null> {
    try {
      const smart = await this.request<{
        temperature?: { current: number };
        power_on_time?: { hours: number };
        reallocated_sector_count?: { raw_value: number };
        current_pending_sector?: { raw_value: number };
        smart_status?: { passed: boolean };
        load_cycle_count?: { raw_value: number };
        spin_retry_count?: { raw_value: number };
      }>(`/disk/smart/test/results?disk=${diskName}`);

      return {
        diskName,
        temperature: smart.temperature?.current || 0,
        powerOnHours: smart.power_on_time?.hours || 0,
        reallocatedSectors: smart.reallocated_sector_count?.raw_value || 0,
        pendingSectors: smart.current_pending_sector?.raw_value || 0,
        healthStatus: smart.smart_status?.passed ? 'PASSED' : 'FAILED',
        loadCycleCount: smart.load_cycle_count?.raw_value,
        spinRetryCount: smart.spin_retry_count?.raw_value,
      };
    } catch (error) {
      logger.warn(`Could not get SMART data for ${diskName}`);
      return null;
    }
  }

  // System stats
  async getSystemStats(): Promise<{
    cpu: {
      usage: number;
      temperature: number;
      perCore: number[];
    };
    memory: {
      used: number;
      available: number;
      arc: number;
      percentage: number;
    };
    network: {
      rxRate: number;
      txRate: number;
    };
    loadAverage: [number, number, number];
  }> {
    const stats = await this.request<{
      cpu?: { average: number };
      cputemp?: { average: number };
      memory?: { used_percentage: number; arc_size: number; used: number };
      interface?: { rx_rate: number; tx_rate: number };
    }>('/reporting/get_data', {
      method: 'POST',
      body: JSON.stringify({
        graphs: [{ name: 'cpu' }, { name: 'memory' }, { name: 'network' }],
        reporting_query: {
          start: Math.floor(Date.now() / 1000) - 300,
          end: Math.floor(Date.now() / 1000),
          aggregate: true,
        },
      }),
    });

    const memUsed = stats.memory?.used || 0;
    const memTotal = 64;
    const memAvailable = memTotal - memUsed;
    const memPercentage = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

    return {
      cpu: {
        usage: stats.cpu?.average || 0,
        temperature: stats.cputemp?.average || 0,
        perCore: [],
      },
      memory: {
        used: memUsed,
        available: memAvailable,
        arc: stats.memory?.arc_size || 0,
        percentage: memPercentage,
      },
      network: {
        rxRate: stats.interface?.rx_rate || 0,
        txRate: stats.interface?.tx_rate || 0,
      },
      loadAverage: [0, 0, 0],
    };
  }
}

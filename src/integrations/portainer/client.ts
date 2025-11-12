import { createLogger } from '../../utils/logger.js';

const logger = createLogger('portainer-client');

// Global types for fetch API
type RequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

interface PortainerConfig {
  host: string;
  port: number;
  token: string;
  endpointId?: number;
}

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  imageTag: string;
  state: string;
  status: string;
  created: Date;
  ports: Array<{
    private: number;
    public?: number;
    type: string;
  }>;
  labels: Record<string, string>;
  isArrApp: boolean;
  isPlex: boolean;
  isCritical: boolean;
}

export interface ContainerStats {
  cpu: {
    percentage: number;
    cores: number;
  };
  memory: {
    used: number;
    limit: number;
    percentage: number;
  };
  network: {
    rx: number;
    tx: number;
  };
  io: {
    read: number;
    write: number;
  };
}

export class PortainerClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private endpointId: number;

  constructor(config: PortainerConfig) {
    this.baseUrl = `http://${config.host}:${config.port}/api`;
    this.headers = {
      'X-API-Key': config.token,
      'Content-Type': 'application/json',
    };
    this.endpointId = config.endpointId || 1;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`Portainer API error: ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      logger.error({ err: error, path }, 'Portainer API request failed');
      throw error;
    }
  }

  /**
   * Retrieves all Docker containers from the Portainer endpoint
   *
   * @returns Array of container information including status, ports, and labels
   * @throws {Error} If the Portainer API request fails
   *
   * @example
   * ```typescript
   * const containers = await client.getContainers();
   * console.log(containers[0].name); // 'plex'
   * console.log(containers[0].state); // 'running'
   * ```
   */
  async getContainers(): Promise<ContainerInfo[]> {
    const containers = await this.request<
      Array<{
        Id: string;
        Names: string[];
        Image: string;
        ImageID: string;
        State: string;
        Status: string;
        Created: number;
        Ports?: Array<{
          PrivatePort: number;
          PublicPort?: number;
          Type: string;
        }>;
        Labels: Record<string, string>;
      }>
    >(`/endpoints/${this.endpointId}/docker/containers/json?all=true`);

    return containers.map((container) => ({
      id: container.Id,
      name: container.Names[0]?.replace('/', '') || 'unknown',
      image: container.Image,
      imageTag: container.ImageID,
      state: container.State,
      status: container.Status,
      created: new Date(container.Created * 1000),
      ports:
        container.Ports?.map((p) => ({
          private: p.PrivatePort,
          public: p.PublicPort,
          type: p.Type,
        })) || [],
      labels: container.Labels || {},
      isArrApp: this.isArrApp(container.Names[0] || ''),
      isPlex: (container.Names[0] || '').includes('plex'),
      isCritical: this.isCritical(container.Names[0] || ''),
    }));
  }

  /**
   * Retrieves real-time resource usage statistics for a specific container
   *
   * @param containerId - The Docker container ID
   * @returns Container statistics including CPU, memory, network, and I/O metrics
   * @throws {Error} If the container doesn't exist or API request fails
   *
   * @example
   * ```typescript
   * const stats = await client.getContainerStats('abc123');
   * console.log(`CPU: ${stats.cpu.percentage}%`);
   * console.log(`Memory: ${stats.memory.percentage}%`);
   * ```
   */
  async getContainerStats(containerId: string): Promise<ContainerStats> {
    const stats = await this.request<{
      cpu_stats: {
        cpu_usage: { total_usage: number };
        system_cpu_usage: number;
        online_cpus: number;
      };
      precpu_stats: {
        cpu_usage: { total_usage: number };
        system_cpu_usage: number;
      };
      memory_stats: {
        usage: number;
        limit: number;
        stats?: { cache: number };
      };
      networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
      blkio_stats?: {
        io_service_bytes_recursive?: Array<{ op: string; value: number }>;
      };
    }>(`/endpoints/${this.endpointId}/docker/containers/${containerId}/stats?stream=false`);

    // Calculate CPU percentage
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent =
      systemDelta > 0 ? (cpuDelta / systemDelta) * 100 * stats.cpu_stats.online_cpus : 0;

    // Calculate memory
    const memoryUsed = stats.memory_stats.usage - (stats.memory_stats.stats?.cache || 0);
    const memoryLimit = stats.memory_stats.limit;
    const memoryPercent = memoryLimit > 0 ? (memoryUsed / memoryLimit) * 100 : 0;

    // Network stats
    const networks = stats.networks || {};
    let rxBytes = 0;
    let txBytes = 0;
    Object.values(networks).forEach((net) => {
      rxBytes += net.rx_bytes;
      txBytes += net.tx_bytes;
    });

    // Block I/O
    let readBytes = 0;
    let writeBytes = 0;
    stats.blkio_stats?.io_service_bytes_recursive?.forEach((io) => {
      if (io.op === 'read') {
        readBytes += io.value;
      }
      if (io.op === 'write') {
        writeBytes += io.value;
      }
    });

    return {
      cpu: {
        percentage: cpuPercent,
        cores: stats.cpu_stats.online_cpus,
      },
      memory: {
        used: memoryUsed,
        limit: memoryLimit,
        percentage: memoryPercent,
      },
      network: {
        rx: rxBytes,
        tx: txBytes,
      },
      io: {
        read: readBytes,
        write: writeBytes,
      },
    };
  }

  /**
   * Retrieves recent log entries from a container
   *
   * @param containerId - The Docker container ID
   * @param lines - Number of log lines to retrieve (default: 100)
   * @returns Array of log lines with Docker prefix removed
   * @throws {Error} If the container doesn't exist or API request fails
   *
   * @example
   * ```typescript
   * const logs = await client.getContainerLogs('abc123', 50);
   * logs.forEach(line => console.log(line));
   * ```
   */
  async getContainerLogs(containerId: string, lines: number = 100): Promise<string[]> {
    const response = await fetch(
      `${this.baseUrl}/endpoints/${this.endpointId}/docker/containers/${containerId}/logs?stdout=true&stderr=true&tail=${lines}`,
      { headers: this.headers },
    );

    const text = await response.text();
    // Parse Docker log format (remove timestamps and stream indicators)
    const cleanedLogs = text
      .split('\n')
      .map((line) => line.substring(8)) // Remove Docker log prefix
      .filter((line) => line.trim() !== '');

    return cleanedLogs;
  }

  /**
   * Restarts a Docker container
   *
   * @param containerId - The Docker container ID to restart
   * @returns True if restart was initiated successfully
   * @throws {Error} If write operations are disabled or API request fails
   *
   * @example
   * ```typescript
   * await client.restartContainer('abc123');
   * console.log('Container restarted');
   * ```
   */
  async restartContainer(containerId: string): Promise<boolean> {
    if (!this.isWriteEnabled()) {
      throw new Error('Write operations are disabled');
    }

    await this.request(`/endpoints/${this.endpointId}/docker/containers/${containerId}/restart`, {
      method: 'POST',
    });

    logger.info(`Container ${containerId} restart initiated`);
    return true;
  }

  async stopContainer(containerId: string): Promise<boolean> {
    if (!this.isWriteEnabled()) {
      throw new Error('Write operations are disabled');
    }

    await this.request(`/endpoints/${this.endpointId}/docker/containers/${containerId}/stop`, {
      method: 'POST',
    });

    return true;
  }

  async startContainer(containerId: string): Promise<boolean> {
    if (!this.isWriteEnabled()) {
      throw new Error('Write operations are disabled');
    }

    await this.request(`/endpoints/${this.endpointId}/docker/containers/${containerId}/start`, {
      method: 'POST',
    });

    return true;
  }

  // Stack Management (Phase 8)

  /**
   * List all stacks
   */
  async getStacks(): Promise<
    Array<{
      Id: number;
      Name: string;
      Type: number;
      Status: number;
      EndpointId: number;
      SwarmId?: string;
      Env?: Array<{ name: string; value: string }>;
    }>
  > {
    try {
      return await this.request<
        Array<{
          Id: number;
          Name: string;
          Type: number;
          Status: number;
          EndpointId: number;
          SwarmId?: string;
          Env?: Array<{ name: string; value: string }>;
        }>
      >('/stacks');
    } catch (error) {
      logger.error({ err: error }, 'Failed to list stacks');
      throw error;
    }
  }

  /**
   * Deploy a new stack from docker-compose
   */
  async deployStack(
    name: string,
    dockerCompose: string,
    endpointId?: number,
    env?: Array<{ name: string; value: string }>,
  ): Promise<{
    Id: number;
    Name: string;
    Type: number;
    EndpointId: number;
  }> {
    try {
      const endpoint = endpointId || this.endpointId;

      logger.info({ name, endpoint }, 'Deploying stack');

      // Portainer expects the stack to be deployed via the compose standalone endpoint
      const response = await this.request<{
        Id: number;
        Name: string;
        Type: number;
        EndpointId: number;
      }>(`/stacks/create/standalone/string?endpointId=${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          stackFileContent: dockerCompose,
          env: env || [],
        }),
      });

      logger.info({ stackId: response.Id, name }, 'Stack deployed successfully');
      return response;
    } catch (error) {
      logger.error({ err: error, name }, 'Failed to deploy stack');
      throw error;
    }
  }

  /**
   * Delete a stack
   */
  async deleteStack(stackId: number, endpointId?: number): Promise<void> {
    try {
      const endpoint = endpointId || this.endpointId;

      logger.info({ stackId, endpoint }, 'Deleting stack');

      await this.request(`/stacks/${stackId}?endpointId=${endpoint}`, {
        method: 'DELETE',
      });

      logger.info({ stackId }, 'Stack deleted successfully');
    } catch (error) {
      logger.error({ err: error, stackId }, 'Failed to delete stack');
      throw error;
    }
  }

  /**
   * Update an existing stack
   */
  async updateStack(
    stackId: number,
    dockerCompose: string,
    env?: Array<{ name: string; value: string }>,
    endpointId?: number,
  ): Promise<void> {
    try {
      const endpoint = endpointId || this.endpointId;

      logger.info({ stackId, endpoint }, 'Updating stack');

      await this.request(`/stacks/${stackId}?endpointId=${endpoint}`, {
        method: 'PUT',
        body: JSON.stringify({
          stackFileContent: dockerCompose,
          env: env || [],
          prune: false,
        }),
      });

      logger.info({ stackId }, 'Stack updated successfully');
    } catch (error) {
      logger.error({ err: error, stackId }, 'Failed to update stack');
      throw error;
    }
  }

  /**
   * Get stack details by ID
   */
  async getStack(stackId: number): Promise<{
    Id: number;
    Name: string;
    Type: number;
    Status: number;
    EndpointId: number;
    Env?: Array<{ name: string; value: string }>;
  }> {
    try {
      return await this.request<{
        Id: number;
        Name: string;
        Type: number;
        Status: number;
        EndpointId: number;
        Env?: Array<{ name: string; value: string }>;
      }>(`/stacks/${stackId}`);
    } catch (error) {
      logger.error({ err: error, stackId }, 'Failed to get stack details');
      throw error;
    }
  }

  // Helper methods
  private isArrApp(name: string): boolean {
    const arrApps = ['sonarr', 'radarr', 'prowlarr', 'lidarr', 'readarr', 'bazarr'];
    return arrApps.some((app) => name?.toLowerCase().includes(app));
  }

  private isCritical(name: string): boolean {
    const critical = ['plex', 'sonarr', 'radarr', 'prowlarr', 'nginx', 'traefik'];
    return critical.some((app) => name?.toLowerCase().includes(app));
  }

  private isWriteEnabled(): boolean {
    return process.env['ENABLE_WRITE_OPERATIONS'] === 'true';
  }
}

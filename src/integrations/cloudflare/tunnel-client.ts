import { logger } from '../../utils/logger.js';

interface TunnelConfig {
  tunnelId?: string;
  accountId: string;
  apiToken: string;
}

interface Tunnel {
  id: string;
  name: string;
  status: string;
  created_at: string;
  connections: TunnelConnection[];
}

interface TunnelConnection {
  id: string;
  client_id: string;
  opened_at: string;
  origin_ip: string;
}

/**
 * Cloudflare Tunnel API Client
 * Manages Cloudflare Tunnel (cloudflared) for zero-trust access
 */
export class CloudflareTunnelClient {
  private baseUrl = 'https://api.cloudflare.com/client/v4';
  private tunnelId?: string;

  constructor(private config: TunnelConfig) {
    this.tunnelId = config.tunnelId;
  }

  /**
   * List all tunnels for the account
   */
  async listTunnels(): Promise<Tunnel[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/accounts/${this.config.accountId}/cfd_tunnel`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to list tunnels: ${response.statusText}`);
      }

      const data = (await response.json()) as { result: Tunnel[] };
      return data.result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to list Cloudflare tunnels');
      throw error;
    }
  }

  /**
   * Get tunnel details
   */
  async getTunnel(tunnelId?: string): Promise<Tunnel> {
    const id = tunnelId || this.tunnelId;
    if (!id) {
      throw new Error('No tunnel ID provided');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/accounts/${this.config.accountId}/cfd_tunnel/${id}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to get tunnel: ${response.statusText}`);
      }

      const data = (await response.json()) as { result: Tunnel };
      return data.result;
    } catch (error) {
      logger.error({ err: error }, `Failed to get tunnel ${id}`);
      throw error;
    }
  }

  /**
   * Get tunnel connections
   */
  async getTunnelConnections(tunnelId?: string): Promise<TunnelConnection[]> {
    const id = tunnelId || this.tunnelId;
    if (!id) {
      throw new Error('No tunnel ID provided');
    }

    try {
      const tunnel = await this.getTunnel(id);
      return tunnel.connections || [];
    } catch (error) {
      logger.error({ err: error }, `Failed to get tunnel connections for ${id}`);
      throw error;
    }
  }

  /**
   * Check if tunnel is healthy
   */
  async isHealthy(tunnelId?: string): Promise<boolean> {
    try {
      const tunnel = await this.getTunnel(tunnelId);
      return (
        tunnel.status === 'active' && tunnel.connections && tunnel.connections.length > 0
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to check tunnel health');
      return false;
    }
  }

  /**
   * Delete tunnel
   */
  async deleteTunnel(tunnelId?: string): Promise<void> {
    const id = tunnelId || this.tunnelId;
    if (!id) {
      throw new Error('No tunnel ID provided');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/accounts/${this.config.accountId}/cfd_tunnel/${id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to delete tunnel: ${response.statusText}`);
      }

      logger.info(`Tunnel ${id} deleted successfully`);
    } catch (error) {
      logger.error({ err: error }, `Failed to delete tunnel ${id}`);
      throw error;
    }
  }

  /**
   * Get tunnel metrics
   */
  async getMetrics(tunnelId?: string): Promise<{
    active_connections: number;
    status: string;
    healthy: boolean;
  }> {
    try {
      const tunnel = await this.getTunnel(tunnelId);
      return {
        active_connections: tunnel.connections?.length || 0,
        status: tunnel.status,
        healthy: await this.isHealthy(tunnelId),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get tunnel metrics');
      return {
        active_connections: 0,
        status: 'unknown',
        healthy: false,
      };
    }
  }
}

import type { MCPConfig } from '../tool-handler-types.js';

/**
 * TrueNAS Tool Handlers
 * Handles TrueNAS system, storage, and SMART monitoring tools
 */
export class TrueNASHandlers {
  constructor(private config: MCPConfig) {}

  async getSystemInfo(): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!this.config.truenas) {
      return {
        content: [
          {
            type: 'text',
            text: 'TrueNAS integration not configured',
          },
        ],
      };
    }

    const info = await this.config.truenas.getSystemInfo();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(info, null, 2),
        },
      ],
    };
  }

  async getSystemStats(): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!this.config.truenas) {
      return {
        content: [
          {
            type: 'text',
            text: 'TrueNAS integration not configured',
          },
        ],
      };
    }

    const stats = await this.config.truenas.getSystemStats();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }

  async getPoolStatus(args: {
    poolName?: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!this.config.truenas) {
      return {
        content: [
          {
            type: 'text',
            text: 'TrueNAS integration not configured',
          },
        ],
      };
    }

    const pools = await this.config.truenas.getPools();
    const filtered = args.poolName
      ? pools.filter((p: { name: string }) => p.name === args.poolName)
      : pools;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(filtered, null, 2),
        },
      ],
    };
  }

  async getDiskSmart(args: {
    diskName: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!this.config.truenas) {
      return {
        content: [
          {
            type: 'text',
            text: 'TrueNAS integration not configured',
          },
        ],
      };
    }

    const smart = await this.config.truenas.getSmartData(args.diskName);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(smart, null, 2),
        },
      ],
    };
  }
}

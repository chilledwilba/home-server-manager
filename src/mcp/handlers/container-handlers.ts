import type { MCPConfig, PendingAction } from '../tool-handler-types.js';

/**
 * Container Tool Handlers
 * Handles Portainer container management, logs, stats, and restart operations
 */
export class ContainerHandlers {
  constructor(
    private config: MCPConfig,
    private pendingActions: Map<string, PendingAction>,
    private generateActionId: () => string,
  ) {}

  async listContainers(): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!this.config.portainer) {
      return {
        content: [
          {
            type: 'text',
            text: 'Portainer integration not configured',
          },
        ],
      };
    }

    const containers = await this.config.portainer.getContainers();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(containers, null, 2),
        },
      ],
    };
  }

  async getContainerLogs(args: {
    containerId: string;
    lines?: number;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!this.config.portainer) {
      return {
        content: [
          {
            type: 'text',
            text: 'Portainer integration not configured',
          },
        ],
      };
    }

    const logs = await this.config.portainer.getContainerLogs(args.containerId, args.lines || 100);
    return {
      content: [
        {
          type: 'text',
          text: logs.join('\n'),
        },
      ],
    };
  }

  async getContainerStats(args: {
    containerId: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!this.config.portainer) {
      return {
        content: [
          {
            type: 'text',
            text: 'Portainer integration not configured',
          },
        ],
      };
    }

    const stats = await this.config.portainer.getContainerStats(args.containerId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }

  async restartContainer(args: {
    containerId: string;
    reason: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!this.config.portainer) {
      return {
        content: [
          {
            type: 'text',
            text: 'Portainer integration not configured',
          },
        ],
      };
    }

    if (this.config.requireConfirmation) {
      const actionId = this.generateActionId();
      this.pendingActions.set(actionId, {
        type: 'restart_container',
        input: args,
        timestamp: new Date(),
      });

      return {
        content: [
          {
            type: 'text',
            text: `⚠️ ACTION REQUIRES CONFIRMATION ⚠️

Action: Restart container ${args.containerId}
Reason: ${args.reason}

To confirm this action, use confirmation ID: ${actionId}

This action will:
1. Send stop signal to container
2. Wait for graceful shutdown
3. Start container with same configuration

Impact: Service will be unavailable for ~10-30 seconds`,
          },
        ],
      };
    }

    await this.config.portainer.restartContainer(args.containerId);
    return {
      content: [
        {
          type: 'text',
          text: `Container ${args.containerId} restart initiated`,
        },
      ],
    };
  }
}

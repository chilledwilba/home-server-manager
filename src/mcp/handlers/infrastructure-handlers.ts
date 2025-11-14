import type { MCPConfig, PendingAction } from '../tool-handler-types.js';

/**
 * Infrastructure Tool Handlers
 * Handles service deployment, removal, docker-compose generation, and service information
 */
export class InfrastructureHandlers {
  constructor(
    private config: MCPConfig,
    private pendingActions: Map<string, PendingAction>,
    private generateActionId: () => string,
  ) {}

  async getServiceInfo(args: {
    serviceName: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    const analysis = await this.config.infrastructure.analyzeInfrastructure();
    const allServices = [...analysis.deployed, ...analysis.recommended, ...analysis.missing];

    const service = allServices.find(
      (s) => s.name.toLowerCase() === args.serviceName.toLowerCase(),
    );

    if (!service) {
      return {
        content: [
          {
            type: 'text',
            text: `Service '${args.serviceName}' not found. Available services: ${allServices.map((s) => s.name).join(', ')}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(service, null, 2),
        },
      ],
    };
  }

  async getDockerCompose(args: {
    serviceName: string;
    envVars?: Record<string, string>;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const dockerCompose = await this.config.infrastructure.generateDockerCompose(
        args.serviceName,
        args.envVars,
      );

      return {
        content: [
          {
            type: 'text',
            text: `Docker Compose for ${args.serviceName}:\n\n\`\`\`yaml\n${dockerCompose}\n\`\`\``,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error generating docker-compose: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  async deployService(args: {
    serviceName: string;
    stackName?: string;
    envVars?: Record<string, string>;
    autoStart?: boolean;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (this.config.requireConfirmation) {
      const actionId = this.generateActionId();
      this.pendingActions.set(actionId, {
        type: 'deploy_service',
        input: args,
        timestamp: new Date(),
      });

      return {
        content: [
          {
            type: 'text',
            text: `⚠️ DEPLOYMENT REQUIRES CONFIRMATION ⚠️

Service: ${args.serviceName}
Stack Name: ${args.stackName || args.serviceName.toLowerCase().replace(/\\s+/g, '-')}
Auto-start: ${args.autoStart !== false ? 'Yes' : 'No'}
Environment Variables: ${args.envVars ? Object.keys(args.envVars).length + ' provided' : 'None'}

To confirm this deployment, use confirmation ID: ${actionId}

This action will:
1. Generate docker-compose configuration
2. Deploy to Portainer
3. ${args.autoStart !== false ? 'Start containers automatically' : 'Leave containers stopped'}

Impact: New infrastructure component will be deployed`,
          },
        ],
      };
    }

    const result = await this.config.infrastructure.deployService(args.serviceName, {
      stackName: args.stackName,
      envVars: args.envVars,
      autoStart: args.autoStart,
    });

    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `✅ Service '${args.serviceName}' deployed successfully!\nStack ID: ${result.stackId}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to deploy '${args.serviceName}': ${result.error}`,
          },
        ],
      };
    }
  }

  async removeService(args: {
    serviceName: string;
    reason: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (this.config.requireConfirmation) {
      const actionId = this.generateActionId();
      this.pendingActions.set(actionId, {
        type: 'remove_service',
        input: args,
        timestamp: new Date(),
      });

      return {
        content: [
          {
            type: 'text',
            text: `⚠️ REMOVAL REQUIRES CONFIRMATION ⚠️

Service: ${args.serviceName}
Reason: ${args.reason}

To confirm this removal, use confirmation ID: ${actionId}

This action will:
1. Stop all containers in the service
2. Remove the Docker stack
3. Mark as removed in database

Impact: Service will be completely removed and unavailable`,
          },
        ],
      };
    }

    const result = await this.config.infrastructure.removeService(args.serviceName);

    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `✅ Service '${args.serviceName}' removed successfully!`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to remove '${args.serviceName}': ${result.error}`,
          },
        ],
      };
    }
  }
}

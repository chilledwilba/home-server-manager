import type { MCPConfig, PendingAction } from '../tool-handler-types.js';

/**
 * Analysis Tool Handlers
 * Handles action confirmation, problem analysis, and infrastructure analysis
 */
export class AnalysisHandlers {
  constructor(
    private config: MCPConfig,
    private pendingActions: Map<string, PendingAction>,
  ) {}

  async confirmAction(args: {
    actionId: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    const action = this.pendingActions.get(args.actionId);

    if (!action) {
      return {
        content: [
          {
            type: 'text',
            text: 'Invalid or expired action ID',
          },
        ],
      };
    }

    // Check if action is not too old (5 minutes)
    const age = Date.now() - action.timestamp.getTime();
    if (age > 5 * 60 * 1000) {
      this.pendingActions.delete(args.actionId);
      return {
        content: [
          {
            type: 'text',
            text: 'Action expired (older than 5 minutes)',
          },
        ],
      };
    }

    // Execute the action
    let result = '';
    if (action.type === 'restart_container' && this.config.portainer) {
      const input = action.input as { containerId: string };
      await this.config.portainer.restartContainer(input.containerId);
      result = `Container ${input.containerId} restarted successfully`;
    } else if (action.type === 'deploy_service') {
      const input = action.input as {
        serviceName: string;
        stackName?: string;
        envVars?: Record<string, string>;
        autoStart?: boolean;
      };
      const deployResult = await this.config.infrastructure.deployService(input.serviceName, {
        stackName: input.stackName,
        envVars: input.envVars,
        autoStart: input.autoStart,
      });
      result = deployResult.success
        ? `✅ Service '${input.serviceName}' deployed successfully! Stack ID: ${deployResult.stackId}`
        : `❌ Failed to deploy '${input.serviceName}': ${deployResult.error}`;
    } else if (action.type === 'remove_service') {
      const input = action.input as { serviceName: string };
      const removeResult = await this.config.infrastructure.removeService(input.serviceName);
      result = removeResult.success
        ? `✅ Service '${input.serviceName}' removed successfully!`
        : `❌ Failed to remove '${input.serviceName}': ${removeResult.error}`;
    } else {
      result = 'Unknown action type or service not configured';
    }

    this.pendingActions.delete(args.actionId);
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  async analyzeProblem(args: {
    problem: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    // Gather relevant data
    const containers = this.config.portainer ? await this.config.portainer.getContainers() : [];
    const alerts = this.config.db
      .prepare(
        `
        SELECT * FROM alerts
        WHERE resolved = 0
        ORDER BY triggered_at DESC
        LIMIT 10
      `,
      )
      .all();
    const recentMetrics = this.config.db
      .prepare(
        `
        SELECT * FROM metrics
        WHERE timestamp > datetime('now', '-1 hour')
        ORDER BY timestamp DESC
      `,
      )
      .all() as Array<{ cpu_percent: number; ram_used_gb: number }>;

    const system = this.config.truenas ? await this.config.truenas.getSystemStats() : null;

    const analysis = {
      problem: args.problem,
      currentState: {
        cpu: system?.cpu?.usage || 0,
        memory: system?.memory?.used || 0,
        activeAlerts: alerts.length,
        stoppedContainers: containers
          .filter((c: { state: string }) => c.state !== 'running')
          .map((c: { name: string }) => c.name),
      },
      recentTrends: {
        avgCpu: recentMetrics.reduce((a, m) => a + m.cpu_percent, 0) / recentMetrics.length || 0,
        maxMemory: Math.max(...recentMetrics.map((m) => m.ram_used_gb)) || 0,
      },
      possibleCauses: [] as string[],
      recommendations: [] as string[],
    };

    // Simple analysis logic
    const problem = args.problem.toLowerCase();
    if (problem.includes('slow')) {
      if (system && system.cpu.usage > 80) {
        analysis.possibleCauses.push('High CPU usage detected');
        analysis.recommendations.push('Check for CPU-intensive processes');
      }
      if (system && system.memory.used > 58) {
        analysis.possibleCauses.push('High memory usage');
        analysis.recommendations.push('Consider restarting memory-heavy containers');
      }
    }

    if (problem.includes('plex')) {
      const plexContainer = containers.find((c: { name?: string }) => c.name?.includes('plex'));
      if (plexContainer) {
        analysis.possibleCauses.push(`Plex is ${(plexContainer as { state: string }).state}`);
        if ((plexContainer as { state: string }).state !== 'running') {
          analysis.recommendations.push('Restart Plex container');
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(analysis, null, 2),
        },
      ],
    };
  }

  async analyzeInfrastructure(): Promise<{ content: Array<{ type: string; text: string }> }> {
    const analysis = await this.config.infrastructure.analyzeInfrastructure();

    const summary = {
      deployed: analysis.deployed.map((s) => ({
        name: s.name,
        type: s.type,
        priority: s.priority,
        deployed: true,
      })),
      recommended: analysis.recommended.map((s) => ({
        name: s.name,
        type: s.type,
        priority: s.priority,
        description: s.description,
        reason: s.benefits?.join(', '),
      })),
      missing: analysis.missing.map((s) => ({
        name: s.name,
        type: s.type,
        priority: s.priority,
        description: s.description,
      })),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  }
}

import type { TrueNASClient } from '../integrations/truenas/client.js';
import type { PortainerClient } from '../integrations/portainer/client.js';
import type { InfrastructureManager } from '../services/infrastructure/manager.js';
import type Database from 'better-sqlite3';

interface MCPConfig {
  truenas?: TrueNASClient;
  portainer?: PortainerClient;
  infrastructure: InfrastructureManager;
  db: Database.Database;
  requireConfirmation: boolean;
}

interface PendingAction {
  type: string;
  input: Record<string, unknown>;
  timestamp: Date;
}

/**
 * MCP Tool Handlers
 * Implements all tool execution logic
 */
export class ToolHandlers {
  private config: MCPConfig;
  private pendingActions: Map<string, PendingAction>;

  constructor(config: MCPConfig, pendingActions: Map<string, PendingAction>) {
    this.config = config;
    this.pendingActions = pendingActions;
  }

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

  // eslint-disable-next-line @typescript-eslint/require-await
  async getRecentAlerts(args: {
    severity?: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    let query = `
      SELECT * FROM alerts
      WHERE resolved = 0
    `;

    if (args.severity) {
      query += ` AND severity = ?`;
    }

    query += ` ORDER BY triggered_at DESC LIMIT 20`;

    const alerts = args.severity
      ? this.config.db.prepare(query).all(args.severity)
      : this.config.db.prepare(query).all();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(alerts, null, 2),
        },
      ],
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getMetricsHistory(args: {
    metric: string;
    hours?: number;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    const hours = args.hours || 24;
    const query = `
      SELECT timestamp, cpu_percent, ram_used_gb, network_rx_mbps, network_tx_mbps
      FROM metrics
      WHERE timestamp > datetime('now', '-${hours} hours')
      ORDER BY timestamp DESC
    `;

    const metrics = this.config.db.prepare(query).all();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(metrics, null, 2),
        },
      ],
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSecurityFindings(): Promise<{ content: Array<{ type: string; text: string }> }> {
    const findings = this.config.db
      .prepare(
        `
      SELECT * FROM security_findings
      WHERE fixed = 0
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `,
      )
      .all();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(findings, null, 2),
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

  // === Infrastructure Management Tools (Phase 8) ===

  async analyzeInfrastructure(): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSecurityStatus(): Promise<{ content: Array<{ type: string; text: string }> }> {
    const securityLog = this.config.db
      .prepare(
        `
      SELECT * FROM security_status_log
      ORDER BY timestamp DESC
      LIMIT 1
    `,
      )
      .get() as
      | {
          timestamp: string;
          overall_health: string;
          tunnel_healthy: number;
          auth_healthy: number;
          fail2ban_healthy: number;
          banned_ips_count: number;
          active_sessions: number;
        }
      | undefined;

    if (!securityLog) {
      return {
        content: [
          {
            type: 'text',
            text: 'No security status available. Security orchestrator may not be configured or running.',
          },
        ],
      };
    }

    const status = {
      timestamp: securityLog.timestamp,
      overall_health: securityLog.overall_health,
      components: {
        cloudflare_tunnel: {
          healthy: securityLog.tunnel_healthy === 1,
          status: securityLog.tunnel_healthy === 1 ? 'operational' : 'degraded',
        },
        authentik_sso: {
          healthy: securityLog.auth_healthy === 1,
          active_sessions: securityLog.active_sessions,
          status: securityLog.auth_healthy === 1 ? 'operational' : 'degraded',
        },
        fail2ban: {
          healthy: securityLog.fail2ban_healthy === 1,
          banned_ips: securityLog.banned_ips_count,
          status: securityLog.fail2ban_healthy === 1 ? 'operational' : 'degraded',
        },
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  generateActionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

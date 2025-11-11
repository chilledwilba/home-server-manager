import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../utils/logger.js';
import { TrueNASClient } from '../integrations/truenas/client.js';
import { PortainerClient } from '../integrations/portainer/client.js';
import { getDatabase } from '../db/connection.js';
import { InfrastructureManager } from '../services/infrastructure/manager.js';
import type Database from 'better-sqlite3';

const logger = createLogger('mcp-server');

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

export class HomeServerMCP {
  private server: Server;
  private config: MCPConfig;
  private pendingActions: Map<string, PendingAction> = new Map();

  constructor(config: MCPConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: 'home-server-monitor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    );

    this.setupHandlers();
    this.setupErrorHandlers();
  }

  private setupErrorHandlers(): void {
    this.server.onerror = (error) => {
      logger.error({ err: error }, 'MCP server error');
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_system_info',
            description: 'Get TrueNAS system information including CPU, RAM, uptime',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_system_stats',
            description: 'Get current system statistics (CPU, memory, network)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_pool_status',
            description: 'Get ZFS pool status and health information',
            inputSchema: {
              type: 'object',
              properties: {
                poolName: {
                  type: 'string',
                  description: 'Optional pool name to filter',
                },
              },
            },
          },
          {
            name: 'get_disk_smart',
            description: 'Get SMART data for drives to check health',
            inputSchema: {
              type: 'object',
              properties: {
                diskName: {
                  type: 'string',
                  description: 'Disk identifier (e.g., sda)',
                },
              },
              required: ['diskName'],
            },
          },
          {
            name: 'list_containers',
            description: 'List all Docker containers and their status',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_container_logs',
            description: 'Get recent logs from a container',
            inputSchema: {
              type: 'object',
              properties: {
                containerId: {
                  type: 'string',
                  description: 'Container ID or name',
                },
                lines: {
                  type: 'number',
                  description: 'Number of log lines to retrieve',
                  default: 100,
                },
              },
              required: ['containerId'],
            },
          },
          {
            name: 'get_container_stats',
            description: 'Get resource usage stats for a container',
            inputSchema: {
              type: 'object',
              properties: {
                containerId: {
                  type: 'string',
                  description: 'Container ID or name',
                },
              },
              required: ['containerId'],
            },
          },
          {
            name: 'get_recent_alerts',
            description: 'Get recent system alerts and warnings',
            inputSchema: {
              type: 'object',
              properties: {
                severity: {
                  type: 'string',
                  description: 'Filter by severity: critical, warning, info',
                  enum: ['critical', 'warning', 'info'],
                },
              },
            },
          },
          {
            name: 'get_metrics_history',
            description: 'Get historical metrics for analysis',
            inputSchema: {
              type: 'object',
              properties: {
                metric: {
                  type: 'string',
                  description: 'Metric type: cpu, memory, network, storage',
                  enum: ['cpu', 'memory', 'network', 'storage'],
                },
                hours: {
                  type: 'number',
                  description: 'Hours of history to retrieve',
                  default: 24,
                },
              },
              required: ['metric'],
            },
          },
          {
            name: 'get_security_findings',
            description: 'Get current security issues and recommendations',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'restart_container',
            description: 'Restart a Docker container (requires confirmation)',
            inputSchema: {
              type: 'object',
              properties: {
                containerId: {
                  type: 'string',
                  description: 'Container ID or name to restart',
                },
                reason: {
                  type: 'string',
                  description: 'Reason for restart',
                },
              },
              required: ['containerId', 'reason'],
            },
          },
          {
            name: 'confirm_action',
            description: 'Confirm a pending action using its ID',
            inputSchema: {
              type: 'object',
              properties: {
                actionId: {
                  type: 'string',
                  description: 'Action confirmation ID',
                },
              },
              required: ['actionId'],
            },
          },
          {
            name: 'analyze_problem',
            description: 'Analyze a problem based on system data',
            inputSchema: {
              type: 'object',
              properties: {
                problem: {
                  type: 'string',
                  description: 'Description of the problem',
                },
              },
              required: ['problem'],
            },
          },
          {
            name: 'analyze_infrastructure',
            description: 'Analyze current infrastructure and get recommendations (Phase 8)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_service_info',
            description: 'Get detailed information about an infrastructure service',
            inputSchema: {
              type: 'object',
              properties: {
                serviceName: {
                  type: 'string',
                  description: 'Name of the service (e.g., "Cloudflare Tunnel", "Traefik")',
                },
              },
              required: ['serviceName'],
            },
          },
          {
            name: 'get_docker_compose',
            description: 'Get docker-compose configuration for a service',
            inputSchema: {
              type: 'object',
              properties: {
                serviceName: {
                  type: 'string',
                  description: 'Name of the service',
                },
                envVars: {
                  type: 'object',
                  description: 'Optional environment variables as key-value pairs',
                },
              },
              required: ['serviceName'],
            },
          },
          {
            name: 'deploy_service',
            description: 'Deploy an infrastructure service (requires confirmation)',
            inputSchema: {
              type: 'object',
              properties: {
                serviceName: {
                  type: 'string',
                  description: 'Name of the service to deploy',
                },
                stackName: {
                  type: 'string',
                  description: 'Optional custom stack name',
                },
                envVars: {
                  type: 'object',
                  description: 'Environment variables as key-value pairs',
                },
                autoStart: {
                  type: 'boolean',
                  description: 'Auto-start containers after deployment',
                  default: true,
                },
              },
              required: ['serviceName'],
            },
          },
          {
            name: 'remove_service',
            description: 'Remove a deployed service (requires confirmation)',
            inputSchema: {
              type: 'object',
              properties: {
                serviceName: {
                  type: 'string',
                  description: 'Name of the service to remove',
                },
                reason: {
                  type: 'string',
                  description: 'Reason for removal',
                },
              },
              required: ['serviceName', 'reason'],
            },
          },
          {
            name: 'get_security_status',
            description: 'Get comprehensive security stack status (Phase 8)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_system_info':
            return await this.getSystemInfo();
          case 'get_system_stats':
            return await this.getSystemStats();
          case 'get_pool_status':
            return await this.getPoolStatus(args as { poolName?: string });
          case 'get_disk_smart':
            return await this.getDiskSmart(args as { diskName: string });
          case 'list_containers':
            return await this.listContainers();
          case 'get_container_logs':
            return await this.getContainerLogs(args as { containerId: string; lines?: number });
          case 'get_container_stats':
            return await this.getContainerStats(args as { containerId: string });
          case 'get_recent_alerts':
            return await this.getRecentAlerts(args as { severity?: string });
          case 'get_metrics_history':
            return await this.getMetricsHistory(args as { metric: string; hours?: number });
          case 'get_security_findings':
            return await this.getSecurityFindings();
          case 'restart_container':
            return await this.restartContainer(args as { containerId: string; reason: string });
          case 'confirm_action':
            return await this.confirmAction(args as { actionId: string });
          case 'analyze_problem':
            return await this.analyzeProblem(args as { problem: string });
          case 'analyze_infrastructure':
            return await this.analyzeInfrastructure();
          case 'get_service_info':
            return await this.getServiceInfo(args as { serviceName: string });
          case 'get_docker_compose':
            return await this.getDockerCompose(
              args as { serviceName: string; envVars?: Record<string, string> },
            );
          case 'deploy_service':
            return await this.deployService(
              args as {
                serviceName: string;
                stackName?: string;
                envVars?: Record<string, string>;
                autoStart?: boolean;
              },
            );
          case 'remove_service':
            return await this.removeService(args as { serviceName: string; reason: string });
          case 'get_security_status':
            return await this.getSecurityStatus();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error({ err: error, tool: name }, 'Tool execution error');
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'server://config/system',
            name: 'System Configuration',
            description: 'Current system configuration and settings',
            mimeType: 'application/json',
          },
          {
            uri: 'server://docs/troubleshooting',
            name: 'Troubleshooting Guide',
            description: 'Common issues and solutions',
            mimeType: 'text/markdown',
          },
        ],
      };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'server://config/system') {
        const config = {
          truenas: {
            version: 'TrueNAS-SCALE-24.04.2.4',
            hardware: {
              cpu: 'Intel i5-12400',
              ram: '64GB DDR5',
              pools: [
                { name: 'personal', type: 'mirror', size: '4TB x2' },
                { name: 'media', type: 'single', size: '8TB' },
                { name: 'apps', type: 'ssd', size: '1TB NVMe' },
              ],
            },
          },
          docker: {
            runtime: 'Docker 24.x',
            orchestration: 'Portainer',
            containers: ['plex', 'sonarr', 'radarr', 'prowlarr'],
          },
        };

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(config, null, 2),
            },
          ],
        };
      }

      if (uri === 'server://docs/troubleshooting') {
        const guide = `# Troubleshooting Guide

## High CPU Usage
- Check for Plex transcoding (use QuickSync)
- Look for runaway containers
- Verify no intensive scrubs running

## High Memory Usage
- Normal for ZFS (ARC cache)
- Check container limits
- Review memory allocation

## Container Restarts
- Check logs for errors
- Verify resource limits
- Check mount points
`;

        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: guide,
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });

    // List prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'diagnose_system',
            description: 'Run full system diagnostics',
            arguments: [],
          },
          {
            name: 'security_audit',
            description: 'Perform security audit',
            arguments: [],
          },
          {
            name: 'optimize_performance',
            description: 'Analyze and optimize performance',
            arguments: [],
          },
        ],
      };
    });

    // Get prompt content
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name } = request.params;

      const prompts: Record<string, string> = {
        diagnose_system: `Please run a comprehensive system diagnosis:

1. Check system resources (CPU, memory, storage)
2. Verify all pools are healthy
3. Check container status
4. Review recent alerts
5. Identify any issues
6. Provide recommendations

Use available tools to gather data and provide a detailed analysis.`,

        security_audit: `Perform a security audit:

1. Check for exposed ports
2. Review container security
3. Check authentication settings
4. Identify vulnerabilities
5. Provide hardening recommendations

Focus on actionable items with clear steps to improve security.`,

        optimize_performance: `Analyze system performance and provide optimization recommendations:

1. Review resource usage patterns
2. Identify bottlenecks
3. Check for inefficient configurations
4. Suggest optimizations
5. Consider hardware capabilities (i5-12400 QuickSync, 64GB RAM, NVMe)

Provide specific, actionable recommendations.`,
      };

      const description = prompts[name];
      if (!description) {
        throw new Error(`Unknown prompt: ${name}`);
      }

      return {
        description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: description,
            },
          },
        ],
      };
    });
  }

  // Tool implementations
  private async getSystemInfo(): Promise<{ content: Array<{ type: string; text: string }> }> {
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

  private async getSystemStats(): Promise<{ content: Array<{ type: string; text: string }> }> {
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

  private async getPoolStatus(args: { poolName?: string }) {
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

  private async getDiskSmart(args: { diskName: string }) {
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

  private async listContainers(): Promise<{ content: Array<{ type: string; text: string }> }> {
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

  private async getContainerLogs(args: { containerId: string; lines?: number }) {
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

  private async getContainerStats(args: { containerId: string }) {
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

  private async getRecentAlerts(args: { severity?: string }) {
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

  private async getMetricsHistory(args: { metric: string; hours?: number }) {
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

  private async getSecurityFindings() {
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

  private async restartContainer(args: { containerId: string; reason: string }) {
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

  private async confirmAction(args: { actionId: string }) {
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

  private async analyzeProblem(args: { problem: string }) {
    // Gather relevant data
    const [containers, alerts, recentMetrics] = await Promise.all([
      this.config.portainer ? this.config.portainer.getContainers() : [],
      this.config.db
        .prepare(
          `
        SELECT * FROM alerts
        WHERE resolved = 0
        ORDER BY triggered_at DESC
        LIMIT 10
      `,
        )
        .all(),
      this.config.db
        .prepare(
          `
        SELECT * FROM metrics
        WHERE timestamp > datetime('now', '-1 hour')
        ORDER BY timestamp DESC
      `,
        )
        .all() as Array<{ cpu_percent: number; ram_used_gb: number }>,
    ]);

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

  private async analyzeInfrastructure() {
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

  private async getServiceInfo(args: { serviceName: string }) {
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

  private async getDockerCompose(args: { serviceName: string; envVars?: Record<string, string> }) {
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

  private async deployService(args: {
    serviceName: string;
    stackName?: string;
    envVars?: Record<string, string>;
    autoStart?: boolean;
  }) {
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

  private async removeService(args: { serviceName: string; reason: string }) {
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

  private async getSecurityStatus() {
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

  private generateActionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server started successfully');
  }
}

// Main execution
async function main(): Promise<void> {
  const db = getDatabase();

  let truenas: TrueNASClient | undefined;
  let portainer: PortainerClient | undefined;

  // Initialize TrueNAS if configured
  const trueNASHost = process.env['TRUENAS_HOST'];
  const trueNASKey = process.env['TRUENAS_API_KEY'];

  if (trueNASHost && trueNASKey && trueNASKey !== 'mock-truenas-api-key-replace-on-deploy') {
    truenas = new TrueNASClient({
      host: trueNASHost,
      apiKey: trueNASKey,
      timeout: 5000,
    });
  }

  // Initialize Portainer if configured
  const portainerHost = process.env['PORTAINER_HOST'];
  const portainerPort = parseInt(process.env['PORTAINER_PORT'] || '9000', 10);
  const portainerToken = process.env['PORTAINER_TOKEN'];

  if (
    portainerHost &&
    portainerToken &&
    portainerToken !== 'mock-portainer-token-replace-on-deploy'
  ) {
    portainer = new PortainerClient({
      host: portainerHost,
      port: portainerPort,
      token: portainerToken,
      endpointId: 1,
    });
  }

  // Initialize Infrastructure Manager (Phase 8)
  const infrastructure = new InfrastructureManager(db);

  const mcp = new HomeServerMCP({
    truenas,
    portainer,
    infrastructure,
    db,
    requireConfirmation: process.env['REQUIRE_CONFIRMATION'] !== 'false',
  });

  await mcp.start();
}

// Run if this is the main module
// In ES modules, we check if import.meta.url matches the process argv
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  void main();
}

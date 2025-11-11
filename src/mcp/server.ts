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
import type Database from 'better-sqlite3';

const logger = createLogger('mcp-server');

interface MCPConfig {
  truenas?: TrueNASClient;
  portainer?: PortainerClient;
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
  private async getSystemInfo() {
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

  private async getSystemStats() {
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

  private async listContainers() {
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

  const mcp = new HomeServerMCP({
    truenas,
    portainer,
    db,
    requireConfirmation: process.env['REQUIRE_CONFIRMATION'] !== 'false',
  });

  await mcp.start();
}

if (require.main === module) {
  void main();
}

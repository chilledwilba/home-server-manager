import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection.js';
import { PortainerClient } from '../integrations/portainer/client.js';
import { TrueNASClient } from '../integrations/truenas/client.js';
import { InfrastructureManager } from '../services/infrastructure/manager.js';
import { createLogger } from '../utils/logger.js';
import { getPromptContent, promptDefinitions } from './prompt-handlers.js';
import { getResourceContent, resourceDefinitions } from './resource-handlers.js';
import { toolDefinitions } from './tool-definitions.js';
import { ToolHandlers } from './tool-handlers.js';

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
  private pendingActions: Map<string, PendingAction> = new Map();
  private toolHandlers: ToolHandlers;

  constructor(config: MCPConfig) {
    this.toolHandlers = new ToolHandlers(config, this.pendingActions);
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
    this.server.onerror = (error): void => {
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
      return { tools: toolDefinitions };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_system_info':
            return await this.toolHandlers.getSystemInfo();
          case 'get_system_stats':
            return await this.toolHandlers.getSystemStats();
          case 'get_pool_status':
            return await this.toolHandlers.getPoolStatus(args as { poolName?: string });
          case 'get_disk_smart':
            return await this.toolHandlers.getDiskSmart(args as { diskName: string });
          case 'list_containers':
            return await this.toolHandlers.listContainers();
          case 'get_container_logs':
            return await this.toolHandlers.getContainerLogs(
              args as { containerId: string; lines?: number },
            );
          case 'get_container_stats':
            return await this.toolHandlers.getContainerStats(args as { containerId: string });
          case 'get_recent_alerts':
            return await this.toolHandlers.getRecentAlerts(args as { severity?: string });
          case 'get_metrics_history':
            return await this.toolHandlers.getMetricsHistory(
              args as { metric: string; hours?: number },
            );
          case 'get_security_findings':
            return await this.toolHandlers.getSecurityFindings();
          case 'restart_container':
            return await this.toolHandlers.restartContainer(
              args as { containerId: string; reason: string },
            );
          case 'confirm_action':
            return await this.toolHandlers.confirmAction(args as { actionId: string });
          case 'analyze_problem':
            return await this.toolHandlers.analyzeProblem(args as { problem: string });
          case 'analyze_infrastructure':
            return await this.toolHandlers.analyzeInfrastructure();
          case 'get_service_info':
            return await this.toolHandlers.getServiceInfo(args as { serviceName: string });
          case 'get_docker_compose':
            return await this.toolHandlers.getDockerCompose(
              args as { serviceName: string; envVars?: Record<string, string> },
            );
          case 'deploy_service':
            return await this.toolHandlers.deployService(
              args as {
                serviceName: string;
                stackName?: string;
                envVars?: Record<string, string>;
                autoStart?: boolean;
              },
            );
          case 'remove_service':
            return await this.toolHandlers.removeService(
              args as { serviceName: string; reason: string },
            );
          case 'get_security_status':
            return await this.toolHandlers.getSecurityStatus();
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
      return { resources: resourceDefinitions };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      try {
        return getResourceContent(uri);
      } catch (error) {
        throw new Error(
          `Failed to read resource: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    });

    // List prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: promptDefinitions };
    });

    // Get prompt content
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name } = request.params;
      try {
        return getPromptContent(name);
      } catch (error) {
        throw new Error(
          `Failed to get prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    });
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
  const infrastructure = new InfrastructureManager(db, portainer);

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

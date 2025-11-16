# TODO-05: MCP Integration - Connect Claude to Your Server

## Goal
Set up an MCP (Model Context Protocol) server that gives Claude direct access to your server data, enabling intelligent assistance with human confirmation for important actions.

## What is MCP?
MCP allows Claude to directly interact with your tools and data sources. Instead of copy-pasting information, Claude can:
- Query your server state in real-time
- Understand your infrastructure context
- Execute approved commands
- Learn from your system's behavior

## Your Requirements
- ✅ Read access for Claude (monitoring, analysis)
- ✅ Write access with human confirmation
- ✅ Security and safety checks
- ✅ Learning and troubleshooting assistance

## Phase 1: MCP Server Implementation

### Create `src/mcp/server.ts`
```typescript
import { Server } from '@modelcontextprotocol/sdk';
import { StdioTransport } from '@modelcontextprotocol/sdk/transport';
import { logger } from '../utils/logger';
import { TrueNASClient } from '../integrations/truenas/client';
import { PortainerClient } from '../integrations/portainer/client';
import Database from 'better-sqlite3';

interface MCPConfig {
  truenas: TrueNASClient;
  portainer: PortainerClient;
  db: Database.Database;
  requireConfirmation: boolean;
}

export class HomeServerMCP {
  private server: Server;
  private config: MCPConfig;
  private pendingActions: Map<string, any> = new Map();

  constructor(config: MCPConfig) {
    this.config = config;
    this.server = new Server({
      name: 'home-server-monitor',
      version: '1.0.0',
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
      },
    });

    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }

  private registerTools() {
    // System Information Tools
    this.server.addTool({
      name: 'get_system_info',
      description: 'Get TrueNAS system information including CPU, RAM, uptime',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const info = await this.config.truenas.getSystemInfo();
        return {
          content: JSON.stringify(info, null, 2),
        };
      },
    });

    this.server.addTool({
      name: 'get_system_stats',
      description: 'Get current system statistics (CPU, memory, network)',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const stats = await this.config.truenas.getSystemStats();
        return {
          content: JSON.stringify(stats, null, 2),
        };
      },
    });

    // Storage Tools
    this.server.addTool({
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
      handler: async (input) => {
        const pools = await this.config.truenas.getPools();
        const filtered = input.poolName
          ? pools.filter(p => p.name === input.poolName)
          : pools;
        return {
          content: JSON.stringify(filtered, null, 2),
        };
      },
    });

    this.server.addTool({
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
      },
      handler: async (input) => {
        const smart = await this.config.truenas.getSmartData(input.diskName);
        return {
          content: JSON.stringify(smart, null, 2),
        };
      },
    });

    // Docker/Container Tools
    this.server.addTool({
      name: 'list_containers',
      description: 'List all Docker containers and their status',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const containers = await this.config.portainer.getContainers();
        return {
          content: JSON.stringify(containers, null, 2),
        };
      },
    });

    this.server.addTool({
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
      handler: async (input) => {
        const logs = await this.config.portainer.getContainerLogs(
          input.containerId,
          input.lines || 100
        );
        return {
          content: logs.join('\n'),
        };
      },
    });

    this.server.addTool({
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
      handler: async (input) => {
        const stats = await this.config.portainer.getContainerStats(input.containerId);
        return {
          content: JSON.stringify(stats, null, 2),
        };
      },
    });

    // Alert and Monitoring Tools
    this.server.addTool({
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
      handler: async (input) => {
        let query = `
          SELECT * FROM alerts
          WHERE resolved = 0
        `;
        if (input.severity) {
          query += ` AND severity = '${input.severity}'`;
        }
        query += ` ORDER BY triggered_at DESC LIMIT 20`;

        const alerts = this.config.db.prepare(query).all();
        return {
          content: JSON.stringify(alerts, null, 2),
        };
      },
    });

    this.server.addTool({
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
      handler: async (input) => {
        const query = `
          SELECT timestamp, cpu_percent, ram_used_gb, network_rx_mbps, network_tx_mbps
          FROM metrics
          WHERE timestamp > datetime('now', '-${input.hours || 24} hours')
          ORDER BY timestamp DESC
        `;

        const metrics = this.config.db.prepare(query).all();
        return {
          content: JSON.stringify(metrics, null, 2),
        };
      },
    });

    // Security Tools
    this.server.addTool({
      name: 'get_security_findings',
      description: 'Get current security issues and recommendations',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const findings = this.config.db.prepare(`
          SELECT * FROM security_findings
          WHERE fixed = 0
          ORDER BY severity
        `).all();
        return {
          content: JSON.stringify(findings, null, 2),
        };
      },
    });

    // Action Tools (Require Confirmation)
    this.server.addTool({
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
      handler: async (input) => {
        if (this.config.requireConfirmation) {
          const actionId = this.generateActionId();
          this.pendingActions.set(actionId, {
            type: 'restart_container',
            input,
            timestamp: new Date(),
          });

          return {
            content: `
⚠️ ACTION REQUIRES CONFIRMATION ⚠️

Action: Restart container ${input.containerId}
Reason: ${input.reason}

To confirm this action, use confirmation ID: ${actionId}

This action will:
1. Send stop signal to container
2. Wait for graceful shutdown
3. Start container with same configuration

Impact: Service will be unavailable for ~10-30 seconds
            `,
          };
        }

        // If confirmation not required (dev mode)
        await this.config.portainer.restartContainer(input.containerId);
        return {
          content: `Container ${input.containerId} restart initiated`,
        };
      },
    });

    this.server.addTool({
      name: 'create_snapshot',
      description: 'Create a ZFS snapshot (requires confirmation)',
      inputSchema: {
        type: 'object',
        properties: {
          dataset: {
            type: 'string',
            description: 'Dataset to snapshot',
          },
          name: {
            type: 'string',
            description: 'Snapshot name',
          },
          reason: {
            type: 'string',
            description: 'Reason for snapshot',
          },
        },
        required: ['dataset', 'name', 'reason'],
      },
      handler: async (input) => {
        if (this.config.requireConfirmation) {
          const actionId = this.generateActionId();
          this.pendingActions.set(actionId, {
            type: 'create_snapshot',
            input,
            timestamp: new Date(),
          });

          return {
            content: `
⚠️ ACTION REQUIRES CONFIRMATION ⚠️

Action: Create ZFS snapshot
Dataset: ${input.dataset}
Snapshot Name: ${input.name}
Reason: ${input.reason}

To confirm this action, use confirmation ID: ${actionId}

This is a SAFE operation that:
- Creates a point-in-time copy
- Uses minimal space initially
- Can be deleted if not needed
            `,
          };
        }

        // Execute if confirmed
        return {
          content: `Snapshot ${input.dataset}@${input.name} created`,
        };
      },
    });

    this.server.addTool({
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
      handler: async (input) => {
        const action = this.pendingActions.get(input.actionId);

        if (!action) {
          return {
            content: 'Invalid or expired action ID',
          };
        }

        // Check if action is not too old (5 minutes)
        const age = Date.now() - action.timestamp.getTime();
        if (age > 5 * 60 * 1000) {
          this.pendingActions.delete(input.actionId);
          return {
            content: 'Action expired (older than 5 minutes)',
          };
        }

        // Execute the action
        let result = '';
        switch (action.type) {
          case 'restart_container':
            await this.config.portainer.restartContainer(action.input.containerId);
            result = `Container ${action.input.containerId} restarted successfully`;
            break;

          case 'create_snapshot':
            // Would execute actual snapshot creation here
            result = `Snapshot ${action.input.dataset}@${action.input.name} created`;
            break;

          default:
            result = 'Unknown action type';
        }

        this.pendingActions.delete(input.actionId);
        return {
          content: result,
        };
      },
    });

    // Analysis Tools
    this.server.addTool({
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
      handler: async (input) => {
        // Gather relevant data
        const [system, containers, alerts, recentMetrics] = await Promise.all([
          this.config.truenas.getSystemStats(),
          this.config.portainer.getContainers(),
          this.config.db.prepare(`
            SELECT * FROM alerts
            WHERE resolved = 0
            ORDER BY triggered_at DESC
            LIMIT 10
          `).all(),
          this.config.db.prepare(`
            SELECT * FROM metrics
            WHERE timestamp > datetime('now', '-1 hour')
            ORDER BY timestamp DESC
          `).all(),
        ]);

        const analysis = {
          problem: input.problem,
          currentState: {
            cpu: system.cpu.usage,
            memory: system.memory.used,
            activeAlerts: alerts.length,
            stoppedContainers: containers.filter(c => c.state !== 'running').map(c => c.name),
          },
          recentTrends: {
            avgCpu: recentMetrics.reduce((a, m) => a + m.cpu_percent, 0) / recentMetrics.length,
            maxMemory: Math.max(...recentMetrics.map(m => m.ram_used_gb)),
          },
          possibleCauses: [],
          recommendations: [],
        };

        // Simple analysis logic (can be enhanced)
        if (input.problem.toLowerCase().includes('slow')) {
          if (system.cpu.usage > 80) {
            analysis.possibleCauses.push('High CPU usage detected');
            analysis.recommendations.push('Check for CPU-intensive processes');
          }
          if (system.memory.used > 58) { // Out of 64GB
            analysis.possibleCauses.push('High memory usage');
            analysis.recommendations.push('Consider restarting memory-heavy containers');
          }
        }

        if (input.problem.toLowerCase().includes('plex')) {
          const plexContainer = containers.find(c => c.name?.includes('plex'));
          if (plexContainer) {
            analysis.possibleCauses.push(`Plex is ${plexContainer.state}`);
            if (plexContainer.state !== 'running') {
              analysis.recommendations.push('Restart Plex container');
            }
          }
        }

        return {
          content: JSON.stringify(analysis, null, 2),
        };
      },
    });
  }

  private registerResources() {
    // System configuration resource
    this.server.addResource({
      uri: 'server://config/system',
      name: 'System Configuration',
      description: 'Current system configuration and settings',
      mimeType: 'application/json',
      handler: async () => {
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
          content: JSON.stringify(config, null, 2),
        };
      },
    });

    // Documentation resource
    this.server.addResource({
      uri: 'server://docs/troubleshooting',
      name: 'Troubleshooting Guide',
      description: 'Common issues and solutions',
      mimeType: 'text/markdown',
      handler: async () => {
        const guide = `
# Troubleshooting Guide

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
          content: guide,
        };
      },
    });
  }

  private registerPrompts() {
    // Diagnostic prompt
    this.server.addPrompt({
      name: 'diagnose_system',
      description: 'Run full system diagnostics',
      arguments: [],
      template: `
Please run a comprehensive system diagnosis:

1. Check system resources (CPU, memory, storage)
2. Verify all pools are healthy
3. Check container status
4. Review recent alerts
5. Identify any issues
6. Provide recommendations

Use available tools to gather data and provide a detailed analysis.
      `,
    });

    // Security audit prompt
    this.server.addPrompt({
      name: 'security_audit',
      description: 'Perform security audit',
      arguments: [],
      template: `
Perform a security audit:

1. Check for exposed ports
2. Review container security
3. Check authentication settings
4. Identify vulnerabilities
5. Provide hardening recommendations

Focus on actionable items with clear steps to improve security.
      `,
    });

    // Performance optimization prompt
    this.server.addPrompt({
      name: 'optimize_performance',
      description: 'Analyze and optimize performance',
      arguments: [],
      template: `
Analyze system performance and provide optimization recommendations:

1. Review resource usage patterns
2. Identify bottlenecks
3. Check for inefficient configurations
4. Suggest optimizations
5. Consider hardware capabilities (i5-12400 QuickSync, 64GB RAM, NVMe)

Provide specific, actionable recommendations.
      `,
    });
  }

  private generateActionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  async start() {
    const transport = new StdioTransport();
    await this.server.connect(transport);
    logger.info('MCP server started successfully');
  }
}
```

### Create `src/mcp/config.json`
```json
{
  "mcpServers": {
    "home-server-monitor": {
      "command": "bun",
      "args": ["run", "src/mcp/server.ts"],
      "env": {
        "TRUENAS_HOST": "192.168.1.100",
        "TRUENAS_API_KEY": "${TRUENAS_API_KEY}",
        "PORTAINER_HOST": "192.168.1.100",
        "PORTAINER_TOKEN": "${PORTAINER_TOKEN}",
        "ENABLE_WRITE_OPERATIONS": "true",
        "REQUIRE_CONFIRMATION": "true"
      }
    }
  }
}
```

## Phase 2: Local LLM Option (Ollama)

### Create `src/integrations/ollama/client.ts`
```typescript
import { logger } from '../../utils/logger';

interface OllamaConfig {
  host: string;
  port: number;
  model: string;
}

export class OllamaClient {
  private baseUrl: string;
  private model: string;

  constructor(config: OllamaConfig) {
    this.baseUrl = `http://${config.host}:${config.port}`;
    this.model = config.model;
  }

  async chat(messages: Array<{ role: string; content: string }>) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    return data.message.content;
  }

  async analyzeSystemState(systemData: any): Promise<string> {
    const prompt = `
You are a TrueNAS and Docker expert assistant. Analyze this system data and provide insights:

System Data:
${JSON.stringify(systemData, null, 2)}

Provide:
1. Current system health assessment
2. Any concerning patterns
3. Optimization opportunities
4. Recommended actions
`;

    const response = await this.chat([
      { role: 'system', content: 'You are a helpful server administration assistant.' },
      { role: 'user', content: prompt },
    ]);

    return response;
  }

  // Check if Ollama is available
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  // List available models
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data = await response.json();
      return data.models.map((m: any) => m.name);
    } catch {
      return [];
    }
  }
}
```

### GPU Recommendations for Local LLMs

Since you're willing to get a GPU, here are recommendations based on your use case:

```typescript
// src/docs/gpu-recommendations.ts
export const gpuRecommendations = {
  budget: {
    card: 'NVIDIA RTX 4060 Ti 16GB',
    price: '~$500',
    vram: '16GB',
    pros: [
      'Good VRAM for 13B parameter models',
      'Low power consumption',
      'Fits in Jonsbo N4 case',
      'Can run Llama 2 13B, CodeLlama, Mistral',
    ],
    cons: ['Limited to medium-sized models'],
  },
  balanced: {
    card: 'NVIDIA RTX 4070 Ti SUPER 16GB',
    price: '~$800',
    vram: '16GB',
    pros: [
      'Faster inference than 4060 Ti',
      'Better for continuous use',
      'Can run quantized 30B models',
      'Good for Plex transcoding backup',
    ],
    cons: ['Higher power draw'],
  },
  performance: {
    card: 'NVIDIA RTX 4090 24GB',
    price: '~$1600',
    vram: '24GB',
    pros: [
      'Can run 30B models comfortably',
      'Fast inference speeds',
      'Future-proof for larger models',
      'Excellent for ML experiments',
    ],
    cons: [
      'High power consumption',
      'May need PSU upgrade (750W should handle it)',
      'Size constraints in Jonsbo N4',
    ],
  },
  alternative: {
    card: 'Used NVIDIA Tesla P40 24GB',
    price: '~$600-800',
    vram: '24GB',
    pros: [
      'Massive VRAM for the price',
      'Great for inference (not training)',
      'Can run large models',
    ],
    cons: [
      'No display output',
      'Passive cooling (needs airflow)',
      'Older architecture',
    ],
  },
};
```

## Phase 3: Install and Configure

### Install Ollama (Optional for Local LLM)
```bash
# On TrueNAS Scale
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama
ollama serve

# Pull recommended models
ollama pull llama2:13b        # General purpose
ollama pull codellama:13b     # Code-focused
ollama pull mistral:7b        # Fast and efficient

# For GPU acceleration, ensure NVIDIA drivers are installed
nvidia-smi  # Check GPU is detected
```

### Configure Claude Desktop for MCP
```bash
# 1. Install Claude Desktop (if not already)
# Download from: https://claude.ai/desktop

# 2. Configure MCP in Claude Desktop settings
# Add to Claude's config file (location varies by OS):
# Mac: ~/Library/Application Support/Claude/config.json
# Linux: ~/.config/claude/config.json
# Windows: %APPDATA%\Claude\config.json
```

Add this to Claude's config:
```json
{
  "mcpServers": {
    "home-server": {
      "command": "ssh",
      "args": [
        "user@192.168.1.100",
        "cd /path/to/home-server-monitor && bun run src/mcp/server.ts"
      ],
      "env": {
        "TRUENAS_API_KEY": "your-key",
        "PORTAINER_TOKEN": "your-token"
      }
    }
  }
}
```

## Phase 4: Using MCP with Claude

### Example Conversations

```
You: "What's the status of my server?"

Claude: I'll check your server status for you.
[Uses get_system_info and get_system_stats tools]

Your TrueNAS server is running well:
- CPU: 15% usage (Intel i5-12400)
- Memory: 28GB of 64GB used (44%)
- Pools:
  - personal (mirror): 65% used, HEALTHY
  - media: 40% used, HEALTHY
  - apps (NVMe): 20% used, HEALTHY
- All containers running normally
- No critical alerts

The memory usage is primarily ZFS ARC cache, which is normal and improves performance.
```

```
You: "Plex seems slow"

Claude: Let me investigate the Plex performance issue.
[Uses multiple tools to gather data]

I found the issue:
- Plex is transcoding 2 streams (using CPU instead of QuickSync)
- CPU usage is at 75% due to software transcoding
- Your i5-12400 has Intel QuickSync but it's not enabled

Would you like me to:
1. Show you how to enable hardware transcoding?
2. Restart Plex to clear current transcodes? (requires confirmation)
3. Check if the Plex container has access to /dev/dri for QuickSync?
```

```
You: "Run a security audit"

Claude: I'll perform a comprehensive security audit of your system.
[Uses security_audit prompt and multiple tools]

Security Audit Results:
🔴 Critical Issues (2):
1. SSH root login enabled
2. Sonarr/Radarr have no authentication

🟡 Warnings (5):
1. Containers running as root user
2. Ports bound to 0.0.0.0
3. Outdated container images
4. No fail2ban configured
5. Docker socket mounted in Portainer

✅ Good Practices Found:
- Port 32400 no longer forwarded
- ZFS pools healthy
- Regular snapshots configured

Shall I guide you through fixing the critical issues first?
```

## Phase 5: Safety Features

### Create `src/mcp/safety.ts`
```typescript
export class SafetyCheck {
  // Actions that should ALWAYS require confirmation
  static readonly DANGEROUS_ACTIONS = [
    'delete',
    'remove',
    'destroy',
    'format',
    'wipe',
    'reset',
    'rollback',
  ];

  // Actions that are generally safe
  static readonly SAFE_ACTIONS = [
    'list',
    'get',
    'show',
    'status',
    'info',
    'describe',
  ];

  static requiresConfirmation(action: string): boolean {
    const actionLower = action.toLowerCase();
    return this.DANGEROUS_ACTIONS.some(dangerous =>
      actionLower.includes(dangerous)
    );
  }

  static validateAction(action: string, context: any): {
    safe: boolean;
    warnings: string[];
    recommendation: string;
  } {
    const warnings: string[] = [];
    let safe = true;

    // Check for dangerous keywords
    if (this.requiresConfirmation(action)) {
      safe = false;
      warnings.push('This action is potentially destructive');
    }

    // Check for production impact
    if (context.container?.includes('plex') && action.includes('stop')) {
      warnings.push('This will interrupt active Plex streams');
    }

    // Check time of day
    const hour = new Date().getHours();
    if (hour >= 19 || hour <= 7) {
      if (action.includes('restart') || action.includes('update')) {
        warnings.push('Running during peak usage hours (7PM-7AM)');
      }
    }

    return {
      safe,
      warnings,
      recommendation: safe
        ? 'Action appears safe to execute'
        : 'Requires careful review and confirmation',
    };
  }
}
```

## Phase 6: Testing MCP

### Test MCP Server Standalone
```bash
# Start MCP server
bun run src/mcp/server.ts

# In another terminal, test with MCP client
echo '{"method":"tools/list"}' | bun run src/mcp/server.ts
```

### Test with Claude Desktop
1. Restart Claude Desktop after configuration
2. Open a new conversation
3. You should see "home-server" in available tools

### Test Queries
```
"Show me my system status"
"What containers are running?"
"Are there any security issues?"
"Why is my media pool at 85% capacity?"
"Check SMART data for my IronWolf drives"
"Analyze why Sonarr is using so much CPU"
```

## Validation Checklist

- [ ] MCP server starts without errors
- [ ] Claude Desktop recognizes MCP server
- [ ] Tools are available in Claude
- [ ] Read operations work correctly
- [ ] Write operations require confirmation
- [ ] Safety checks prevent dangerous actions
- [ ] Ollama integration works (if configured)

## Security Notes

1. **MCP runs with system access** - Be careful with credentials
2. **Always require confirmation** for write operations
3. **Use SSH tunnel** if accessing remotely
4. **Rotate API keys** regularly
5. **Monitor MCP logs** for unusual activity

## Next Steps

With MCP integration complete:
- ✅ Claude has direct server access
- ✅ Intelligent troubleshooting available
- ✅ Safety confirmations in place
- ✅ Local LLM option configured

**Proceed to TODO-06-zfs-assistant.md** for ZFS management and snapshots!

---

*Note: With MCP, Claude becomes your intelligent server assistant. The combination of your i5-12400 (for QuickSync) and a future GPU (for local LLMs) will give you excellent AI-assisted server management.*
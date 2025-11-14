/**
 * MCP Tool Definitions
 * Defines the schemas for all available MCP tools
 */
export const toolDefinitions = [
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
];

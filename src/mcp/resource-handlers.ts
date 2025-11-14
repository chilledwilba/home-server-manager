/**
 * MCP Resource Handlers
 * Handles resource definitions and content retrieval
 */
export const resourceDefinitions = [
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
];

export function getResourceContent(uri: string): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
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
      monitoring: {
        metrics_retention: '30 days',
        alert_channels: ['webhook', 'email'],
      },
      security: {
        fail2ban: 'enabled',
        ssh_keys_only: true,
        cloudflare_tunnel: 'configured',
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
    const guide = `# Home Server Troubleshooting Guide

## Common Issues

### Pool Degraded
**Symptoms**: ZFS pool shows DEGRADED status
**Causes**:
- Disk failure
- Connection issue
- Power loss during write

**Solutions**:
1. Check disk health: \`get_disk_smart\`
2. Review pool status: \`get_pool_status\`
3. Check recent alerts: \`get_recent_alerts\`
4. If disk failed: Replace and resilver

### High CPU Usage
**Symptoms**: System sluggish, high load average
**Causes**:
- Runaway container
- ZFS scrub running
- Insufficient resources

**Solutions**:
1. Check container stats: \`get_container_stats\`
2. Review system stats: \`get_system_stats\`
3. Identify culprit process
4. Restart or limit resources

### Container Won't Start
**Symptoms**: Container status shows "Exited"
**Causes**:
- Port conflict
- Volume mount issue
- Configuration error

**Solutions**:
1. Check logs: \`get_container_logs\`
2. Verify port availability
3. Check volume permissions
4. Review docker-compose configuration

### Out of Storage
**Symptoms**: Applications fail, can't write data
**Causes**:
- Pool at capacity
- Excessive snapshots
- Large log files

**Solutions**:
1. Check pool status: \`get_pool_status\`
2. Delete old snapshots
3. Clear log files
4. Archive/delete unused data

## Quick Commands

- System health check: Use \`diagnose_system\` prompt
- Security audit: Use \`security_audit\` prompt
- Performance analysis: Use \`optimize_performance\` prompt
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
}

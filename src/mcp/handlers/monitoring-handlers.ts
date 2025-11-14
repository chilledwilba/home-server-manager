import type { MCPConfig } from '../tool-handler-types.js';

/**
 * Monitoring Tool Handlers
 * Handles alerts, metrics history, security findings, and security status
 */
export class MonitoringHandlers {
  constructor(private config: MCPConfig) {}

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
}

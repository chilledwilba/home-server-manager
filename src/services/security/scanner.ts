import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('security-scanner');

export interface SecurityFinding {
  container: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  recommendation: string;
  cve?: string;
  fixed: boolean;
}

interface ContainerData {
  name: string;
  id: string;
  state: string;
  labels: Record<string, string>;
  ports?: Array<{
    private: number;
    public?: number;
    type: string;
    IP?: string;
  }>;
  isArrApp?: boolean;
  isPlex?: boolean;
}

export class SecurityScanner {
  constructor(
    private db: Database.Database,
    private io: SocketServer,
  ) {}

  async scanAllContainers(containers: ContainerData[]): Promise<{
    findings: SecurityFinding[];
    score: number;
  }> {
    logger.info(`Scanning ${containers.length} containers for security issues`);
    const findings: SecurityFinding[] = [];

    for (const container of containers) {
      const containerFindings = await this.scanContainer(container);
      findings.push(...containerFindings);
    }

    // Store findings in database
    this.storeFindings(findings);

    // Calculate security score
    const score = this.calculateSecurityScore(findings);

    // Broadcast results
    this.io.to('security').emit('security:scan-complete', {
      findings,
      score,
      timestamp: new Date().toISOString(),
    });

    logger.info(`Security scan complete: ${findings.length} findings, score: ${score}/100`);

    return { findings, score };
  }

  async scanContainer(container: ContainerData): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // 1. Check if container is running as root
    const userId = container.labels?.['PUID'] || container.labels?.['UID'];
    if (!userId || userId === '0') {
      findings.push({
        container: container.name,
        severity: 'medium',
        type: 'root_user',
        message: 'Container may be running as root user',
        recommendation: 'Set PUID and PGID environment variables to non-root user (e.g., 1000)',
        fixed: false,
      });
    }

    // 2. Check privileged mode
    if (container.labels?.['Privileged'] === 'true') {
      findings.push({
        container: container.name,
        severity: 'high',
        type: 'privileged_mode',
        message: 'Container running in privileged mode',
        recommendation: 'Remove privileged mode unless absolutely necessary for functionality',
        fixed: false,
      });
    }

    // 3. Check exposed ports
    if (container.ports && container.ports.length > 0) {
      for (const port of container.ports) {
        if (port.public) {
          // Check if binding to all interfaces
          if (!port.IP || port.IP === '0.0.0.0') {
            findings.push({
              container: container.name,
              severity: 'low',
              type: 'exposed_port',
              message: `Port ${port.public} exposed to all interfaces (0.0.0.0)`,
              recommendation: `Bind to specific IP: 192.168.1.100:${port.public}:${port.private}`,
              fixed: false,
            });
          }

          // Flag commonly attacked ports
          const riskyPorts = [22, 23, 445, 3389, 5900];
          if (riskyPorts.includes(port.public)) {
            findings.push({
              container: container.name,
              severity: 'high',
              type: 'risky_port',
              message: `High-risk port ${port.public} exposed to network`,
              recommendation: 'Use VPN or Cloudflare Tunnel instead of direct port exposure',
              fixed: false,
            });
          }
        }
      }
    }

    // 4. Check for Docker socket mount
    const volumes = container.labels?.['Volumes'];
    if (volumes && typeof volumes === 'string' && volumes.includes('/var/run/docker.sock')) {
      findings.push({
        container: container.name,
        severity: 'high',
        type: 'docker_socket',
        message: 'Docker socket mounted (container can control Docker daemon)',
        recommendation:
          'Only mount Docker socket for management tools. Use read-only when possible.',
        fixed: false,
      });
    }

    // 5. Check dangerous root filesystem mounts
    if (volumes && typeof volumes === 'string') {
      if (volumes.includes('/:/') || volumes.includes('/etc:/')) {
        findings.push({
          container: container.name,
          severity: 'critical',
          type: 'dangerous_mount',
          message: 'Root filesystem or /etc mounted in container',
          recommendation: 'Limit volume mounts to specific directories only',
          fixed: false,
        });
      }
    }

    // 6. Check for authentication (Arr apps and Plex)
    if (container.isArrApp) {
      const hasAuth = container.labels?.['AuthenticationRequired'] === 'true';
      if (!hasAuth) {
        findings.push({
          container: container.name,
          severity: 'high',
          type: 'no_auth',
          message: 'No authentication configured on media management app',
          recommendation: 'Enable authentication in Settings > General > Security > Authentication',
          fixed: false,
        });
      }
    }

    // 7. Check Plex security
    if (container.isPlex) {
      const plexPorts = container.ports?.filter((p) => p.public === 32400);
      if (plexPorts && plexPorts.length > 0) {
        findings.push({
          container: container.name,
          severity: 'medium',
          type: 'plex_exposed',
          message: 'Plex port 32400 is exposed',
          recommendation: 'Disable remote access or use Plex relay. Access via local network only.',
          fixed: false,
        });
      }
    }

    // 8. Check for restart policy
    const restartPolicy = container.labels?.['RestartPolicy'];
    if (!restartPolicy || restartPolicy === 'no') {
      findings.push({
        container: container.name,
        severity: 'low',
        type: 'no_restart_policy',
        message: 'Container has no restart policy',
        recommendation: 'Set restart policy to "unless-stopped" for production containers',
        fixed: false,
      });
    }

    return findings;
  }

  calculateSecurityScore(findings: SecurityFinding[]): number {
    let score = 100;

    for (const finding of findings) {
      if (!finding.fixed) {
        switch (finding.severity) {
          case 'critical':
            score -= 20;
            break;
          case 'high':
            score -= 10;
            break;
          case 'medium':
            score -= 5;
            break;
          case 'low':
            score -= 2;
            break;
        }
      }
    }

    return Math.max(0, score);
  }

  private storeFindings(findings: SecurityFinding[]): void {
    // Clear old unfixed findings
    this.db.prepare('DELETE FROM security_findings WHERE fixed = 0').run();

    // Insert new findings
    const stmt = this.db.prepare(`
      INSERT INTO security_findings (
        container, severity, type, message,
        recommendation, cve, fixed, found_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const finding of findings) {
      stmt.run(
        finding.container,
        finding.severity,
        finding.type,
        finding.message,
        finding.recommendation,
        finding.cve || null,
        finding.fixed ? 1 : 0,
        new Date().toISOString(),
      );
    }
  }

  getLatestFindings(): SecurityFinding[] {
    const rows = this.db
      .prepare(
        `
      SELECT container, severity, type, message,
             recommendation, cve, fixed, found_at as foundAt
      FROM security_findings
      WHERE fixed = 0
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        found_at DESC
    `,
      )
      .all() as Array<SecurityFinding & { foundAt: string }>;

    return rows.map((row) => ({
      container: row.container,
      severity: row.severity,
      type: row.type,
      message: row.message,
      recommendation: row.recommendation,
      cve: row.cve,
      fixed: row.fixed,
    }));
  }

  generateSecurityReport(): {
    score: number;
    summary: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      total: number;
    };
    findings: SecurityFinding[];
    recommendations: string[];
  } {
    const findings = this.getLatestFindings();
    const score = this.calculateSecurityScore(findings);

    const summary = {
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      medium: findings.filter((f) => f.severity === 'medium').length,
      low: findings.filter((f) => f.severity === 'low').length,
      total: findings.length,
    };

    // Generate top recommendations
    const recommendations: string[] = [];

    if (summary.critical > 0) {
      recommendations.push('🚨 CRITICAL: Address critical security issues immediately');
    }

    if (summary.high > 0) {
      recommendations.push('⚠️ HIGH: Review and fix high-severity issues as soon as possible');
    }

    const hasExposedPorts = findings.some((f) => f.type === 'exposed_port');
    if (hasExposedPorts) {
      recommendations.push('🔒 Consider setting up Cloudflare Tunnel for secure remote access');
    }

    const hasNoAuth = findings.some((f) => f.type === 'no_auth');
    if (hasNoAuth) {
      recommendations.push('🔐 Enable authentication on all web applications');
    }

    if (score < 70) {
      recommendations.push('📊 Security score is below 70 - prioritize security improvements');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Security baseline looks good! Continue monitoring.');
    }

    return {
      score,
      summary,
      findings,
      recommendations,
    };
  }

  markFindingFixed(container: string, type: string): void {
    this.db
      .prepare(
        `
      UPDATE security_findings
      SET fixed = 1, fixed_at = ?
      WHERE container = ? AND type = ? AND fixed = 0
    `,
      )
      .run(new Date().toISOString(), container, type);

    logger.info(`Marked security finding as fixed: ${container} - ${type}`);
  }
}

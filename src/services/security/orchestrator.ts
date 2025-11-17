import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';

// Type for setInterval return value
type IntervalId = ReturnType<typeof setInterval>;

import { AuthentikClient } from '../../integrations/authentik/client.js';
import { CloudflareTunnelClient } from '../../integrations/cloudflare/tunnel-client.js';
import { Fail2banClient } from '../../integrations/fail2ban/client.js';
import { logger } from '../../utils/logger.js';
import { InfrastructureManager } from '../infrastructure/manager.js';

interface SecurityConfig {
  cloudflare?: {
    accountId: string;
    apiToken: string;
    tunnelId?: string;
  };
  authentik?: {
    url: string;
    token: string;
  };
  fail2ban?: {
    containerName?: string;
    useDocker?: boolean;
  };
}

interface SecurityStatus {
  overall_health: 'healthy' | 'degraded' | 'critical';
  tunnel: {
    enabled: boolean;
    healthy: boolean;
    connections: number;
  };
  authentication: {
    enabled: boolean;
    healthy: boolean;
    users_count: number;
    active_sessions: number;
  };
  intrusion_prevention: {
    enabled: boolean;
    healthy: boolean;
    jails_active: number;
    total_banned: number;
  };
  recommendations: string[];
}

/**
 * Security Orchestrator
 * Coordinates security stack components and provides unified management
 */
export class SecurityOrchestrator {
  private cloudflare?: CloudflareTunnelClient;
  private authentik?: AuthentikClient;
  private fail2ban?: Fail2banClient;
  private infrastructure: InfrastructureManager;
  private monitoringInterval?: IntervalId;

  constructor(
    private db: Database.Database,
    private io: SocketServer,
    config: SecurityConfig,
  ) {
    // Initialize clients if configured
    if (config.cloudflare) {
      this.cloudflare = new CloudflareTunnelClient(config.cloudflare);
    }

    if (config.authentik) {
      this.authentik = new AuthentikClient(config.authentik);
    }

    if (config.fail2ban) {
      this.fail2ban = new Fail2banClient(config.fail2ban);
    }

    this.infrastructure = new InfrastructureManager(db);
  }

  /**
   * Start security monitoring
   */
  start(): void {
    logger.info('Starting security orchestrator...');

    // Monitor security status every minute
    this.monitoringInterval = setInterval(() => {
      void this.checkSecurityStatus();
    }, 60 * 1000);

    // Initial check
    void this.checkSecurityStatus();

    logger.info('Security orchestrator started');
  }

  /**
   * Stop security monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    logger.info('Security orchestrator stopped');
  }

  /**
   * Get comprehensive security status
   */
  async getStatus(): Promise<SecurityStatus> {
    logger.info('Checking security status...');

    const [tunnelStatus, authStatus, fail2banStatus, recommendations] = await Promise.all([
      this.checkTunnelStatus(),
      this.checkAuthStatus(),
      this.checkFail2banStatus(),
      this.generateRecommendations(),
    ]);

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (!authStatus.enabled && !tunnelStatus.enabled) {
      overallHealth = 'critical';
    } else if (!tunnelStatus.healthy || !authStatus.healthy || !fail2banStatus.healthy) {
      overallHealth = 'degraded';
    }

    return {
      overall_health: overallHealth,
      tunnel: tunnelStatus,
      authentication: authStatus,
      intrusion_prevention: fail2banStatus,
      recommendations,
    };
  }

  /**
   * Check Cloudflare Tunnel status
   */
  private async checkTunnelStatus(): Promise<{
    enabled: boolean;
    healthy: boolean;
    connections: number;
  }> {
    if (!this.cloudflare) {
      return {
        enabled: false,
        healthy: false,
        connections: 0,
      };
    }

    try {
      const metrics = await this.cloudflare.getMetrics();
      return {
        enabled: true,
        healthy: metrics.healthy,
        connections: metrics.active_connections,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to check tunnel status');
      return {
        enabled: true,
        healthy: false,
        connections: 0,
      };
    }
  }

  /**
   * Check Authentik status
   */
  private async checkAuthStatus(): Promise<{
    enabled: boolean;
    healthy: boolean;
    users_count: number;
    active_sessions: number;
  }> {
    if (!this.authentik) {
      return {
        enabled: false,
        healthy: false,
        users_count: 0,
        active_sessions: 0,
      };
    }

    try {
      const status = await this.authentik.getSystemStatus();
      return {
        enabled: true,
        healthy: status.healthy,
        users_count: status.users_count,
        active_sessions: status.active_sessions,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to check auth status');
      return {
        enabled: true,
        healthy: false,
        users_count: 0,
        active_sessions: 0,
      };
    }
  }

  /**
   * Check Fail2ban status
   */
  private async checkFail2banStatus(): Promise<{
    enabled: boolean;
    healthy: boolean;
    jails_active: number;
    total_banned: number;
  }> {
    if (!this.fail2ban) {
      return {
        enabled: false,
        healthy: false,
        jails_active: 0,
        total_banned: 0,
      };
    }

    try {
      const isRunning = await this.fail2ban.isRunning();
      if (!isRunning) {
        return {
          enabled: true,
          healthy: false,
          jails_active: 0,
          total_banned: 0,
        };
      }

      const status = await this.fail2ban.getStatus();
      return {
        enabled: true,
        healthy: true,
        jails_active: status.jails.length,
        total_banned: status.totalBanned,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to check fail2ban status');
      return {
        enabled: true,
        healthy: false,
        jails_active: 0,
        total_banned: 0,
      };
    }
  }

  /**
   * Generate security recommendations
   */
  private async generateRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];

    // Check infrastructure
    const { deployed } = await this.infrastructure.analyzeInfrastructure();

    // Recommend missing security components
    if (!this.cloudflare && !deployed.find((s) => s.name === 'Cloudflare Tunnel')) {
      recommendations.push(
        'Deploy Cloudflare Tunnel for zero-trust network access without port forwarding',
      );
    }

    if (!this.authentik && !deployed.find((s) => s.name === 'Authentik SSO')) {
      recommendations.push('Deploy Authentik SSO for centralized authentication and 2FA');
    }

    if (!this.fail2ban && !deployed.find((s) => s.name === 'Fail2ban')) {
      recommendations.push('Deploy Fail2ban for automated intrusion prevention');
    }

    // Check for reverse proxy
    const hasProxy =
      deployed.find((s) => s.name === 'Traefik') ||
      deployed.find((s) => s.name === 'Nginx Proxy Manager');

    if (!hasProxy && this.cloudflare) {
      recommendations.push(
        'Consider deploying a reverse proxy (Traefik or Nginx Proxy Manager) for local network access',
      );
    }

    return recommendations;
  }

  /**
   * Check security status and broadcast updates
   */
  private async checkSecurityStatus(): Promise<void> {
    try {
      const status = await this.getStatus();

      // Broadcast to connected clients
      this.io.to('security').emit('security:status', status);

      // Store in database
      this.recordSecurityStatus(status);

      // Log warnings if degraded
      if (status.overall_health !== 'healthy') {
        logger.warn(
          {
            tunnel: status.tunnel.healthy,
            auth: status.authentication.healthy,
            fail2ban: status.intrusion_prevention.healthy,
          },
          'Security health degraded',
        );
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to check security status');
    }
  }

  /**
   * Record security status in database
   */
  private recordSecurityStatus(status: SecurityStatus): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO security_status_log
          (timestamp, overall_health, tunnel_healthy, auth_healthy, fail2ban_healthy,
           banned_ips_count, active_sessions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        new Date().toISOString(),
        status.overall_health,
        status.tunnel.healthy ? 1 : 0,
        status.authentication.healthy ? 1 : 0,
        status.intrusion_prevention.healthy ? 1 : 0,
        status.intrusion_prevention.total_banned,
        status.authentication.active_sessions,
      );
    } catch (error) {
      // Table might not exist yet
      logger.debug({ err: error }, 'Could not record security status');
    }
  }

  /**
   * Get Cloudflare client (if configured)
   */
  getCloudflareClient(): CloudflareTunnelClient | undefined {
    return this.cloudflare;
  }

  /**
   * Get Authentik client (if configured)
   */
  getAuthentikClient(): AuthentikClient | undefined {
    return this.authentik;
  }

  /**
   * Get Fail2ban client (if configured)
   */
  getFail2banClient(): Fail2banClient | undefined {
    return this.fail2ban;
  }

  /**
   * Get infrastructure manager
   */
  getInfrastructureManager(): InfrastructureManager {
    return this.infrastructure;
  }
}

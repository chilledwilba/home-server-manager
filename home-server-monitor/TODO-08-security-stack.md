# TODO-08: Security Stack Implementation

> Comprehensive security hardening with Cloudflare Tunnel, Authentik SSO, and fail2ban

## 📋 Phase Overview

**Objective**: Implement production-grade security stack for safe remote access and intrusion prevention

**Duration**: 3-4 hours

**Prerequisites**:
- ✅ Phase 0-7 complete (monitoring and optimization working)
- ✅ Cloudflare account (free tier is fine)
- ✅ Domain name (for tunnel)
- ✅ Docker running on TrueNAS

## 🎯 Success Criteria

- [ ] Zero port forwarding (all through Cloudflare Tunnel)
- [ ] SSO authentication for all services
- [ ] Automatic IP banning for suspicious activity
- [ ] Security headers properly configured
- [ ] No exposed credentials or secrets
- [ ] Audit logging enabled

## 📚 Learning Context

### Why This Security Stack?

After your port 32400 exposure incident, we need defense in depth:

1. **Cloudflare Tunnel**: No open ports, DDoS protection, WAF
2. **Authentik**: Single sign-on, 2FA, audit trails
3. **Fail2ban**: Automated threat response
4. **CrowdSec**: Community threat intelligence

## 🏗️ Architecture

```
Internet → Cloudflare Edge → Tunnel → Docker Network → Services
                ↓                           ↓
            WAF/DDoS                   Authentik SSO
                                           ↓
                                      Fail2ban/CrowdSec
```

## 📁 File Structure

```bash
src/
├── security/
│   ├── cloudflare/
│   │   ├── tunnel-manager.ts      # Tunnel lifecycle
│   │   ├── config-generator.ts    # Config generation
│   │   └── health-monitor.ts      # Tunnel health
│   ├── authentik/
│   │   ├── client.ts              # Authentik API
│   │   ├── middleware.ts          # Express middleware
│   │   └── user-sync.ts           # User management
│   ├── fail2ban/
│   │   ├── jail-manager.ts        # Jail configuration
│   │   ├── log-parser.ts          # Log analysis
│   │   └── ban-actions.ts         # Ban/unban logic
│   └── index.ts                   # Security orchestrator
├── routes/
│   └── security.ts                # Security API endpoints
└── types/
    └── security.ts                # Security types
```

## 📝 Implementation Tasks

### 1. Cloudflare Tunnel Setup

Create `src/security/cloudflare/tunnel-manager.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { logger } from '@/utils/logger';
import { config } from '@/config';

const execAsync = promisify(exec);

// Schema for tunnel configuration
const TunnelConfigSchema = z.object({
  tunnel: z.object({
    id: z.string().uuid(),
    name: z.string(),
    secret: z.string()
  }),
  ingress: z.array(z.object({
    hostname: z.string().optional(),
    service: z.string(),
    originRequest: z.object({
      noTLSVerify: z.boolean().optional(),
      connectTimeout: z.string().optional(),
      httpHostHeader: z.string().optional()
    }).optional()
  }))
});

export class CloudflareTunnelManager {
  private tunnelId: string | null = null;
  private isRunning = false;

  /**
   * Initialize Cloudflare Tunnel
   * This replaces port forwarding with secure tunneling
   */
  async initialize(): Promise<void> {
    logger.info('🔐 Initializing Cloudflare Tunnel...');

    try {
      // Check if cloudflared is installed
      await this.checkCloudflared();

      // Create or load tunnel
      await this.setupTunnel();

      // Configure ingress rules
      await this.configureIngress();

      // Start tunnel
      await this.startTunnel();

      logger.info('✅ Cloudflare Tunnel active');
    } catch (error) {
      logger.error('Failed to initialize tunnel:', error);
      throw error;
    }
  }

  /**
   * Check if cloudflared is installed
   */
  private async checkCloudflared(): Promise<void> {
    try {
      const { stdout } = await execAsync('cloudflared --version');
      logger.info(`Cloudflared version: ${stdout.trim()}`);
    } catch {
      logger.error('cloudflared not found. Installing...');
      await this.installCloudflared();
    }
  }

  /**
   * Install cloudflared in Docker container
   */
  private async installCloudflared(): Promise<void> {
    const commands = [
      'curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared',
      'chmod +x /usr/local/bin/cloudflared'
    ];

    for (const cmd of commands) {
      await execAsync(cmd);
    }

    logger.info('✅ cloudflared installed');
  }

  /**
   * Create or load existing tunnel
   */
  private async setupTunnel(): Promise<void> {
    const tunnelName = config.CLOUDFLARE_TUNNEL_NAME || 'homeserver-monitor';

    try {
      // Try to create new tunnel
      const { stdout } = await execAsync(
        `cloudflared tunnel create ${tunnelName}`
      );

      // Extract tunnel ID from output
      const match = stdout.match(/Created tunnel .+ with id ([a-f0-9-]+)/);
      if (match) {
        this.tunnelId = match[1];
        logger.info(`Created new tunnel: ${this.tunnelId}`);
      }
    } catch (error: any) {
      // Tunnel might already exist
      if (error.message.includes('already exists')) {
        // List tunnels to get ID
        const { stdout } = await execAsync('cloudflared tunnel list --output json');
        const tunnels = JSON.parse(stdout);
        const tunnel = tunnels.find((t: any) => t.name === tunnelName);

        if (tunnel) {
          this.tunnelId = tunnel.id;
          logger.info(`Using existing tunnel: ${this.tunnelId}`);
        } else {
          throw new Error('Failed to find tunnel');
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Configure ingress rules for services
   * This replaces port forwarding with secure routing
   */
  private async configureIngress(): Promise<void> {
    const config = {
      tunnel: {
        id: this.tunnelId!,
        name: 'homeserver-monitor',
        secret: process.env.TUNNEL_SECRET!
      },
      ingress: [
        // Home Server Monitor
        {
          hostname: 'monitor.yourdomain.com',
          service: 'http://localhost:3100',
          originRequest: {
            httpHostHeader: 'monitor.yourdomain.com'
          }
        },
        // Plex (if needed, more secure than port 32400)
        {
          hostname: 'plex.yourdomain.com',
          service: 'http://localhost:32400',
          originRequest: {
            noTLSVerify: true
          }
        },
        // Authentik
        {
          hostname: 'auth.yourdomain.com',
          service: 'http://localhost:9000'
        },
        // Catch-all
        {
          service: 'http_status:404'
        }
      ]
    };

    // Validate configuration
    const validated = TunnelConfigSchema.parse(config);

    // Write config file
    const fs = await import('fs/promises');
    await fs.writeFile(
      '/etc/cloudflared/config.yml',
      this.generateYaml(validated)
    );

    logger.info('✅ Ingress rules configured');
  }

  /**
   * Generate YAML configuration
   */
  private generateYaml(config: z.infer<typeof TunnelConfigSchema>): string {
    // Convert to YAML format
    const yaml = [
      `tunnel: ${config.tunnel.id}`,
      `credentials-file: /root/.cloudflared/${config.tunnel.id}.json`,
      '',
      'ingress:'
    ];

    for (const rule of config.ingress) {
      if (rule.hostname) {
        yaml.push(`  - hostname: ${rule.hostname}`);
        yaml.push(`    service: ${rule.service}`);

        if (rule.originRequest) {
          yaml.push('    originRequest:');
          for (const [key, value] of Object.entries(rule.originRequest)) {
            yaml.push(`      ${key}: ${value}`);
          }
        }
      } else {
        yaml.push(`  - service: ${rule.service}`);
      }
    }

    return yaml.join('\n');
  }

  /**
   * Start the tunnel
   */
  private async startTunnel(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Tunnel already running');
      return;
    }

    // Start tunnel in background
    exec(
      'cloudflared tunnel run',
      { env: { ...process.env } },
      (error, stdout, stderr) => {
        if (error) {
          logger.error('Tunnel error:', error);
          this.isRunning = false;
        }
      }
    );

    this.isRunning = true;

    // Wait for tunnel to be ready
    await this.waitForReady();
  }

  /**
   * Wait for tunnel to be ready
   */
  private async waitForReady(maxRetries = 30): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const { stdout } = await execAsync('cloudflared tunnel info');
        if (stdout.includes('HEALTHY')) {
          return;
        }
      } catch {
        // Not ready yet
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Tunnel failed to start');
  }

  /**
   * Monitor tunnel health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `cloudflared tunnel info ${this.tunnelId} --output json`
      );

      const info = JSON.parse(stdout);
      return info.status === 'HEALTHY';
    } catch {
      return false;
    }
  }

  /**
   * Stop tunnel
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await execAsync('pkill cloudflared');
      this.isRunning = false;
      logger.info('Tunnel stopped');
    } catch (error) {
      logger.error('Failed to stop tunnel:', error);
    }
  }
}
```

### 2. Authentik SSO Integration

Create `src/security/authentik/client.ts`:

```typescript
import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import { logger } from '@/utils/logger';

// User schema from Authentik
const AuthentikUserSchema = z.object({
  pk: z.number(),
  username: z.string(),
  email: z.string().email(),
  name: z.string(),
  is_active: z.boolean(),
  is_superuser: z.boolean(),
  groups: z.array(z.string()),
  attributes: z.record(z.any()).optional()
});

export type AuthentikUser = z.infer<typeof AuthentikUserSchema>;

export class AuthentikClient {
  private client: AxiosInstance;

  constructor(
    private baseUrl: string,
    private token: string
  ) {
    this.client = axios.create({
      baseURL: `${baseUrl}/api/v3`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Verify JWT token from request
   */
  async verifyToken(token: string): Promise<AuthentikUser | null> {
    try {
      const response = await this.client.get('/core/users/me/', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      return AuthentikUserSchema.parse(response.data);
    } catch (error) {
      logger.error('Token verification failed:', error);
      return null;
    }
  }

  /**
   * Create application in Authentik
   */
  async createApplication(
    name: string,
    slug: string,
    redirectUri: string
  ): Promise<void> {
    try {
      // Create OAuth2 provider
      const provider = await this.client.post('/providers/oauth2/', {
        name: `${name} OAuth2`,
        authorization_flow: 'default-authorization-implicit-consent',
        client_type: 'confidential',
        redirect_uris: redirectUri,
        sub_mode: 'hashed_user_id',
        include_claims_in_id_token: true,
        issuer_mode: 'per_provider'
      });

      // Create application
      await this.client.post('/core/applications/', {
        name,
        slug,
        provider: provider.data.pk,
        meta_launch_url: redirectUri,
        open_in_new_tab: true
      });

      logger.info(`Created Authentik application: ${name}`);
    } catch (error) {
      logger.error('Failed to create application:', error);
      throw error;
    }
  }

  /**
   * Get user groups
   */
  async getUserGroups(userId: number): Promise<string[]> {
    try {
      const response = await this.client.get(
        `/core/users/${userId}/groups/`
      );

      return response.data.results.map((g: any) => g.name);
    } catch (error) {
      logger.error('Failed to get user groups:', error);
      return [];
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(
    user: AuthentikUser,
    permission: string
  ): Promise<boolean> {
    // Check if superuser
    if (user.is_superuser) return true;

    // Check group permissions
    const requiredGroups: Record<string, string[]> = {
      'admin': ['administrators', 'homeserver-admins'],
      'write': ['administrators', 'homeserver-admins', 'homeserver-operators'],
      'read': ['administrators', 'homeserver-admins', 'homeserver-operators', 'homeserver-viewers']
    };

    const required = requiredGroups[permission] || [];
    return user.groups.some(g => required.includes(g));
  }
}
```

Create `src/security/authentik/middleware.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthentikClient } from './client';
import { logger } from '@/utils/logger';
import { config } from '@/config';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string;
        groups: string[];
        permissions: string[];
      };
    }
  }
}

export class AuthentikMiddleware {
  private client: AuthentikClient;
  private publicKey: string;

  constructor() {
    this.client = new AuthentikClient(
      config.AUTHENTIK_URL,
      config.AUTHENTIK_TOKEN
    );
    this.publicKey = config.AUTHENTIK_PUBLIC_KEY;
  }

  /**
   * Verify authentication
   */
  authenticate() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Get token from header or cookie
        const token = this.extractToken(req);

        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        // Verify JWT signature
        const decoded = jwt.verify(token, this.publicKey, {
          algorithms: ['RS256']
        }) as any;

        // Verify with Authentik
        const user = await this.client.verifyToken(token);

        if (!user) {
          return res.status(401).json({ error: 'Invalid token' });
        }

        // Attach user to request
        req.user = {
          id: user.pk,
          username: user.username,
          email: user.email,
          groups: user.groups,
          permissions: await this.getPermissions(user)
        };

        next();
      } catch (error) {
        logger.error('Authentication failed:', error);
        res.status(401).json({ error: 'Authentication failed' });
      }
    };
  }

  /**
   * Check for specific permission
   */
  requirePermission(permission: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (!req.user.permissions.includes(permission)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    };
  }

  /**
   * Extract token from request
   */
  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookie
    if (req.cookies?.authentik_token) {
      return req.cookies.authentik_token;
    }

    return null;
  }

  /**
   * Get user permissions
   */
  private async getPermissions(user: any): Promise<string[]> {
    const permissions: string[] = [];

    // Map groups to permissions
    if (user.is_superuser || user.groups.includes('administrators')) {
      permissions.push('admin', 'write', 'read');
    } else if (user.groups.includes('homeserver-operators')) {
      permissions.push('write', 'read');
    } else if (user.groups.includes('homeserver-viewers')) {
      permissions.push('read');
    }

    return permissions;
  }
}
```

### 3. Fail2ban Integration

Create `src/security/fail2ban/jail-manager.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { logger } from '@/utils/logger';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

interface JailConfig {
  name: string;
  enabled: boolean;
  port: number | string;
  filter: string;
  logpath: string;
  maxretry: number;
  findtime: string;
  bantime: string;
  action: string;
}

export class Fail2banManager extends EventEmitter {
  private jails: Map<string, JailConfig> = new Map();
  private bannedIPs: Set<string> = new Set();

  /**
   * Initialize fail2ban with custom jails
   */
  async initialize(): Promise<void> {
    logger.info('🔒 Initializing Fail2ban...');

    // Check if fail2ban is installed
    await this.checkFail2ban();

    // Configure jails for our services
    await this.configureJails();

    // Start fail2ban service
    await this.startService();

    // Start monitoring
    this.startMonitoring();

    logger.info('✅ Fail2ban active');
  }

  /**
   * Check if fail2ban is installed
   */
  private async checkFail2ban(): Promise<void> {
    try {
      const { stdout } = await execAsync('fail2ban-client version');
      logger.info(`Fail2ban version: ${stdout.trim()}`);
    } catch {
      logger.error('Fail2ban not found. Installing...');
      await execAsync('apt-get update && apt-get install -y fail2ban');
    }
  }

  /**
   * Configure custom jails
   */
  private async configureJails(): Promise<void> {
    const jails: JailConfig[] = [
      // SSH protection
      {
        name: 'sshd',
        enabled: true,
        port: 'ssh',
        filter: 'sshd',
        logpath: '/var/log/auth.log',
        maxretry: 3,
        findtime: '10m',
        bantime: '1h',
        action: 'iptables-multiport'
      },
      // Home Server Monitor API
      {
        name: 'homeserver-api',
        enabled: true,
        port: 3100,
        filter: 'homeserver-api',
        logpath: '/var/log/homeserver/api.log',
        maxretry: 10,
        findtime: '5m',
        bantime: '30m',
        action: 'iptables-multiport'
      },
      // Authentik
      {
        name: 'authentik',
        enabled: true,
        port: 9000,
        filter: 'authentik',
        logpath: '/var/log/authentik/authentik.log',
        maxretry: 5,
        findtime: '10m',
        bantime: '1h',
        action: 'iptables-multiport'
      },
      // TrueNAS WebUI
      {
        name: 'truenas-webui',
        enabled: true,
        port: 443,
        filter: 'truenas-webui',
        logpath: '/var/log/nginx/access.log',
        maxretry: 5,
        findtime: '10m',
        bantime: '1h',
        action: 'iptables-multiport'
      },
      // Docker containers
      {
        name: 'docker-containers',
        enabled: true,
        port: '8080-8999',
        filter: 'docker-auth',
        logpath: '/var/log/docker/*.log',
        maxretry: 10,
        findtime: '10m',
        bantime: '30m',
        action: 'docker-action'
      }
    ];

    // Write jail configurations
    for (const jail of jails) {
      await this.writeJailConfig(jail);
      this.jails.set(jail.name, jail);
    }

    // Write custom filters
    await this.writeCustomFilters();
  }

  /**
   * Write jail configuration
   */
  private async writeJailConfig(jail: JailConfig): Promise<void> {
    const config = `
[${jail.name}]
enabled = ${jail.enabled}
port = ${jail.port}
filter = ${jail.filter}
logpath = ${jail.logpath}
maxretry = ${jail.maxretry}
findtime = ${jail.findtime}
bantime = ${jail.bantime}
action = ${jail.action}[name=%(__name__)s, port="%(port)s", protocol="%(protocol)s"]
`;

    await fs.writeFile(
      `/etc/fail2ban/jail.d/${jail.name}.conf`,
      config.trim()
    );
  }

  /**
   * Write custom filters
   */
  private async writeCustomFilters(): Promise<void> {
    // Filter for Home Server Monitor API
    const apiFilter = `
[Definition]
failregex = ^.*\\[ERROR\\].*401 Unauthorized.*<HOST>.*$
            ^.*\\[WARN\\].*Invalid API key.*<HOST>.*$
            ^.*\\[SECURITY\\].*Suspicious activity.*<HOST>.*$
ignoreregex =
`;

    await fs.writeFile(
      '/etc/fail2ban/filter.d/homeserver-api.conf',
      apiFilter.trim()
    );

    // Filter for Authentik
    const authentikFilter = `
[Definition]
failregex = ^.*authentication failed.*<HOST>.*$
            ^.*invalid credentials.*<HOST>.*$
            ^.*SUSPICIOUS_REQUEST.*<HOST>.*$
ignoreregex =
`;

    await fs.writeFile(
      '/etc/fail2ban/filter.d/authentik.conf',
      authentikFilter.trim()
    );

    // Filter for Docker containers
    const dockerFilter = `
[Definition]
failregex = ^.*\\[401\\].*<HOST>.*$
            ^.*Unauthorized.*<HOST>.*$
            ^.*Authentication failed.*<HOST>.*$
ignoreregex =
`;

    await fs.writeFile(
      '/etc/fail2ban/filter.d/docker-auth.conf',
      dockerFilter.trim()
    );
  }

  /**
   * Start fail2ban service
   */
  private async startService(): Promise<void> {
    try {
      await execAsync('systemctl restart fail2ban');
      logger.info('Fail2ban service started');
    } catch (error) {
      logger.error('Failed to start fail2ban:', error);
      throw error;
    }
  }

  /**
   * Start monitoring fail2ban
   */
  private startMonitoring(): void {
    setInterval(async () => {
      await this.checkBannedIPs();
      await this.checkJailStatus();
    }, 30000); // Every 30 seconds
  }

  /**
   * Check banned IPs
   */
  private async checkBannedIPs(): Promise<void> {
    try {
      const { stdout } = await execAsync('fail2ban-client status');
      const jailList = stdout.match(/Jail list:\s+(.+)/)?.[1]?.split(',') || [];

      for (const jailName of jailList) {
        const jail = jailName.trim();
        const { stdout: jailStatus } = await execAsync(
          `fail2ban-client status ${jail}`
        );

        const bannedMatch = jailStatus.match(/Banned IP list:\s+(.+)/);
        if (bannedMatch) {
          const ips = bannedMatch[1].split(' ').filter(ip => ip);
          for (const ip of ips) {
            if (!this.bannedIPs.has(ip)) {
              this.bannedIPs.add(ip);
              this.emit('ip-banned', { ip, jail });
              logger.warn(`🚫 IP banned: ${ip} (jail: ${jail})`);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to check banned IPs:', error);
    }
  }

  /**
   * Check jail status
   */
  private async checkJailStatus(): Promise<void> {
    try {
      const { stdout } = await execAsync('fail2ban-client status');
      const stats = {
        totalJails: 0,
        activeJails: 0,
        totalBanned: this.bannedIPs.size
      };

      const jailList = stdout.match(/Jail list:\s+(.+)/)?.[1]?.split(',') || [];
      stats.totalJails = jailList.length;
      stats.activeJails = jailList.length; // All listed jails are active

      this.emit('status-update', stats);
    } catch (error) {
      logger.error('Failed to check jail status:', error);
    }
  }

  /**
   * Ban IP manually
   */
  async banIP(ip: string, jail: string = 'homeserver-api'): Promise<void> {
    try {
      await execAsync(`fail2ban-client set ${jail} banip ${ip}`);
      this.bannedIPs.add(ip);
      logger.info(`Manually banned IP: ${ip} in jail: ${jail}`);
    } catch (error) {
      logger.error(`Failed to ban IP ${ip}:`, error);
      throw error;
    }
  }

  /**
   * Unban IP
   */
  async unbanIP(ip: string, jail: string = 'homeserver-api'): Promise<void> {
    try {
      await execAsync(`fail2ban-client set ${jail} unbanip ${ip}`);
      this.bannedIPs.delete(ip);
      logger.info(`Unbanned IP: ${ip} from jail: ${jail}`);
    } catch (error) {
      logger.error(`Failed to unban IP ${ip}:`, error);
      throw error;
    }
  }

  /**
   * Get banned IPs
   */
  getBannedIPs(): string[] {
    return Array.from(this.bannedIPs);
  }

  /**
   * Get jail statistics
   */
  async getJailStats(jailName: string): Promise<any> {
    try {
      const { stdout } = await execAsync(
        `fail2ban-client status ${jailName}`
      );

      const stats = {
        currentlyFailed: stdout.match(/Currently failed:\s+(\d+)/)?.[1] || '0',
        totalFailed: stdout.match(/Total failed:\s+(\d+)/)?.[1] || '0',
        currentlyBanned: stdout.match(/Currently banned:\s+(\d+)/)?.[1] || '0',
        totalBanned: stdout.match(/Total banned:\s+(\d+)/)?.[1] || '0',
        bannedIPs: stdout.match(/Banned IP list:\s+(.+)/)?.[1]?.split(' ') || []
      };

      return stats;
    } catch (error) {
      logger.error(`Failed to get stats for jail ${jailName}:`, error);
      return null;
    }
  }
}
```

### 4. Security API Routes

Create `src/routes/security.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { CloudflareTunnelManager } from '@/security/cloudflare/tunnel-manager';
import { AuthentikMiddleware } from '@/security/authentik/middleware';
import { Fail2banManager } from '@/security/fail2ban/jail-manager';
import { z } from 'zod';

// Request/Response schemas
const BanIPSchema = z.object({
  ip: z.string().ip(),
  jail: z.string().optional(),
  duration: z.string().optional()
});

const SecurityStatusSchema = z.object({
  tunnel: z.object({
    active: z.boolean(),
    healthy: z.boolean(),
    hostname: z.string().optional()
  }),
  authentication: z.object({
    provider: z.string(),
    enabled: z.boolean(),
    users: z.number()
  }),
  fail2ban: z.object({
    active: z.boolean(),
    jails: z.number(),
    bannedIPs: z.number()
  }),
  threats: z.array(z.object({
    timestamp: z.string(),
    source: z.string(),
    type: z.string(),
    action: z.string()
  }))
});

export async function securityRoutes(fastify: FastifyInstance) {
  const tunnel = new CloudflareTunnelManager();
  const auth = new AuthentikMiddleware();
  const fail2ban = new Fail2banManager();

  // Initialize security stack
  await tunnel.initialize();
  await fail2ban.initialize();

  /**
   * Get security status
   */
  fastify.get('/api/v1/security/status', {
    preHandler: [auth.authenticate()]
  }, async (request, reply) => {
    const status = {
      tunnel: {
        active: true,
        healthy: await tunnel.checkHealth(),
        hostname: process.env.TUNNEL_HOSTNAME
      },
      authentication: {
        provider: 'Authentik',
        enabled: true,
        users: 0 // TODO: Get from Authentik
      },
      fail2ban: {
        active: true,
        jails: 5,
        bannedIPs: fail2ban.getBannedIPs().length
      },
      threats: [] // TODO: Get recent threats
    };

    return SecurityStatusSchema.parse(status);
  });

  /**
   * Get banned IPs
   */
  fastify.get('/api/v1/security/banned-ips', {
    preHandler: [auth.authenticate(), auth.requirePermission('read')]
  }, async (request, reply) => {
    return {
      ips: fail2ban.getBannedIPs()
    };
  });

  /**
   * Ban IP manually
   */
  fastify.post('/api/v1/security/ban-ip', {
    preHandler: [auth.authenticate(), auth.requirePermission('admin')]
  }, async (request, reply) => {
    const data = BanIPSchema.parse(request.body);

    await fail2ban.banIP(data.ip, data.jail);

    return {
      success: true,
      message: `IP ${data.ip} banned`
    };
  });

  /**
   * Unban IP
   */
  fastify.post('/api/v1/security/unban-ip', {
    preHandler: [auth.authenticate(), auth.requirePermission('admin')]
  }, async (request, reply) => {
    const data = z.object({
      ip: z.string().ip(),
      jail: z.string().optional()
    }).parse(request.body);

    await fail2ban.unbanIP(data.ip, data.jail);

    return {
      success: true,
      message: `IP ${data.ip} unbanned`
    };
  });

  /**
   * Get jail statistics
   */
  fastify.get('/api/v1/security/jails/:jail/stats', {
    preHandler: [auth.authenticate(), auth.requirePermission('read')]
  }, async (request, reply) => {
    const params = z.object({
      jail: z.string()
    }).parse(request.params);

    const stats = await fail2ban.getJailStats(params.jail);

    return stats;
  });

  /**
   * Security scan
   */
  fastify.post('/api/v1/security/scan', {
    preHandler: [auth.authenticate(), auth.requirePermission('admin')]
  }, async (request, reply) => {
    // Trigger security scan (from phase 4)
    const scanner = request.server.securityScanner;
    const results = await scanner.performFullScan();

    return results;
  });

  // Real-time security events
  fail2ban.on('ip-banned', (event) => {
    fastify.io.emit('security:ip-banned', event);
  });

  fail2ban.on('status-update', (stats) => {
    fastify.io.emit('security:status', stats);
  });
}
```

### 5. Environment Variables

Add to `.env.example`:

```env
# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_NAME=homeserver-monitor
CLOUDFLARE_TUNNEL_ID=
CLOUDFLARE_TUNNEL_SECRET=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
TUNNEL_HOSTNAME=monitor.yourdomain.com

# Authentik SSO
AUTHENTIK_URL=http://localhost:9000
AUTHENTIK_TOKEN=
AUTHENTIK_PUBLIC_KEY=
AUTHENTIK_CLIENT_ID=
AUTHENTIK_CLIENT_SECRET=

# Security Settings
FAIL2BAN_ENABLED=true
FAIL2BAN_DEFAULT_BANTIME=1h
FAIL2BAN_DEFAULT_FINDTIME=10m
FAIL2BAN_DEFAULT_MAXRETRY=5
CROWDSEC_ENABLED=false
CROWDSEC_API_KEY=
```

### 6. Docker Compose Addition

Add to `docker-compose.yml`:

```yaml
  # Cloudflare Tunnel
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: homeserver-tunnel
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_SECRET}
    command: tunnel run
    networks:
      - homeserver
    restart: unless-stopped

  # Authentik
  authentik-postgresql:
    image: postgres:15-alpine
    container_name: authentik-db
    environment:
      POSTGRES_PASSWORD: ${AUTHENTIK_DB_PASSWORD}
      POSTGRES_USER: authentik
      POSTGRES_DB: authentik
    volumes:
      - authentik_postgres:/var/lib/postgresql/data
    networks:
      - homeserver
    restart: unless-stopped

  authentik-redis:
    image: redis:7-alpine
    container_name: authentik-redis
    networks:
      - homeserver
    restart: unless-stopped

  authentik-server:
    image: ghcr.io/goauthentik/server:latest
    container_name: authentik-server
    environment:
      AUTHENTIK_REDIS__HOST: authentik-redis
      AUTHENTIK_POSTGRESQL__HOST: authentik-postgresql
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: ${AUTHENTIK_DB_PASSWORD}
      AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY}
      AUTHENTIK_ERROR_REPORTING__ENABLED: false
      AUTHENTIK_LOG_LEVEL: INFO
    volumes:
      - ./authentik/media:/media
      - ./authentik/custom-templates:/templates
    ports:
      - "9000:9000"
    depends_on:
      - authentik-postgresql
      - authentik-redis
    networks:
      - homeserver
    restart: unless-stopped

  authentik-worker:
    image: ghcr.io/goauthentik/server:latest
    container_name: authentik-worker
    command: worker
    environment:
      AUTHENTIK_REDIS__HOST: authentik-redis
      AUTHENTIK_POSTGRESQL__HOST: authentik-postgresql
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: ${AUTHENTIK_DB_PASSWORD}
      AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY}
      AUTHENTIK_ERROR_REPORTING__ENABLED: false
      AUTHENTIK_LOG_LEVEL: INFO
    volumes:
      - ./authentik/media:/media
      - ./authentik/certs:/certs
      - ./authentik/custom-templates:/templates
    depends_on:
      - authentik-postgresql
      - authentik-redis
    networks:
      - homeserver
    restart: unless-stopped
```

## 🧪 Testing

### Test Cloudflare Tunnel

```bash
# Verify tunnel is running
cloudflared tunnel info

# Check ingress rules
cloudflared tunnel ingress validate

# Test connectivity
curl https://monitor.yourdomain.com/health
```

### Test Authentik

```bash
# Get token
TOKEN=$(curl -X POST https://auth.yourdomain.com/api/v3/token/ \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}' \
  | jq -r .access_token)

# Test authentication
curl https://monitor.yourdomain.com/api/v1/status \
  -H "Authorization: Bearer $TOKEN"
```

### Test Fail2ban

```bash
# Check status
sudo fail2ban-client status

# Test ban
sudo fail2ban-client set homeserver-api banip 192.168.1.100

# Check banned IPs
sudo fail2ban-client status homeserver-api
```

## 📚 Additional Resources

### Cloudflare Tunnel
- [Official Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [TrueNAS Guide](https://www.truenas.com/community/threads/cloudflare-tunnel.102471/)

### Authentik
- [Official Docs](https://goauthentik.io/docs/)
- [Docker Setup](https://goauthentik.io/docs/installation/docker-compose)

### Fail2ban
- [Official Wiki](https://github.com/fail2ban/fail2ban/wiki)
- [Custom Jails](https://www.fail2ban.org/wiki/index.php/MANUAL_0_8#Jails)

## 🎓 Learning Notes

### Security Lessons

1. **Zero Trust**: Never trust, always verify
2. **Defense in Depth**: Multiple security layers
3. **Least Privilege**: Minimal permissions
4. **Audit Everything**: Log all access attempts
5. **Automate Response**: Ban threats automatically

### Why These Technologies?

- **Cloudflare Tunnel**: No exposed ports = reduced attack surface
- **Authentik**: Enterprise SSO without enterprise cost
- **Fail2ban**: Proven intrusion prevention
- **CrowdSec**: Community threat intelligence

## ✅ Completion Checklist

- [ ] Cloudflare Tunnel configured and running
- [ ] Authentik SSO deployed and integrated
- [ ] Fail2ban jails configured for all services
- [ ] Security API endpoints working
- [ ] Authentication middleware protecting routes
- [ ] Banned IP monitoring active
- [ ] Security scan integration complete
- [ ] Documentation updated
- [ ] Tests passing
- [ ] No exposed ports (everything through tunnel)

## 🚀 Next Steps

After completing this phase:

1. **Test Security**:
   - Run penetration tests
   - Check for exposed services
   - Verify authentication flow

2. **Monitor Threats**:
   - Watch fail2ban logs
   - Review Cloudflare analytics
   - Check Authentik audit logs

3. **Proceed to Phase 9**: Smart alerting system

---

**Remember**: Security is not a feature, it's a process. Keep monitoring, updating, and improving!
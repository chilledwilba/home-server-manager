# TODO-08.1: Plex Security Hardening

> **Secure Port 32400 Exposure After Server Hardening**

## 📋 Phase Overview

**Objective**: Safely expose Plex port 32400 with defense-in-depth security

**Duration**: 2-3 hours

**Prerequisites**:
- ✅ Phase 8 complete (Security stack hardened)
- ✅ Fail2ban active
- ✅ Docker permissions fixed (see Phase 4)
- ✅ Server fully patched

## 🎯 Success Criteria

- [ ] Port 32400 exposed with Fail2ban protection
- [ ] Rate limiting configured
- [ ] Geographic blocking (optional)
- [ ] Plex authentication hardened
- [ ] Remote access secured
- [ ] No security vulnerabilities from exposure

## 📚 Why Not Cloudflare Tunnel for Plex?

### Cloudflare Tunnel Limitations

**❌ Doesn't Work Well for Plex:**
```
1. Cloudflare ToS prohibits video streaming through tunnels
2. Severe speed degradation (500Mbps → 50Mbps typical)
3. TV apps (Samsung, LG, Roku) don't support reverse proxies
4. Mobile apps have connection issues
5. Transcoding detection breaks
6. Direct play/stream breaks
```

**✅ Better Approach:**
```
1. Harden server first (Phases 0-8)
2. Expose port 32400 with protection:
   - Fail2ban (auto-ban brute force)
   - Rate limiting (prevent abuse)
   - Strong authentication (secure passwords)
   - Optional: VPN for remote access
```

## 🏗️ Security Architecture

```
Internet
   ↓
Router (Port Forward 32400)
   ↓
Firewall Rules (Rate Limiting)
   ↓
Fail2ban (Intrusion Detection)
   ↓
Plex Server (Hardened Authentication)
   ↓
Media Files (Correct Permissions)
```

## 📝 Implementation Tasks

### 1. Plex Authentication Hardening

**Create `src/security/plex/authentication.ts`**:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/utils/logger';

const execAsync = promisify(exec);

export class PlexSecurityManager {
  /**
   * Audit Plex authentication settings
   */
  async auditPlexAuth(): Promise<any> {
    logger.info('Auditing Plex authentication...');

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check authentication method
    const authCheck = await this.checkAuthMethod();
    if (authCheck.allowsLocalNoAuth) {
      issues.push('Local network allows unauthenticated access');
      recommendations.push('Disable "Allow insecure connections" in Plex settings');
    }

    // Check admin password strength
    const adminPasswordStrength = await this.checkPasswordStrength();
    if (adminPasswordStrength.score < 3) {
      issues.push('Weak admin password detected');
      recommendations.push('Use password with 16+ characters, mixed case, numbers, symbols');
    }

    // Check for shared users
    const sharedUsers = await this.getSharedUsers();
    if (sharedUsers.length > 0) {
      recommendations.push(`Review ${sharedUsers.length} shared users - remove inactive accounts`);
    }

    // Check for open access
    const publicAccess = await this.checkPublicAccess();
    if (publicAccess.enabled) {
      issues.push('⚠️ CRITICAL: Public access enabled');
      recommendations.push('Disable public access immediately');
    }

    return {
      secure: issues.length === 0,
      issues,
      recommendations,
      details: {
        authCheck,
        adminPasswordStrength,
        sharedUsers,
        publicAccess
      }
    };
  }

  /**
   * Check Plex authentication method
   */
  private async checkAuthMethod(): Promise<any> {
    // Check Plex preferences.xml
    try {
      const { stdout } = await execAsync(
        `grep -i "allowinsecure" /var/lib/plexmediaserver/Library/Application\\ Support/Plex\\ Media\\ Server/Preferences.xml || echo "not_found"`
      );

      return {
        allowsLocalNoAuth: stdout.includes('allowLocalNoAuth="1"'),
        allowsInsecure: stdout.includes('allowInsecureConnections="1"'),
        recommendation: 'Both should be disabled for security'
      };
    } catch (error) {
      logger.error('Failed to check Plex auth method:', error);
      return { error: 'Could not check' };
    }
  }

  /**
   * Check password strength (placeholder - would need Plex API)
   */
  private async checkPasswordStrength(): Promise<any> {
    // In production, this would check via Plex API
    // For now, return recommendation
    return {
      score: 0, // Unknown
      recommendation: 'Ensure password is 16+ characters with mixed case, numbers, symbols'
    };
  }

  /**
   * Get shared users
   */
  private async getSharedUsers(): Promise<any[]> {
    // Would query Plex API for shared users
    return [];
  }

  /**
   * Check public access
   */
  private async checkPublicAccess(): Promise<any> {
    // Check if Plex has public access enabled
    return {
      enabled: false,
      recommendation: 'Keep disabled unless needed'
    };
  }

  /**
   * Harden Plex settings
   */
  async hardenPlexSettings(): Promise<void> {
    const recommendations = [
      '1. Plex Settings → Network → Show Advanced',
      '2. Set "Secure connections: Required"',
      '3. Disable "Enable Relay"',
      '4. Set "Custom server access URLs" (optional for VPN)',
      '5. Enable "Treat WAN IP as LAN bandwidth"',
      '6. Settings → Security → Enable two-factor authentication',
      '7. Review and remove unused shared users',
      '8. Disable "Allow insecure connections on LAN"',
      '9. Change admin password to 16+ characters',
      '10. Review activity logs for suspicious access'
    ];

    logger.info('Plex Hardening Recommendations:');
    recommendations.forEach(r => logger.info(r));

    return;
  }
}
```

### 2. Fail2ban Jail for Plex

**Add to `/etc/fail2ban/jail.d/plex.conf`**:

```ini
[plex]
enabled = true
port = 32400
filter = plex
logpath = /var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Logs/Plex Media Server.log
maxretry = 5
findtime = 600
bantime = 3600
action = iptables-multiport[name=plex, port="32400", protocol=tcp]
```

**Create filter `/etc/fail2ban/filter.d/plex.conf`**:

```ini
[Definition]
# Detect failed authentication attempts
failregex = .*Unauthorized access attempt from <HOST>.*
            .*Failed login from <HOST>.*
            .*Authentication failed.*<HOST>.*
            .*Invalid token from <HOST>.*

# Detect suspicious scanning
            .*Excessive requests from <HOST>.*
            .*Rate limit exceeded.*<HOST>.*

ignoreregex =
```

### 3. Firewall Rate Limiting

**Add to `src/security/firewall/rate-limiting.ts`**:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/utils/logger';

const execAsync = promisify(exec);

export class FirewallManager {
  /**
   * Configure rate limiting for Plex port
   */
  async configurePlexRateLimiting(): Promise<void> {
    logger.info('Configuring rate limiting for Plex (port 32400)...');

    const rules = [
      // Limit new connections to 10 per minute per IP
      'iptables -A INPUT -p tcp --dport 32400 -m state --state NEW -m recent --set --name PLEX',
      'iptables -A INPUT -p tcp --dport 32400 -m state --state NEW -m recent --update --seconds 60 --hitcount 10 --name PLEX -j DROP',

      // Limit total connections per IP to 5 concurrent
      'iptables -A INPUT -p tcp --dport 32400 -m connlimit --connlimit-above 5 --connlimit-mask 32 -j REJECT',

      // Log dropped packets
      'iptables -A INPUT -p tcp --dport 32400 -j LOG --log-prefix "PLEX-DROP: " --log-level 4'
    ];

    for (const rule of rules) {
      try {
        await execAsync(rule);
        logger.info(`Applied: ${rule}`);
      } catch (error) {
        logger.error(`Failed to apply rule: ${rule}`, error);
      }
    }

    logger.info('✅ Rate limiting configured for Plex');
  }

  /**
   * Optional: Configure GeoIP blocking
   */
  async configureGeoIPBlocking(allowedCountries: string[]): Promise<void> {
    logger.info('Configuring GeoIP blocking...');

    // Example: Only allow US, CA, UK
    // Requires geoip database
    const blockRule = `
iptables -A INPUT -p tcp --dport 32400 -m geoip ! --src-cc ${allowedCountries.join(',')} -j DROP
`;

    logger.info(`GeoIP rule: ${blockRule}`);
    logger.info('Note: Requires xtables-addons-common and geoip database');
  }

  /**
   * Get current firewall rules for Plex
   */
  async getPlexFirewallRules(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('iptables -L INPUT -n -v | grep 32400');
      return stdout.split('\n').filter(line => line.trim());
    } catch {
      return [];
    }
  }
}
```

### 4. Monitoring Plex Access

**Add to `src/integrations/plex/access-monitor.ts`**:

```typescript
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { logger } from '@/utils/logger';
import { db } from '@/db';

export class PlexAccessMonitor extends EventEmitter {
  private logPath = '/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Logs/Plex Media Server.log';
  private suspiciousIPs: Map<string, number> = new Map();

  /**
   * Monitor Plex access logs
   */
  async startMonitoring(): Promise<void> {
    logger.info('Starting Plex access monitoring...');

    // Tail Plex log file
    setInterval(async () => {
      await this.checkAccessLogs();
    }, 10000); // Every 10 seconds
  }

  /**
   * Check Plex access logs for suspicious activity
   */
  private async checkAccessLogs(): Promise<void> {
    try {
      const logContent = await fs.readFile(this.logPath, 'utf-8');
      const recentLines = logContent.split('\n').slice(-1000); // Last 1000 lines

      for (const line of recentLines) {
        // Check for failed auth
        if (this.isFailedAuth(line)) {
          const ip = this.extractIP(line);
          if (ip) {
            await this.handleSuspiciousAccess(ip, 'failed_auth');
          }
        }

        // Check for excessive requests
        if (this.isExcessiveRequests(line)) {
          const ip = this.extractIP(line);
          if (ip) {
            await this.handleSuspiciousAccess(ip, 'excessive_requests');
          }
        }

        // Check for unusual patterns
        if (this.isUnusualPattern(line)) {
          const ip = this.extractIP(line);
          if (ip) {
            await this.handleSuspiciousAccess(ip, 'unusual_pattern');
          }
        }
      }
    } catch (error) {
      logger.error('Failed to check Plex access logs:', error);
    }
  }

  /**
   * Handle suspicious access attempt
   */
  private async handleSuspiciousAccess(ip: string, reason: string): Promise<void> {
    const count = (this.suspiciousIPs.get(ip) || 0) + 1;
    this.suspiciousIPs.set(ip, count);

    // Record in database
    db.prepare(`
      INSERT INTO plex_suspicious_access (ip, reason, count, timestamp)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET
        count = count + 1,
        last_seen = ?
    `).run(ip, reason, count, new Date().toISOString(), new Date().toISOString());

    // Trigger alert if threshold exceeded
    if (count >= 5) {
      this.emit('suspicious-access', {
        ip,
        reason,
        count,
        recommendation: 'Consider manually banning this IP'
      });

      logger.warn(`🚨 Suspicious Plex access from ${ip}: ${reason} (${count} attempts)`);
    }
  }

  /**
   * Check if log line indicates failed authentication
   */
  private isFailedAuth(line: string): boolean {
    const patterns = [
      /unauthorized/i,
      /authentication failed/i,
      /invalid token/i,
      /access denied/i
    ];

    return patterns.some(pattern => pattern.test(line));
  }

  /**
   * Check if log line indicates excessive requests
   */
  private isExcessiveRequests(line: string): boolean {
    return /rate limit|too many requests|excessive/i.test(line);
  }

  /**
   * Check for unusual access patterns
   */
  private isUnusualPattern(line: string): boolean {
    // Check for scanning patterns, unusual endpoints, etc.
    const suspiciousPatterns = [
      /\/admin/i,
      /\.\.\/\.\.\//,
      /<script>/i,
      /union.*select/i,
      /etc\/passwd/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Extract IP address from log line
   */
  private extractIP(line: string): string | null {
    const ipPattern = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/;
    const match = line.match(ipPattern);
    return match ? match[0] : null;
  }

  /**
   * Get suspicious access statistics
   */
  async getSuspiciousAccessStats(): Promise<any[]> {
    return db.prepare(`
      SELECT ip, reason, count, last_seen
      FROM plex_suspicious_access
      WHERE last_seen > datetime('now', '-24 hours')
      ORDER BY count DESC
    `).all();
  }
}
```

### 5. Docker Permission Auditing

**Add to `src/security/docker/permission-audit.ts`**:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/utils/logger';

const execAsync = promisify(exec);

interface PermissionIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  container: string;
  issue: string;
  path: string;
  currentPermissions: string;
  currentOwner: string;
  recommendation: string;
}

export class DockerPermissionAuditor {
  /**
   * Audit all Docker container permissions
   */
  async auditAllContainers(): Promise<PermissionIssue[]> {
    logger.info('🔍 Auditing Docker container permissions...');

    const issues: PermissionIssue[] = [];

    // Get all running containers
    const containers = await this.getAllContainers();

    for (const container of containers) {
      const containerIssues = await this.auditContainer(container);
      issues.push(...containerIssues);
    }

    logger.info(`Found ${issues.length} permission issues`);

    return issues;
  }

  /**
   * Audit single container
   */
  private async auditContainer(container: any): Promise<PermissionIssue[]> {
    const issues: PermissionIssue[] = [];

    // Check if running as root
    if (await this.isRunningAsRoot(container.id)) {
      issues.push({
        severity: 'high',
        container: container.name,
        issue: 'Container running as root user',
        path: 'N/A',
        currentPermissions: 'root (UID 0)',
        currentOwner: 'root',
        recommendation: 'Create dedicated user with minimal permissions. Add USER directive in Dockerfile.'
      });
    }

    // Check mounted volumes
    const mounts = await this.getContainerMounts(container.id);
    for (const mount of mounts) {
      const mountIssues = await this.auditMount(container, mount);
      issues.push(...mountIssues);
    }

    // Check environment variables for secrets
    const envIssues = await this.auditEnvironmentVariables(container);
    issues.push(...envIssues);

    return issues;
  }

  /**
   * Audit mounted volume permissions
   */
  private async auditMount(container: any, mount: any): Promise<PermissionIssue[]> {
    const issues: PermissionIssue[] = [];

    try {
      // Check permissions on host path
      const { stdout: permissions } = await execAsync(
        `stat -c '%a %U:%G' "${mount.hostPath}"`
      );

      const [mode, owner] = permissions.trim().split(' ');

      // Check for world-writable (777, 776, etc.)
      if (mode.endsWith('7')) {
        issues.push({
          severity: 'critical',
          container: container.name,
          issue: 'World-writable permissions detected',
          path: mount.hostPath,
          currentPermissions: mode,
          currentOwner: owner,
          recommendation: `Change to 755 or 750: chmod 750 "${mount.hostPath}"`
        });
      }

      // Check if owned by truenas_admin
      if (owner.includes('truenas_admin') || owner.includes('root')) {
        issues.push({
          severity: 'high',
          container: container.name,
          issue: 'Mount owned by admin/root user',
          path: mount.hostPath,
          currentPermissions: mode,
          currentOwner: owner,
          recommendation: `Create dedicated user for ${container.name}: useradd -u 1001 plex && chown -R 1001:1001 "${mount.hostPath}"`
        });
      }

      // Check for /etc, /var, /root mounts
      if (this.isSensitiveSystemPath(mount.hostPath)) {
        issues.push({
          severity: 'critical',
          container: container.name,
          issue: 'Sensitive system directory mounted',
          path: mount.hostPath,
          currentPermissions: mode,
          currentOwner: owner,
          recommendation: 'Avoid mounting system directories. Use specific subdirectories only.'
        });
      }

    } catch (error) {
      logger.error(`Failed to audit mount ${mount.hostPath}:`, error);
    }

    return issues;
  }

  /**
   * Check if running as root
   */
  private async isRunningAsRoot(containerId: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `docker exec ${containerId} id -u`
      );
      return stdout.trim() === '0';
    } catch {
      return false;
    }
  }

  /**
   * Get container mounts
   */
  private async getContainerMounts(containerId: string): Promise<any[]> {
    try {
      const { stdout } = await execAsync(
        `docker inspect ${containerId} --format '{{json .Mounts}}'`
      );

      const mounts = JSON.parse(stdout);
      return mounts.map((m: any) => ({
        hostPath: m.Source,
        containerPath: m.Destination,
        mode: m.Mode,
        rw: m.RW
      }));
    } catch {
      return [];
    }
  }

  /**
   * Audit environment variables for exposed secrets
   */
  private async auditEnvironmentVariables(container: any): Promise<PermissionIssue[]> {
    const issues: PermissionIssue[] = [];

    try {
      const { stdout } = await execAsync(
        `docker inspect ${container.id} --format '{{json .Config.Env}}'`
      );

      const envVars = JSON.parse(stdout);

      const sensitivePatterns = [
        /password/i,
        /secret/i,
        /token/i,
        /api[_-]?key/i,
        /private[_-]?key/i
      ];

      for (const env of envVars) {
        for (const pattern of sensitivePatterns) {
          if (pattern.test(env)) {
            issues.push({
              severity: 'medium',
              container: container.name,
              issue: 'Secret in environment variable',
              path: 'Environment',
              currentPermissions: 'Exposed in ENV',
              currentOwner: 'N/A',
              recommendation: 'Use Docker secrets or mounted config files instead of ENV vars'
            });
            break;
          }
        }
      }
    } catch {
      // Ignore
    }

    return issues;
  }

  /**
   * Check if path is sensitive system directory
   */
  private isSensitiveSystemPath(path: string): boolean {
    const sensitivePaths = [
      '/etc',
      '/var',
      '/root',
      '/boot',
      '/sys',
      '/proc',
      '/dev'
    ];

    return sensitivePaths.some(sensitive =>
      path.startsWith(sensitive) && path.split('/').length <= 2
    );
  }

  /**
   * Get all containers
   */
  private async getAllContainers(): Promise<any[]> {
    try {
      const { stdout } = await execAsync(
        `docker ps --format '{{json .}}'`
      );

      return stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  /**
   * Generate remediation script
   */
  async generateRemediationScript(issues: PermissionIssue[]): Promise<string> {
    const script = ['#!/bin/bash', '', '# Docker Permission Remediation Script', ''];

    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const highIssues = issues.filter(i => i.severity === 'high');

    script.push('# CRITICAL ISSUES (Fix immediately)');
    for (const issue of criticalIssues) {
      script.push(`# ${issue.issue} - ${issue.path}`);
      script.push(`# ${issue.recommendation}`);
      script.push('');
    }

    script.push('# HIGH PRIORITY ISSUES');
    for (const issue of highIssues) {
      script.push(`# ${issue.issue} - ${issue.path}`);
      script.push(`# ${issue.recommendation}`);
      script.push('');
    }

    return script.join('\n');
  }
}
```

### 6. Database Schema for Plex Monitoring

**Add to `src/db/migrations/004_plex_security.sql`**:

```sql
CREATE TABLE IF NOT EXISTS plex_suspicious_access (
  ip TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plex_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  user TEXT,
  action TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plex_access_ip ON plex_access_log(ip);
CREATE INDEX idx_plex_access_timestamp ON plex_access_log(timestamp);
```

## 🧪 Testing

### Test Fail2ban for Plex

```bash
# Simulate failed auth attempts
for i in {1..6}; do
  curl -X POST http://your-plex:32400/api/auth \
    -H "X-Plex-Client-Identifier: test" \
    --data "invalid=credentials"
  sleep 1
done

# Check if IP was banned
sudo fail2ban-client status plex
```

### Test Rate Limiting

```bash
# Rapid connection test
for i in {1..15}; do
  curl -v http://your-plex:32400 &
done

# Should see connections rejected after 10
```

### Test Permission Audit

```bash
# Run permission audit
curl http://localhost:3100/api/v1/security/audit/docker-permissions

# Should report:
# - Containers running as root
# - World-writable mounts
# - Admin-owned directories
```

## 📚 Plex Security Best Practices

### Recommended Configuration

1. **Authentication**:
   - ✅ Require authentication even on LAN
   - ✅ Enable 2FA for admin account
   - ✅ Use 16+ character password
   - ✅ Regularly review shared users

2. **Network**:
   - ✅ Secure connections: Required
   - ✅ Disable Relay (use direct connection only)
   - ✅ Set custom access URL (optional)
   - ❌ Disable "Allow insecure connections"

3. **Access**:
   - ✅ Limit shared users to trusted people
   - ✅ Remove inactive users monthly
   - ✅ Monitor access logs
   - ❌ Never enable public access

4. **Firewall**:
   - ✅ Rate limiting (10 connections/min per IP)
   - ✅ Connection limit (5 concurrent per IP)
   - ✅ Fail2ban (ban after 5 failures)
   - ✅ Optional: GeoIP blocking

## 🎯 Alternative: VPN Access

### For Maximum Security

Instead of exposing port 32400, consider VPN:

```bash
# Option 1: WireGuard VPN (recommended)
# Users connect to VPN first, then access Plex locally
# Zero port exposure

# Option 2: Tailscale (easiest)
# Mesh VPN, works everywhere
# No configuration needed

# Option 3: OpenVPN (traditional)
# More complex but battle-tested
```

**Pros**:
- Zero port exposure
- Encrypted connection
- Works from anywhere

**Cons**:
- Extra step for users
- May not work on all devices (smart TVs)
- Requires VPN client

## ✅ Completion Checklist

- [ ] Plex authentication hardened (2FA enabled)
- [ ] Fail2ban jail configured for port 32400
- [ ] Firewall rate limiting active
- [ ] Plex access monitoring running
- [ ] Docker permissions audited and fixed
- [ ] Suspicious access alerts configured
- [ ] Alternative VPN considered
- [ ] Security scan passes with port 32400 exposed
- [ ] Documentation updated
- [ ] Monitoring dashboard shows Plex status

## 🚀 Next Steps

After securing Plex:
1. **Monitor for 1 week** - Watch for suspicious access
2. **Review access logs** - Check for unusual patterns
3. **Test from external network** - Verify it works
4. **Update firewall rules** - Refine as needed
5. **Consider VPN** - For maximum security

---

**Remember**: Port exposure is acceptable when properly hardened. Defense in depth!
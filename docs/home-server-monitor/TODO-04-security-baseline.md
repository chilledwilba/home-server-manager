# TODO-04: Security Baseline & Scanning

## Goal
Establish a security baseline for your TrueNAS system, scan Docker containers for vulnerabilities, and prepare for safe internet exposure.

## Your Current Security Status
- ✅ Port 32400 (Plex) disabled after suspicious traffic (good call!)
- ⚠️ No reverse proxy configured
- ⚠️ No fail2ban or intrusion detection
- ⚠️ Docker containers may have security issues
- ❓ Unknown exposure of other services

## Phase 1: Security Scanner

### Create `src/services/security/scanner.ts`
```typescript
import { logger } from '../../utils/logger';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SecurityFinding {
  container: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  recommendation: string;
  cve?: string;
  fixed: boolean;
}

export class SecurityScanner {
  constructor(
    private db: Database.Database,
    private io: SocketServer
  ) {}

  // Scan all containers
  async scanAllContainers(containers: any[]): Promise<SecurityFinding[]> {
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
      timestamp: new Date(),
    });

    return findings;
  }

  // Scan individual container
  async scanContainer(container: any): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // 1. Check if running as root
    if (container.labels?.['User'] === '0' || !container.labels?.['User']) {
      findings.push({
        container: container.name,
        severity: 'medium',
        type: 'root_user',
        message: 'Container running as root user (UID 0)',
        recommendation: 'Set PUID and PGID environment variables to non-root user (1000)',
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
        recommendation: 'Remove privileged mode unless absolutely necessary',
        fixed: false,
      });
    }

    // 3. Check exposed ports
    const exposedPorts = container.ports?.filter((p: any) =>
      p.public && p.public !== p.private
    );

    exposedPorts?.forEach((port: any) => {
      // Check if binding to all interfaces
      if (port.IP === '0.0.0.0' || !port.IP) {
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
          message: `High-risk port ${port.public} exposed`,
          recommendation: 'Use VPN or Cloudflare Tunnel instead of direct exposure',
          fixed: false,
        });
      }
    });

    // 4. Check volume mounts
    const volumes = container.labels?.['Volumes'] || [];
    volumes.forEach((volume: string) => {
      // Check for dangerous mounts
      if (volume.includes('/:/') || volume.includes('/etc:/')) {
        findings.push({
          container: container.name,
          severity: 'critical',
          type: 'dangerous_mount',
          message: `Dangerous volume mount: ${volume}`,
          recommendation: 'Limit volume mounts to specific directories only',
          fixed: false,
        });
      }

      // Check Docker socket mount
      if (volume.includes('/var/run/docker.sock')) {
        findings.push({
          container: container.name,
          severity: 'high',
          type: 'docker_socket',
          message: 'Docker socket mounted (container can control Docker)',
          recommendation: 'Only mount Docker socket for management tools, use read-only when possible',
          fixed: false,
        });
      }
    });

    // 5. Check for default passwords (arr apps)
    if (container.isArrApp && !container.labels?.['AuthRequired']) {
      findings.push({
        container: container.name,
        severity: 'high',
        type: 'no_auth',
        message: 'No authentication configured',
        recommendation: 'Enable authentication in app settings',
        fixed: false,
      });
    }

    // 6. Check image age and updates
    await this.checkImageVulnerabilities(container, findings);

    return findings;
  }

  // Check for known vulnerabilities in images
  async checkImageVulnerabilities(container: any, findings: SecurityFinding[]) {
    // Check if image is outdated
    const imageAge = await this.getImageAge(container.image);

    if (imageAge > 90) { // Days
      findings.push({
        container: container.name,
        severity: 'medium',
        type: 'outdated_image',
        message: `Image is ${imageAge} days old`,
        recommendation: 'Pull latest image: docker pull ' + container.image,
        fixed: false,
      });
    }

    // Future: Integrate with Trivy for CVE scanning
    // This would require Trivy installed on the system
    // await this.runTrivyScan(container.image, findings);
  }

  // Get image age in days
  async getImageAge(imageName: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `docker image inspect ${imageName} --format '{{.Created}}'`
      );
      const created = new Date(stdout.trim());
      const ageMs = Date.now() - created.getTime();
      return Math.floor(ageMs / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  }

  // Network security scan
  async scanNetworkSecurity(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Check for exposed services
    try {
      const { stdout } = await execAsync('netstat -tuln | grep LISTEN');
      const lines = stdout.split('\n');

      lines.forEach(line => {
        // Check for services listening on all interfaces
        if (line.includes('0.0.0.0:') || line.includes(':::')) {
          const port = this.extractPort(line);
          if (port && this.isRiskyPort(port)) {
            findings.push({
              container: 'host',
              severity: 'high',
              type: 'exposed_service',
              message: `Port ${port} exposed on all interfaces`,
              recommendation: 'Use firewall rules or bind to specific IP',
              fixed: false,
            });
          }
        }
      });
    } catch (error) {
      logger.error('Network scan failed:', error);
    }

    return findings;
  }

  // ZFS security checks
  async scanZFSSecurity(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Check encryption status
    try {
      const { stdout } = await execAsync('zfs list -o name,encryption');
      const lines = stdout.split('\n').slice(1); // Skip header

      lines.forEach(line => {
        const [dataset, encryption] = line.split(/\s+/);
        if (dataset?.includes('personal') && encryption === 'off') {
          findings.push({
            container: 'zfs',
            severity: 'medium',
            type: 'unencrypted_dataset',
            message: `Personal dataset ${dataset} is not encrypted`,
            recommendation: 'Consider enabling encryption for sensitive data',
            fixed: false,
          });
        }
      });
    } catch (error) {
      logger.error('ZFS security scan failed:', error);
    }

    return findings;
  }

  // SSH security check
  async scanSSHSecurity(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    try {
      // Check if root login is allowed
      const { stdout: rootLogin } = await execAsync(
        'grep "^PermitRootLogin" /etc/ssh/sshd_config || echo "not-set"'
      );

      if (rootLogin.includes('yes') || rootLogin.includes('not-set')) {
        findings.push({
          container: 'ssh',
          severity: 'high',
          type: 'ssh_root_login',
          message: 'SSH root login is allowed',
          recommendation: 'Set PermitRootLogin no in /etc/ssh/sshd_config',
          fixed: false,
        });
      }

      // Check if password auth is enabled
      const { stdout: passwordAuth } = await execAsync(
        'grep "^PasswordAuthentication" /etc/ssh/sshd_config || echo "yes"'
      );

      if (passwordAuth.includes('yes')) {
        findings.push({
          container: 'ssh',
          severity: 'medium',
          type: 'ssh_password_auth',
          message: 'SSH password authentication enabled',
          recommendation: 'Use SSH keys only, disable password authentication',
          fixed: false,
        });
      }
    } catch (error) {
      logger.error('SSH security scan failed:', error);
    }

    return findings;
  }

  // Calculate overall security score
  calculateSecurityScore(findings: SecurityFinding[]): number {
    let score = 100;

    findings.forEach(finding => {
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
    });

    return Math.max(0, score);
  }

  // Store findings in database
  private storeFindings(findings: SecurityFinding[]) {
    // Clear old findings
    this.db.prepare('DELETE FROM security_findings WHERE fixed = 0').run();

    // Insert new findings
    const stmt = this.db.prepare(`
      INSERT INTO security_findings (
        container, severity, type, message,
        recommendation, cve, fixed, found_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    findings.forEach(finding => {
      stmt.run(
        finding.container,
        finding.severity,
        finding.type,
        finding.message,
        finding.recommendation,
        finding.cve || null,
        finding.fixed ? 1 : 0,
        new Date().toISOString()
      );
    });
  }

  // Helper methods
  private extractPort(netstatLine: string): number | null {
    const match = netstatLine.match(/:(\d+)\s/);
    return match ? parseInt(match[1]) : null;
  }

  private isRiskyPort(port: number): boolean {
    const riskyPorts = [
      21, 22, 23, 25, 110, 143, 445, 3389, 5900,
      8080, 8081, 8443, 9000, 3306, 5432, 27017
    ];
    return riskyPorts.includes(port);
  }

  // Generate security report
  async generateSecurityReport(): Promise<string> {
    const findings = this.db.prepare(`
      SELECT * FROM security_findings
      WHERE fixed = 0
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `).all() as SecurityFinding[];

    const score = this.calculateSecurityScore(findings);

    let report = `# Security Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Security Score: ${score}/100\n\n`;

    // Group by severity
    const critical = findings.filter(f => f.severity === 'critical');
    const high = findings.filter(f => f.severity === 'high');
    const medium = findings.filter(f => f.severity === 'medium');
    const low = findings.filter(f => f.severity === 'low');

    if (critical.length > 0) {
      report += `## Critical Issues (${critical.length})\n\n`;
      critical.forEach(f => {
        report += `- **${f.container}**: ${f.message}\n`;
        report += `  - Recommendation: ${f.recommendation}\n\n`;
      });
    }

    if (high.length > 0) {
      report += `## High Severity Issues (${high.length})\n\n`;
      high.forEach(f => {
        report += `- **${f.container}**: ${f.message}\n`;
        report += `  - Recommendation: ${f.recommendation}\n\n`;
      });
    }

    if (medium.length > 0) {
      report += `## Medium Severity Issues (${medium.length})\n\n`;
      medium.forEach(f => {
        report += `- **${f.container}**: ${f.message}\n`;
        report += `  - Recommendation: ${f.recommendation}\n\n`;
      });
    }

    if (low.length > 0) {
      report += `## Low Severity Issues (${low.length})\n\n`;
      low.forEach(f => {
        report += `- **${f.container}**: ${f.message}\n`;
        report += `  - Recommendation: ${f.recommendation}\n\n`;
      });
    }

    report += `## Recommendations\n\n`;
    report += `1. Address all critical and high severity issues immediately\n`;
    report += `2. Configure Cloudflare Tunnel instead of port forwarding\n`;
    report += `3. Enable authentication on all services\n`;
    report += `4. Implement fail2ban for brute force protection\n`;
    report += `5. Regular security scans (weekly recommended)\n`;

    return report;
  }
}
```

### Create `src/services/security/hardening.ts`
```typescript
import { logger } from '../../utils/logger';

interface HardeningRecommendation {
  category: string;
  title: string;
  description: string;
  commands?: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  impact: 'low' | 'medium' | 'high';
}

export class SecurityHardening {
  getRecommendations(): HardeningRecommendation[] {
    return [
      // Network Security
      {
        category: 'Network',
        title: 'Disable Port Forwarding',
        description: 'Replace port forwarding with Cloudflare Tunnel for secure access',
        commands: [
          '# Remove port forwarding rules from router',
          '# Install cloudflared (covered in TODO-08)',
        ],
        difficulty: 'easy',
        impact: 'high',
      },
      {
        category: 'Network',
        title: 'Configure Firewall',
        description: 'Set up UFW firewall to control access',
        commands: [
          'sudo ufw default deny incoming',
          'sudo ufw default allow outgoing',
          'sudo ufw allow ssh',
          'sudo ufw allow from 192.168.1.0/24', // Local network only
          'sudo ufw enable',
        ],
        difficulty: 'easy',
        impact: 'high',
      },

      // Docker Security
      {
        category: 'Docker',
        title: 'Run Containers as Non-Root',
        description: 'Configure containers to run with non-root user',
        commands: [
          '# In docker-compose.yml:',
          'environment:',
          '  - PUID=1000',
          '  - PGID=1000',
        ],
        difficulty: 'easy',
        impact: 'medium',
      },
      {
        category: 'Docker',
        title: 'Enable Docker Content Trust',
        description: 'Only run signed Docker images',
        commands: [
          'export DOCKER_CONTENT_TRUST=1',
          'echo "export DOCKER_CONTENT_TRUST=1" >> ~/.bashrc',
        ],
        difficulty: 'medium',
        impact: 'medium',
      },
      {
        category: 'Docker',
        title: 'Limit Container Resources',
        description: 'Prevent containers from consuming all resources',
        commands: [
          '# In docker-compose.yml:',
          'deploy:',
          '  resources:',
          '    limits:',
          '      cpus: "2"',
          '      memory: 2G',
        ],
        difficulty: 'easy',
        impact: 'medium',
      },

      // SSH Hardening
      {
        category: 'SSH',
        title: 'Disable Root SSH Login',
        description: 'Prevent root login via SSH',
        commands: [
          'sudo sed -i "s/PermitRootLogin yes/PermitRootLogin no/" /etc/ssh/sshd_config',
          'sudo systemctl restart sshd',
        ],
        difficulty: 'easy',
        impact: 'high',
      },
      {
        category: 'SSH',
        title: 'Use SSH Keys Only',
        description: 'Disable password authentication',
        commands: [
          'ssh-keygen -t ed25519 -C "your-email@example.com"',
          'ssh-copy-id user@truenas-ip',
          'sudo sed -i "s/PasswordAuthentication yes/PasswordAuthentication no/" /etc/ssh/sshd_config',
          'sudo systemctl restart sshd',
        ],
        difficulty: 'medium',
        impact: 'high',
      },

      // ZFS Security
      {
        category: 'ZFS',
        title: 'Enable Dataset Encryption',
        description: 'Encrypt sensitive datasets',
        commands: [
          'zfs create -o encryption=on -o keyformat=passphrase pool/encrypted',
          '# Enter passphrase when prompted',
        ],
        difficulty: 'medium',
        impact: 'high',
      },
      {
        category: 'ZFS',
        title: 'Regular Scrubs',
        description: 'Schedule regular pool scrubs',
        commands: [
          'zpool scrub pool-name',
          '# Add to cron: 0 2 * * 0 /sbin/zpool scrub pool-name',
        ],
        difficulty: 'easy',
        impact: 'medium',
      },

      // Application Security
      {
        category: 'Applications',
        title: 'Enable Arr App Authentication',
        description: 'Require authentication for all arr apps',
        commands: [
          '# In Sonarr/Radarr settings:',
          '# Settings → General → Security',
          '# Authentication: Forms',
          '# Username: your-username',
          '# Password: strong-password',
        ],
        difficulty: 'easy',
        impact: 'high',
      },
      {
        category: 'Applications',
        title: 'Configure Fail2ban',
        description: 'Prevent brute force attacks',
        commands: [
          'sudo apt install fail2ban',
          '# Configure in TODO-08',
        ],
        difficulty: 'medium',
        impact: 'high',
      },

      // Monitoring & Logging
      {
        category: 'Monitoring',
        title: 'Enable Audit Logging',
        description: 'Track all system changes',
        commands: [
          'sudo apt install auditd',
          'sudo systemctl enable auditd',
          'sudo systemctl start auditd',
        ],
        difficulty: 'medium',
        impact: 'medium',
      },
      {
        category: 'Monitoring',
        title: 'Set Up Log Rotation',
        description: 'Prevent logs from filling disk',
        commands: [
          '# Edit /etc/logrotate.conf',
          '# Set appropriate rotation policies',
        ],
        difficulty: 'easy',
        impact: 'low',
      },

      // Backup & Recovery
      {
        category: 'Backup',
        title: 'Configure Automated Snapshots',
        description: 'Regular snapshots for quick recovery',
        commands: [
          'zfs set com.sun:auto-snapshot=true pool/dataset',
          '# Configure in TODO-06',
        ],
        difficulty: 'easy',
        impact: 'high',
      },
      {
        category: 'Backup',
        title: 'Test Backup Restoration',
        description: 'Verify backups actually work',
        commands: [
          '# Create test dataset',
          'zfs create pool/test-restore',
          '# Restore from snapshot',
          'zfs send pool/dataset@snapshot | zfs recv pool/test-restore',
        ],
        difficulty: 'medium',
        impact: 'high',
      },
    ];
  }

  // Generate docker-compose with security best practices
  generateSecureDockerCompose(service: string): string {
    const templates: { [key: string]: string } = {
      sonarr: `
version: '3.8'
services:
  sonarr:
    image: lscr.io/linuxserver/sonarr:latest
    container_name: sonarr
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Your/Timezone
    volumes:
      - /path/to/config:/config
      - /path/to/media:/media:ro  # Read-only media
    ports:
      - "192.168.1.100:8989:8989"  # Bind to specific IP
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETUID
      - SETGID
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
`,
      plex: `
version: '3.8'
services:
  plex:
    image: lscr.io/linuxserver/plex:latest
    container_name: plex
    network_mode: host  # Required for Plex
    environment:
      - PUID=1000
      - PGID=1000
      - VERSION=docker
    volumes:
      - /path/to/config:/config
      - /path/to/media:/media:ro
      - /dev/dri:/dev/dri  # For Intel QuickSync
    devices:
      - /dev/dri:/dev/dri  # Hardware transcoding
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
`,
    };

    return templates[service] || 'Service template not found';
  }

  // Check if Intel QuickSync is available (for your i5-12400)
  async checkQuickSync(): Promise<boolean> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync('ls /dev/dri');
      return stdout.includes('renderD128');
    } catch {
      return false;
    }
  }
}
```

## Phase 2: Add Security Routes

### Create `src/routes/security.ts`
```typescript
import { FastifyInstance } from 'fastify';
import { SecurityScanner } from '../services/security/scanner';
import { SecurityHardening } from '../services/security/hardening';

export async function securityRoutes(fastify: FastifyInstance) {
  const scanner = new SecurityScanner(fastify.db, fastify.io);
  const hardening = new SecurityHardening();

  // Run security scan
  fastify.post('/api/security/scan', async (request, reply) => {
    // Get all containers
    const containers = await fastify.docker.portainer.getContainers();

    // Run scans
    const [containerFindings, networkFindings, zfsFindings, sshFindings] =
      await Promise.all([
        scanner.scanAllContainers(containers),
        scanner.scanNetworkSecurity(),
        scanner.scanZFSSecurity(),
        scanner.scanSSHSecurity(),
      ]);

    const allFindings = [
      ...containerFindings,
      ...networkFindings,
      ...zfsFindings,
      ...sshFindings,
    ];

    const score = scanner.calculateSecurityScore(allFindings);

    return {
      score,
      findings: allFindings,
      summary: {
        critical: allFindings.filter(f => f.severity === 'critical').length,
        high: allFindings.filter(f => f.severity === 'high').length,
        medium: allFindings.filter(f => f.severity === 'medium').length,
        low: allFindings.filter(f => f.severity === 'low').length,
      },
      scannedAt: new Date(),
    };
  });

  // Get security findings
  fastify.get('/api/security/findings', async (request, reply) => {
    const findings = fastify.db.prepare(`
      SELECT * FROM security_findings
      WHERE fixed = 0
      ORDER BY severity
    `).all();

    return findings;
  });

  // Get hardening recommendations
  fastify.get('/api/security/recommendations', async (request, reply) => {
    const recommendations = hardening.getRecommendations();
    return recommendations;
  });

  // Generate security report
  fastify.get('/api/security/report', async (request, reply) => {
    const report = await scanner.generateSecurityReport();
    reply.type('text/markdown').send(report);
  });

  // Check QuickSync availability
  fastify.get('/api/security/quicksync', async (request, reply) => {
    const available = await hardening.checkQuickSync();
    return {
      available,
      message: available
        ? 'Intel QuickSync is available for hardware transcoding'
        : 'Intel QuickSync not detected',
    };
  });

  // Get secure docker-compose template
  fastify.get('/api/security/docker-template/:service', async (request, reply) => {
    const { service } = request.params as { service: string };
    const template = hardening.generateSecureDockerCompose(service);
    reply.type('text/yaml').send(template);
  });

  // Mark finding as fixed
  fastify.post('/api/security/findings/:id/fixed', async (request, reply) => {
    const { id } = request.params as { id: string };

    fastify.db.prepare(`
      UPDATE security_findings
      SET fixed = 1, fixed_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);

    return { success: true };
  });
}
```

## Phase 3: Database Updates

### Create `src/db/migrations/004_security_tables.sql`
```sql
CREATE TABLE IF NOT EXISTS security_findings (
  id INTEGER PRIMARY KEY,
  container TEXT NOT NULL,
  severity TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  recommendation TEXT,
  cve TEXT,
  fixed BOOLEAN DEFAULT 0,
  found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  fixed_at DATETIME
);

CREATE INDEX idx_security_severity ON security_findings(severity);
CREATE INDEX idx_security_fixed ON security_findings(fixed);

CREATE TABLE IF NOT EXISTS security_scans (
  id INTEGER PRIMARY KEY,
  score INTEGER,
  findings_count INTEGER,
  critical_count INTEGER,
  high_count INTEGER,
  medium_count INTEGER,
  low_count INTEGER,
  scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Phase 4: Testing Security Features

### Run security scan
```bash
# Trigger full security scan
curl -X POST http://localhost:3100/api/security/scan

# Get current findings
curl http://localhost:3100/api/security/findings

# Get security report
curl http://localhost:3100/api/security/report

# Get hardening recommendations
curl http://localhost:3100/api/security/recommendations

# Check if QuickSync is available
curl http://localhost:3100/api/security/quicksync

# Get secure Docker template
curl http://localhost:3100/api/security/docker-template/sonarr
```

## Validation Checklist

- [ ] Security scan identifies issues
- [ ] Findings stored in database
- [ ] Security score calculated
- [ ] Recommendations provided
- [ ] QuickSync detection works
- [ ] Report generation works
- [ ] Real-time alerts for critical issues

## Common Security Issues You'll Find

1. **Containers running as root** - Most containers by default
2. **Ports bound to 0.0.0.0** - Exposed to all interfaces
3. **No authentication on arr apps** - Common oversight
4. **Outdated images** - Regular updates needed
5. **SSH with password auth** - Should use keys only

## Immediate Actions

Based on your setup, prioritize these:

1. **Disable all port forwarding** (you already started this!)
2. **Enable authentication on all arr apps**
3. **Bind services to local IP only** (192.168.1.100)
4. **Set up SSH keys and disable password auth**
5. **Configure UFW firewall**

## Questions for Claude

- "How do I enable Intel QuickSync for Plex on my i5-12400?"
- "Should I encrypt my media dataset or just personal files?"
- "What's the best firewall configuration for TrueNAS Scale?"
- "How do I set up fail2ban for my arr apps?"

## Next Steps

With security scanning complete:
- ✅ Security issues identified
- ✅ Recommendations provided
- ✅ Hardening templates available
- ✅ QuickSync detection for hardware transcoding

**Proceed to TODO-05-mcp-integration.md** to connect Claude for intelligent assistance!

---

*Note: Your instinct to disable port 32400 was correct. We'll set up Cloudflare Tunnel in TODO-08 for safe external access without port forwarding.*
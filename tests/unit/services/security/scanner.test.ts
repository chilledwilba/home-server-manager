import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { Server as SocketIOServer } from 'socket.io';
import { SecurityScanner } from '../../../../src/services/security/scanner.js';

describe('SecurityScanner', () => {
  let db: Database.Database;
  let io: SocketIOServer;
  let httpServer: ReturnType<typeof createServer>;
  let scanner: SecurityScanner;
  let emitSpy: jest.SpiedFunction<any>;
  let mockRoom: any;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create schema matching production
    db.exec(`
      CREATE TABLE security_findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        container TEXT NOT NULL,
        severity TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        cve TEXT,
        fixed BOOLEAN DEFAULT 0,
        found_at TEXT,
        fixed_at TEXT
      );
    `);

    // Create HTTP server and Socket.IO
    httpServer = createServer();
    io = new SocketIOServer(httpServer);

    // Create a mock room with emit method
    mockRoom = {
      emit: jest.fn(),
    };

    // Mock the 'to' method to return our mock room
    jest.spyOn(io, 'to').mockReturnValue(mockRoom as any);

    // Spy on the mock room's emit
    emitSpy = mockRoom.emit;

    scanner = new SecurityScanner(db, io);
  });

  afterEach(() => {
    db.close();
    io.close();
    httpServer.close();
    jest.restoreAllMocks();
  });

  describe('scanContainer', () => {
    it('should detect container running as root', async () => {
      const container = {
        name: 'test-container',
        id: 'abc123',
        state: 'running',
        labels: {} as Record<string, string>,
      };

      const findings = await scanner.scanContainer(container);

      const rootFinding = findings.find((f) => f.type === 'root_user');
      expect(rootFinding).toBeDefined();
      expect(rootFinding?.severity).toBe('medium');
      expect(rootFinding?.message).toContain('root');
    });

    it('should not flag containers with PUID set', async () => {
      const container = {
        name: 'safe-container',
        id: 'xyz789',
        state: 'running',
        labels: {
          PUID: '1000',
          PGID: '1000',
          RestartPolicy: 'unless-stopped',
        },
      };

      const findings = await scanner.scanContainer(container);

      const rootFindings = findings.filter((f) => f.type === 'root_user');
      expect(rootFindings).toHaveLength(0);
    });

    it('should detect privileged mode', async () => {
      const container = {
        name: 'privileged-container',
        id: 'priv123',
        state: 'running',
        labels: {
          Privileged: 'true',
          PUID: '1000',
        },
      };

      const findings = await scanner.scanContainer(container);

      const privFindings = findings.filter((f) => f.type === 'privileged_mode');
      expect(privFindings).toHaveLength(1);
      expect(privFindings[0]?.severity).toBe('high');
    });

    it('should detect exposed ports on all interfaces', async () => {
      const container = {
        name: 'exposed-container',
        id: 'exp123',
        state: 'running',
        labels: {
          PUID: '1000',
          RestartPolicy: 'unless-stopped',
        },
        ports: [
          {
            private: 8080,
            public: 8080,
            type: 'tcp',
            IP: '0.0.0.0',
          },
        ],
      };

      const findings = await scanner.scanContainer(container);

      const portFindings = findings.filter((f) => f.type === 'exposed_port');
      expect(portFindings.length).toBeGreaterThan(0);
    });

    it('should not flag ports bound to localhost', async () => {
      const container = {
        name: 'localhost-container',
        id: 'local123',
        state: 'running',
        labels: {
          PUID: '1000',
        },
        ports: [
          {
            private: 8080,
            public: 8080,
            type: 'tcp',
            IP: '127.0.0.1',
          },
        ],
      };

      const findings = await scanner.scanContainer(container);

      const portFindings = findings.filter((f) => f.type === 'exposed_port');
      expect(portFindings).toHaveLength(0);
    });

    it('should detect risky ports', async () => {
      const container = {
        name: 'ssh-container',
        id: 'ssh123',
        state: 'running',
        labels: {
          PUID: '1000',
        },
        ports: [
          {
            private: 22,
            public: 22,
            type: 'tcp',
            IP: '0.0.0.0',
          },
        ],
      };

      const findings = await scanner.scanContainer(container);

      const riskyPortFindings = findings.filter((f) => f.type === 'risky_port');
      expect(riskyPortFindings.length).toBeGreaterThan(0);
      expect(riskyPortFindings[0]?.severity).toBe('high');
    });

    it('should detect Docker socket mount', async () => {
      const container = {
        name: 'portainer',
        id: 'port123',
        state: 'running',
        labels: {
          PUID: '1000',
          Volumes: '/var/run/docker.sock:/var/run/docker.sock',
        },
      };

      const findings = await scanner.scanContainer(container);

      const dockerSocketFindings = findings.filter((f) => f.type === 'docker_socket');
      expect(dockerSocketFindings.length).toBeGreaterThan(0);
      expect(dockerSocketFindings[0]?.severity).toBe('high');
    });

    it('should detect dangerous mounts', async () => {
      const container = {
        name: 'dangerous-container',
        id: 'dang123',
        state: 'running',
        labels: {
          PUID: '1000',
          Volumes: '/:/host',
        },
      };

      const findings = await scanner.scanContainer(container);

      const dangerousMountFindings = findings.filter((f) => f.type === 'dangerous_mount');
      expect(dangerousMountFindings.length).toBeGreaterThan(0);
      expect(dangerousMountFindings[0]?.severity).toBe('critical');
    });

    it('should detect missing authentication on Arr apps', async () => {
      const container = {
        name: 'sonarr',
        id: 'sonarr123',
        state: 'running',
        labels: {
          PUID: '1000',
        },
        isArrApp: true,
      };

      const findings = await scanner.scanContainer(container);

      const noAuthFindings = findings.filter((f) => f.type === 'no_auth');
      expect(noAuthFindings.length).toBeGreaterThan(0);
      expect(noAuthFindings[0]?.severity).toBe('high');
    });

    it('should not flag Arr apps with authentication', async () => {
      const container = {
        name: 'radarr',
        id: 'radarr123',
        state: 'running',
        labels: {
          PUID: '1000',
          AuthenticationRequired: 'true',
        },
        isArrApp: true,
      };

      const findings = await scanner.scanContainer(container);

      const noAuthFindings = findings.filter((f) => f.type === 'no_auth');
      expect(noAuthFindings).toHaveLength(0);
    });

    it('should detect exposed Plex port', async () => {
      const container = {
        name: 'plex',
        id: 'plex123',
        state: 'running',
        labels: {
          PUID: '1000',
        },
        isPlex: true,
        ports: [
          {
            private: 32400,
            public: 32400,
            type: 'tcp',
          },
        ],
      };

      const findings = await scanner.scanContainer(container);

      const plexFindings = findings.filter((f) => f.type === 'plex_exposed');
      expect(plexFindings.length).toBeGreaterThan(0);
      expect(plexFindings[0]?.severity).toBe('medium');
    });

    it('should detect missing restart policy', async () => {
      const container = {
        name: 'test-container',
        id: 't123',
        state: 'running',
        labels: {
          PUID: '1000',
        },
      };

      const findings = await scanner.scanContainer(container);

      const restartFindings = findings.filter((f) => f.type === 'no_restart_policy');
      expect(restartFindings.length).toBeGreaterThan(0);
      expect(restartFindings[0]?.severity).toBe('low');
    });
  });

  describe('scanAllContainers', () => {
    it('should scan multiple containers and calculate score', async () => {
      const containers = [
        {
          name: 'container1',
          id: 'c1',
          state: 'running',
          labels: { PUID: '1000', RestartPolicy: 'unless-stopped' },
        },
        {
          name: 'container2',
          id: 'c2',
          state: 'running',
          labels: {} as Record<string, string>,
        },
      ];

      const result = await scanner.scanAllContainers(containers);

      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('score');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should return perfect score for secure containers', async () => {
      const containers = [
        {
          name: 'secure-container',
          id: 'sec1',
          state: 'running',
          labels: {
            PUID: '1000',
            PGID: '1000',
            RestartPolicy: 'unless-stopped',
          },
        },
      ];

      const result = await scanner.scanAllContainers(containers);

      expect(result.findings).toHaveLength(0);
      expect(result.score).toBe(100);
    });

    it('should store findings in database', async () => {
      const containers = [
        {
          name: 'test-container',
          id: 't1',
          state: 'running',
          labels: {} as Record<string, string>,
        },
      ];

      await scanner.scanAllContainers(containers);

      const stored = db
        .prepare('SELECT * FROM security_findings WHERE container = ?')
        .all('test-container');

      expect(stored.length).toBeGreaterThan(0);
    });

    it('should emit security scan complete event', async () => {
      const containers = [
        {
          name: 'test-container',
          id: 't1',
          state: 'running',
          labels: { PUID: '1000', RestartPolicy: 'unless-stopped' },
        },
      ];

      await scanner.scanAllContainers(containers);

      expect(emitSpy).toHaveBeenCalledWith(
        'security:scan-complete',
        expect.objectContaining({
          findings: expect.any(Array),
          score: expect.any(Number),
          timestamp: expect.any(String),
        }),
      );
    });

    it('should handle empty container list', async () => {
      const result = await scanner.scanAllContainers([]);

      expect(result.findings).toHaveLength(0);
      expect(result.score).toBe(100);
    });
  });

  describe('calculateSecurityScore', () => {
    it('should penalize critical findings more than others', () => {
      const findings = [
        {
          container: 'test',
          severity: 'critical' as const,
          type: 'dangerous_mount',
          message: 'Critical issue',
          recommendation: 'Fix now',
          fixed: false,
        },
      ];

      const score = scanner.calculateSecurityScore(findings);
      expect(score).toBe(80); // 100 - 20 for critical
    });

    it('should ignore fixed findings when calculating score', () => {
      const findings = [
        {
          container: 'test',
          severity: 'high' as const,
          type: 'test',
          message: 'Test',
          recommendation: 'Fix',
          fixed: true,
        },
      ];

      const score = scanner.calculateSecurityScore(findings);
      expect(score).toBe(100); // Fixed finding doesn't affect score
    });

    it('should not go below zero', () => {
      const findings = Array(20).fill({
        container: 'test',
        severity: 'critical' as const,
        type: 'test',
        message: 'Test',
        recommendation: 'Fix',
        fixed: false,
      });

      const score = scanner.calculateSecurityScore(findings);
      expect(score).toBe(0);
    });
  });

  describe('getLatestFindings', () => {
    it('should retrieve all unfixed findings', async () => {
      const containers = [
        {
          name: 'test-container',
          id: 't1',
          state: 'running',
          labels: {} as Record<string, string>,
        },
      ];

      await scanner.scanAllContainers(containers);
      const findings = scanner.getLatestFindings();

      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every((f) => f.fixed === false)).toBe(true);
    });

    it('should sort findings by severity', async () => {
      const containers = [
        {
          name: 'dangerous',
          id: 'd1',
          state: 'running',
          labels: {
            Volumes: '/:/host',
            Privileged: 'true',
          },
          ports: [
            {
              private: 22,
              public: 22,
              type: 'tcp',
              IP: '0.0.0.0',
            },
          ],
        },
      ];

      await scanner.scanAllContainers(containers);
      const findings = scanner.getLatestFindings();

      // Critical findings should come first
      const firstFindingSeverity = findings[0]?.severity;
      expect(['critical', 'high']).toContain(firstFindingSeverity);
    });
  });

  describe('generateSecurityReport', () => {
    it('should generate comprehensive security report', async () => {
      const containers = [
        {
          name: 'privileged-container',
          id: 'p1',
          state: 'running',
          labels: { Privileged: 'true' },
        },
      ];

      await scanner.scanAllContainers(containers);
      const report = scanner.generateSecurityReport();

      expect(report).toHaveProperty('score');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('findings');
      expect(report).toHaveProperty('recommendations');

      expect(report.summary).toHaveProperty('critical');
      expect(report.summary).toHaveProperty('high');
      expect(report.summary).toHaveProperty('medium');
      expect(report.summary).toHaveProperty('low');
      expect(report.summary).toHaveProperty('total');
    });

    it('should include critical recommendation for critical issues', async () => {
      const containers = [
        {
          name: 'dangerous-container',
          id: 'd1',
          state: 'running',
          labels: {
            Volumes: '/:/host',
          },
        },
      ];

      await scanner.scanAllContainers(containers);
      const report = scanner.generateSecurityReport();

      expect(report.recommendations.some((r) => r.includes('CRITICAL'))).toBe(true);
    });

    it('should show positive message for secure setup', async () => {
      const containers = [
        {
          name: 'secure-container',
          id: 's1',
          state: 'running',
          labels: {
            PUID: '1000',
            PGID: '1000',
            RestartPolicy: 'unless-stopped',
          },
        },
      ];

      await scanner.scanAllContainers(containers);
      const report = scanner.generateSecurityReport();

      expect(report.score).toBe(100);
      expect(report.summary.total).toBe(0);
      expect(report.recommendations.some((r) => r.includes('✅'))).toBe(true);
    });
  });

  describe('markFindingFixed', () => {
    it('should mark specific finding as fixed', async () => {
      const containers = [
        {
          name: 'test-container',
          id: 't1',
          state: 'running',
          labels: {} as Record<string, string>,
        },
      ];

      await scanner.scanAllContainers(containers);
      const beforeFindings = scanner.getLatestFindings();
      expect(beforeFindings.length).toBeGreaterThan(0);

      // Mark the root_user finding as fixed
      scanner.markFindingFixed('test-container', 'root_user');

      const afterFindings = scanner.getLatestFindings();
      const rootFinding = afterFindings.find(
        (f) => f.container === 'test-container' && f.type === 'root_user',
      );

      expect(rootFinding).toBeUndefined();
    });

    it('should handle marking already fixed findings', () => {
      // Should not throw error
      expect(() => {
        scanner.markFindingFixed('nonexistent', 'root_user');
      }).not.toThrow();
    });
  });
});

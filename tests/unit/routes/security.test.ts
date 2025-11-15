/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { scannerRoutes } from '../../../src/routes/security/scanner.js';
import { orchestratorRoutes } from '../../../src/routes/security/orchestrator.js';
import { fail2banRoutes } from '../../../src/routes/security/fail2ban.js';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock validation
jest.mock('../../../src/utils/validation.js', () => ({
  validateIPAddress: jest.fn((ip: string) => {
    // Simple IP validation for testing
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const valid = ipRegex.test(ip);
    return {
      valid,
      error: valid ? undefined : 'Invalid IP address format',
    };
  }),
}));

// Mock route helpers
jest.mock('../../../src/utils/route-helpers.js', () => {
  const actual = jest.requireActual('../../../src/utils/route-helpers.js') as any;
  return {
    ...actual,
    withDatabase: (handler: any) => async (request: any, reply: any) => {
      const db = (request.server as any).db;
      return handler(db, request, reply);
    },
  };
});

// Mock error types
jest.mock('../../../src/utils/error-types.js', () => ({
  ExternalServiceError: class ExternalServiceError extends Error {
    constructor(_service: string, message: string) {
      super(message);
      this.name = 'ExternalServiceError';
    }
  },
  ServiceUnavailableError: class ServiceUnavailableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ServiceUnavailableError';
    }
  },
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
  DatabaseError: class DatabaseError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'DatabaseError';
    }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(resource: string, identifier: string) {
      super(`${resource} with identifier '${identifier}' not found`);
      this.name = 'NotFoundError';
    }
  },
}));

describe('Security Routes', () => {
  let app: FastifyInstance;
  let mockScanner: any;
  let mockDockerMonitor: any;
  let mockOrchestrator: any;
  let mockDb: any;

  beforeEach(async () => {
    app = Fastify();

    // Create mock security scanner
    mockScanner = {
      scanAllContainers: jest.fn(),
      getLatestFindings: jest.fn(),
      generateSecurityReport: jest.fn(),
      markFindingFixed: jest.fn(),
    };

    // Create mock docker monitor
    mockDockerMonitor = {
      getContainers: jest.fn(),
    };

    // Create mock orchestrator
    mockOrchestrator = {
      getStatus: jest.fn(),
      getCloudflareClient: jest.fn(),
      getAuthentikClient: jest.fn(),
      getFail2banClient: jest.fn(),
    };

    // Create mock database
    mockDb = {
      prepare: jest.fn(),
    };

    // Decorate Fastify instance
    app.decorate('db', mockDb);

    // Register actual route modules
    scannerRoutes(app, {
      scanner: mockScanner,
      dockerMonitor: mockDockerMonitor,
    });

    orchestratorRoutes(app, {
      orchestrator: mockOrchestrator,
    });

    fail2banRoutes(app, {
      orchestrator: mockOrchestrator,
    });
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('Scanner Routes', () => {
    describe('POST /scan', () => {
      it('should run security scan successfully', async () => {
        const mockContainers = [
          { id: 'container1', name: 'nginx' },
          { id: 'container2', name: 'postgres' },
        ];

        const mockScanResult = {
          scanned: 2,
          vulnerabilities: 5,
          critical: 1,
          high: 2,
          medium: 2,
        };

        mockDockerMonitor.getContainers.mockResolvedValue(mockContainers);
        mockScanner.scanAllContainers.mockResolvedValue(mockScanResult);

        const response = await app.inject({
          method: 'POST',
          url: '/scan',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toEqual(mockScanResult);
        expect(mockScanner.scanAllContainers).toHaveBeenCalledWith(mockContainers);
      });

      it('should handle docker monitor not configured', async () => {
        // Create new app without docker monitor
        const appWithoutDocker = Fastify();
        scannerRoutes(appWithoutDocker, {
          scanner: mockScanner,
          dockerMonitor: null,
        });

        const response = await appWithoutDocker.inject({
          method: 'POST',
          url: '/scan',
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
        await appWithoutDocker.close();
      });
    });

    describe('GET /findings', () => {
      it('should return latest security findings', async () => {
        const mockFindings = [
          {
            container: 'nginx',
            type: 'CVE-2024-1234',
            severity: 'high',
            description: 'Security vulnerability in nginx',
          },
          {
            container: 'postgres',
            type: 'CVE-2024-5678',
            severity: 'medium',
            description: 'Security vulnerability in postgres',
          },
        ];

        mockScanner.getLatestFindings.mockReturnValue(mockFindings);

        const response = await app.inject({
          method: 'GET',
          url: '/findings',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toEqual(mockFindings);
      });

      it('should handle errors getting findings', async () => {
        mockScanner.getLatestFindings.mockImplementation(() => {
          throw new Error('Database error');
        });

        const response = await app.inject({
          method: 'GET',
          url: '/findings',
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
      });
    });

    describe('GET /report', () => {
      it('should generate security report', async () => {
        const mockReport = {
          totalVulnerabilities: 15,
          bySeverity: {
            critical: 2,
            high: 5,
            medium: 6,
            low: 2,
          },
          containers: [
            {
              name: 'nginx',
              vulnerabilities: 8,
            },
            {
              name: 'postgres',
              vulnerabilities: 7,
            },
          ],
          lastScan: '2024-01-15T12:00:00Z',
        };

        mockScanner.generateSecurityReport.mockReturnValue(mockReport);

        const response = await app.inject({
          method: 'GET',
          url: '/report',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toEqual(mockReport);
      });

      it('should handle errors generating report', async () => {
        mockScanner.generateSecurityReport.mockImplementation(() => {
          throw new Error('Report generation failed');
        });

        const response = await app.inject({
          method: 'GET',
          url: '/report',
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
      });
    });

    describe('POST /findings/fix', () => {
      it('should mark finding as fixed', async () => {
        mockScanner.markFindingFixed.mockReturnValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/findings/fix',
          payload: {
            container: 'nginx',
            type: 'CVE-2024-1234',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.message).toBe('Finding marked as fixed');
        expect(mockScanner.markFindingFixed).toHaveBeenCalledWith('nginx', 'CVE-2024-1234');
      });

      it('should handle errors marking finding as fixed', async () => {
        mockScanner.markFindingFixed.mockImplementation(() => {
          throw new Error('Update failed');
        });

        const response = await app.inject({
          method: 'POST',
          url: '/findings/fix',
          payload: {
            container: 'nginx',
            type: 'CVE-2024-1234',
          },
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
      });
    });
  });

  describe('Orchestrator Routes', () => {
    describe('GET /status', () => {
      it('should return comprehensive security status', async () => {
        const mockStatus = {
          scanner: {
            vulnerabilities: 15,
            lastScan: '2024-01-15T12:00:00Z',
          },
          fail2ban: {
            running: true,
            bannedIPs: 5,
          },
          cloudflare: {
            tunnelActive: true,
            connections: 10,
          },
          authentik: {
            healthy: true,
            users: 25,
          },
        };

        mockOrchestrator.getStatus.mockResolvedValue(mockStatus);

        const response = await app.inject({
          method: 'GET',
          url: '/status',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toEqual(mockStatus);
      });

      it('should handle orchestrator not configured', async () => {
        const appWithoutOrchestrator = Fastify();
        orchestratorRoutes(appWithoutOrchestrator, {
          orchestrator: undefined,
        });

        const response = await appWithoutOrchestrator.inject({
          method: 'GET',
          url: '/status',
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
        await appWithoutOrchestrator.close();
      });
    });

    describe('GET /tunnel/status', () => {
      it('should return Cloudflare Tunnel status', async () => {
        const mockMetrics = {
          tunnelActive: true,
          connections: 15,
          requests: 1250,
          uptime: 86400,
        };

        const mockClient = {
          getMetrics: jest.fn<() => Promise<any>>().mockResolvedValue(mockMetrics),
        };

        mockOrchestrator.getCloudflareClient.mockReturnValue(mockClient);

        const response = await app.inject({
          method: 'GET',
          url: '/tunnel/status',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toEqual(mockMetrics);
      });

      it('should handle Cloudflare Tunnel not configured', async () => {
        mockOrchestrator.getCloudflareClient.mockReturnValue(null);

        const response = await app.inject({
          method: 'GET',
          url: '/tunnel/status',
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
      });
    });

    describe('GET /auth/status', () => {
      it('should return Authentik status', async () => {
        const mockStatus = {
          healthy: true,
          version: '2024.1.0',
          users: 50,
          activeUsers: 25,
        };

        const mockClient = {
          getSystemStatus: jest.fn<() => Promise<any>>().mockResolvedValue(mockStatus),
        };

        mockOrchestrator.getAuthentikClient.mockReturnValue(mockClient);

        const response = await app.inject({
          method: 'GET',
          url: '/auth/status',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toEqual(mockStatus);
      });

      it('should handle Authentik not configured', async () => {
        mockOrchestrator.getAuthentikClient.mockReturnValue(null);

        const response = await app.inject({
          method: 'GET',
          url: '/auth/status',
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
      });
    });

    describe('GET /fail2ban/status', () => {
      it('should return Fail2ban status', async () => {
        const mockStatus = {
          version: 'Fail2Ban v1.0.2',
          jails: [
            {
              name: 'sshd',
              currentlyBanned: 3,
              totalBanned: 25,
            },
          ],
          totalBanned: 3,
        };

        const mockClient = {
          getStatus: jest.fn<() => Promise<any>>().mockResolvedValue(mockStatus),
        };

        mockOrchestrator.getFail2banClient.mockReturnValue(mockClient);

        const response = await app.inject({
          method: 'GET',
          url: '/fail2ban/status',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toEqual(mockStatus);
      });

      it('should handle Fail2ban not configured', async () => {
        mockOrchestrator.getFail2banClient.mockReturnValue(null);

        const response = await app.inject({
          method: 'GET',
          url: '/fail2ban/status',
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
      });
    });
  });

  describe('Fail2ban Action Routes', () => {
    describe('POST /fail2ban/ban', () => {
      it('should ban IP address successfully', async () => {
        const mockClient = {
          banIP: jest.fn<(ip: string, jail?: string) => Promise<boolean>>().mockResolvedValue(true),
        };

        mockOrchestrator.getFail2banClient.mockReturnValue(mockClient);

        const response = await app.inject({
          method: 'POST',
          url: '/fail2ban/ban',
          payload: {
            ip: '192.168.1.100',
            jail: 'sshd',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.banned).toBe(true);
        expect(body.message).toBe('IP 192.168.1.100 banned successfully');
        expect(mockClient.banIP).toHaveBeenCalledWith('192.168.1.100', 'sshd');
      });

      it('should handle missing IP address', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/fail2ban/ban',
          payload: {},
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(400);
      });

      it('should handle invalid IP address', async () => {
        const mockClient = {
          banIP: jest.fn<(ip: string, jail?: string) => Promise<boolean>>(),
        };

        mockOrchestrator.getFail2banClient.mockReturnValue(mockClient);

        const response = await app.inject({
          method: 'POST',
          url: '/fail2ban/ban',
          payload: {
            ip: 'invalid-ip',
          },
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(400);
        expect(mockClient.banIP).not.toHaveBeenCalled();
      });

      it('should handle Fail2ban not configured', async () => {
        mockOrchestrator.getFail2banClient.mockReturnValue(null);

        const response = await app.inject({
          method: 'POST',
          url: '/fail2ban/ban',
          payload: {
            ip: '192.168.1.100',
          },
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
      });

      it('should handle orchestrator not configured', async () => {
        const appWithoutOrchestrator = Fastify();
        fail2banRoutes(appWithoutOrchestrator, {
          orchestrator: undefined,
        });

        const response = await appWithoutOrchestrator.inject({
          method: 'POST',
          url: '/fail2ban/ban',
          payload: {
            ip: '192.168.1.100',
          },
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
        await appWithoutOrchestrator.close();
      });
    });

    describe('POST /fail2ban/unban', () => {
      it('should unban IP address successfully', async () => {
        const mockClient = {
          unbanIP: jest
            .fn<(ip: string, jail?: string) => Promise<boolean>>()
            .mockResolvedValue(true),
        };

        mockOrchestrator.getFail2banClient.mockReturnValue(mockClient);

        const response = await app.inject({
          method: 'POST',
          url: '/fail2ban/unban',
          payload: {
            ip: '192.168.1.100',
            jail: 'sshd',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.unbanned).toBe(true);
        expect(body.message).toBe('IP 192.168.1.100 unbanned successfully');
        expect(mockClient.unbanIP).toHaveBeenCalledWith('192.168.1.100', 'sshd');
      });

      it('should handle missing IP address', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/fail2ban/unban',
          payload: {},
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(400);
      });

      it('should handle invalid IP address', async () => {
        const mockClient = {
          unbanIP: jest.fn<(ip: string, jail?: string) => Promise<boolean>>(),
        };

        mockOrchestrator.getFail2banClient.mockReturnValue(mockClient);

        const response = await app.inject({
          method: 'POST',
          url: '/fail2ban/unban',
          payload: {
            ip: 'not-an-ip',
          },
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(400);
        expect(mockClient.unbanIP).not.toHaveBeenCalled();
      });
    });

    describe('GET /fail2ban/banned', () => {
      it('should return all banned IPs', async () => {
        const mockBannedIPs = ['192.168.1.100', '10.0.0.50', '172.16.0.20'];

        const mockClient = {
          getAllBannedIPs: jest.fn<() => Promise<string[]>>().mockResolvedValue(mockBannedIPs),
        };

        mockOrchestrator.getFail2banClient.mockReturnValue(mockClient);

        const response = await app.inject({
          method: 'GET',
          url: '/fail2ban/banned',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.ips).toEqual(mockBannedIPs);
        expect(body.data.count).toBe(3);
      });

      it('should return empty list when no IPs banned', async () => {
        const mockClient = {
          getAllBannedIPs: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
        };

        mockOrchestrator.getFail2banClient.mockReturnValue(mockClient);

        const response = await app.inject({
          method: 'GET',
          url: '/fail2ban/banned',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.ips).toEqual([]);
        expect(body.data.count).toBe(0);
      });
    });

    describe('GET /status/history', () => {
      it('should return security status history', async () => {
        const mockHistory = [
          {
            id: 1,
            timestamp: '2024-01-15T12:00:00Z',
            status: 'healthy',
            vulnerabilities: 5,
          },
          {
            id: 2,
            timestamp: '2024-01-15T11:00:00Z',
            status: 'degraded',
            vulnerabilities: 8,
          },
        ];

        const mockStmt = {
          all: jest.fn().mockReturnValue(mockHistory),
        };

        mockDb.prepare.mockReturnValue(mockStmt);

        const response = await app.inject({
          method: 'GET',
          url: '/status/history',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toEqual(mockHistory);
        expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('security_status_log'));
      });

      it('should handle database errors', async () => {
        mockDb.prepare.mockImplementation(() => {
          throw new Error('Database connection failed');
        });

        const response = await app.inject({
          method: 'GET',
          url: '/status/history',
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(500);
      });
    });
  });
});

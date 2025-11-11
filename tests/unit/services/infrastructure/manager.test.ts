/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type Database from 'better-sqlite3';
import type { PortainerClient } from '../../../../src/integrations/portainer/client.js';

// Mock the logger
jest.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock validation utilities
jest.mock('../../../../src/utils/validation.js', () => ({
  validateServiceName: jest.fn(() => ({ valid: true })),
  validateStackName: jest.fn(() => ({ valid: true })),
  validateEnvVars: jest.fn(() => ({ valid: true, errors: [] })),
  sanitizeDockerCompose: jest.fn(() => ({ valid: true })),
}));

describe.skip('InfrastructureManager', () => {
  let mockDb: any;
  let mockPortainer: any;
  let InfrastructureManager: typeof import('../../../../src/services/infrastructure/manager.js').InfrastructureManager;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock database
    mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      }),
    } as any;

    // Create mock Portainer client
    mockPortainer = {
      // @ts-expect-error - Mock return type
      getStacks: jest.fn().mockResolvedValue([]),
      // @ts-expect-error - Mock return type
      deployStack: jest.fn().mockResolvedValue({
        Id: 123,
        Name: 'test-stack',
        Type: 2,
        EndpointId: 1,
      }),
      // @ts-expect-error - Mock return type
      deleteStack: jest.fn().mockResolvedValue(undefined),
    };

    // Import the class after mocks are set up
    const module = await import('../../../../src/services/infrastructure/manager.js');
    InfrastructureManager = module.InfrastructureManager;
  });

  describe('Service Discovery', () => {
    it('should initialize with predefined services', () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const cloudflareService = manager.getService('cloudflare-tunnel');
      expect(cloudflareService).toBeDefined();
      expect(cloudflareService?.name).toBe('Cloudflare Tunnel');
      expect(cloudflareService?.type).toBe('security');
    });

    it('should get services by type', () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const securityServices = manager.getServicesByType('security');
      expect(securityServices.length).toBeGreaterThan(0);
      expect(securityServices.every((s) => s.type === 'security')).toBe(true);
    });

    it('should return undefined for unknown service', () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const service = manager.getService('unknown-service');
      expect(service).toBeUndefined();
    });
  });

  describe('Infrastructure Analysis', () => {
    it('should analyze infrastructure and categorize services', async () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const analysis = await manager.analyzeInfrastructure();

      expect(analysis).toHaveProperty('deployed');
      expect(analysis).toHaveProperty('recommended');
      expect(analysis).toHaveProperty('missing');
      expect(Array.isArray(analysis.deployed)).toBe(true);
      expect(Array.isArray(analysis.recommended)).toBe(true);
      expect(Array.isArray(analysis.missing)).toBe(true);
    });

    it('should mark services as deployed when found in Portainer', async () => {
      // @ts-expect-error - Mock return type
      mockPortainer.getStacks = jest.fn().mockResolvedValue([
        { Name: 'cloudflare-tunnel' },
        { Name: 'authentik' },
      ]);

      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const analysis = await manager.analyzeInfrastructure();

      expect(analysis.deployed.length).toBeGreaterThan(0);
      expect(analysis.deployed.some((s) => s.name === 'Cloudflare Tunnel')).toBe(true);
    });

    it('should handle Portainer unavailability gracefully', async () => {
      // @ts-expect-error - Mock return type
      mockPortainer.getStacks = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const analysis = await manager.analyzeInfrastructure();

      // Should not throw, just return empty deployed list
      expect(analysis.deployed.length).toBe(0);
    });
  });

  describe('Deployment Validation', () => {
    it('should validate deployment readiness with all requirements', () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const validation = manager.validateDeployment('cloudflare-tunnel', {
        CLOUDFLARE_TUNNEL_TOKEN: 'test-token',
      });

      expect(validation.ready).toBe(true);
      expect(validation.missing.length).toBe(0);
    });

    it('should detect missing environment variables', () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const validation = manager.validateDeployment('cloudflare-tunnel', {});

      expect(validation.ready).toBe(false);
      expect(validation.missing.length).toBeGreaterThan(0);
      expect(validation.missing[0]).toContain('CLOUDFLARE_TUNNEL_TOKEN');
    });

    it('should warn about missing dependencies', () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const validation = manager.validateDeployment('grafana', {
        GRAFANA_ADMIN_PASSWORD: 'password',
      });

      expect(validation.warnings.some((w) => w.includes('prometheus'))).toBe(true);
    });

    it('should return not ready for unknown service', () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const validation = manager.validateDeployment('unknown-service');

      expect(validation.ready).toBe(false);
      expect(validation.missing[0]).toContain('not found');
    });
  });

  describe('Docker Compose Generation', () => {
    it('should reject unknown service', async () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      await expect(manager.generateDockerCompose('unknown-service')).rejects.toThrow(
        'Unknown service',
      );
    });

    it('should reject service without docker-compose template', async () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      // Create a service without dockerCompose property (though all current services have it)
      // This tests the error handling path
      const services = (manager as any).services;
      services.set('test-service', {
        name: 'Test Service',
        type: 'monitoring',
        status: 'not_deployed',
        description: 'Test',
      });

      await expect(manager.generateDockerCompose('test-service')).rejects.toThrow(
        'No docker-compose template',
      );
    });
  });

  describe('Service Removal', () => {
    it('should return error when Portainer is not configured', async () => {
      const manager = new InfrastructureManager(mockDb);

      const result = await manager.removeService('cloudflare-tunnel');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Portainer');
    });

    it('should return error for unknown service', async () => {
      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const result = await manager.removeService('unknown-service');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown service');
    });

    it('should handle service not found in Portainer', async () => {
      // @ts-expect-error - Mock return type
      mockPortainer.getStacks = jest.fn().mockResolvedValue([]);

      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const result = await manager.removeService('cloudflare-tunnel');

      // Should succeed even if stack not found (idempotent)
      expect(result.success).toBe(true);
    });

    it('should handle Portainer errors gracefully', async () => {
      // @ts-expect-error - Mock return type
      mockPortainer.getStacks = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const result = await manager.removeService('cloudflare-tunnel');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Deployment History', () => {
    it('should retrieve deployment history for specific service', () => {
      const mockHistory = [
        { service_name: 'cloudflare-tunnel', deployed_at: '2024-01-01' },
      ];

      mockDb.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue(mockHistory),
      });

      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const history = manager.getDeploymentHistory('cloudflare-tunnel');

      expect(history).toEqual(mockHistory);
    });

    it('should retrieve all deployment history when no service specified', () => {
      const mockHistory = [
        { service_name: 'cloudflare-tunnel', deployed_at: '2024-01-01' },
        { service_name: 'authentik', deployed_at: '2024-01-02' },
      ];

      mockDb.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue(mockHistory),
      });

      const manager = new InfrastructureManager(
        mockDb,
        mockPortainer,
      );

      const history = manager.getDeploymentHistory();

      expect(history).toEqual(mockHistory);
    });
  });
});

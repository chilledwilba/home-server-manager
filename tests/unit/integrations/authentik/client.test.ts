import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the logger
jest.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('AuthentikClient', () => {
  let AuthentikClient: typeof import('../../../../src/integrations/authentik/client.js').AuthentikClient;
  let client: InstanceType<typeof import('../../../../src/integrations/authentik/client.js').AuthentikClient>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Import the class after mocks are set up
    const module = await import('../../../../src/integrations/authentik/client.js');
    AuthentikClient = module.AuthentikClient;

    client = new AuthentikClient({
      url: 'https://auth.example.com',
      token: 'test-token',
    });
  });

  describe('Constructor', () => {
    it('should initialize with correct base URL', () => {
      expect((client as any).baseUrl).toBe('https://auth.example.com/api/v3');
    });

    it('should store configuration', () => {
      expect((client as any).config.url).toBe('https://auth.example.com');
      expect((client as any).config.token).toBe('test-token');
    });
  });

  describe('Token Verification', () => {
    it('should verify valid token and return user', async () => {
      const mockUser = {
        pk: 1,
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        is_active: true,
        is_superuser: false,
        groups: ['homeserver-viewers'],
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser,
      } as Response);

      const user = await client.verifyToken('valid-token');

      expect(user).toEqual(mockUser);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/core/users/me/'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-token',
          }),
        }),
      );
    });

    it('should return null for invalid token', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response);

      const user = await client.verifyToken('invalid-token');

      expect(user).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const user = await client.verifyToken('token');

      expect(user).toBeNull();
    });
  });

  describe('User Management', () => {
    it('should get all users', async () => {
      const mockUsers = [
        {
          pk: 1,
          username: 'user1',
          name: 'User 1',
          email: 'user1@example.com',
          is_active: true,
          is_superuser: false,
          groups: [],
        },
        {
          pk: 2,
          username: 'user2',
          name: 'User 2',
          email: 'user2@example.com',
          is_active: true,
          is_superuser: false,
          groups: [],
        },
      ];

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: mockUsers }),
      } as Response);

      const users = await client.getUsers();

      expect(users).toEqual(mockUsers);
      expect(users.length).toBe(2);
    });

    it('should return empty array on error', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('API error'),
      );

      const users = await client.getUsers();

      expect(users).toEqual([]);
    });

    it('should get user by ID', async () => {
      const mockUser = {
        pk: 1,
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        is_active: true,
        is_superuser: false,
        groups: [],
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser,
      } as Response);

      const user = await client.getUser(1);

      expect(user).toEqual(mockUser);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/core/users/1/'),
        expect.any(Object),
      );
    });

    it('should return null when user not found', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      } as Response);

      const user = await client.getUser(999);

      expect(user).toBeNull();
    });

    it('should get user groups', async () => {
      const mockGroups = [{ name: 'admins' }, { name: 'users' }];

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: mockGroups }),
      } as Response);

      const groups = await client.getUserGroups(1);

      expect(groups).toEqual(['admins', 'users']);
    });
  });

  describe('Application Management', () => {
    it('should get all applications', async () => {
      const mockApps = [
        {
          pk: 'app1',
          name: 'App 1',
          slug: 'app-1',
          provider: 1,
          launch_url: 'https://app1.example.com',
        },
        {
          pk: 'app2',
          name: 'App 2',
          slug: 'app-2',
          provider: 2,
        },
      ];

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: mockApps }),
      } as Response);

      const applications = await client.getApplications();

      expect(applications).toEqual(mockApps);
      expect(applications.length).toBe(2);
    });

    it('should return empty array on error', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('API error'),
      );

      const applications = await client.getApplications();

      expect(applications).toEqual([]);
    });
  });

  describe('Session Management', () => {
    it('should get active sessions', async () => {
      const mockSessions = [
        {
          pk: 'session1',
          user: 1,
          expires: '2024-12-31T23:59:59Z',
          last_ip: '192.168.1.100',
        },
      ];

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: mockSessions }),
      } as Response);

      const sessions = await client.getActiveSessions();

      expect(sessions).toEqual(mockSessions);
    });
  });

  describe('System Status', () => {
    it('should get system status with all metrics', async () => {
      const mockUsers = [{ pk: 1 }, { pk: 2 }];
      const mockApps = [{ pk: 'app1' }];
      const mockSessions = [{ pk: 'session1' }];

      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: mockUsers }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: mockApps }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: mockSessions }),
        } as Response);

      const status = await client.getSystemStatus();

      expect(status.healthy).toBe(true);
      expect(status.users_count).toBe(2);
      expect(status.applications_count).toBe(1);
      expect(status.active_sessions).toBe(1);
      expect(status.version).toBeDefined();
    });

    it('should return healthy with zero counts when API calls fail gracefully', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockRejectedValueOnce(new Error('API error'))
        .mockRejectedValueOnce(new Error('API error'))
        .mockRejectedValueOnce(new Error('API error'));

      const status = await client.getSystemStatus();

      // Individual methods catch errors and return empty arrays, so system appears healthy
      expect(status.healthy).toBe(true);
      expect(status.users_count).toBe(0);
      expect(status.applications_count).toBe(0);
      expect(status.active_sessions).toBe(0);
    });
  });

  describe('Permission Checking', () => {
    it('should grant all permissions to superusers', () => {
      const superuser = {
        pk: 1,
        username: 'admin',
        name: 'Admin',
        email: 'admin@example.com',
        is_active: true,
        is_superuser: true,
        groups: [],
      };

      expect(client.hasPermission(superuser, 'admin')).toBe(true);
      expect(client.hasPermission(superuser, 'write')).toBe(true);
      expect(client.hasPermission(superuser, 'read')).toBe(true);
    });

    it('should check admin permissions based on groups', () => {
      const adminUser = {
        pk: 2,
        username: 'groupadmin',
        name: 'Group Admin',
        email: 'groupadmin@example.com',
        is_active: true,
        is_superuser: false,
        groups: ['homeserver-admins'],
      };

      expect(client.hasPermission(adminUser, 'admin')).toBe(true);
      expect(client.hasPermission(adminUser, 'write')).toBe(true);
      expect(client.hasPermission(adminUser, 'read')).toBe(true);
    });

    it('should check write permissions based on groups', () => {
      const operator = {
        pk: 3,
        username: 'operator',
        name: 'Operator',
        email: 'operator@example.com',
        is_active: true,
        is_superuser: false,
        groups: ['homeserver-operators'],
      };

      expect(client.hasPermission(operator, 'admin')).toBe(false);
      expect(client.hasPermission(operator, 'write')).toBe(true);
      expect(client.hasPermission(operator, 'read')).toBe(true);
    });

    it('should check read permissions based on groups', () => {
      const viewer = {
        pk: 4,
        username: 'viewer',
        name: 'Viewer',
        email: 'viewer@example.com',
        is_active: true,
        is_superuser: false,
        groups: ['homeserver-viewers'],
      };

      expect(client.hasPermission(viewer, 'admin')).toBe(false);
      expect(client.hasPermission(viewer, 'write')).toBe(false);
      expect(client.hasPermission(viewer, 'read')).toBe(true);
    });

    it('should deny all permissions to users without appropriate groups', () => {
      const noGroups = {
        pk: 5,
        username: 'nogroups',
        name: 'No Groups',
        email: 'nogroups@example.com',
        is_active: true,
        is_superuser: false,
        groups: [],
      };

      expect(client.hasPermission(noGroups, 'admin')).toBe(false);
      expect(client.hasPermission(noGroups, 'write')).toBe(false);
      expect(client.hasPermission(noGroups, 'read')).toBe(false);
    });
  });
});

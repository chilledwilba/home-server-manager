import { logger } from '../../utils/logger.js';

// Global types for fetch API
type RequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

interface AuthentikUser {
  pk: number;
  username: string;
  name: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  groups: string[];
  last_login?: string;
}

interface AuthentikApplication {
  pk: string;
  name: string;
  slug: string;
  provider: number;
  launch_url?: string;
}

interface AuthentikSession {
  pk: string;
  user: number;
  expires?: string;
  last_ip?: string;
  last_user_agent?: string;
}

interface AuthentikConfig {
  url: string;
  token: string;
}

/**
 * Authentik SSO API Client
 * Manages authentication and user access via Authentik
 */
export class AuthentikClient {
  private baseUrl: string;

  constructor(private config: AuthentikConfig) {
    this.baseUrl = `${config.url}/api/v3`;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
    };

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(`Authentik API error: ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      logger.error({ err: error }, `Authentik API request failed: ${endpoint}`);
      throw error;
    }
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<AuthentikUser | null> {
    try {
      const user = await this.request<AuthentikUser>('/core/users/me/', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return user;
    } catch (error) {
      logger.error({ err: error }, 'Token verification failed');
      return null;
    }
  }

  /**
   * Get all users
   */
  async getUsers(): Promise<AuthentikUser[]> {
    try {
      const response = await this.request<{ results: AuthentikUser[] }>('/core/users/');
      return response.results;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get users');
      return [];
    }
  }

  /**
   * Get user by ID
   */
  async getUser(userId: number): Promise<AuthentikUser | null> {
    try {
      return await this.request<AuthentikUser>(`/core/users/${userId}/`);
    } catch (error) {
      logger.error({ err: error }, `Failed to get user ${userId}`);
      return null;
    }
  }

  /**
   * Get user groups
   */
  async getUserGroups(userId: number): Promise<string[]> {
    try {
      const response = await this.request<{ results: Array<{ name: string }> }>(
        `/core/users/${userId}/groups/`,
      );
      return response.results.map((g) => g.name);
    } catch (error) {
      logger.error({ err: error }, `Failed to get groups for user ${userId}`);
      return [];
    }
  }

  /**
   * Get all applications
   */
  async getApplications(): Promise<AuthentikApplication[]> {
    try {
      const response = await this.request<{ results: AuthentikApplication[] }>(
        '/core/applications/',
      );
      return response.results;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get applications');
      return [];
    }
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(): Promise<AuthentikSession[]> {
    try {
      const response = await this.request<{ results: AuthentikSession[] }>(
        '/core/sessions/',
      );
      return response.results;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get active sessions');
      return [];
    }
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<{
    healthy: boolean;
    version: string;
    users_count: number;
    applications_count: number;
    active_sessions: number;
  }> {
    try {
      const [users, applications, sessions] = await Promise.all([
        this.getUsers(),
        this.getApplications(),
        this.getActiveSessions(),
      ]);

      return {
        healthy: true,
        version: '2024.1', // Would need to fetch from /version endpoint
        users_count: users.length,
        applications_count: applications.length,
        active_sessions: sessions.length,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get Authentik system status');
      return {
        healthy: false,
        version: 'unknown',
        users_count: 0,
        applications_count: 0,
        active_sessions: 0,
      };
    }
  }

  /**
   * Check if user has permission
   */
  hasPermission(user: AuthentikUser, permission: 'admin' | 'write' | 'read'): boolean {
    // Superusers have all permissions
    if (user.is_superuser) return true;

    // Map groups to permissions
    const adminGroups = ['administrators', 'homeserver-admins'];
    const writeGroups = [...adminGroups, 'homeserver-operators'];
    const readGroups = [...writeGroups, 'homeserver-viewers'];

    const userGroups = user.groups || [];

    switch (permission) {
      case 'admin':
        return userGroups.some((g) => adminGroups.includes(g));
      case 'write':
        return userGroups.some((g) => writeGroups.includes(g));
      case 'read':
        return userGroups.some((g) => readGroups.includes(g));
      default:
        return false;
    }
  }
}

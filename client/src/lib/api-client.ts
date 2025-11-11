import { QueryClient } from '@tanstack/react-query';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3100';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 30000, // 30 seconds
      staleTime: 10000, // 10 seconds
      retry: 3,
    },
  },
});

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('auth_token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // Health check
  async getHealth() {
    return this.request<{ status: string; uptime: number; timestamp: string }>('/health');
  }

  // System metrics
  async getMetrics() {
    return this.request<{ success: boolean; data: unknown }>('/api/v1/metrics');
  }

  // Pool operations
  async getPools() {
    return this.request<{ success: boolean; pools: unknown[] }>('/api/v1/pools');
  }

  async getPoolStatus(poolName: string) {
    return this.request<{ success: boolean; pool: unknown }>(`/api/v1/pools/${poolName}`);
  }

  // Container operations
  async getContainers() {
    return this.request<{ success: boolean; containers: unknown[] }>('/api/v1/containers');
  }

  async restartContainer(containerId: string) {
    return this.request<{ success: boolean }>(`/api/v1/containers/${containerId}/restart`, {
      method: 'POST',
    });
  }

  async stopContainer(containerId: string) {
    return this.request<{ success: boolean }>(`/api/v1/containers/${containerId}/stop`, {
      method: 'POST',
    });
  }

  async startContainer(containerId: string) {
    return this.request<{ success: boolean }>(`/api/v1/containers/${containerId}/start`, {
      method: 'POST',
    });
  }

  // Alert operations
  async getAlerts(params?: { severity?: string; resolved?: boolean; limit?: number }) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request<{ success: boolean; alerts: unknown[] }>(
      `/api/v1/alerts${query ? `?${query}` : ''}`,
    );
  }

  async acknowledgeAlert(alertId: string, userId: string) {
    return this.request<{ success: boolean }>(`/api/v1/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async resolveAlert(alertId: string, userId: string, resolution: string) {
    return this.request<{ success: boolean }>(`/api/v1/alerts/${alertId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ userId, resolution }),
    });
  }

  // Security operations
  async getSecurityStatus() {
    return this.request<{ success: boolean; data: unknown }>('/api/v1/security/status');
  }

  async getBannedIPs() {
    return this.request<{ success: boolean; banned_ips: unknown[] }>('/api/v1/security/banned-ips');
  }

  async unbanIP(ip: string) {
    return this.request<{ success: boolean }>(`/api/v1/security/banned-ips/${ip}`, {
      method: 'DELETE',
    });
  }

  // Remediation operations
  async getPendingPlans() {
    return this.request<{ success: boolean; plans: unknown[] }>(
      '/api/v1/remediation/plans/pending',
    );
  }

  async approvePlan(planId: string, userId: string) {
    return this.request<{ success: boolean }>(`/api/v1/remediation/plans/${planId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async rejectPlan(planId: string, userId: string, reason: string) {
    return this.request<{ success: boolean }>(`/api/v1/remediation/plans/${planId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ userId, reason }),
    });
  }

  // Arr operations
  async getArrOptimizations(app: string) {
    return this.request<{ success: boolean; app: string; suggestions: string[] }>(
      `/api/arr/optimize/suggestions/${app}`,
    );
  }

  async getArrPerformance(app: string) {
    return this.request<{ success: boolean; app: string; metrics: unknown[] }>(
      `/api/arr/performance/${app}`,
    );
  }

  async getArrFailedDownloads(app?: string, limit?: number) {
    const params = new URLSearchParams();
    if (app) params.set('app', app);
    if (limit) params.set('limit', limit.toString());
    return this.request<{ success: boolean; failures: unknown[] }>(
      `/api/arr/failed?${params.toString()}`,
    );
  }

  async getArrDiskUsage() {
    return this.request<{ success: boolean; usage: unknown[] }>('/api/arr/disk-usage');
  }

  async getArrQueueAnalysis() {
    return this.request<{ success: boolean; analysis: unknown[] }>('/api/arr/queue/analysis');
  }

  async getArrQueueStats(app: string, limit?: number) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    return this.request<{ success: boolean; app: string; stats: unknown[] }>(
      `/api/arr/queue/${app}?${params.toString()}`,
    );
  }

  async getArrHealth(app: string, limit?: number) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    return this.request<{ success: boolean; app: string; health: unknown[] }>(
      `/api/arr/health/${app}?${params.toString()}`,
    );
  }

  // Settings
  async getSettings() {
    return this.request<{ success: boolean; settings: unknown }>('/api/v1/settings');
  }

  async updateSettings(settings: unknown) {
    return this.request<{ success: boolean }>('/api/v1/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }
}

export const apiClient = new ApiClient();

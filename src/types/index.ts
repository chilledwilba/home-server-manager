/**
 * Core type definitions for Home Server Monitor
 */

import type { z } from 'zod';

// Re-export zod for convenience
export { z };

/**
 * System Information Types
 */
export interface SystemInfo {
  hostname: string;
  version: string;
  uptime: string;
  cpuModel: string;
  cpuCores: number;
  ramTotal: number;
  bootTime: Date;
}

export interface SystemStats {
  cpu: {
    usage: number;
    temperature: number;
    perCore: number[];
  };
  memory: {
    used: number;
    available: number;
    arc: number; // ZFS ARC cache
    percentage: number;
  };
  network: {
    rxRate: number;
    txRate: number;
  };
  loadAverage: [number, number, number];
}

/**
 * Storage Types
 */
export interface PoolInfo {
  name: string;
  type: 'personal' | 'media' | 'apps' | 'boot' | 'unknown';
  status: 'ONLINE' | 'DEGRADED' | 'FAULTED';
  health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  capacity: {
    used: number;
    available: number;
    total: number;
    percent: number;
  };
  topology: unknown; // Will be refined based on actual API
  lastScrub: Date | null;
  scrubErrors: number;
  encryption: boolean;
  autotrim: boolean;
}

export interface DiskInfo {
  identifier: string;
  name: string;
  model: string;
  serial: string;
  size: number;
  type: 'HDD' | 'SSD' | 'NVMe';
  temperature: number;
  smartStatus: string;
  isNVMe: boolean;
  isIronWolf: boolean;
  isCritical: boolean;
}

export interface SmartData {
  diskName: string;
  temperature: number;
  powerOnHours: number;
  reallocatedSectors: number;
  pendingSectors: number;
  healthStatus: 'PASSED' | 'FAILED';
  loadCycleCount?: number;
  spinRetryCount?: number;
}

/**
 * Container Types
 */
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'stopped' | 'restarting' | 'paused';
  status: string;
  created: Date;
  ports: Array<{
    private: number;
    public?: number;
    type: string;
  }>;
  labels: Record<string, string>;
  isArrApp: boolean;
  isPlex: boolean;
  isCritical: boolean;
}

export interface ContainerStats {
  cpu: {
    percentage: number;
    cores: number;
  };
  memory: {
    used: number;
    limit: number;
    percentage: number;
  };
  network: {
    rx: number;
    tx: number;
  };
  io: {
    read: number;
    write: number;
  };
}

/**
 * Alert Types
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: number;
  type: string;
  severity: AlertSeverity;
  message: string;
  details?: unknown;
  triggeredAt: Date;
  acknowledged: boolean;
  resolved: boolean;
  actionable?: boolean;
  suggestedAction?: string;
}

/**
 * Security Types
 */
export interface SecurityFinding {
  container: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  recommendation: string;
  cve?: string;
  fixed: boolean;
  foundAt?: Date;
  fixedAt?: Date;
}

/**
 * Configuration Types
 */
export interface Config {
  server: {
    port: number;
    host: string;
  };
  truenas: {
    host: string;
    apiKey: string;
    timeout: number;
  };
  portainer?: {
    host: string;
    port: number;
    token: string;
    endpointId: number;
  };
  database: {
    path: string;
  };
  monitoring: {
    enabled: boolean;
    intervals: {
      system: number;
      docker: number;
      storage: number;
      smart: number;
    };
  };
  security: {
    apiToken?: string;
    enableWrite: boolean;
    requireConfirmation: boolean;
  };
}

/**
 * API Response Types
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T = unknown> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * MCP Types
 */
export interface MCPAction {
  id: string;
  type: string;
  input: unknown;
  timestamp: Date;
  confirmed: boolean;
}

/**
 * Type Guards
 */
export function isContainerRunning(container: ContainerInfo): boolean {
  return container.state === 'running';
}

export function isCriticalAlert(alert: Alert): boolean {
  return alert.severity === 'critical' && !alert.resolved;
}

export function isHealthyPool(pool: PoolInfo): boolean {
  return pool.status === 'ONLINE' && pool.health === 'HEALTHY';
}

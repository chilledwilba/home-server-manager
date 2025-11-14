import type { TrueNASClient } from '../integrations/truenas/client.js';
import type { PortainerClient } from '../integrations/portainer/client.js';
import type { InfrastructureManager } from '../services/infrastructure/manager.js';
import type Database from 'better-sqlite3';

export interface MCPConfig {
  truenas?: TrueNASClient;
  portainer?: PortainerClient;
  infrastructure: InfrastructureManager;
  db: Database.Database;
  requireConfirmation: boolean;
}

export interface PendingAction {
  type: string;
  input: Record<string, unknown>;
  timestamp: Date;
}

export interface ToolResponse {
  content: Array<{ type: string; text: string }>;
}

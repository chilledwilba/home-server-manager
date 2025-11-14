import type Database from 'better-sqlite3';

export interface AIInsightsRouteOptions {
  db: Database.Database;
  ollamaEnabled?: boolean;
  ollamaConfig?: {
    host: string;
    port: number;
    model: string;
  };
}

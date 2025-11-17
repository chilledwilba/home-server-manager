import type { Database } from 'better-sqlite3';
import { logger } from '@/utils/logger.js';

export interface Settings {
  refreshInterval: number;
  alertNotifications: {
    critical: boolean;
    warning: boolean;
    info: boolean;
  };
  truenasUrl: string;
  truenasApiKey: string;
}

export class SettingsService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    const defaults: Settings = {
      refreshInterval: 30,
      alertNotifications: {
        critical: true,
        warning: true,
        info: false,
      },
      truenasUrl: process.env['TRUENAS_HOST'] || '',
      truenasApiKey: process.env['TRUENAS_API_KEY'] || '',
    };

    for (const [key, value] of Object.entries(defaults)) {
      this.setIfNotExists(key, value);
    }
  }

  private setIfNotExists(key: string, value: unknown): void {
    const existing = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key);

    if (!existing) {
      this.set(key, value);
    }
  }

  get(key: string): unknown {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  getAll(): Settings {
    const rows = this.db
      .prepare('SELECT key, value FROM settings')
      .all() as Array<{ key: string; value: string }>;

    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    // Build the settings object with defaults
    return {
      refreshInterval: (settings['refreshInterval'] as number) || 30,
      alertNotifications: (settings['alertNotifications'] as Settings['alertNotifications']) || {
        critical: true,
        warning: true,
        info: false,
      },
      truenasUrl: (settings['truenasUrl'] as string) || '',
      truenasApiKey: (settings['truenasApiKey'] as string) || '',
    };
  }

  set(key: string, value: unknown): void {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    this.db
      .prepare(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      )
      .run(key, serialized, Date.now());

    logger.info({ key, value }, 'Setting updated');
  }

  setMultiple(settings: Partial<Settings>): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    );

    const transaction = this.db.transaction((entries: Array<[string, unknown]>) => {
      for (const [key, value] of entries) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        stmt.run(key, serialized, Date.now());
      }
    });

    transaction(Object.entries(settings));
    logger.info({ settings }, 'Multiple settings updated');
  }
}

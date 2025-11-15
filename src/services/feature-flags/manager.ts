/**
 * Feature Flag Manager
 * Provides runtime feature toggling with hot-reload support
 */

import { readFileSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description: string;
  environments?: string[]; // ['development', 'production']
  users?: string[]; // For user-specific targeting (future)
  percentage?: number; // For gradual rollouts (0-100)
}

export interface FeatureFlagsConfig {
  flags: Record<string, Omit<FeatureFlag, 'name'>>;
}

export class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();
  private configPath: string;
  private watching = false;

  constructor(configPath = 'config/feature-flags.json') {
    this.configPath = join(process.cwd(), configPath);
    this.loadFlags();
    this.watchConfig();
  }

  /**
   * Load flags from configuration file
   */
  private loadFlags(): void {
    try {
      const config = JSON.parse(readFileSync(this.configPath, 'utf-8')) as FeatureFlagsConfig;

      this.flags.clear();
      for (const [name, flag] of Object.entries(config.flags)) {
        this.flags.set(name, { name, ...flag });
      }

      logger.info({ count: this.flags.size }, 'Feature flags loaded');
    } catch (error) {
      logger.error({ err: error }, 'Failed to load feature flags');
      // Use defaults if config fails
      this.loadDefaults();
    }
  }

  /**
   * Watch config file for changes and hot-reload
   */
  private watchConfig(): void {
    if (this.watching) return;

    watchFile(this.configPath, { interval: 5000 }, () => {
      logger.info('Feature flags config changed, reloading...');
      this.loadFlags();
    });

    this.watching = true;
  }

  /**
   * Check if a feature is enabled
   */
  isEnabled(flagName: string, context?: { userId?: string; environment?: string }): boolean {
    const flag = this.flags.get(flagName);
    if (!flag) {
      logger.warn({ flagName }, 'Unknown feature flag, defaulting to false');
      return false;
    }

    // Check environment override from ENV vars
    const envOverride = process.env[`FEATURE_${flagName.toUpperCase()}`];
    if (envOverride !== undefined) {
      return envOverride === 'true' || envOverride === '1';
    }

    // Check environment targeting
    if (flag.environments && context?.environment) {
      if (!flag.environments.includes(context.environment)) {
        return false;
      }
    }

    // Check user targeting
    if (flag.users && context?.userId) {
      if (!flag.users.includes(context.userId)) {
        return false;
      }
    }

    // Check percentage rollout
    if (flag.percentage !== undefined && context?.userId) {
      const hash = this.hashString(context.userId);
      const userPercentage = hash % 100;
      return userPercentage < flag.percentage;
    }

    return flag.enabled;
  }

  /**
   * Get all flags and their status
   */
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * Get specific flag details
   */
  getFlag(name: string): FeatureFlag | undefined {
    return this.flags.get(name);
  }

  /**
   * Simple hash function for percentage rollouts
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Load default flags if config fails
   */
  private loadDefaults(): void {
    const defaults: FeatureFlag[] = [
      {
        name: 'ai_insights_enabled',
        enabled: true,
        description: 'Enable AI-powered insights and analysis',
      },
      {
        name: 'auto_remediation_enabled',
        enabled: false,
        description: 'Enable automatic problem remediation',
      },
    ];

    for (const flag of defaults) {
      this.flags.set(flag.name, flag);
    }
  }

  /**
   * Stop watching config file
   */
  destroy(): void {
    if (this.watching) {
      unwatchFile(this.configPath);
      this.watching = false;
    }
  }
}

// Singleton instance
let instance: FeatureFlagManager | null = null;

export function getFeatureFlagManager(): FeatureFlagManager {
  if (!instance) {
    instance = new FeatureFlagManager();
  }
  return instance;
}

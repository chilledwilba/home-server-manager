# Priority 5: Feature Flags System 🚩

**Status**: 🔴 Not Started
**Estimated Time**: 2-3 hours
**Why**: Safe feature rollouts, A/B testing, instant rollback without deployment
**Impact**: MEDIUM - Enables safer feature development

---

## Task Checklist

### Step 1: Create Feature Flag Manager

#### Create `src/services/feature-flags/manager.ts`
- [ ] Implement feature flag manager:
  ```typescript
  import { readFileSync, watchFile } from 'fs';
  import { join } from 'path';
  import { logger } from '@/utils/logger.js';

  export interface FeatureFlag {
    name: string;
    enabled: boolean;
    description: string;
    environments?: string[];  // ['development', 'production']
    users?: string[];         // For user-specific targeting (future)
    percentage?: number;      // For gradual rollouts (0-100)
  }

  export interface FeatureFlagsConfig {
    flags: Record<string, FeatureFlag>;
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
        const config = JSON.parse(
          readFileSync(this.configPath, 'utf-8')
        ) as FeatureFlagsConfig;

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
    isEnabled(
      flagName: string,
      context?: { userId?: string; environment?: string }
    ): boolean {
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
        // Note: unwatchFile not available in all environments
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
  ```

### Step 2: Create Feature Flag Configuration

#### Create `config/feature-flags.json`
- [ ] Define initial feature flags:
  ```json
  {
    "flags": {
      "ai_insights_enabled": {
        "enabled": true,
        "description": "Enable AI-powered insights and analysis",
        "environments": ["development", "production"]
      },
      "auto_remediation_enabled": {
        "enabled": false,
        "description": "Enable automatic problem remediation (requires human confirmation)",
        "environments": ["development"]
      },
      "new_dashboard_ui": {
        "enabled": false,
        "description": "Enable new React dashboard UI",
        "percentage": 0
      },
      "experimental_features": {
        "enabled": false,
        "description": "Enable experimental features",
        "environments": ["development"]
      },
      "performance_monitoring": {
        "enabled": true,
        "description": "Enable detailed performance monitoring",
        "environments": ["development", "production"]
      },
      "enhanced_logging": {
        "enabled": true,
        "description": "Enable enhanced debug logging",
        "environments": ["development"]
      },
      "security_scanning": {
        "enabled": true,
        "description": "Enable security vulnerability scanning",
        "environments": ["development", "production"]
      },
      "mcp_server": {
        "enabled": true,
        "description": "Enable MCP server for Claude integration",
        "environments": ["development", "production"]
      }
    }
  }
  ```

### Step 3: Create Feature Flag Middleware

#### Create `src/middleware/feature-flag.ts`
- [ ] Implement Fastify middleware:
  ```typescript
  import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
  import { getFeatureFlagManager } from '../services/feature-flags/manager.js';

  /**
   * Middleware to check feature flags before route execution
   */
  export function requireFeatureFlag(flagName: string) {
    return function featureFlagMiddleware(
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction
    ): void {
      const manager = getFeatureFlagManager();
      const isEnabled = manager.isEnabled(flagName, {
        environment: process.env.NODE_ENV,
      });

      if (!isEnabled) {
        reply.status(404).send({
          error: {
            code: 'FEATURE_NOT_AVAILABLE',
            message: `Feature '${flagName}' is not available`,
          },
        });
        return;
      }

      done();
    };
  }

  /**
   * Decorator to add feature flag check to Fastify instance
   */
  export function addFeatureFlagSupport(app: FastifyInstance): void {
    app.decorate('checkFeature', (flagName: string, context?: any) => {
      const manager = getFeatureFlagManager();
      return manager.isEnabled(flagName, context);
    });
  }

  // Augment Fastify types
  declare module 'fastify' {
    interface FastifyInstance {
      checkFeature(flagName: string, context?: any): boolean;
    }
  }
  ```

### Step 4: Create Feature Flag API Routes

#### Create `src/routes/feature-flags.ts`
- [ ] Add admin routes for feature flag management:
  ```typescript
  import type { FastifyInstance } from 'fastify';
  import { getFeatureFlagManager } from '../services/feature-flags/manager.js';

  export async function featureFlagRoutes(app: FastifyInstance): Promise<void> {
    const manager = getFeatureFlagManager();

    // Get all feature flags
    app.get('/api/feature-flags', async (request, reply) => {
      const flags = manager.getAllFlags();
      return { flags };
    });

    // Get specific feature flag
    app.get<{ Params: { name: string } }>(
      '/api/feature-flags/:name',
      async (request, reply) => {
        const flag = manager.getFlag(request.params.name);
        if (!flag) {
          return reply.status(404).send({
            error: 'Feature flag not found',
          });
        }
        return { flag };
      }
    );

    // Check if feature is enabled (public endpoint)
    app.get<{ Params: { name: string } }>(
      '/api/feature-flags/:name/enabled',
      async (request, reply) => {
        const isEnabled = manager.isEnabled(request.params.name, {
          environment: process.env.NODE_ENV,
        });
        return { enabled: isEnabled };
      }
    );
  }
  ```

### Step 5: Integrate with Server

#### Update `src/server.ts`
- [ ] Register feature flag support:
  ```typescript
  import { addFeatureFlagSupport } from './middleware/feature-flag.js';
  import { featureFlagRoutes } from './routes/feature-flags.js';

  // After creating Fastify instance:
  addFeatureFlagSupport(app);

  // Register feature flag routes:
  await app.register(featureFlagRoutes);
  ```

### Step 6: Add Helper Utilities

#### Create `src/utils/feature-flags.ts`
- [ ] Add convenience functions:
  ```typescript
  import { getFeatureFlagManager } from '../services/feature-flags/manager.js';

  /**
   * Check if feature is enabled
   */
  export function checkFeature(flagName: string): boolean {
    return getFeatureFlagManager().isEnabled(flagName, {
      environment: process.env.NODE_ENV,
    });
  }

  /**
   * Conditional execution based on feature flag
   */
  export function withFeature<T>(
    flagName: string,
    whenEnabled: () => T,
    whenDisabled?: () => T
  ): T | undefined {
    if (checkFeature(flagName)) {
      return whenEnabled();
    }
    return whenDisabled?.();
  }

  /**
   * Async version
   */
  export async function withFeatureAsync<T>(
    flagName: string,
    whenEnabled: () => Promise<T>,
    whenDisabled?: () => Promise<T>
  ): Promise<T | undefined> {
    if (checkFeature(flagName)) {
      return await whenEnabled();
    }
    return await whenDisabled?.();
  }
  ```

### Step 7: Add Tests

#### Create `tests/unit/services/feature-flags/manager.test.ts`
- [ ] Test feature flag manager:
  ```typescript
  import { FeatureFlagManager } from '@/services/feature-flags/manager';
  import { mkdirSync, writeFileSync, unlinkSync } from 'fs';

  describe('FeatureFlagManager', () => {
    let manager: FeatureFlagManager;
    const testConfigPath = 'config/test-feature-flags.json';

    beforeEach(() => {
      mkdirSync('config', { recursive: true });
      writeFileSync(
        testConfigPath,
        JSON.stringify({
          flags: {
            test_feature: {
              enabled: true,
              description: 'Test feature',
            },
          },
        })
      );
      manager = new FeatureFlagManager(testConfigPath);
    });

    afterEach(() => {
      manager.destroy();
      unlinkSync(testConfigPath);
    });

    it('should load flags from config', () => {
      expect(manager.isEnabled('test_feature')).toBe(true);
    });

    it('should respect environment overrides', () => {
      process.env.FEATURE_TEST_FEATURE = 'false';
      expect(manager.isEnabled('test_feature')).toBe(false);
      delete process.env.FEATURE_TEST_FEATURE;
    });

    it('should return false for unknown flags', () => {
      expect(manager.isEnabled('unknown_flag')).toBe(false);
    });
  });
  ```

### Step 8: Usage Examples

#### Document usage patterns:
- [ ] Create `docs/FEATURE_FLAGS.md`:
  ```markdown
  # Feature Flags Usage Guide

  ## Basic Usage

  ### In Routes
  ```typescript
  import { requireFeatureFlag } from '@/middleware/feature-flag';

  app.get(
    '/api/new-endpoint',
    { preHandler: requireFeatureFlag('new_feature') },
    async (request, reply) => {
      // Only accessible if 'new_feature' flag is enabled
    }
  );
  ```

  ### In Services
  ```typescript
  import { checkFeature, withFeature } from '@/utils/feature-flags';

  if (checkFeature('ai_insights_enabled')) {
    // Run AI insights
  }

  // OR use helper:
  withFeature('ai_insights_enabled', () => {
    // Run AI insights
  });
  ```

  ### Environment Overrides
  ```bash
  # Override in .env
  FEATURE_AI_INSIGHTS_ENABLED=false

  # Override in shell
  FEATURE_NEW_DASHBOARD_UI=true npm run dev
  ```

  ## Configuration

  Edit `config/feature-flags.json`:
  - `enabled`: Boolean to enable/disable feature
  - `description`: What the feature does
  - `environments`: Which envs it's available in
  - `percentage`: Gradual rollout (0-100)
  - `users`: User-specific targeting (future)

  ## API Endpoints

  - `GET /api/feature-flags` - List all flags
  - `GET /api/feature-flags/:name` - Get specific flag
  - `GET /api/feature-flags/:name/enabled` - Check if enabled
  ```

### Step 9: Add to .gitignore
- [ ] Ensure config directory is properly tracked:
  ```gitignore
  # Keep example, ignore overrides
  config/feature-flags.local.json
  ```

### Step 10: Documentation Updates
- [ ] Update README with feature flag information
- [ ] Add feature flags section to development guide

## Acceptance Criteria

- ✅ Feature flags loadable from JSON config
- ✅ Environment variable overrides work
- ✅ Hot-reload on config change
- ✅ Middleware blocks routes when flag disabled
- ✅ Helper functions work correctly
- ✅ API routes expose flag status
- ✅ Tests pass
- ✅ Documentation complete

## Verification Commands

```bash
# Start server
pnpm run dev

# Check feature flags
curl http://localhost:3100/api/feature-flags

# Check specific flag
curl http://localhost:3100/api/feature-flags/ai_insights_enabled/enabled

# Test environment override
FEATURE_AI_INSIGHTS_ENABLED=false pnpm run dev

# Run tests
pnpm test -- feature-flags
```

## Commit Strategy

```bash
git commit -m "feat: add feature flags system for safe rollouts

- Implement FeatureFlagManager with hot-reload
- Add JSON-based configuration
- Support environment variable overrides
- Add middleware for route protection
- Create API endpoints for flag management
- Add helper utilities for conditional execution
- Support gradual rollouts with percentage
- Add comprehensive tests
- Document usage patterns

Enables safe feature rollouts and instant rollback

🤖 Generated with Claude Code"
```

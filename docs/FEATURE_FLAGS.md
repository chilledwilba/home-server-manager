# Feature Flags Usage Guide

This document explains how to use the feature flags system in the Home Server Manager application.

## Overview

Feature flags enable safe feature rollouts, A/B testing, and instant rollback without deployment. They allow you to:

- **Toggle features** on/off without code changes
- **Target specific environments** (development, production)
- **Gradual rollouts** with percentage-based targeting
- **Hot-reload** configuration changes without restart
- **Override via environment variables** for quick testing

## Configuration

Feature flags are configured in `config/feature-flags.json`:

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
      "description": "Enable automatic problem remediation",
      "environments": ["development"]
    },
    "new_dashboard_ui": {
      "enabled": false,
      "description": "Enable new React dashboard UI",
      "percentage": 50
    }
  }
}
```

### Configuration Options

| Field          | Type     | Required | Description                                    |
| -------------- | -------- | -------- | ---------------------------------------------- |
| `enabled`      | boolean  | Yes      | Whether the feature is enabled                 |
| `description`  | string   | Yes      | What the feature does                          |
| `environments` | string[] | No       | Which environments the feature is available in |
| `percentage`   | number   | No       | Gradual rollout percentage (0-100)             |
| `users`        | string[] | No       | User-specific targeting (future feature)       |

## Usage

### In Routes

Use the `requireFeatureFlag` middleware to protect routes:

```typescript
import { requireFeatureFlag } from '@/middleware/feature-flag';

app.get(
  '/api/new-endpoint',
  { preHandler: requireFeatureFlag('new_feature') },
  async (request, reply) => {
    // Only accessible if 'new_feature' flag is enabled
    return { message: 'New feature!' };
  },
);
```

### In Services

Use helper functions for conditional execution:

```typescript
import { checkFeature, withFeature } from '@/utils/feature-flags';

// Simple check
if (checkFeature('ai_insights_enabled')) {
  // Run AI insights
  await generateInsights();
}

// Using helper function
withFeature('ai_insights_enabled', () => {
  // Run AI insights
  return generateInsights();
});

// Async version
await withFeatureAsync(
  'ai_insights_enabled',
  async () => {
    return await generateInsights();
  },
  async () => {
    // Fallback when disabled
    return await generateBasicStats();
  },
);
```

### Using Fastify Decorator

The `checkFeature` method is available on the Fastify instance:

```typescript
app.get('/api/data', async (request, reply) => {
  const useNewAPI = app.checkFeature('new_api_enabled');

  if (useNewAPI) {
    return await fetchFromNewAPI();
  }
  return await fetchFromLegacyAPI();
});
```

## Environment Overrides

Override any feature flag via environment variables:

```bash
# Format: FEATURE_<FLAG_NAME_UPPERCASE>=true|false|1|0

# Enable a disabled feature
FEATURE_AUTO_REMEDIATION_ENABLED=true npm run dev

# Disable an enabled feature
FEATURE_AI_INSIGHTS_ENABLED=false npm run dev

# In .env file
FEATURE_NEW_DASHBOARD_UI=true
FEATURE_EXPERIMENTAL_FEATURES=1
```

Environment variable overrides take precedence over config file values.

## API Endpoints

### Get All Flags

```bash
GET /api/feature-flags
```

Response:

```json
{
  "success": true,
  "flags": [
    {
      "name": "ai_insights_enabled",
      "enabled": true,
      "description": "Enable AI-powered insights and analysis",
      "environments": ["development", "production"]
    }
  ]
}
```

### Get Specific Flag

```bash
GET /api/feature-flags/:name
```

Response:

```json
{
  "success": true,
  "flag": {
    "name": "ai_insights_enabled",
    "enabled": true,
    "description": "Enable AI-powered insights and analysis"
  }
}
```

### Check if Feature is Enabled

```bash
GET /api/feature-flags/:name/enabled
```

Response:

```json
{
  "success": true,
  "enabled": true
}
```

## Hot Reload

The feature flag configuration is automatically reloaded when `config/feature-flags.json` is modified. Changes take effect within 5 seconds without requiring a server restart.

This enables:

- **Instant rollback** of problematic features
- **Quick testing** of different configurations
- **Production debugging** without deployments

## Environment Targeting

Restrict features to specific environments:

```json
{
  "flags": {
    "debug_mode": {
      "enabled": true,
      "description": "Enable debug mode",
      "environments": ["development"]
    }
  }
}
```

The feature will only be enabled in the specified environments, regardless of the `enabled` flag.

## Gradual Rollout

Enable features for a percentage of users:

```json
{
  "flags": {
    "new_dashboard": {
      "enabled": true,
      "description": "New dashboard UI",
      "percentage": 25
    }
  }
}
```

When checking the flag, provide a `userId` for consistent percentage-based targeting:

```typescript
const isEnabled = manager.isEnabled('new_dashboard', {
  userId: request.user.id,
});
```

Users are consistently assigned to either the enabled or disabled group based on a hash of their user ID.

## Best Practices

### 1. Naming Conventions

Use descriptive names with underscores:

- ✅ `ai_insights_enabled`
- ✅ `auto_remediation_enabled`
- ❌ `feature1`
- ❌ `newStuff`

### 2. Always Provide Descriptions

Include clear descriptions of what the feature does:

```json
{
  "description": "Enable automatic problem remediation (requires human confirmation)"
}
```

### 3. Use Environment Targeting

Restrict experimental features to development:

```json
{
  "experimental_features": {
    "enabled": true,
    "environments": ["development"]
  }
}
```

### 4. Clean Up Old Flags

Remove feature flags once the feature is fully rolled out and stable:

```bash
# After 2-4 weeks of successful rollout, remove the flag
# 1. Remove code that checks the flag
# 2. Remove from config/feature-flags.json
# 3. Deploy
```

### 5. Document Flag Usage

When adding a new flag, document:

- What it controls
- Why it exists
- When it can be removed
- Any dependencies

## Troubleshooting

### Feature Not Enabling

1. **Check config file**: Verify flag exists in `config/feature-flags.json`
2. **Check environment**: Ensure flag's `environments` includes current environment
3. **Check override**: Look for `FEATURE_*` environment variables
4. **Check logs**: Look for "Feature flags loaded" log message

### Hot Reload Not Working

1. **Wait 5 seconds**: File watching polls every 5 seconds
2. **Check file permissions**: Ensure config file is writable
3. **Restart server**: As last resort, restart the server

### Flag Always Returns False

1. **Check typo**: Flag names are case-sensitive
2. **Check config syntax**: Ensure valid JSON
3. **Check defaults**: If config fails to load, defaults are used

## Examples

### Feature Flag for API Endpoint

```typescript
// Protect endpoint with feature flag
app.get(
  '/api/v2/insights',
  { preHandler: requireFeatureFlag('api_v2_enabled') },
  async (request, reply) => {
    return { insights: await generateV2Insights() };
  },
);
```

### Conditional Service Behavior

```typescript
class MonitoringService {
  async collectMetrics() {
    const useAdvancedMetrics = checkFeature('advanced_metrics_enabled');

    if (useAdvancedMetrics) {
      return await this.collectAdvancedMetrics();
    }
    return await this.collectBasicMetrics();
  }
}
```

### Gradual UI Rollout

```typescript
app.get('/dashboard', async (request, reply) => {
  const useNewUI = app.checkFeature('new_dashboard_ui', {
    userId: request.session.userId,
  });

  if (useNewUI) {
    return reply.sendFile('dashboard-v2.html');
  }
  return reply.sendFile('dashboard-v1.html');
});
```

## Available Flags

Current feature flags in the system:

| Flag Name                  | Default | Description                              |
| -------------------------- | ------- | ---------------------------------------- |
| `ai_insights_enabled`      | `true`  | Enable AI-powered insights and analysis  |
| `auto_remediation_enabled` | `false` | Enable automatic problem remediation     |
| `new_dashboard_ui`         | `false` | Enable new React dashboard UI            |
| `experimental_features`    | `false` | Enable experimental features             |
| `performance_monitoring`   | `true`  | Enable detailed performance monitoring   |
| `enhanced_logging`         | `true`  | Enable enhanced debug logging            |
| `security_scanning`        | `true`  | Enable security vulnerability scanning   |
| `mcp_server`               | `true`  | Enable MCP server for Claude integration |

## Further Reading

- [Feature Flags Best Practices](https://martinfowler.com/articles/feature-toggles.html)
- [Testing with Feature Flags](../tests/unit/services/feature-flags/manager.test.ts)
- [API Reference](./API.md)

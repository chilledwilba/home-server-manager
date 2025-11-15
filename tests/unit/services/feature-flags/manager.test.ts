import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FeatureFlagManager } from '../../../../src/services/feature-flags/manager.js';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs';

describe('FeatureFlagManager', () => {
  let manager: FeatureFlagManager;
  const testConfigPath = 'config/test-feature-flags.json';
  const originalEnv = process.env;

  beforeEach(() => {
    // Create config directory if it doesn't exist
    mkdirSync('config', { recursive: true });

    // Create test config
    writeFileSync(
      testConfigPath,
      JSON.stringify({
        flags: {
          test_feature: {
            enabled: true,
            description: 'Test feature',
          },
          env_specific_feature: {
            enabled: true,
            description: 'Environment specific feature',
            environments: ['development'],
          },
          disabled_feature: {
            enabled: false,
            description: 'Disabled feature',
          },
          percentage_feature: {
            enabled: true,
            description: 'Percentage rollout feature',
            percentage: 50,
          },
        },
      }),
    );

    manager = new FeatureFlagManager(testConfigPath);
  });

  afterEach(() => {
    manager.destroy();
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
    // Restore environment
    process.env = originalEnv;
  });

  describe('Flag Loading', () => {
    it('should load flags from config file', () => {
      const flags = manager.getAllFlags();
      expect(flags.length).toBe(4);
      expect(flags.find((f) => f.name === 'test_feature')).toBeDefined();
    });

    it('should get specific flag details', () => {
      const flag = manager.getFlag('test_feature');
      expect(flag).toBeDefined();
      expect(flag?.name).toBe('test_feature');
      expect(flag?.enabled).toBe(true);
      expect(flag?.description).toBe('Test feature');
    });

    it('should return undefined for unknown flag', () => {
      const flag = manager.getFlag('unknown_flag');
      expect(flag).toBeUndefined();
    });
  });

  describe('Flag Evaluation', () => {
    it('should return true for enabled feature', () => {
      expect(manager.isEnabled('test_feature')).toBe(true);
    });

    it('should return false for disabled feature', () => {
      expect(manager.isEnabled('disabled_feature')).toBe(false);
    });

    it('should return false for unknown flag', () => {
      expect(manager.isEnabled('unknown_flag')).toBe(false);
    });
  });

  describe('Environment Overrides', () => {
    it('should respect environment variable override to enable', () => {
      process.env['FEATURE_DISABLED_FEATURE'] = 'true';
      expect(manager.isEnabled('disabled_feature')).toBe(true);
    });

    it('should respect environment variable override to disable', () => {
      process.env['FEATURE_TEST_FEATURE'] = 'false';
      expect(manager.isEnabled('test_feature')).toBe(false);
    });

    it('should handle "1" as true', () => {
      process.env['FEATURE_DISABLED_FEATURE'] = '1';
      expect(manager.isEnabled('disabled_feature')).toBe(true);
    });

    it('should handle any other value as false', () => {
      process.env['FEATURE_TEST_FEATURE'] = '0';
      expect(manager.isEnabled('test_feature')).toBe(false);
    });
  });

  describe('Environment Targeting', () => {
    it('should enable feature in matching environment', () => {
      expect(
        manager.isEnabled('env_specific_feature', {
          environment: 'development',
        }),
      ).toBe(true);
    });

    it('should disable feature in non-matching environment', () => {
      expect(
        manager.isEnabled('env_specific_feature', {
          environment: 'production',
        }),
      ).toBe(false);
    });

    it('should enable feature when no environment specified', () => {
      expect(manager.isEnabled('env_specific_feature')).toBe(true);
    });
  });

  describe('Percentage Rollout', () => {
    it('should enable feature for some users based on percentage', () => {
      const results = new Set<boolean>();
      // Test with different user IDs
      for (let i = 0; i < 100; i++) {
        const result = manager.isEnabled('percentage_feature', {
          userId: `user-${i}`,
        });
        results.add(result);
      }
      // Should have both true and false results due to 50% rollout
      expect(results.has(true)).toBe(true);
      expect(results.has(false)).toBe(true);
    });

    it('should be consistent for the same user', () => {
      const userId = 'test-user-123';
      const result1 = manager.isEnabled('percentage_feature', { userId });
      const result2 = manager.isEnabled('percentage_feature', { userId });
      expect(result1).toBe(result2);
    });

    it('should work without userId for percentage rollout', () => {
      // Without userId, percentage should be ignored
      expect(manager.isEnabled('percentage_feature')).toBe(true);
    });
  });

  describe('Default Flags', () => {
    it('should load default flags when config file does not exist', () => {
      // Remove test config
      unlinkSync(testConfigPath);

      // Create manager with non-existent config
      const managerWithDefaults = new FeatureFlagManager('config/non-existent.json');

      // Should load defaults
      const flags = managerWithDefaults.getAllFlags();
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.find((f) => f.name === 'ai_insights_enabled')).toBeDefined();

      managerWithDefaults.destroy();
    });
  });

  describe('Hot Reload', () => {
    it.skip('should reload flags when config file changes', (done) => {
      // Initial state
      expect(manager.isEnabled('test_feature')).toBe(true);

      // Update config file
      // eslint-disable-next-line no-undef
      setTimeout(() => {
        writeFileSync(
          testConfigPath,
          JSON.stringify({
            flags: {
              test_feature: {
                enabled: false,
                description: 'Test feature (disabled)',
              },
            },
          }),
        );

        // Wait for file watch to trigger
        // eslint-disable-next-line no-undef
        setTimeout(() => {
          expect(manager.isEnabled('test_feature')).toBe(false);
          done();
        }, 6000); // Wait for watch interval (5000ms) + buffer
      }, 100);
    }, 10000); // Increase test timeout
  });
});

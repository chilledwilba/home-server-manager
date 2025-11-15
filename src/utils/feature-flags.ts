/**
 * Feature Flag Helper Utilities
 * Convenience functions for checking and using feature flags
 */

import { getFeatureFlagManager } from '../services/feature-flags/manager.js';

/**
 * Check if feature is enabled
 */
export function checkFeature(flagName: string): boolean {
  return getFeatureFlagManager().isEnabled(flagName, {
    environment: process.env['NODE_ENV'],
  });
}

/**
 * Conditional execution based on feature flag
 */
export function withFeature<T>(
  flagName: string,
  whenEnabled: () => T,
  whenDisabled?: () => T,
): T | undefined {
  if (checkFeature(flagName)) {
    return whenEnabled();
  }
  return whenDisabled?.();
}

/**
 * Async version of withFeature
 */
export async function withFeatureAsync<T>(
  flagName: string,
  whenEnabled: () => Promise<T>,
  whenDisabled?: () => Promise<T>,
): Promise<T | undefined> {
  if (checkFeature(flagName)) {
    return await whenEnabled();
  }
  if (whenDisabled) {
    return await whenDisabled();
  }
  return undefined;
}

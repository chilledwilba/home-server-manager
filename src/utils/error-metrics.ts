/**
 * Error metrics tracking for Prometheus
 * Provides insights into error patterns and system health
 */

import { Counter, Histogram } from 'prom-client';
import type { AppError, ErrorCode } from './error-types.js';
import { ErrorSeverity } from './error-types.js';

/**
 * Counter for total errors by code
 */
export const errorCounter = new Counter({
  name: 'app_errors_total',
  help: 'Total number of application errors',
  labelNames: ['code', 'severity', 'recoverable', 'path'] as const,
});

/**
 * Counter for errors by severity level
 */
export const errorSeverityCounter = new Counter({
  name: 'app_errors_by_severity_total',
  help: 'Total number of errors grouped by severity',
  labelNames: ['severity'] as const,
});

/**
 * Counter for errors by domain
 */
export const errorDomainCounter = new Counter({
  name: 'app_errors_by_domain_total',
  help: 'Total number of errors grouped by domain (TrueNAS, Docker, ZFS, etc.)',
  labelNames: ['domain'] as const,
});

/**
 * Counter for recoverable vs non-recoverable errors
 */
export const errorRecoverabilityCounter = new Counter({
  name: 'app_errors_by_recoverability_total',
  help: 'Total number of errors grouped by recoverability',
  labelNames: ['recoverable'] as const,
});

/**
 * Histogram for error handling duration
 */
export const errorHandlingDuration = new Histogram({
  name: 'app_error_handling_duration_seconds',
  help: 'Duration of error handling in seconds',
  labelNames: ['code', 'severity'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

/**
 * Track an application error in Prometheus metrics
 */
export function trackError(error: AppError, path?: string): void {
  const domain = extractDomain(error.code);

  // Track total errors with labels
  errorCounter.inc({
    code: error.code,
    severity: error.severity,
    recoverable: error.recoverable.toString(),
    path: path || 'unknown',
  });

  // Track by severity
  errorSeverityCounter.inc({
    severity: error.severity,
  });

  // Track by domain
  if (domain) {
    errorDomainCounter.inc({
      domain,
    });
  }

  // Track recoverability
  errorRecoverabilityCounter.inc({
    recoverable: error.recoverable.toString(),
  });
}

/**
 * Track error handling time
 */
export function trackErrorHandling(error: AppError, durationSeconds: number): void {
  errorHandlingDuration.observe(
    {
      code: error.code,
      severity: error.severity,
    },
    durationSeconds,
  );
}

/**
 * Extract domain from error code
 * Maps error codes to their domain (TrueNAS, Docker, ZFS, etc.)
 */
function extractDomain(code: ErrorCode): string | null {
  const codeStr = code.toString();

  // Extract numeric prefix to determine domain
  if (
    codeStr.includes('1000') ||
    codeStr.includes('1001') ||
    codeStr.includes('1002') ||
    codeStr.includes('1003')
  ) {
    return 'system';
  }
  if (
    codeStr.includes('2000') ||
    codeStr.includes('2001') ||
    codeStr.includes('2002') ||
    codeStr.includes('2003') ||
    codeStr.includes('2004')
  ) {
    return 'truenas';
  }
  if (
    codeStr.includes('3000') ||
    codeStr.includes('3001') ||
    codeStr.includes('3002') ||
    codeStr.includes('3003') ||
    codeStr.includes('3004') ||
    codeStr.includes('3005')
  ) {
    return 'docker';
  }
  if (
    codeStr.includes('4000') ||
    codeStr.includes('4001') ||
    codeStr.includes('4002') ||
    codeStr.includes('4003') ||
    codeStr.includes('4004')
  ) {
    return 'zfs';
  }
  if (
    codeStr.includes('5000') ||
    codeStr.includes('5001') ||
    codeStr.includes('5002') ||
    codeStr.includes('5003') ||
    codeStr.includes('5004')
  ) {
    return 'validation';
  }
  if (
    codeStr.includes('6000') ||
    codeStr.includes('6001') ||
    codeStr.includes('6002') ||
    codeStr.includes('6003') ||
    codeStr.includes('6004')
  ) {
    return 'auth';
  }
  if (codeStr.includes('7000') || codeStr.includes('7001') || codeStr.includes('7002')) {
    return 'resource';
  }
  if (
    codeStr.includes('8000') ||
    codeStr.includes('8001') ||
    codeStr.includes('8002') ||
    codeStr.includes('8003')
  ) {
    return 'external';
  }
  if (
    codeStr.includes('9000') ||
    codeStr.includes('9001') ||
    codeStr.includes('9002') ||
    codeStr.includes('9003')
  ) {
    return 'security';
  }

  return null;
}

/**
 * Get error statistics
 * Useful for health checks and monitoring dashboards
 */
export interface ErrorStats {
  totalErrors: number;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsByDomain: Record<string, number>;
  recoverableErrors: number;
  nonRecoverableErrors: number;
}

/**
 * Get current error statistics
 * Note: This is a placeholder implementation
 * For production monitoring, query Prometheus directly
 */
export function getErrorStats(): ErrorStats {
  // Placeholder - in production, query Prometheus registry
  return {
    totalErrors: 0,
    errorsBySeverity: {
      [ErrorSeverity.CRITICAL]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.LOW]: 0,
    },
    errorsByDomain: {},
    recoverableErrors: 0,
    nonRecoverableErrors: 0,
  };
}

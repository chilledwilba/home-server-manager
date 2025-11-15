/**
 * Application constants and configuration values
 * Centralizes magic numbers and configuration for better maintainability
 */

/**
 * Monitoring intervals in milliseconds
 */
export const MONITORING_INTERVALS = {
  SYSTEM: 30_000, // 30 seconds
  POOLS: 60_000, // 1 minute
  DISKS: 120_000, // 2 minutes
  CONTAINERS: 45_000, // 45 seconds
  SECURITY: 300_000, // 5 minutes
  ARR_QUEUE: 120_000, // 2 minutes
  UPS_STATUS: 10_000, // 10 seconds
  HEALTH_CHECK: 5_000, // 5 seconds
} as const;

/**
 * Temperature thresholds in Celsius
 */
export const TEMPERATURE_THRESHOLDS = {
  DISK_WARNING: 50, // °C
  DISK_CRITICAL: 60, // °C
  CPU_WARNING: 70, // °C
  CPU_CRITICAL: 85, // °C
} as const;

/**
 * Alert severity levels
 */
export const ALERT_SEVERITIES = ['info', 'warning', 'critical', 'error'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/**
 * Retry configuration for failed operations
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY: 1000, // 1 second
  MAX_DELAY: 10_000, // 10 seconds
  BACKOFF_FACTOR: 2,
} as const;

/**
 * Circuit breaker configuration
 */
export const CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 5, // Number of failures before opening circuit
  SUCCESS_THRESHOLD: 2, // Number of successes to close circuit
  TIMEOUT: 60_000, // 1 minute before attempting reset
  HALF_OPEN_MAX_CALLS: 1, // Number of calls allowed in half-open state
} as const;

/**
 * Database retention periods in days
 */
export const RETENTION_PERIODS = {
  METRICS: 30, // 30 days
  LOGS: 7, // 7 days
  ALERTS: 90, // 90 days
  SMART_DATA: 365, // 1 year
  CONTAINER_STATS: 14, // 14 days
} as const;

/**
 * Resource usage thresholds (percentages)
 */
export const RESOURCE_THRESHOLDS = {
  CPU_WARNING: 80,
  CPU_CRITICAL: 95,
  RAM_WARNING: 85,
  RAM_CRITICAL: 95,
  DISK_WARNING: 80,
  DISK_CRITICAL: 90,
  POOL_WARNING: 80,
  POOL_CRITICAL: 90,
} as const;

/**
 * ZFS snapshot retention policies
 */
export const SNAPSHOT_RETENTION = {
  HOURLY: 24, // Keep 24 hourly snapshots
  DAILY: 7, // Keep 7 daily snapshots
  WEEKLY: 4, // Keep 4 weekly snapshots
  MONTHLY: 12, // Keep 12 monthly snapshots
} as const;

/**
 * Docker container health check intervals
 */
export const CONTAINER_HEALTH = {
  INTERVAL: 10_000, // 10 seconds
  TIMEOUT: 5_000, // 5 seconds
  RETRIES: 3,
  START_PERIOD: 30_000, // 30 seconds
} as const;

/**
 * API rate limiting
 */
export const RATE_LIMITS = {
  WINDOW_MS: 60_000, // 1 minute
  MAX_REQUESTS: 100, // 100 requests per window
  SKIP_SUCCESSFUL: false,
} as const;

/**
 * Security scanner configuration
 */
export const SECURITY_SCANNER = {
  SCAN_INTERVAL: 3600_000, // 1 hour
  CVE_SEVERITY_THRESHOLD: 'MEDIUM',
  MAX_CONCURRENT_SCANS: 3,
} as const;

/**
 * AI insights configuration
 */
export const AI_INSIGHTS = {
  ANOMALY_DETECTION_WINDOW: 24, // hours
  CAPACITY_PREDICTION_DAYS: 30, // days
  ANALYSIS_RETENTION_DAYS: 90, // days
  MIN_DATA_POINTS: 10, // minimum data points for analysis
} as const;

/**
 * Notification configuration
 */
export const NOTIFICATIONS = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 5_000, // 5 seconds
  BATCH_SIZE: 10, // notifications per batch
  RATE_LIMIT_WINDOW: 300_000, // 5 minutes
  MAX_PER_WINDOW: 20, // max notifications per window
} as const;

/**
 * HTTP timeout configuration
 */
export const HTTP_TIMEOUTS = {
  DEFAULT: 5_000, // 5 seconds
  LONG_RUNNING: 30_000, // 30 seconds
  UPLOAD: 60_000, // 1 minute
} as const;

/**
 * Logging configuration
 */
export const LOGGING = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
  MAX_FILES: 5,
  ROTATE_INTERVAL: '1d', // daily
} as const;

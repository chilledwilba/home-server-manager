/**
 * Application-wide constants
 * Centralizes magic numbers and string literals for better maintainability
 */

/**
 * Time intervals in milliseconds
 */
export const INTERVALS = {
  /** 30 seconds - Default monitoring interval */
  THIRTY_SECONDS: 30_000,
  /** 1 minute - Health check interval */
  ONE_MINUTE: 60_000,
  /** 5 minutes - Metric aggregation */
  FIVE_MINUTES: 5 * 60_000,
  /** 15 minutes - Long-running tasks */
  FIFTEEN_MINUTES: 15 * 60_000,
  /** 1 hour - Cleanup and maintenance */
  ONE_HOUR: 60 * 60_000,
  /** 24 hours - Daily reports */
  ONE_DAY: 24 * 60 * 60_000,
} as const;

/**
 * File size limits
 */
export const FILE_LIMITS = {
  /** Maximum route file size in lines */
  ROUTE_FILE_MAX: 250,
  /** Maximum service file size in lines */
  SERVICE_FILE_MAX: 400,
  /** Maximum general file size in lines */
  GENERAL_FILE_MAX: 500,
} as const;

/**
 * Circuit breaker configuration defaults
 */
export const CIRCUIT_BREAKER = {
  /** Failures before opening circuit */
  FAILURE_THRESHOLD: 5,
  /** Successes required to close from half-open */
  SUCCESS_THRESHOLD: 2,
  /** Timeout before attempting recovery (ms) */
  TIMEOUT: 60_000,
  /** Minimum requests before evaluation */
  VOLUME_THRESHOLD: 10,
} as const;

/**
 * Health monitoring configuration
 */
export const HEALTH_MONITOR = {
  /** Health check interval (ms) */
  CHECK_INTERVAL: 30_000,
  /** Maximum restart attempts */
  MAX_RESTART_ATTEMPTS: 3,
  /** Base backoff delay (ms) */
  BASE_BACKOFF_DELAY: 5_000,
} as const;

/**
 * Database query limits
 */
export const QUERY_LIMITS = {
  /** Default pagination limit */
  DEFAULT_LIMIT: 20,
  /** Maximum results per query */
  MAX_LIMIT: 100,
  /** Alert history limit */
  ALERTS_LIMIT: 100,
  /** Metrics retention limit */
  METRICS_LIMIT: 50,
} as const;

/**
 * Alert severity levels
 */
export const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const;

/**
 * Disk failure prediction thresholds
 */
export const DISK_THRESHOLDS = {
  /** Temperature threshold (°C) */
  TEMPERATURE_THRESHOLD: 50,
  /** Reallocated sectors threshold */
  REALLOCATED_SECTORS_THRESHOLD: 10,
  /** Pending sectors threshold */
  PENDING_SECTORS_THRESHOLD: 5,
  /** High risk probability (%) */
  HIGH_RISK_THRESHOLD: 40,
  /** Medium risk probability (%) */
  MEDIUM_RISK_THRESHOLD: 20,
} as const;

/**
 * Docker monitoring thresholds
 */
export const DOCKER_THRESHOLDS = {
  /** CPU usage alert threshold (%) */
  CPU_THRESHOLD: 80,
  /** Memory usage alert threshold (%) */
  MEMORY_THRESHOLD: 85,
  /** Container restart count threshold */
  RESTART_THRESHOLD: 5,
} as const;

/**
 * ZFS thresholds
 */
export const ZFS_THRESHOLDS = {
  /** Pool capacity warning (%) */
  CAPACITY_WARNING: 75,
  /** Pool capacity critical (%) */
  CAPACITY_CRITICAL: 85,
  /** Scrub age warning (days) */
  SCRUB_AGE_WARNING: 35,
} as const;

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Cache TTL values (seconds)
 */
export const CACHE_TTL = {
  /** Short-lived cache (1 minute) */
  SHORT: 60,
  /** Medium-lived cache (5 minutes) */
  MEDIUM: 300,
  /** Long-lived cache (15 minutes) */
  LONG: 900,
  /** Very long cache (1 hour) */
  VERY_LONG: 3600,
} as const;

/**
 * Regex patterns
 */
export const PATTERNS = {
  /** IPv4 address pattern */
  IPV4: /^(\d{1,3}\.){3}\d{1,3}$/,
  /** IPv6 address pattern (simplified) */
  IPV6: /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/,
  /** Pool name pattern */
  POOL_NAME: /^[a-zA-Z0-9_-]+$/,
  /** Container name pattern */
  CONTAINER_NAME: /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
} as const;

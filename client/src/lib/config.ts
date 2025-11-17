/**
 * Application Configuration
 * Centralized configuration for the Home Server Manager frontend
 */

/**
 * API Configuration
 */
export const API_CONFIG = {
  /** Base URL for API requests */
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3100',

  /** Default refetch interval for queries (ms) */
  REFETCH_INTERVAL: 30000, // 30 seconds

  /** Stale time for cached data (ms) */
  STALE_TIME: 10000, // 10 seconds

  /** Number of retry attempts for failed requests */
  RETRY_ATTEMPTS: 3,

  /** Local storage key for authentication token */
  AUTH_TOKEN_KEY: 'auth_token',
} as const;

/**
 * WebSocket Configuration
 */
export const WEBSOCKET_CONFIG = {
  /** WebSocket reconnection delay (ms) */
  RECONNECTION_DELAY: 1000,

  /** Maximum number of reconnection attempts */
  RECONNECTION_ATTEMPTS: 5,

  /** Transports to use for WebSocket connection */
  TRANSPORTS: ['websocket'],
} as const;

/**
 * UI Configuration
 */
export const UI_CONFIG = {
  /** Toast notification duration (ms) */
  TOAST_DURATION: 3000,

  /** Default page size for paginated lists */
  DEFAULT_PAGE_SIZE: 20,
} as const;

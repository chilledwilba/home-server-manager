import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines multiple class names using clsx and tailwind-merge.
 * This function merges Tailwind CSS classes intelligently, handling conflicts.
 *
 * @param inputs - Class names to combine (strings, arrays, objects, etc.)
 * @returns Merged class name string
 *
 * @example
 * ```tsx
 * cn('px-2 py-1', 'px-4') // Returns: 'py-1 px-4' (px-4 overrides px-2)
 * cn('text-red-500', isActive && 'text-blue-500') // Conditional classes
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a byte value into a human-readable string with appropriate units.
 *
 * @param bytes - The number of bytes to format
 * @param decimals - Number of decimal places to show (default: 2)
 * @returns Formatted string like "1.5 GB", "512 MB", etc.
 *
 * @example
 * ```ts
 * formatBytes(1024) // Returns: "1 KB"
 * formatBytes(1536, 0) // Returns: "2 KB"
 * formatBytes(1073741824) // Returns: "1 GB"
 * ```
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Formats uptime in seconds to a human-readable string.
 *
 * @param seconds - Total uptime in seconds
 * @returns Formatted string like "2d 5h 30m" or "45m"
 *
 * @example
 * ```ts
 * formatUptime(90) // Returns: "1m"
 * formatUptime(3665) // Returns: "1h 1m"
 * formatUptime(90061) // Returns: "1d 1h 1m"
 * ```
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(' ') || '0m';
}

/**
 * Formats a date into a localized string representation.
 *
 * @param date - Date string or Date object to format
 * @returns Localized date and time string
 *
 * @example
 * ```ts
 * formatDate('2024-01-15T10:30:00Z') // Returns: "1/15/2024, 10:30:00 AM" (locale-dependent)
 * formatDate(new Date()) // Returns current date/time
 * ```
 */
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString();
}

/**
 * Formats a date as a relative time string (e.g., "5m ago", "2h ago").
 *
 * @param date - Date string or Date object to format
 * @returns Relative time string like "5m ago", "3h ago", "2d ago"
 *
 * @example
 * ```ts
 * formatRelativeTime(new Date(Date.now() - 120000)) // Returns: "2m ago"
 * formatRelativeTime('2024-01-15T10:00:00Z') // Returns time difference from now
 * ```
 */
export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return `${seconds}s ago`;
}

/**
 * Returns the appropriate Tailwind CSS text color class based on status.
 * Maps common status values to semantic colors (green=good, yellow=warning, red=error).
 *
 * @param status - Status string (e.g., "online", "degraded", "faulted")
 * @returns Tailwind CSS text color class
 *
 * @example
 * ```ts
 * getStatusColor('online') // Returns: 'text-green-500'
 * getStatusColor('degraded') // Returns: 'text-yellow-500'
 * getStatusColor('critical') // Returns: 'text-red-500'
 * getStatusColor('unknown') // Returns: 'text-gray-500'
 * ```
 */
export function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();

  if (statusLower === 'online' || statusLower === 'healthy' || statusLower === 'running') {
    return 'text-green-500';
  }

  if (statusLower === 'degraded' || statusLower === 'warning') {
    return 'text-yellow-500';
  }

  if (statusLower === 'faulted' || statusLower === 'error' || statusLower === 'critical') {
    return 'text-red-500';
  }

  return 'text-gray-500';
}

/**
 * Returns Tailwind CSS classes for severity-based styling (text color + background).
 * Provides dark mode support with opacity-based backgrounds.
 *
 * @param severity - Severity level (e.g., "critical", "warning", "info")
 * @returns Tailwind CSS classes for text and background colors
 *
 * @example
 * ```ts
 * getSeverityColor('critical') // Returns: 'text-red-500 bg-red-100 dark:bg-red-900/30'
 * getSeverityColor('warning') // Returns: 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30'
 * getSeverityColor('info') // Returns: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30'
 * ```
 */
export function getSeverityColor(severity: string): string {
  const severityLower = severity.toLowerCase();

  switch (severityLower) {
    case 'critical':
      return 'text-red-500 bg-red-100 dark:bg-red-900/30';
    case 'warning':
      return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30';
    case 'info':
      return 'text-blue-500 bg-blue-100 dark:bg-blue-900/30';
    default:
      return 'text-gray-500 bg-gray-100 dark:bg-gray-900/30';
  }
}

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString();
}

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

import { AlertTriangle, CheckCircle, Database, HardDrive, XCircle } from 'lucide-react';
import { formatBytes } from '../../lib/utils';
import { EmptyState } from '../ui/empty-state';

interface Pool {
  name: string;
  status: string;
  capacity?: number;
  used?: number;
  available?: number;
  health: string;
  disks?: Array<{
    name: string;
    status: string;
    temperature?: number;
  }>;
}

interface PoolStatusProps {
  pools: Pool[];
}

export function PoolStatus({ pools }: PoolStatusProps) {
  if (!pools || pools.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No storage pools found"
        description="Storage pools will appear here once they are configured and detected."
      />
    );
  }

  return (
    <div className="space-y-4">
      {pools.map((pool, index) => {
        const capacity = pool.capacity || 0;
        const used = pool.used || 0;
        const available = pool.available || 0;
        const usagePercent = capacity > 0 ? (used / capacity) * 100 : 0;
        const statusIcon = getStatusIcon(pool.status);
        const statusColor = getStatusColor(pool.status);

        return (
          <div
            key={pool.name}
            className="border dark:border-gray-700 rounded-lg p-4 transition-all duration-200 hover:shadow-sm animate-in fade-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-gray-500" />
                <h3 className="font-medium">{pool.name}</h3>
                <span className={statusColor}>{statusIcon}</span>
              </div>
              <span
                className={`
                px-2 py-1 text-xs rounded-full
                ${
                  pool.status === 'ONLINE'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }
              `}
              >
                {pool.status}
              </span>
            </div>

            {/* Usage Bar */}
            {capacity > 0 && (
              <div className="mb-3">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <span>{formatBytes(used)} used</span>
                  <span>{formatBytes(available)} free</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      usagePercent > 90
                        ? 'bg-red-500'
                        : usagePercent > 80
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <div className="text-center text-sm text-gray-500 mt-1">
                  {usagePercent.toFixed(1)}% used of {formatBytes(capacity)}
                </div>
              </div>
            )}

            {/* Disk Status */}
            {pool.disks && pool.disks.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {pool.disks.map((disk) => (
                  <div
                    key={disk.name}
                    className="flex items-center gap-2 text-sm p-2 bg-gray-50 dark:bg-gray-900 rounded"
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        disk.status === 'ONLINE' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="truncate">{disk.name}</span>
                    {disk.temperature && (
                      <span
                        className={`ml-auto ${
                          disk.temperature > 50
                            ? 'text-red-500'
                            : disk.temperature > 45
                              ? 'text-yellow-500'
                              : 'text-gray-500'
                        }`}
                      >
                        {disk.temperature}°C
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'ONLINE':
      return <CheckCircle className="w-4 h-4" />;
    case 'DEGRADED':
      return <AlertTriangle className="w-4 h-4" />;
    case 'FAULTED':
      return <XCircle className="w-4 h-4" />;
    default:
      return null;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'ONLINE':
      return 'text-green-500';
    case 'DEGRADED':
      return 'text-yellow-500';
    case 'FAULTED':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

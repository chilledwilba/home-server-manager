import { Activity, Cpu, HardDrive, Zap } from 'lucide-react';
import { formatUptime } from '../../lib/utils';

interface SystemMetricsProps {
  metrics?: {
    cpu?: { usage: number };
    memory?: { used: number; total: number; percent: number };
    uptime?: number;
    load?: number[];
  };
}

export function SystemMetrics({ metrics }: SystemMetricsProps) {
  if (!metrics) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No system metrics available
      </div>
    );
  }

  const cpuUsage = metrics.cpu?.usage || 0;
  const memoryPercent = metrics.memory?.percent || 0;
  const uptime = metrics.uptime || 0;
  const load = metrics.load || [0, 0, 0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* CPU Usage */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-5 h-5 text-primary-500" />
          <span className="font-medium">CPU Usage</span>
        </div>
        <div className="text-2xl font-bold mb-2">{cpuUsage.toFixed(1)}%</div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              cpuUsage > 80 ? 'bg-red-500' : cpuUsage > 60 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${cpuUsage}%` }}
          />
        </div>
      </div>

      {/* Memory Usage */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <HardDrive className="w-5 h-5 text-primary-500" />
          <span className="font-medium">Memory Usage</span>
        </div>
        <div className="text-2xl font-bold mb-2">{memoryPercent.toFixed(1)}%</div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              memoryPercent > 80
                ? 'bg-red-500'
                : memoryPercent > 60
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
            }`}
            style={{ width: `${memoryPercent}%` }}
          />
        </div>
      </div>

      {/* System Load */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-5 h-5 text-primary-500" />
          <span className="font-medium">System Load</span>
        </div>
        <div className="text-2xl font-bold">{load[0]?.toFixed(2) || '0.00'}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {load[1]?.toFixed(2) || '0.00'} / {load[2]?.toFixed(2) || '0.00'}
        </div>
      </div>

      {/* Uptime */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-primary-500" />
          <span className="font-medium">Uptime</span>
        </div>
        <div className="text-2xl font-bold">{formatUptime(uptime)}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">System running</div>
      </div>
    </div>
  );
}

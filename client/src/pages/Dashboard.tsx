import { Activity, Server, HardDrive, Shield, Bell } from 'lucide-react';
import { useMetrics, usePools, useContainers, useSecurityStatus } from '../hooks/useMetrics';
import { useAlerts } from '../hooks/useAlerts';
import { PoolStatus } from '../components/Dashboard/PoolStatus';
import { SystemMetrics } from '../components/Dashboard/SystemMetrics';
import { ContainerGrid } from '../components/Dashboard/ContainerGrid';
import { AlertFeed } from '../components/Dashboard/AlertFeed';
import { QuickActions } from '../components/Dashboard/QuickActions';
import type { Pool, ContainerInfo, Alert, SystemMetrics as SystemMetricsType } from '../lib/types';

export function Dashboard() {
  const { data: metricsData, isLoading: metricsLoading } = useMetrics();
  const { data: poolsData } = usePools();
  const { data: containersData } = useContainers();
  const { data: securityData } = useSecurityStatus();
  const { data: alertsData } = useAlerts({ limit: 10 });

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="spinner h-12 w-12" />
      </div>
    );
  }

  const pools = (poolsData?.pools || []) as Pool[];
  const containers = (containersData?.containers || []) as ContainerInfo[];
  const alerts = (alertsData?.alerts || []) as Alert[];
  const metrics = metricsData?.data as SystemMetricsType | undefined;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Server className="w-6 h-6" />}
          title="System Status"
          value="Healthy"
          color="green"
        />
        <StatCard
          icon={<HardDrive className="w-6 h-6" />}
          title="Storage Pools"
          value={`${pools.length} Pools`}
          color="blue"
        />
        <StatCard
          icon={<Shield className="w-6 h-6" />}
          title="Security"
          value={(securityData?.data as { status?: string })?.status || 'Active'}
          color="purple"
        />
        <StatCard
          icon={<Bell className="w-6 h-6" />}
          title="Active Alerts"
          value={alerts.filter((a) => !a.resolved).length.toString()}
          color={alerts.some((a) => a.severity === 'critical') ? 'red' : 'yellow'}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column - 2 cols */}
        <div className="xl:col-span-2 space-y-6">
          {/* Pool Status */}
          <div className="card">
            <h2 className="card-header">
              <HardDrive className="w-5 h-5" />
              Storage Pools
            </h2>
            <PoolStatus pools={pools} />
          </div>

          {/* System Metrics */}
          <div className="card">
            <h2 className="card-header">
              <Activity className="w-5 h-5" />
              System Metrics
            </h2>
            <SystemMetrics metrics={metrics} />
          </div>

          {/* Container Grid */}
          <div className="card">
            <h2 className="card-header">Docker Containers</h2>
            <ContainerGrid containers={containers} />
          </div>
        </div>

        {/* Right Column - 1 col */}
        <div className="space-y-6">
          {/* Alert Feed */}
          <div className="card">
            <h2 className="card-header">
              <Bell className="w-5 h-5" />
              Recent Alerts
            </h2>
            <AlertFeed alerts={alerts} />
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h2 className="card-header">Quick Actions</h2>
            <QuickActions />
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  color: 'green' | 'red' | 'blue' | 'purple' | 'yellow';
}

function StatCard({ icon, title, value, color }: StatCardProps) {
  const colorClasses = {
    green: 'text-green-600 bg-green-100 dark:bg-green-900/20',
    red: 'text-red-600 bg-red-100 dark:bg-red-900/20',
    blue: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20',
    purple: 'text-purple-600 bg-purple-100 dark:bg-purple-900/20',
    yellow: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20',
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="stat-label">{title}</p>
          <p className="stat-value">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  );
}

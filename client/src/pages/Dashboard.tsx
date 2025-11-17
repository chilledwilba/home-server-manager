import { Activity, Bell, HardDrive, Server, Shield } from 'lucide-react';
import { AlertFeed } from '../components/Dashboard/AlertFeed';
import { ContainerGrid } from '../components/Dashboard/ContainerGrid';
import { PoolStatus } from '../components/Dashboard/PoolStatus';
import { QuickActions } from '../components/Dashboard/QuickActions';
import { SystemMetrics } from '../components/Dashboard/SystemMetrics';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useAlerts } from '../hooks/useAlerts';
import { useContainers, useMetrics, usePools, useSecurityStatus } from '../hooks/useMetrics';
import type { Alert, ContainerInfo, Pool, SystemMetrics as SystemMetricsType } from '../lib/types';

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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Storage Pools
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PoolStatus pools={pools} />
            </CardContent>
          </Card>

          {/* System Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                System Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SystemMetrics metrics={metrics} />
            </CardContent>
          </Card>

          {/* Container Grid */}
          <Card>
            <CardHeader>
              <CardTitle>Docker Containers</CardTitle>
            </CardHeader>
            <CardContent>
              <ContainerGrid containers={containers} />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - 1 col */}
        <div className="space-y-6">
          {/* Alert Feed */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Recent Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AlertFeed alerts={alerts} />
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <QuickActions />
            </CardContent>
          </Card>
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
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-semibold mt-1">{value}</p>
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

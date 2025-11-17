import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle,
  Info as InfoIcon,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAlerts } from '@/hooks/useAlerts';
import type { Alert } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';

export function Alerts() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [severity, setSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const { data: alertsData, isLoading } = useAlerts({ limit: 100 });

  const alerts = (alertsData?.alerts || []) as Alert[];

  // Memoize refresh handler to prevent unnecessary re-renders
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
    toast.success('Refreshing alerts...');
  }, [queryClient]);

  // Memoize filtered alerts to prevent recalculation on every render
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (filter === 'active' && alert.resolved) {
        return false;
      }
      if (filter === 'resolved' && !alert.resolved) {
        return false;
      }
      if (severity !== 'all' && alert.severity.toLowerCase() !== severity) {
        return false;
      }
      return true;
    });
  }, [alerts, filter, severity]);

  // Memoize stats calculations to prevent multiple filter operations on every render
  const stats = useMemo(() => {
    return {
      total: alerts.length,
      active: alerts.filter((a) => !a.resolved).length,
      resolved: alerts.filter((a) => a.resolved).length,
      critical: alerts.filter((a) => a.severity.toLowerCase() === 'critical' && !a.resolved)
        .length,
      warning: alerts.filter((a) => a.severity.toLowerCase() === 'warning' && !a.resolved).length,
    };
  }, [alerts]);

  if (isLoading) {
    const StatSkeleton = () => (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-8 w-12" />
        </CardContent>
      </Card>
    );

    const AlertListSkeleton = () => <Skeleton className="h-20 w-full" />;

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <AlertListSkeleton />
              <AlertListSkeleton />
              <AlertListSkeleton />
              <AlertListSkeleton />
              <AlertListSkeleton />
              <AlertListSkeleton />
              <AlertListSkeleton />
              <AlertListSkeleton />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6" />
          Alerts
        </h1>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-2xl font-bold text-blue-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Resolved</div>
            <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Critical</div>
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Warning</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Alerts</CardTitle>
          <CardDescription>Filter alerts by status and severity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="status-filter" className="text-sm font-medium mb-2 block">
                Status
              </label>
              <Select value={filter} onValueChange={(value: typeof filter) => setFilter(value)}>
                <SelectTrigger id="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Alerts</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="resolved">Resolved Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="severity-filter" className="text-sm font-medium mb-2 block">
                Severity
              </label>
              <Select
                value={severity}
                onValueChange={(value: typeof severity) => setSeverity(value)}
              >
                <SelectTrigger id="severity-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts List */}
      <Card>
        <CardHeader>
          <CardTitle>Alert History</CardTitle>
          <CardDescription>
            Showing {filteredAlerts.length} of {alerts.length} alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredAlerts.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="No alerts found"
              description="No alerts match your current filters."
            />
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert, index) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border-l-4 transition-all duration-200 hover:shadow-sm animate-in fade-in ${getSeverityBorderColor(alert.severity)}`}
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(alert.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge
                          variant={
                            alert.severity.toLowerCase() === 'critical'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {alert.severity}
                        </Badge>
                        <Badge variant="outline">{alert.type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(alert.created_at)}
                        </span>
                      </div>
                      <p className="text-sm mb-2">{alert.message}</p>
                      <div className="flex items-center gap-2">
                        {alert.resolved ? (
                          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            Resolved
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                            <InfoIcon className="w-3 h-3" />
                            Active
                          </div>
                        )}
                        {alert.acknowledged && !alert.resolved && (
                          <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                            <CheckCircle className="w-3 h-3" />
                            Acknowledged
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getSeverityIcon(severity: string) {
  const iconClass = 'w-5 h-5 flex-shrink-0';

  switch (severity.toLowerCase()) {
    case 'critical':
      return <AlertCircle className={`${iconClass} text-red-500`} />;
    case 'warning':
      return <AlertTriangle className={`${iconClass} text-yellow-500`} />;
    case 'info':
      return <InfoIcon className={`${iconClass} text-blue-500`} />;
    default:
      return <InfoIcon className={`${iconClass} text-gray-500`} />;
  }
}

function getSeverityBorderColor(severity: string) {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'border-red-500 bg-red-50 dark:bg-red-900/10';
    case 'warning':
      return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10';
    case 'info':
      return 'border-blue-500 bg-blue-50 dark:bg-blue-900/10';
    default:
      return 'border-gray-500 bg-gray-50 dark:bg-gray-900/10';
  }
}

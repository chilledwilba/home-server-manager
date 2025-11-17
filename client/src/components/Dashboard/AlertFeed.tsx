import { AlertCircle, AlertTriangle, BellOff, CheckCircle, Info } from 'lucide-react';
import { formatRelativeTime } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { EmptyState } from '../ui/empty-state';

interface Alert {
  id: number;
  type: string;
  severity: string;
  message: string;
  created_at: string;
  acknowledged?: number;
  resolved?: number;
}

interface AlertFeedProps {
  alerts: Alert[];
}

export function AlertFeed({ alerts }: AlertFeedProps) {
  if (!alerts || alerts.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="No alerts"
        description="All systems are running smoothly. Alerts will appear here when issues are detected."
      />
    );
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
      {alerts.map((alert, index) => (
        <div
          key={alert.id}
          className={`p-3 rounded-lg border-l-4 transition-all duration-200 hover:shadow-sm animate-in fade-in ${getSeverityBorderColor(alert.severity)}`}
          style={{ animationDelay: `${index * 30}ms` }}
        >
          <div className="flex items-start gap-2">
            {getSeverityIcon(alert.severity)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant={
                    alert.severity.toLowerCase() === 'critical' ? 'destructive' : 'secondary'
                  }
                >
                  {alert.severity}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(alert.created_at)}
                </span>
              </div>
              <p className="text-sm">{alert.message}</p>
              {alert.resolved ? (
                <div className="flex items-center gap-1 mt-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle className="w-3 h-3" />
                  Resolved
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ))}
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
      return <Info className={`${iconClass} text-blue-500`} />;
    default:
      return <Info className={`${iconClass} text-gray-500`} />;
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

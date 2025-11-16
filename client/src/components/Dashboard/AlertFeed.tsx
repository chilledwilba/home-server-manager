import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { formatRelativeTime, getSeverityColor } from '../../lib/utils';

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
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">No recent alerts</div>
    );
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-3 rounded-lg border-l-4 ${getSeverityBorderColor(alert.severity)}`}
        >
          <div className="flex items-start gap-2">
            {getSeverityIcon(alert.severity)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${getSeverityColor(alert.severity)}`}
                >
                  {alert.severity}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatRelativeTime(alert.created_at)}
                </span>
              </div>
              <p className="text-sm text-gray-900 dark:text-gray-100">{alert.message}</p>
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

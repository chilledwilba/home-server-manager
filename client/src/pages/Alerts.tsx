import { Bell } from 'lucide-react';
import { useAlerts } from '../hooks/useAlerts';
import { AlertFeed } from '../components/Dashboard/AlertFeed';
import type { Alert } from '../lib/types';

export function Alerts() {
  const { data, isLoading } = useAlerts({ limit: 50 });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner h-12 w-12" />
      </div>
    );
  }

  const alerts = (data?.alerts || []) as Alert[];
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const warnings = alerts.filter((a) => a.severity === 'warning').length;
  const unresolved = alerts.filter((a) => !a.resolved).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6" />
          Alerts
        </h1>
        <button className="btn-primary">Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-2">Critical Alerts</h3>
          <p className="text-2xl font-bold text-red-600">{critical}</p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Warnings</h3>
          <p className="text-2xl font-bold text-yellow-600">{warnings}</p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Unresolved</h3>
          <p className="text-2xl font-bold text-blue-600">{unresolved}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="card-header">All Alerts</h2>
        <AlertFeed alerts={alerts} />
      </div>
    </div>
  );
}

import { Activity } from 'lucide-react';

export function ArrMonitoring() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" />
          Arr Suite Monitoring
        </h1>
        <button className="btn-primary">Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-2">Sonarr</h3>
          <p className="text-2xl font-bold text-green-600">Healthy</p>
          <p className="text-sm text-gray-500 mt-2">Queue: 5 items</p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Radarr</h3>
          <p className="text-2xl font-bold text-green-600">Healthy</p>
          <p className="text-sm text-gray-500 mt-2">Queue: 2 items</p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Prowlarr</h3>
          <p className="text-2xl font-bold text-green-600">Healthy</p>
          <p className="text-sm text-gray-500 mt-2">Indexers: 8</p>
        </div>
      </div>

      <div className="card">
        <h2 className="card-header">Queue Status</h2>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Arr monitoring data will be displayed here
        </div>
      </div>

      <div className="card">
        <h2 className="card-header">Failed Downloads</h2>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Failed download tracking will be displayed here
        </div>
      </div>

      <div className="card">
        <h2 className="card-header">Optimization Suggestions</h2>
        <div className="space-y-2">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded">
            <p className="text-sm">Configure quality profiles for optimal file sizes</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded">
            <p className="text-sm">Add multiple indexers for redundancy</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded">
            <p className="text-sm">Enable recycling bin for safer deletions</p>
          </div>
        </div>
      </div>
    </div>
  );
}

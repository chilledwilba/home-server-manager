import { RefreshCw, AlertCircle, Settings, Shield } from 'lucide-react';

export function QuickActions() {
  return (
    <div className="space-y-2">
      <button className="w-full flex items-center gap-3 px-4 py-3 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-lg transition-colors">
        <RefreshCw className="w-5 h-5" />
        <span className="font-medium">Refresh All Data</span>
      </button>

      <button className="w-full flex items-center gap-3 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors">
        <AlertCircle className="w-5 h-5" />
        <span className="font-medium">View All Alerts</span>
      </button>

      <button className="w-full flex items-center gap-3 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors">
        <Shield className="w-5 h-5" />
        <span className="font-medium">Security Status</span>
      </button>

      <button className="w-full flex items-center gap-3 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors">
        <Settings className="w-5 h-5" />
        <span className="font-medium">System Settings</span>
      </button>
    </div>
  );
}

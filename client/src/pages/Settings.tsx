import { Settings as SettingsIcon } from 'lucide-react';

export function Settings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" />
          Settings
        </h1>
      </div>

      <div className="card">
        <h2 className="card-header">General Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Refresh Interval</label>
            <select className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
              <option value="10">10 seconds</option>
              <option value="30" selected>
                30 seconds
              </option>
              <option value="60">1 minute</option>
              <option value="300">5 minutes</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Alert Notifications</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked className="rounded" />
                <span className="text-sm">Critical alerts</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked className="rounded" />
                <span className="text-sm">Warning alerts</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" />
                <span className="text-sm">Info alerts</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-header">TrueNAS Connection</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">API URL</label>
            <input
              type="text"
              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              placeholder="http://truenas.local/api/v2.0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">API Key</label>
            <input
              type="password"
              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              placeholder="Enter API key"
            />
          </div>

          <button className="btn-primary">Test Connection</button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-header">About</h2>
        <div className="space-y-2 text-sm">
          <p>
            <strong>Version:</strong> 1.0.0
          </p>
          <p>
            <strong>Build:</strong> Production
          </p>
          <p>
            <strong>Server:</strong> Connected
          </p>
          <p>
            <strong>Uptime:</strong> 2d 5h 23m
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <button className="btn-primary">Save Settings</button>
        <button className="btn-secondary">Reset to Defaults</button>
      </div>
    </div>
  );
}

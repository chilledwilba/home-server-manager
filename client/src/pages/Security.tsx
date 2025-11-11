import { Shield } from 'lucide-react';
import { useSecurityStatus } from '../hooks/useMetrics';
import type { SecurityData } from '../lib/types';

export function Security() {
  const { data, isLoading } = useSecurityStatus();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner h-12 w-12" />
      </div>
    );
  }

  const security = (data?.data || {}) as SecurityData;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Security Status
        </h1>
        <button className="btn-primary">Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-2">Status</h3>
          <p className="text-2xl font-bold text-green-600">{security?.status || 'Active'}</p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Banned IPs</h3>
          <p className="text-2xl font-bold">{security?.banned_ips?.length || 0}</p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Failed Attempts</h3>
          <p className="text-2xl font-bold">{security?.failed_attempts || 0}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="card-header">Security Configuration</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <h3 className="font-medium">Fail2ban</h3>
              <p className="text-sm text-gray-500">Intrusion prevention system</p>
            </div>
            <span className="badge badge-success">Active</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <h3 className="font-medium">Firewall</h3>
              <p className="text-sm text-gray-500">Network security</p>
            </div>
            <span className="badge badge-success">Active</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <h3 className="font-medium">SSL/TLS</h3>
              <p className="text-sm text-gray-500">Encrypted connections</p>
            </div>
            <span className="badge badge-success">Enabled</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { HardDrive } from 'lucide-react';
import { usePools } from '../hooks/useMetrics';
import { PoolStatus } from '../components/Dashboard/PoolStatus';
import type { Pool } from '../lib/types';

export function Pools() {
  const { data, isLoading } = usePools();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner h-12 w-12" />
      </div>
    );
  }

  const pools = (data?.pools || []) as Pool[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HardDrive className="w-6 h-6" />
          Storage Pools
        </h1>
        <button className="btn-primary">Refresh</button>
      </div>

      <div className="card">
        <PoolStatus pools={pools} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-2">Total Capacity</h3>
          <p className="text-2xl font-bold">
            {pools.reduce((sum, p) => sum + (p.capacity || 0), 0).toFixed(2)} GB
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Used Space</h3>
          <p className="text-2xl font-bold">
            {pools.reduce((sum, p) => sum + (p.used || 0), 0).toFixed(2)} GB
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Available Space</h3>
          <p className="text-2xl font-bold">
            {pools.reduce((sum, p) => sum + (p.available || 0), 0).toFixed(2)} GB
          </p>
        </div>
      </div>
    </div>
  );
}

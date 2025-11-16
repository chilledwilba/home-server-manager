import { Container } from 'lucide-react';
import { ContainerGrid } from '../components/Dashboard/ContainerGrid';
import { useContainers } from '../hooks/useMetrics';
import type { ContainerInfo } from '../lib/types';

export function Containers() {
  const { data, isLoading } = useContainers();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner h-12 w-12" />
      </div>
    );
  }

  const containers = (data?.containers || []) as ContainerInfo[];
  const running = containers.filter((c) => c.status.toLowerCase() === 'running').length;
  const stopped = containers.length - running;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Container className="w-6 h-6" />
          Docker Containers
        </h1>
        <button className="btn-primary">Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-2">Total Containers</h3>
          <p className="text-2xl font-bold">{containers.length}</p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Running</h3>
          <p className="text-2xl font-bold text-green-600">{running}</p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">Stopped</h3>
          <p className="text-2xl font-bold text-gray-600">{stopped}</p>
        </div>
      </div>

      <div className="card">
        <ContainerGrid containers={containers} />
      </div>
    </div>
  );
}

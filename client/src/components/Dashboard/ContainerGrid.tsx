import { Container, Play, Square, RefreshCw } from 'lucide-react';
import { formatRelativeTime } from '../../lib/utils';

interface ContainerInfo {
  id: string;
  name: string;
  status: string;
  state: string;
  image?: string;
  created?: string;
  ports?: string[];
}

interface ContainerGridProps {
  containers: ContainerInfo[];
}

export function ContainerGrid({ containers }: ContainerGridProps) {
  if (!containers || containers.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">No containers found</div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {containers.map((container) => (
        <div
          key={container.id}
          className="p-4 border dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Container className="w-5 h-5 text-primary-500" />
              <h3 className="font-medium truncate">{container.name}</h3>
            </div>
            <span
              className={`
                px-2 py-1 text-xs rounded-full
                ${
                  container.status.toLowerCase() === 'running'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                }
              `}
            >
              {container.status}
            </span>
          </div>

          {container.image && (
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 truncate">
              {container.image}
            </div>
          )}

          {container.created && (
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              Created {formatRelativeTime(container.created)}
            </div>
          )}

          <div className="flex gap-2">
            {container.status.toLowerCase() === 'running' ? (
              <button className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-sm bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded transition-colors">
                <Square className="w-3 h-3" />
                Stop
              </button>
            ) : (
              <button className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-sm bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 rounded transition-colors">
                <Play className="w-3 h-3" />
                Start
              </button>
            )}
            <button className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-sm bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded transition-colors">
              <RefreshCw className="w-3 h-3" />
              Restart
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

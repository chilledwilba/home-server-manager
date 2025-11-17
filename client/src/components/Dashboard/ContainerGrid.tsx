import { Container, Play, RefreshCw, Square } from 'lucide-react';
import { formatRelativeTime } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

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
    return <div className="text-center py-8 text-muted-foreground">No containers found</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {containers.map((container) => (
        <Card key={container.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Container className="w-5 h-5 text-primary" />
                <span className="truncate">{container.name}</span>
              </CardTitle>
              <Badge
                variant={container.status.toLowerCase() === 'running' ? 'default' : 'secondary'}
              >
                {container.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {container.image && (
              <div className="text-sm text-muted-foreground truncate">{container.image}</div>
            )}

            {container.created && (
              <div className="text-xs text-muted-foreground">
                Created {formatRelativeTime(container.created)}
              </div>
            )}

            <div className="flex gap-2">
              {container.status.toLowerCase() === 'running' ? (
                <Button variant="destructive" size="sm" className="flex-1">
                  <Square className="w-3 h-3 mr-1" />
                  Stop
                </Button>
              ) : (
                <Button variant="default" size="sm" className="flex-1">
                  <Play className="w-3 h-3 mr-1" />
                  Start
                </Button>
              )}
              <Button variant="outline" size="sm" className="flex-1">
                <RefreshCw className="w-3 h-3 mr-1" />
                Restart
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

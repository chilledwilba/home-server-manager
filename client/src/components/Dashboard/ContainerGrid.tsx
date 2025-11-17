import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Container, Play, RefreshCw, Square } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/utils';

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
  const queryClient = useQueryClient();

  const startMutation = useMutation({
    mutationFn: (containerId: string) => apiClient.startContainer(containerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container started successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to start container', {
        description: error.message,
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (containerId: string) => apiClient.stopContainer(containerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container stopped successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to stop container', {
        description: error.message,
      });
    },
  });

  const restartMutation = useMutation({
    mutationFn: (containerId: string) => apiClient.restartContainer(containerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container restarted successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to restart container', {
        description: error.message,
      });
    },
  });

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
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      disabled={stopMutation.isPending}
                    >
                      <Square className="w-3 h-3 mr-1" />
                      {stopMutation.isPending ? 'Stopping...' : 'Stop'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Stop Container?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to stop "{container.name}"? This will gracefully shut
                        down the container.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => stopMutation.mutate(container.id)}>
                        Stop Container
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  onClick={() => startMutation.mutate(container.id)}
                  disabled={startMutation.isPending}
                >
                  <Play className="w-3 h-3 mr-1" />
                  {startMutation.isPending ? 'Starting...' : 'Start'}
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={restartMutation.isPending}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    {restartMutation.isPending ? 'Restarting...' : 'Restart'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restart Container?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to restart "{container.name}"? This will stop and then
                      start the container.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => restartMutation.mutate(container.id)}>
                      Restart Container
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

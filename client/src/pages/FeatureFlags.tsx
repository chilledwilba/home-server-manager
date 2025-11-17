import { useQuery } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api-client';

export function FeatureFlags() {
  const { data, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => apiClient.getFeatureFlags(),
  });

  if (isLoading) {
    const FlagSkeleton = () => (
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-6 w-16" />
      </div>
    );

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <FlagSkeleton />
              <FlagSkeleton />
              <FlagSkeleton />
              <FlagSkeleton />
              <FlagSkeleton />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const flags = data?.flags || {};
  const flagEntries = Object.entries(flags);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Flag className="w-6 h-6" />
          Feature Flags
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Feature Flags</CardTitle>
          <CardDescription>
            View the current state of feature flags in the system. These control which features are
            enabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flagEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No feature flags configured
            </div>
          ) : (
            <div className="space-y-3">
              {flagEntries.map(([name, flag], index) => (
                <div
                  key={name}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors animate-in fade-in"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{name}</h3>
                      <Badge variant={flag.enabled ? 'default' : 'secondary'}>
                        {flag.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    {flag.description && (
                      <p className="text-sm text-muted-foreground">{flag.description}</p>
                    )}
                    {flag.environments && flag.environments.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {flag.environments.map((env) => (
                          <Badge key={env} variant="outline" className="text-xs">
                            {env}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

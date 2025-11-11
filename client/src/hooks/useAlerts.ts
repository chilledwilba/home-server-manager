import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

interface AlertParams {
  severity?: string;
  resolved?: boolean;
  limit?: number;
}

export function useAlerts(params?: AlertParams) {
  return useQuery({
    queryKey: ['alerts', params],
    queryFn: () => apiClient.getAlerts(params),
    refetchInterval: 10000, // 10 seconds
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ alertId, userId }: { alertId: string; userId: string }) =>
      apiClient.acknowledgeAlert(alertId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      alertId,
      userId,
      resolution,
    }: {
      alertId: string;
      userId: string;
      resolution: string;
    }) => apiClient.resolveAlert(alertId, userId, resolution),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

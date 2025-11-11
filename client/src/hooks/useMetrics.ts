import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export function useMetrics() {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: () => apiClient.getMetrics(),
    refetchInterval: 30000, // 30 seconds
  });
}

export function usePools() {
  return useQuery({
    queryKey: ['pools'],
    queryFn: () => apiClient.getPools(),
    refetchInterval: 60000, // 1 minute
  });
}

export function useContainers() {
  return useQuery({
    queryKey: ['containers'],
    queryFn: () => apiClient.getContainers(),
    refetchInterval: 30000, // 30 seconds
  });
}

export function useSecurityStatus() {
  return useQuery({
    queryKey: ['security'],
    queryFn: () => apiClient.getSecurityStatus(),
    refetchInterval: 60000, // 1 minute
  });
}

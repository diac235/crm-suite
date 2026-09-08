import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import type { Bootstrap, Option } from '../types';

/** Catálogos maestros compartidos por todos los formularios. */
export function useCatalogs() {
  return useQuery({
    queryKey: ['catalogs', 'bootstrap'],
    queryFn: () => apiGet<Bootstrap>('/catalogs/bootstrap'),
    staleTime: 5 * 60_000,
  });
}

export function useUserOptions() {
  return useQuery({
    queryKey: ['users', 'options'],
    queryFn: () => apiGet<Option[]>('/users/options'),
    staleTime: 5 * 60_000,
  });
}

export function useContactOptions(clientId?: string | null) {
  return useQuery({
    queryKey: ['contacts', 'options', clientId],
    queryFn: () => apiGet<Option[]>('/contacts/options', clientId ? { clientId } : undefined),
    enabled: Boolean(clientId),
    staleTime: 60_000,
  });
}

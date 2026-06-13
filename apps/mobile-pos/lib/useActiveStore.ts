import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { mobileApi } from './api';

interface Store {
  id: string;
  name: string;
}

/**
 * Resolves the business + store the app should operate on.
 *
 * Email login does not return a storeId (only PIN login can carry one), so
 * when it's absent we fetch the business's stores and use the first one —
 * the same resolution the web app does. Returns empty strings until the
 * user is known; query consumers must gate with `enabled: !!storeId`.
 */
export function useActiveStore() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';

  const { data: stores } = useQuery<Store[]>({
    queryKey: ['stores', businessId],
    queryFn: () => mobileApi.get<Store[]>(`/business/${businessId}/stores`),
    enabled: !!businessId && !user?.storeId,
    staleTime: 30 * 60 * 1000,
  });

  return {
    businessId,
    storeId: user?.storeId ?? stores?.[0]?.id ?? '',
  };
}

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { useActiveStoreOverride } from '../stores/activeStore';
import { mobileApi } from './api';

export interface Store {
  id: string;
  name: string;
}

/**
 * Resolves the business + store the app should operate on.
 *
 * Resolution order for the store:
 *   1. an explicit override chosen via the store switcher (multi-store owners),
 *   2. the storeId carried by a PIN login,
 *   3. the business's first store (email login carries no storeId — same
 *      fallback the web app uses).
 *
 * Returns empty strings until the user is known; query consumers must gate with
 * `enabled: !!storeId`. Also returns the full store list so the switcher and
 * transfer screens can offer a destination.
 */
export function useActiveStore() {
  const user = useAuthStore((s) => s.user);
  const override = useActiveStoreOverride((s) => s.overrideStoreId);
  const businessId = user?.businessId ?? '';

  const { data: stores } = useQuery<Store[]>({
    queryKey: ['stores', businessId],
    queryFn: () => mobileApi.get<Store[]>(`/business/${businessId}/stores`),
    enabled: !!businessId,
    staleTime: 30 * 60 * 1000,
  });

  const list = stores ?? [];
  const resolved =
    (override && list.some((s) => s.id === override) ? override : null) ??
    override ??
    user?.storeId ??
    list[0]?.id ??
    '';

  return {
    businessId,
    storeId: resolved,
    stores: list,
  };
}

import { useQuery } from '@tanstack/react-query';
import { hasRestaurantAccess, parseEnabledModules, type OptionalModule } from '@pos/shared';
import { api } from './api';
import { useAuthStore } from '../stores/auth';

interface ModuleSettings {
  posMode?: string;
  enabledModules?: string | string[] | null;
}

/**
 * The business's main till plus any optional modules switched on next to it.
 *
 * Shares the app shell's `business-settings` query, so this costs no extra
 * request. `restaurant` is true for a restaurant till AND for any other business
 * (a fuel station, a hotel shop) that enabled the Restaurant module, which is
 * what decides whether tables, the kitchen display and station/prep-time fields
 * are shown.
 */
export function useBusinessModules() {
  const businessId = useAuthStore((s) => s.user?.businessId);
  const { data } = useQuery<ModuleSettings>({
    queryKey: ['business-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const modules: OptionalModule[] = parseEnabledModules(data?.enabledModules);
  return {
    posMode: data?.posMode ?? 'RETAIL',
    modules,
    restaurant: hasRestaurantAccess(data?.posMode, data?.enabledModules),
  };
}

export const useRestaurantAccess = () => useBusinessModules().restaurant;

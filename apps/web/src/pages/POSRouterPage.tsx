import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import POSPage from './POSPage';
import SupermarketPOSPage from './SupermarketPOSPage';

/**
 * Thin wrapper that reads the business posMode and renders the correct POS UI.
 * This must be a separate component so neither POSPage nor SupermarketPOSPage
 * violates the Rules of Hooks with conditional early returns.
 */
export default function POSRouterPage() {
  const user = useAuthStore((s) => s.user);

  const { data: posMode } = useQuery<string>({
    queryKey: ['pos-mode', user?.businessId],
    queryFn: () =>
      api.get<any>(`/business/${user?.businessId}/settings`)
        .then((d) => d.posMode ?? 'RETAIL'),
    enabled: !!user?.businessId,
    staleTime: 5 * 60_000,
  });

  // While loading, render standard POS (it will swap once posMode resolves)
  if (posMode === 'SUPERMARKET') {
    return <SupermarketPOSPage />;
  }

  return <POSPage />;
}

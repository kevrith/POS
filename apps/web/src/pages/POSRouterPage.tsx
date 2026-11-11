import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import { readLastKnown } from '../lib/lastKnown';
import { tillStateFor } from '../lib/mainTill';
import { ErrorState } from '../components/ui';
import POSPage from './POSPage';
import SupermarketPOSPage from './SupermarketPOSPage';
import { lazy, Suspense } from 'react';
import { ShoppingCart } from 'lucide-react';

// Lazy-load specialised POS UIs so they don't bloat the main bundle
const HospitalityPage    = lazy(() => import('./HospitalityPage'));
const FuelPumpPage       = lazy(() => import('./FuelPumpPage'));
const CybercafePage      = lazy(() => import('./CybercafePage'));

function POSLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 dark:text-white/30">
      <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/10 flex items-center justify-center">
        <ShoppingCart className="w-5 h-5 text-blue-500" />
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-blue-500/60 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Reads the business posMode and renders the correct POS UI.
 * Keeping this as a router component means neither sub-page
 * violates the Rules of Hooks with conditional early returns.
 */
export default function POSRouterPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId;

  // The same query the menu uses, so changing the kind of business changes the till at once. This used to have a query of
  // its own that nothing refreshed: after the business type was changed the menu said "Fuel Forecourt" and the till
  // stayed the shop till for minutes (until a reload). When settings cannot be read it used to fall back to the shop till too.
  const { data, isLoading, refetch, error } = useQuery<{ posMode?: string | null }>({
    queryKey: ['business-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 10 * 60_000,
    retry: false,
    initialData: () => (businessId ? readLastKnown<{ posMode?: string }>(`settings:${businessId}`) : undefined),
  });
  const posMode = tillStateFor(data, isLoading);

  if (posMode === 'loading') return <POSLoader />;
  if (posMode === 'unknown') return <ErrorState error={error} onRetry={() => void refetch()} subject="your till" />;

  switch (posMode) {
    case 'SUPERMARKET':
      return <SupermarketPOSPage />;

    case 'HOSPITALITY':
    case 'FAST_FOOD':
    case 'BAR_TAB':
      return (
        <Suspense fallback={<POSLoader />}>
          <HospitalityPage />
        </Suspense>
      );

    case 'FUEL_PUMP':
      return (
        <Suspense fallback={<POSLoader />}>
          <FuelPumpPage />
        </Suspense>
      );

    case 'CYBERCAFE':
      return (
        <Suspense fallback={<POSLoader />}>
          <CybercafePage />
        </Suspense>
      );

    // RETAIL, CLINIC, SALON, and any unknown mode → standard POS
    default:
      return <POSPage />;
  }
}

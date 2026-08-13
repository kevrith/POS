import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { mobileApi } from './api';
import {
  normalizePosMode,
  hasCapability,
  posModeLabel,
  type Capability,
  type PosMode,
} from './posMode';

interface BusinessSettings {
  posMode?: string;
}

/**
 * Resolves the business's posMode once and shares it across every screen.
 *
 * Cached for 10 minutes under a stable key — the mode changes about once in the
 * lifetime of a business, and several screens (tab bar, Manage grid, POS) all
 * ask for it on mount, so refetching per screen would be pure waste. Settings
 * invalidates `['pos-mode']` after a change so the UI re-gates immediately.
 *
 * Falls back to RETAIL while loading, which is what the app already did for
 * every business before this layer existed — so a slow network degrades to the
 * old behaviour instead of a blank screen.
 */
export function usePosMode() {
  const businessId = useAuthStore((s) => s.user?.businessId) ?? '';

  const { data, isLoading } = useQuery<BusinessSettings>({
    queryKey: ['pos-mode', businessId],
    queryFn: () => mobileApi.get<BusinessSettings>(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 10 * 60 * 1000,
  });

  const mode: PosMode = normalizePosMode(data?.posMode);

  return {
    mode,
    label: posModeLabel(mode),
    isLoading,
    /** `can('tables')` — reads better than threading `mode` into every helper. */
    can: (cap: Capability) => hasCapability(mode, cap),
  };
}

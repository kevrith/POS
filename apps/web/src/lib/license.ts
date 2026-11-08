import { useQuery } from '@tanstack/react-query';
import api from './api';
import type { LicenseStatus } from './licenseNotice';

export { licenseNotice, type LicenseNotice, type LicenseStatus, type LicenseTone } from './licenseNotice';

/** The licence, asked of this computer's server. Slow to refresh: the dates only change by the day. */
export function useLicense() {
  return useQuery<LicenseStatus>({
    queryKey: ['license-status'],
    queryFn: () => api.get<LicenseStatus>('/license/status'),
    staleTime: 5 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: false,
  });
}

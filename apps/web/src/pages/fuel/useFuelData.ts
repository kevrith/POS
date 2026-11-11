import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import type { FleetAccount, Grade, Pump, Shift, Tank } from './types';

/** Who is looking and which station: every fuel call is for the signed-in user's business and store. */
export function useFuelScope() {
  const user = useAuthStore((s) => s.user);
  const role = String(user?.role ?? '');
  return {
    user,
    businessId: user?.businessId ?? '',
    storeId: user?.storeId ?? '',
    role,
    isManager: ['OWNER', 'ADMIN', 'MANAGER'].includes(role),
  };
}

export function useGrades() {
  const { businessId, storeId } = useFuelScope();
  return useQuery({ queryKey: ['fuel-grades', businessId, storeId], queryFn: () => api.get<Grade[]>(`/fuel-pump/grades?businessId=${businessId}&storeId=${storeId}`), enabled: !!storeId });
}

export function usePumps() {
  const { businessId, storeId } = useFuelScope();
  return useQuery({ queryKey: ['fuel-pumps', businessId, storeId], queryFn: () => api.get<Pump[]>(`/fuel-pump/pumps?businessId=${businessId}&storeId=${storeId}`), enabled: !!storeId, refetchInterval: 15000 });
}

export function useTanks() {
  const { businessId, storeId } = useFuelScope();
  return useQuery({ queryKey: ['fuel-tanks', businessId, storeId], queryFn: () => api.get<Tank[]>(`/fuel-pump/tanks?businessId=${businessId}&storeId=${storeId}`), enabled: !!storeId });
}

export function useOpenShift() {
  const { businessId, storeId } = useFuelScope();
  return useQuery({
    queryKey: ['fuel-open-shift', businessId, storeId],
    queryFn: async () => (await api.get<Shift | null>(`/fuel-pump/shifts/open?businessId=${businessId}&storeId=${storeId}`)) ?? null,
    enabled: !!storeId,
    refetchInterval: 20000,
  });
}

export function useFleetAccounts(enabled = true) {
  const { businessId } = useFuelScope();
  return useQuery({ queryKey: ['fleet-accounts', businessId], queryFn: () => api.get<FleetAccount[]>(`/fuel-pump/fleet?businessId=${businessId}`), enabled: enabled && !!businessId });
}

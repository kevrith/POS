import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Clock, CheckCircle, RefreshCw, X, Crown, User, AlertTriangle, Timer } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

interface KOTItem {
  id: string;
  name: string;
  quantity: number;
  specialInstructions?: string;
  item?: { prepTimeMinutes: number };
}

interface KDSOrder {
  id: string;
  kotNumber: number;
  type: string;
  status: string;
  createdAt: string;
  priority: number;
  estimatedReadyAt?: string;
  estimatedPrepMinutes?: number;
  assignedChef?: { id: string; name: string } | null;
  order: {
    id: string;
    priority: number;
    isVIP: boolean;
    table?: { number: string };
    roomNumber?: string;
    waiter: { id: string; name: string };
    items: KOTItem[];
  };
}

// Chefs advance to READY only — waiters mark SERVED from the order panel
const STATUS_NEXT: Record<string, string> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'READY',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Start Preparing',
  IN_PROGRESS: 'Mark Ready',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'border-orange-400 bg-orange-950/80',
  IN_PROGRESS: 'border-yellow-400 bg-yellow-950/80',
  READY: 'border-green-400 bg-green-950/80',
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-orange-500 text-white',
  IN_PROGRESS: 'bg-yellow-400 text-black',
  READY: 'bg-green-500 text-white',
};

function getAgeMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function getRemainingMinutes(estimatedReadyAt?: string): number | null {
  if (!estimatedReadyAt) return null;
  return Math.ceil((new Date(estimatedReadyAt).getTime() - Date.now()) / 60000);
}

function formatCountdown(mins: number): string {
  if (mins <= 0) return 'OVERDUE';
  if (mins === 1) return '1 min';
  return `${mins} mins`;
}

export default function KDSPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const storeId = user?.storeId ?? '';
  const businessId = user?.businessId ?? '';
  const [countdown, setCountdown] = useState(10);
  const [tick, setTick] = useState(0);

  const { data: bizSettings } = useQuery<{ tablePrefix?: string | null }>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 60_000,
  });
  const tablePrefix = bizSettings?.tablePrefix ?? 'T';

  const { data: orders = [], isFetching } = useQuery<KDSOrder[]>({
    queryKey: ['kds-orders', storeId],
    queryFn: () => api.get<KDSOrder[]>(`/hospitality/kds/orders?storeId=${storeId}`),
    enabled: !!storeId,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) return 10;
        return c - 1;
      });
      setTick(t => t + 1); // force re-render for countdowns
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isFetching) setCountdown(10);
  }, [isFetching]);

  const updateStatusMutation = useMutation({
    mutationFn: ({ kotId, status }: { kotId: string; status: string }) =>
      api.patch(`/hospitality/kot/${kotId}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kds-orders'] });
    },
  });

  const handleAdvance = useCallback((kot: KDSOrder) => {
    const nextStatus = STATUS_NEXT[kot.status];
    if (!nextStatus) return;
    updateStatusMutation.mutate({ kotId: kot.id, status: nextStatus });
  }, [updateStatusMutation]);

  const activeOrders = orders.filter((o) => o.status !== 'SERVED');
  const pendingCount = activeOrders.filter(o => o.status === 'PENDING').length;
  const inProgressCount = activeOrders.filter(o => o.status === 'IN_PROGRESS').length;
  const readyCount = activeOrders.filter(o => o.status === 'READY').length;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col" data-tick={tick}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <ChefHat className="w-6 h-6 text-orange-400" />
          <div>
            <h1 className="text-xl font-bold">Kitchen Display</h1>
            <p className="text-xs text-gray-400">{user?.name} · Store {storeId}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Status counts */}
          <div className="hidden md:flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>{pendingCount} pending</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>{inProgressCount} preparing</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>{readyCount} ready</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-400' : ''}`} />
            <span>{countdown}s</span>
          </div>
          <button onClick={() => window.history.back()} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* KOT Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <CheckCircle className="w-16 h-16 mb-4 text-green-600" />
            <p className="text-xl font-medium">All clear!</p>
            <p className="text-sm mt-1">No pending orders</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {activeOrders.map((kot) => {
              const ageMin = getAgeMinutes(kot.createdAt);
              const remainingMins = getRemainingMinutes(kot.estimatedReadyAt);
              const isOverdue = remainingMins !== null && remainingMins <= 0 && kot.status === 'IN_PROGRESS';
              const isUrgent = ageMin > 15 && kot.status === 'PENDING';
              const rawNum = kot.order.table?.number ?? '';
              const tableLabel = kot.order.table
                ? (/\D/.test(rawNum) ? rawNum : `${tablePrefix}${rawNum}`)
                : kot.order.roomNumber
                ? `Rm ${kot.order.roomNumber}`
                : 'Takeaway';
              const isVIP = kot.order.isVIP;
              const hasPriority = kot.order.priority > 0 || kot.priority > 0;

              return (
                <div
                  key={kot.id}
                  className={`rounded-xl border-2 p-4 flex flex-col gap-3 transition-all ${
                    STATUS_COLORS[kot.status] ?? 'border-gray-600 bg-gray-800'
                  } ${isOverdue || isUrgent ? 'animate-pulse' : ''}`}
                >
                  {/* Priority / VIP badge */}
                  {(isVIP || hasPriority) && (
                    <div className="flex gap-1.5">
                      {isVIP && (
                        <span className="flex items-center gap-1 bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                          <Crown className="w-3 h-3" /> VIP
                        </span>
                      )}
                      {!isVIP && hasPriority && (
                        <span className="flex items-center gap-1 bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                          Priority
                        </span>
                      )}
                    </div>
                  )}

                  {/* KOT header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-2xl font-bold">{tableLabel}</div>
                      <div className="text-xs text-gray-400">KOT #{kot.kotNumber}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[kot.status] ?? 'bg-gray-600 text-white'}`}>
                        {kot.status.replace('_', ' ')}
                      </span>
                      <div className={`flex items-center gap-1 text-xs ${isUrgent ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                        <Clock className="w-3 h-3" />
                        {ageMin}m ago
                      </div>
                    </div>
                  </div>

                  {/* Waiter info */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-300 bg-black/20 rounded-lg px-2 py-1.5">
                    <User className="w-3 h-3 text-blue-400" />
                    <span className="truncate">Waiter: <strong>{kot.order.waiter.name}</strong></span>
                  </div>

                  {/* Chef info (when IN_PROGRESS) */}
                  {kot.assignedChef && (
                    <div className="flex items-center gap-1.5 text-xs text-yellow-200 bg-yellow-900/30 rounded-lg px-2 py-1.5">
                      <ChefHat className="w-3 h-3 text-yellow-400" />
                      <span className="truncate">Chef: <strong>{kot.assignedChef.name}</strong></span>
                    </div>
                  )}

                  {/* Estimated time */}
                  {kot.status === 'IN_PROGRESS' && remainingMins !== null && (
                    <div className={`flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 ${
                      isOverdue
                        ? 'bg-red-900/40 text-red-300 font-bold'
                        : remainingMins <= 2
                        ? 'bg-orange-900/40 text-orange-300'
                        : 'bg-black/20 text-gray-300'
                    }`}>
                      <Timer className="w-3 h-3" />
                      {isOverdue ? (
                        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> OVERDUE</span>
                      ) : (
                        <span>Ready in ~{formatCountdown(remainingMins)}</span>
                      )}
                    </div>
                  )}
                  {kot.status === 'PENDING' && kot.estimatedPrepMinutes && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-black/20 rounded-lg px-2 py-1.5">
                      <Timer className="w-3 h-3" />
                      <span>Est. prep: {kot.estimatedPrepMinutes} min</span>
                    </div>
                  )}

                  {/* Items */}
                  <div className="flex-1 space-y-1.5 min-h-0">
                    {kot.order.items.map((item) => (
                      <div key={item.id} className="bg-black/30 rounded-lg px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium leading-tight">{item.name}</span>
                          <span className="text-lg font-bold text-white shrink-0">×{item.quantity}</span>
                        </div>
                        {item.item?.prepTimeMinutes && (
                          <div className="text-[10px] text-gray-500 mt-0.5">{item.item.prepTimeMinutes} min prep</div>
                        )}
                        {item.specialInstructions && (
                          <div className="text-xs text-yellow-300 mt-1 italic">★ {item.specialInstructions}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Action button — chef stops at READY */}
                  {STATUS_NEXT[kot.status] ? (
                    <button
                      onClick={() => handleAdvance(kot)}
                      disabled={updateStatusMutation.isPending}
                      className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-60 active:scale-95 ${
                        kot.status === 'PENDING'
                          ? 'bg-orange-500 hover:bg-orange-400 text-white'
                          : 'bg-yellow-400 hover:bg-yellow-300 text-black'
                      }`}
                    >
                      {STATUS_LABEL[kot.status]} →
                    </button>
                  ) : kot.status === 'READY' ? (
                    <div className="w-full py-2 rounded-lg bg-green-900/40 border border-green-500/40 text-green-300 text-xs font-semibold text-center flex items-center justify-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5" />
                      At the pass — waiter collecting
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

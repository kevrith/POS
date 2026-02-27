import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Clock, CheckCircle, RefreshCw, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

interface KDSOrder {
  id: string;
  kotNumber: number;
  type: string;
  status: string;
  createdAt: string;
  order: {
    id: string;
    table?: { number: string };
    roomNumber?: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      specialInstructions?: string;
    }>;
  };
}

const STATUS_NEXT: Record<string, string> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'READY',
  READY: 'SERVED',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Start',
  IN_PROGRESS: 'Ready',
  READY: 'Served',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'border-orange-400 bg-orange-950',
  IN_PROGRESS: 'border-yellow-400 bg-yellow-950',
  READY: 'border-green-400 bg-green-950',
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-orange-500 text-white',
  IN_PROGRESS: 'bg-yellow-500 text-black',
  READY: 'bg-green-500 text-white',
};

function getAgeMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

export default function KDSPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const storeId = user?.storeId ?? '';
  const [countdown, setCountdown] = useState(10);

  const { data: orders = [], isFetching } = useQuery<KDSOrder[]>({
    queryKey: ['kds-orders', storeId],
    queryFn: () => api.get<KDSOrder[]>(`/hospitality/kds/orders?storeId=${storeId}`),
    enabled: !!storeId,
    refetchInterval: 10_000,
  });

  // Countdown timer for visual refresh indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) return 10;
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Reset countdown on actual fetch
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

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <ChefHat className="w-6 h-6 text-orange-400" />
          <div>
            <h1 className="text-xl font-bold">Kitchen Display</h1>
            <p className="text-xs text-gray-400">{user?.name} · {storeId}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-400' : ''}`} />
            <span>Refresh in {countdown}s</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {activeOrders.length} order{activeOrders.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={() => window.history.back()}
            className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white"
            title="Exit Kitchen Display"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex items-center gap-4 px-6 py-2 bg-gray-900/50 border-b border-gray-800 shrink-0">
        {['PENDING', 'IN_PROGRESS', 'READY'].map((s) => (
          <div key={s} className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[s]}`}>
              {s.replace('_', ' ')}
            </span>
          </div>
        ))}
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
              const isOld = ageMin > 15;
              const tableLabel = kot.order.table
                ? `T${kot.order.table.number}`
                : kot.order.roomNumber
                ? `Room ${kot.order.roomNumber}`
                : 'Takeaway';

              return (
                <div
                  key={kot.id}
                  className={`rounded-xl border-2 p-4 flex flex-col gap-3 ${
                    STATUS_COLORS[kot.status] ?? 'border-gray-600 bg-gray-800'
                  } ${isOld ? 'animate-pulse' : ''}`}
                >
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
                      <div className={`flex items-center gap-1 text-xs ${isOld ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                        <Clock className="w-3 h-3" />
                        {ageMin}m
                      </div>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="flex-1 space-y-2 min-h-0">
                    {kot.order.items.map((item) => (
                      <div key={item.id} className="bg-black/30 rounded-lg px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium leading-tight">{item.name}</span>
                          <span className="text-lg font-bold text-white shrink-0">×{item.quantity}</span>
                        </div>
                        {item.specialInstructions && (
                          <div className="text-xs text-yellow-300 mt-1 italic">
                            ★ {item.specialInstructions}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Action button */}
                  {STATUS_NEXT[kot.status] && (
                    <button
                      onClick={() => handleAdvance(kot)}
                      disabled={updateStatusMutation.isPending}
                      className={`w-full py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-60 ${
                        kot.status === 'PENDING'
                          ? 'bg-orange-500 hover:bg-orange-400 text-white'
                          : kot.status === 'IN_PROGRESS'
                          ? 'bg-yellow-400 hover:bg-yellow-300 text-black'
                          : 'bg-green-500 hover:bg-green-400 text-white'
                      }`}
                    >
                      {STATUS_LABEL[kot.status]} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

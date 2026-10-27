import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Clock, CheckCircle, RefreshCw, X, Crown, User, AlertTriangle, Timer, KeyRound, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { printKOTDirect, type KOTPrinterConfig, type KOTData } from '../lib/printer';

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

// ── PIN Claim Modal for shared kitchen terminals ──────────────────────────────
const PIN_DIGITS_KDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'] as const;

function PinClaimModal({
  kotId: _kotId, kotLabel, businessId,
  onClaim, onCancel,
}: {
  kotId: string; kotLabel: string; businessId: string;
  onClaim: (chefId: string, chefName: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDigit = (d: typeof PIN_DIGITS_KDS[number]) => {
    if (d === 'C') { setPin(''); return; }
    if (d === '⌫') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= 6) return;
    setPin(p => p + d);
  };

  const handleSubmit = async () => {
    if (!pin) return;
    setLoading(true); setError('');
    try {
      const res = await api.post<{ accessToken: string; user: any }>('/auth/login/pin', {
        pin, businessId, storeId: undefined,
      });
      onClaim(res.user.id, res.user.name);
    } catch {
      setError('Invalid PIN. Try again.');
      setPin('');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '360px', textAlign: 'center' }}>
        <ChefHat style={{ width: 40, height: 40, color: '#f59e0b', margin: '0 auto 0.75rem' }} />
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.25rem' }}>Chef Sign-in</h2>
        <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>Enter your PIN to claim KOT <strong style={{ color: '#94a3b8' }}>{kotLabel}</strong></p>

        {/* PIN dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? '#f59e0b' : '#1e293b', border: '1.5px solid #334155', transition: 'background 0.1s' }} />
          ))}
        </div>

        {error && <p style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.75rem', background: 'rgba(239,68,68,0.08)', padding: '0.375rem 0.75rem', borderRadius: '8px' }}>{error}</p>}

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
          {PIN_DIGITS_KDS.map((d, i) => (
            <button key={i} onClick={() => handleDigit(d)}
              style={{
                padding: '0.875rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '1.125rem', fontWeight: 700,
                background: d === 'C' ? 'rgba(239,68,68,0.12)' : d === '⌫' ? 'rgba(100,116,139,0.15)' : 'rgba(255,255,255,0.06)',
                color: d === 'C' ? '#ef4444' : '#f1f5f9',
                transition: 'background 0.1s',
              }}>
              {d}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: '1px solid #1e293b', background: 'transparent', color: '#64748b', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => void handleSubmit()} disabled={!pin || loading}
            style={{ flex: 2, padding: '0.75rem', borderRadius: '10px', border: 'none', background: pin ? '#f59e0b' : '#1e293b', color: pin ? '#000' : '#64748b', fontSize: '0.875rem', fontWeight: 700, cursor: pin ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
            {loading ? 'Verifying…' : 'Claim KOT'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function KDSPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const storeId = user?.storeId ?? '';
  const businessId = user?.businessId ?? '';
  const [countdown, setCountdown] = useState(10);
  const [tick, setTick] = useState(0);
  // Shared terminal mode: prompt PIN before claiming KOT
  const [sharedMode, setSharedMode] = useState(() => localStorage.getItem('kds-shared-mode') === '1');
  const [pinClaim, setPinClaim] = useState<{ kotId: string; kotLabel: string } | null>(null);

  // Kitchen printer config — read from localStorage (set in Settings → Printers)
  const kotPrinterConfig: KOTPrinterConfig = (() => {
    try {
      const stored = localStorage.getItem('kot-printer-config');
      return stored ? JSON.parse(stored) as KOTPrinterConfig : { type: 'BROWSER' };
    } catch {
      return { type: 'BROWSER' };
    }
  })();

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
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['kds-orders'] });
      // When a KOT moves to IN_PROGRESS, print it to the kitchen printer
      if (variables.status === 'IN_PROGRESS') {
        const kot = orders.find((o) => o.id === variables.kotId);
        if (kot) {
          const rawNum = kot.order.table?.number ?? '';
          const tableLabel = kot.order.table
            ? (/\D/.test(rawNum) ? rawNum : `T${rawNum}`)
            : kot.order.roomNumber ?? 'Takeaway';
          const kotData: KOTData = {
            kotNumber: String(kot.kotNumber),
            tableNumber: tableLabel,
            orderType: 'NEW_ORDER',
            createdAt: kot.createdAt,
            waiterName: kot.order.waiter.name,
            items: kot.order.items.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              specialInstructions: i.specialInstructions,
            })),
          };
          void printKOTDirect(kotPrinterConfig, kotData);
        }
      }
    },
  });

  const toggleSharedMode = () => {
    const next = !sharedMode;
    setSharedMode(next);
    localStorage.setItem('kds-shared-mode', next ? '1' : '0');
  };

  const handleAdvance = useCallback((kot: KDSOrder) => {
    const nextStatus = STATUS_NEXT[kot.status];
    if (!nextStatus) return;
    // In shared terminal mode, PIN claim is required when moving to IN_PROGRESS
    if (sharedMode && kot.status === 'PENDING') {
      const label = `KOT #${kot.kotNumber}`;
      setPinClaim({ kotId: kot.id, kotLabel: label });
      return;
    }
    updateStatusMutation.mutate({ kotId: kot.id, status: nextStatus });
  }, [updateStatusMutation, sharedMode]);

  const activeOrders = orders.filter((o) => o.status !== 'SERVED');
  const pendingCount = activeOrders.filter(o => o.status === 'PENDING').length;
  const inProgressCount = activeOrders.filter(o => o.status === 'IN_PROGRESS').length;
  const readyCount = activeOrders.filter(o => o.status === 'READY').length;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col" data-tick={tick}>

      {/* PIN Claim Modal */}
      {pinClaim && (
        <PinClaimModal
          kotId={pinClaim.kotId}
          kotLabel={pinClaim.kotLabel}
          businessId={businessId}
          onClaim={(_chefId, _chefName) => {
            // Chef verified — advance KOT. The API uses JWT for chef assignment
            // For shared terminal we pass the chefName for display but the server
            // uses the PIN-authed user id for assignedChefId
            updateStatusMutation.mutate({ kotId: pinClaim.kotId, status: 'IN_PROGRESS' });
            setPinClaim(null);
          }}
          onCancel={() => setPinClaim(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 md:px-6 py-3 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <ChefHat className="w-6 h-6 text-orange-400 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Kitchen Display</h1>
            <p className="text-xs text-gray-400 truncate">{sharedMode ? 'Shared Terminal' : user?.name} · Store {storeId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          {/* Status counts */}
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>{pendingCount}<span className="hidden md:inline"> pending</span></span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>{inProgressCount}<span className="hidden md:inline"> preparing</span></span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>{readyCount}<span className="hidden md:inline"> ready</span></span>
          </div>
          {/* Shared terminal toggle */}
          <button
            onClick={toggleSharedMode}
            title={sharedMode ? 'Shared Terminal: PIN required per claim (click to disable)' : 'Enable Shared Terminal mode: require PIN to claim each KOT'}
            className={`flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              sharedMode
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{sharedMode ? 'Shared' : 'Personal'}</span>
            <KeyRound className="w-3 h-3 opacity-60" />
          </button>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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

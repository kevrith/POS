import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChefHat, Clock, CheckCircle, X, Crown, User, AlertTriangle, Timer, KeyRound, Users,
  Volume2, VolumeX, Radio, RotateCcw, Utensils, Wine, IceCream, LayoutGrid,
} from 'lucide-react';
import { KOT_STATIONS, KOT_STATION_LABELS, type KotStation } from '@pos/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useKdsRealtime } from '../lib/useKdsRealtime';
import { printKOTDirect, type KOTPrinterConfig, type KOTData } from '../lib/printer';
import { toastKotFailure } from '../lib/kotPrintFeedback';

interface KOTItem {
  id: string;
  name: string;
  quantity: number;
  specialInstructions?: string | null;
  /** JSON list of modifier names, or of { name, priceCents } objects. */
  modifiers?: string | null;
  course?: string | null;
  seatNumber?: number | null;
  item?: { prepTimeMinutes: number; allergens?: string | null };
}

interface KDSOrder {
  id: string;
  kotNumber: number;
  type: string;
  station: KotStation;
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

type StationFilter = 'ALL' | KotStation;

const STATION_ICON: Record<StationFilter, typeof Utensils> = {
  ALL: LayoutGrid, KITCHEN: Utensils, BAR: Wine, DESSERT: IceCream,
};

const STATION_FILTER_KEY = 'kds-station';

// Chefs advance to READY only; waiters mark SERVED from the order panel (or here, for non-kitchen roles)
const STATUS_NEXT: Record<string, string> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'READY',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Start preparing',
  IN_PROGRESS: 'Mark ready',
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

const COURSE_LABEL: Record<string, string> = { STARTER: 'Starter', DESSERT: 'Dessert' };

function getAgeMinutes(createdAt: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
}

function getRemainingMinutes(estimatedReadyAt: string | undefined, now: number): number | null {
  if (!estimatedReadyAt) return null;
  return Math.ceil((new Date(estimatedReadyAt).getTime() - now) / 60000);
}

function formatCountdown(mins: number): string {
  if (mins === 1) return '1 min';
  return `${mins} mins`;
}

/** Modifiers are stored as a JSON list of names or of { name, priceCents }. */
function modifierNames(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Array<string | { name?: string }>;
    return Array.isArray(list)
      ? list.map((m) => (typeof m === 'string' ? m : m?.name ?? '')).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function allergenList(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as string[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// ── PIN Claim Modal for shared kitchen terminals ──────────────────────────────
const PIN_DIGITS_KDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'] as const;

function PinClaimModal({
  kotLabel, businessId,
  onClaim, onCancel,
}: {
  kotLabel: string; businessId: string;
  /** The chef's own access token, so the change is made (and recorded) as them. */
  onClaim: (chefToken: string, chefName: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // The cook says who they are first. A PIN alone cannot tell two people apart if
  // they happen to share one, and the ticket is recorded against whoever signs in.
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const { data: staff = [], isLoading: staffLoading } = useQuery<Array<{ id: string; name: string; role: string }>>({
    queryKey: ['kds-staff', businessId],
    queryFn: () => api.get(`/business/${businessId}/staff`),
    enabled: !!businessId,
    staleTime: 5 * 60_000,
  });
  const cooks = staff.filter((u) => ['KITCHEN', 'MANAGER', 'OWNER'].includes(u.role));

  const handleDigit = (d: typeof PIN_DIGITS_KDS[number]) => {
    if (d === 'C') { setPin(''); return; }
    if (d === '⌫') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= 6) return;
    setPin(p => p + d);
  };

  const handleSubmit = async () => {
    if (!pin || !chosen) return;
    setLoading(true); setError('');
    try {
      const res = await api.post<{ accessToken: string; user: any }>('/auth/login/pin', {
        pin, businessId, storeId: undefined, userId: chosen?.id,
      });
      onClaim(res.accessToken, res.user.name);
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
        <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>
          {chosen ? <>Enter your PIN to claim KOT <strong style={{ color: '#94a3b8' }}>{kotLabel}</strong></> : <>Who is claiming KOT <strong style={{ color: '#94a3b8' }}>{kotLabel}</strong>?</>}
        </p>

        {!chosen ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', maxHeight: '45vh', overflowY: 'auto' }}>
              {staffLoading && <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Loading staff…</p>}
              {!staffLoading && cooks.length === 0 && (
                <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No kitchen staff have a PIN yet. Set one under Settings, Users.</p>
              )}
              {cooks.map((u) => (
                <button key={u.id} onClick={() => { setChosen({ id: u.id, name: u.name }); setError(''); setPin(''); }}
                  style={{ minHeight: 48, padding: '0.75rem', borderRadius: '10px', border: '1px solid #1e293b', background: 'rgba(255,255,255,0.06)', color: '#f1f5f9', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
                  {u.name}
                </button>
              ))}
            </div>
            <button onClick={onCancel} style={{ width: '100%', minHeight: 44, borderRadius: '10px', border: '1px solid #1e293b', background: 'transparent', color: '#64748b', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </>
        ) : (
        <>
        <button onClick={() => { setChosen(null); setPin(''); setError(''); }}
          style={{ marginBottom: '0.75rem', background: 'none', border: 'none', color: '#f59e0b', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
          {chosen.name} (change)
        </button>

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
        </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function KDSPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const storeId = user?.storeId ?? '';
  const businessId = user?.businessId ?? '';
  const canServe = user?.role !== 'KITCHEN';
  const [now, setNow] = useState(() => Date.now());
  // Shared terminal mode: prompt PIN before claiming KOT
  const [sharedMode, setSharedMode] = useState(() => localStorage.getItem('kds-shared-mode') === '1');
  const [pinClaim, setPinClaim] = useState<{ kotId: string; kotLabel: string } | null>(null);
  // A bar tablet shows only the bar. The choice sticks to this device.
  const [station, setStation] = useState<StationFilter>(() => {
    const saved = localStorage.getItem(STATION_FILTER_KEY);
    return (KOT_STATIONS as readonly string[]).includes(saved ?? '') ? (saved as KotStation) : 'ALL';
  });
  const { live, soundOn, toggleSound } = useKdsRealtime('kds-orders');

  // Kitchen printer config — read from localStorage (set in Settings → Printers)
  const kotPrinterConfig: KOTPrinterConfig = (() => {
    try {
      const stored = localStorage.getItem('kot-printer-config');
      return stored ? JSON.parse(stored) as KOTPrinterConfig : { type: 'BROWSER' };
    } catch {
      return { type: 'BROWSER' };
    }
  })();

  const { data: bizSettings } = useQuery<{ tablePrefix?: string | null; kitchenMode?: string }>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 60_000,
  });
  const tablePrefix = bizSettings?.tablePrefix ?? 'T';

  const { data: orders = [], isFetching, error: ordersError, refetch: refetchOrders } = useQuery<KDSOrder[]>({
    queryKey: ['kds-orders', storeId],
    queryFn: () => api.get<KDSOrder[]>(`/hospitality/kds/orders?storeId=${storeId}`),
    enabled: !!storeId,
    // The socket pushes changes; polling is only the safety net while it is down.
    refetchInterval: live ? 30_000 : 10_000,
  });

  // Ages and countdowns only need minute accuracy.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const updateStatusMutation = useMutation({
    mutationFn: ({ kotId, status, chefToken }: { kotId: string; status: string; chefToken?: string }) =>
      chefToken
        ? api.patchAs(chefToken, `/hospitality/kot/${kotId}/status`, { status })
        : api.patch(`/hospitality/kot/${kotId}/status`, { status }),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['kds-orders'] });
      void qc.invalidateQueries({ queryKey: ['kds'] });
      // When a KOT moves to IN_PROGRESS, print it to the kitchen printer
      if (variables.status === 'IN_PROGRESS') {
        const kot = orders.find((o) => o.id === variables.kotId);
        if (kot) {
          const kotData: KOTData = {
            kotNumber: String(kot.kotNumber),
            // The printer adds its own table prefix, so hand it the bare number.
            tableNumber: kot.order.table?.number ?? kot.order.roomNumber ?? 'Takeaway',
            orderType: kot.type === 'ADDITION' ? 'ADDITION' : 'NEW_ORDER',
            createdAt: kot.createdAt,
            waiterName: kot.order.waiter.name,
            items: kot.order.items.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              specialInstructions: i.specialInstructions ?? undefined,
              modifiers: modifierNames(i.modifiers),
              station: kot.station,
            })),
          };
          printKOTDirect(kotPrinterConfig, kotData).catch((err: unknown) => {
            toastKotFailure('KOT_FOOD', err instanceof Error ? err.message : 'The printer did not respond', kotData);
          });
        }
      }
    },
    onError: (err: unknown) => {
      // A 409 means another screen moved the ticket first; show the truth, not a stale card.
      toast.error(err instanceof Error ? err.message : 'Could not update the ticket');
      void qc.invalidateQueries({ queryKey: ['kds-orders'] });
    },
  });

  const toggleSharedMode = () => {
    const next = !sharedMode;
    setSharedMode(next);
    localStorage.setItem('kds-shared-mode', next ? '1' : '0');
  };

  const chooseStation = (next: StationFilter) => {
    setStation(next);
    localStorage.setItem(STATION_FILTER_KEY, next);
  };

  const handleAdvance = (kot: KDSOrder, to?: string) => {
    const nextStatus = to ?? STATUS_NEXT[kot.status];
    if (!nextStatus) return;
    // In shared terminal mode, PIN claim is required when starting a ticket
    if (sharedMode && nextStatus === 'IN_PROGRESS' && kot.status === 'PENDING') {
      setPinClaim({ kotId: kot.id, kotLabel: `#${kot.kotNumber}` });
      return;
    }
    updateStatusMutation.mutate({ kotId: kot.id, status: nextStatus });
  };

  const activeOrders = orders.filter((o) => o.status !== 'SERVED');
  const countsByStation = useMemo(() => {
    const c: Record<StationFilter, number> = { ALL: activeOrders.length, KITCHEN: 0, BAR: 0, DESSERT: 0 };
    for (const o of activeOrders) c[o.station] = (c[o.station] ?? 0) + 1;
    return c;
  }, [activeOrders]);
  const visible = station === 'ALL' ? activeOrders : activeOrders.filter((o) => o.station === station);
  const pendingCount = visible.filter(o => o.status === 'PENDING').length;
  const inProgressCount = visible.filter(o => o.status === 'IN_PROGRESS').length;
  const readyCount = visible.filter(o => o.status === 'READY').length;

  const close = () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/');
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col">

      {/* PIN Claim Modal */}
      {pinClaim && (
        <PinClaimModal
          kotLabel={pinClaim.kotLabel}
          businessId={businessId}
          onClaim={(chefToken) => {
            // The change is made under the chef's own token, so the server records
            // the chef who typed their PIN, not the shared terminal's login.
            updateStatusMutation.mutate({ kotId: pinClaim.kotId, status: 'IN_PROGRESS', chefToken });
            setPinClaim(null);
          }}
          onCancel={() => setPinClaim(null)}
        />
      )}

      {/* Header */}
      <div className="shrink-0 bg-gray-900 border-b border-gray-700 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between gap-2 px-3 md:px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <ChefHat className="w-6 h-6 text-orange-400 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold leading-tight">Kitchen Display</h1>
              <p className="text-xs text-slate-400 truncate">{sharedMode ? 'Shared terminal' : user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
            {/* Status counts */}
            <div className="hidden sm:flex items-center gap-3 text-sm mr-1">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>{pendingCount}<span className="hidden lg:inline"> pending</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>{inProgressCount}<span className="hidden lg:inline"> preparing</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>{readyCount}<span className="hidden lg:inline"> ready</span></span>
            </div>
            <span
              title={live ? 'Live: tickets appear the moment they are sent' : 'Reconnecting: refreshing every 10 seconds'}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold border ${
                live ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-gray-800 text-slate-400 border-gray-700'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isFetching && !live ? 'animate-pulse' : ''}`} />
              <span className="hidden md:inline">{live ? 'Live' : 'Polling'}</span>
            </span>
            <button
              onClick={toggleSound}
              aria-pressed={soundOn}
              title={soundOn ? 'Sound on: a chime plays for each new ticket' : 'Turn on the new-ticket chime'}
              className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border ${
                soundOn ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-gray-800 text-slate-400 border-gray-700'
              }`}
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            {/* Shared terminal toggle */}
            <button
              onClick={toggleSharedMode}
              aria-pressed={sharedMode}
              title={sharedMode ? 'Shared terminal: each cook types a PIN to start a ticket (click to turn off)' : 'Turn on shared terminal mode: each cook types a PIN to start a ticket'}
              className={`min-h-[40px] flex items-center gap-1.5 px-2 md:px-3 rounded-lg text-xs font-semibold transition-colors ${
                sharedMode
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-gray-800 text-slate-400 border border-gray-700 hover:text-gray-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{sharedMode ? 'Shared' : 'Personal'}</span>
              <KeyRound className="w-3 h-3 opacity-60" />
            </button>
            <button onClick={close} aria-label="Close kitchen display" className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg hover:bg-gray-700 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Station tabs: one screen per preparation area */}
        <div className="flex gap-2 px-3 md:px-6 pb-3 overflow-x-auto" role="tablist" aria-label="Station">
          {(['ALL', ...KOT_STATIONS] as StationFilter[]).map((st) => {
            const Icon = STATION_ICON[st];
            const active = station === st;
            return (
              <button
                key={st}
                role="tab"
                aria-selected={active}
                onClick={() => chooseStation(st)}
                className={`shrink-0 min-h-[40px] flex items-center gap-2 px-3 rounded-lg text-sm font-semibold border transition-colors ${
                  active ? 'bg-orange-500 text-white border-orange-400' : 'bg-gray-800 text-slate-400 border-gray-700 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {st === 'ALL' ? 'All' : KOT_STATION_LABELS[st]}
                <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-white/25' : 'bg-gray-700'}`}>{countsByStation[st]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {bizSettings?.kitchenMode === 'PRINT_ONLY' && (
        <div className="mx-3 mt-3 md:mx-4 rounded-lg border border-amber-600/40 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-200">
          This business prints its kitchen tickets and does not use a kitchen display, so new orders do not appear here.
          An owner can switch the display on in Settings, General, Kitchen.
        </div>
      )}

      {/* KOT Grid */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!storeId ? (
          // Without a store there is nothing to ask for. Say so, rather than showing an empty screen that looks like "no orders".
          <div className="flex flex-col items-center justify-center h-full text-slate-300 text-center px-6">
            <AlertTriangle className="w-14 h-14 mb-4 text-amber-500" />
            <p className="text-xl font-medium">No store selected for this sign-in</p>
            <p className="text-sm mt-1 text-slate-400">Sign out and sign in again. If this stays, contact your administrator.</p>
          </div>
        ) : ordersError && orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-300 text-center px-6">
            <AlertTriangle className="w-14 h-14 mb-4 text-red-500" />
            <p className="text-xl font-medium">Could not load the kitchen orders</p>
            <p className="text-sm mt-1 text-slate-400">{ordersError instanceof Error ? ordersError.message : 'Please try again.'}</p>
            <button onClick={() => void refetchOrders()} className="mt-4 px-5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-semibold text-white">
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <CheckCircle className="w-16 h-16 mb-4 text-green-600" />
            <p className="text-xl font-medium">All clear!</p>
            <p className="text-sm mt-1">{station === 'ALL' ? 'No pending orders' : `Nothing waiting at ${KOT_STATION_LABELS[station]}`}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            {visible.map((kot) => {
              const ageMin = getAgeMinutes(kot.createdAt, now);
              const remainingMins = getRemainingMinutes(kot.estimatedReadyAt, now);
              const isOverdue = remainingMins !== null && remainingMins <= 0 && kot.status === 'IN_PROGRESS';
              const isLate = ageMin >= 15 && kot.status !== 'READY';
              const isWarm = !isLate && ageMin >= 10 && kot.status !== 'READY';
              const rawNum = kot.order.table?.number ?? '';
              const tableLabel = kot.order.table
                ? (/\D/.test(rawNum) ? rawNum : `${tablePrefix}${rawNum}`)
                : kot.order.roomNumber
                ? `Rm ${kot.order.roomNumber}`
                : 'Takeaway';
              const isVIP = kot.order.isVIP;
              const hasPriority = kot.order.priority > 0 || kot.priority > 0;
              const isAddOn = kot.type === 'ADDITION';
              const StationIcon = STATION_ICON[kot.station] ?? Utensils;

              return (
                <div
                  key={kot.id}
                  className={`rounded-xl border-2 p-4 flex flex-col gap-3 ${
                    isLate || isOverdue ? 'border-red-500 bg-red-950/70' : STATUS_COLORS[kot.status] ?? 'border-gray-600 bg-gray-800'
                  }`}
                >
                  {/* Flags: priority, VIP, add-on to an order already in progress */}
                  {(isVIP || hasPriority || isAddOn) && (
                    <div className="flex flex-wrap gap-1.5">
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
                      {isAddOn && (
                        <span className="bg-sky-400 text-black text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                          + Add-on
                        </span>
                      )}
                    </div>
                  )}

                  {/* Ticket header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-2xl font-bold truncate">{tableLabel}</div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <StationIcon className="w-3 h-3" />
                        <span>#{kot.kotNumber}</span>
                        <span>·</span>
                        <span>{KOT_STATION_LABELS[kot.station] ?? kot.station}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[kot.status] ?? 'bg-gray-600 text-white'}`}>
                        {kot.status.replace('_', ' ')}
                      </span>
                      <div className={`flex items-center gap-1 text-xs ${isLate ? 'text-red-300 font-bold' : isWarm ? 'text-amber-300 font-semibold' : 'text-slate-400'}`}>
                        {isLate ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {ageMin}m{isLate ? ' - late' : ' ago'}
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
                        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Overdue by {Math.abs(remainingMins)}m</span>
                      ) : (
                        <span>Ready in ~{formatCountdown(remainingMins)}</span>
                      )}
                    </div>
                  )}
                  {kot.status === 'PENDING' && kot.estimatedPrepMinutes && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-black/20 rounded-lg px-2 py-1.5">
                      <Timer className="w-3 h-3" />
                      <span>Est. prep: {kot.estimatedPrepMinutes} min</span>
                    </div>
                  )}

                  {/* Items */}
                  <div className="flex-1 space-y-1.5 min-h-0">
                    {kot.order.items.length === 0 && (
                      <div className="text-xs text-slate-400 italic px-1">Items on this ticket were voided</div>
                    )}
                    {kot.order.items.map((item) => {
                      const mods = modifierNames(item.modifiers);
                      const allergens = allergenList(item.item?.allergens);
                      const course = item.course ? COURSE_LABEL[item.course] : undefined;
                      return (
                        <div key={item.id} className="bg-black/30 rounded-lg px-3 py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-base font-semibold leading-tight">{item.name}</span>
                            <span className="text-xl font-bold text-white shrink-0">×{item.quantity}</span>
                          </div>
                          {(course || (item.seatNumber ?? 0) > 0) && (
                            <div className="flex gap-1.5 mt-1">
                              {course && <span className="text-[10px] font-bold uppercase bg-purple-500/30 text-purple-200 px-1.5 py-0.5 rounded">{course}</span>}
                              {(item.seatNumber ?? 0) > 0 && <span className="text-[10px] font-bold uppercase bg-blue-500/30 text-blue-200 px-1.5 py-0.5 rounded">Guest {item.seatNumber}</span>}
                            </div>
                          )}
                          {mods.length > 0 && (
                            <ul className="mt-1 text-sm text-gray-200">
                              {mods.map((m) => <li key={m}>+ {m}</li>)}
                            </ul>
                          )}
                          {item.specialInstructions && (
                            <div className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold text-yellow-200 bg-yellow-500/15 border border-yellow-500/30 rounded px-2 py-1">
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>{item.specialInstructions}</span>
                            </div>
                          )}
                          {allergens.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {allergens.map((a) => (
                                <span key={a} className="text-[10px] font-bold uppercase bg-red-500/80 text-white px-1.5 py-0.5 rounded">{a}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions. A bar has nothing to cook, so a drink goes straight to ready. */}
                  {kot.status === 'PENDING' || kot.status === 'IN_PROGRESS' ? (
                    <button
                      onClick={() => handleAdvance(kot, kot.status === 'PENDING' && kot.station === 'BAR' ? 'READY' : undefined)}
                      disabled={updateStatusMutation.isPending}
                      className={`w-full min-h-[48px] rounded-lg text-sm font-bold transition-all disabled:opacity-60 active:scale-95 ${
                        kot.status === 'PENDING' && kot.station !== 'BAR'
                          ? 'bg-orange-500 hover:bg-orange-400 text-white'
                          : kot.status === 'PENDING'
                          ? 'bg-green-500 hover:bg-green-400 text-white'
                          : 'bg-yellow-400 hover:bg-yellow-300 text-black'
                      }`}
                    >
                      {kot.status === 'PENDING' && kot.station === 'BAR' ? 'Mark ready' : STATUS_LABEL[kot.status]} →
                    </button>
                  ) : kot.status === 'READY' ? (
                    <div className="space-y-2">
                      <div className="w-full py-2 rounded-lg bg-green-900/40 border border-green-500/40 text-green-300 text-xs font-semibold text-center flex items-center justify-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5" />
                        At the pass — waiter collecting
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateStatusMutation.mutate({ kotId: kot.id, status: 'IN_PROGRESS' })}
                          disabled={updateStatusMutation.isPending}
                          title="Send it back to being prepared"
                          className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 text-xs font-semibold disabled:opacity-60"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Recall
                        </button>
                        {canServe && (
                          <button
                            onClick={() => updateStatusMutation.mutate({ kotId: kot.id, status: 'SERVED' })}
                            disabled={updateStatusMutation.isPending}
                            className="flex-1 min-h-[44px] rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-bold disabled:opacity-60"
                          >
                            Served
                          </button>
                        )}
                      </div>
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

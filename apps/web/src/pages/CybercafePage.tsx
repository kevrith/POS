import { useState, useEffect, useRef, useCallback } from 'react';
import { useDialog } from '../components/Dialog';
import { toast } from 'sonner';
import { subscribeToEvent, SocketEvents } from '../lib/socket';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { formatKES } from '@pos/shared';
import { printHtml } from '../lib/printHtml';
import {
  Monitor, Plus, Play, Pause, Square, Clock, BarChart3,
  Package, List, Wifi, WifiOff, Printer, Coffee,
  CheckCircle, X, Tag, Trash2, TrendingUp, Timer, Zap,
} from 'lucide-react';

type Tab = 'stations' | 'sessions' | 'packages' | 'rates' | 'stats';

type StationStatus = 'AVAILABLE' | 'IN_USE' | 'PAUSED' | 'OFFLINE';

type StationType = 'BROWSING' | 'GAMING' | 'WORKSTATION' | 'PRINTING';

const STATUS_STYLE: Record<StationStatus, string> = {
  AVAILABLE: 'bg-green-50 border-green-300',
  IN_USE: 'bg-blue-50 border-blue-300',
  PAUSED: 'bg-yellow-50 border-yellow-300',
  OFFLINE: 'bg-gray-100 border-gray-300',
};
const STATUS_BADGE: Record<StationStatus, string> = {
  AVAILABLE: 'bg-green-100 text-green-700',
  IN_USE: 'bg-blue-100 text-blue-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  OFFLINE: 'bg-gray-200 text-gray-500',
};
const STATUS_ICON: Record<StationStatus, React.ReactNode> = {
  AVAILABLE: <Wifi className="w-4 h-4 text-green-500" />,
  IN_USE: <Monitor className="w-4 h-4 text-blue-500" />,
  PAUSED: <Pause className="w-4 h-4 text-yellow-500" />,
  OFFLINE: <WifiOff className="w-4 h-4 text-gray-400" />,
};

const STATION_TYPE_BADGE: Record<StationType, string> = {
  BROWSING: 'bg-blue-100 text-blue-700',
  GAMING: 'bg-purple-100 text-purple-700',
  WORKSTATION: 'bg-gray-100 text-gray-600',
  PRINTING: 'bg-orange-100 text-orange-700',
};
const STATION_TYPE_ICON: Record<StationType, string> = {
  BROWSING: '🌐',
  GAMING: '🎮',
  WORKSTATION: '💼',
  PRINTING: '🖨️',
};

const PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'CREDIT'];

const RATE_CATEGORIES = ['BROWSE', 'GAME', 'PRINT', 'SCAN', 'OTHER'];

const SEED_RATES = [
  { service: 'Browsing', unit: 'per hour', rateCents: 6000, category: 'BROWSE', sortOrder: 0 },
  { service: 'Gaming', unit: 'per hour', rateCents: 10000, category: 'GAME', sortOrder: 0 },
  { service: 'Printing – B&W', unit: 'per page', rateCents: 1000, category: 'PRINT', sortOrder: 0 },
  { service: 'Printing – Colour', unit: 'per page', rateCents: 2000, category: 'PRINT', sortOrder: 1 },
  { service: 'Scanning', unit: 'per page', rateCents: 2000, category: 'SCAN', sortOrder: 0 },
  { service: 'Photocopy – B&W', unit: 'per page', rateCents: 500, category: 'PRINT', sortOrder: 2 },
  { service: 'Lamination A4', unit: 'per item', rateCents: 5000, category: 'OTHER', sortOrder: 0 },
  { service: 'ID Photos (4pcs)', unit: 'per item', rateCents: 10000, category: 'OTHER', sortOrder: 1 },
  { service: 'Typing & Printing', unit: 'per page', rateCents: 3000, category: 'PRINT', sortOrder: 3 },
  { service: 'CV Writing', unit: 'flat', rateCents: 20000, category: 'OTHER', sortOrder: 2 },
  { service: 'Download', unit: 'per GB', rateCents: 5000, category: 'BROWSE', sortOrder: 1 },
];

/** Formats elapsed minutes as HH:MM:SS */
function formatDuration(minutes: number): string {
  const totalSecs = Math.floor(minutes * 60);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Running timer component for active sessions */
function SessionTimer({ startedAt, pausedMinutes, status }: { startedAt: string; pausedMinutes: number; status: string }) {
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const calc = () => {
      const started = new Date(startedAt).getTime();
      const now = Date.now();
      const totalMins = (now - started) / 60000 - pausedMinutes;
      setElapsed(Math.max(0, totalMins));
    };
    calc();
    if (status === 'ACTIVE') {
      ref.current = setInterval(calc, 1000);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [startedAt, pausedMinutes, status]);

  return <span className="font-mono text-lg font-bold">{formatDuration(elapsed)}</span>;
}

/** Package countdown component — shows time remaining for package sessions */
function PackageCountdown({ startedAt, pausedMinutes, timeLimitMinutes, extendedMinutes }: {
  startedAt: string;
  pausedMinutes: number;
  timeLimitMinutes: number;
  extendedMinutes: number;
}) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const calc = () => {
      const elapsed = (Date.now() - new Date(startedAt).getTime()) / 60000 - pausedMinutes;
      const totalLimit = timeLimitMinutes + (extendedMinutes ?? 0);
      setRemaining(Math.max(0, totalLimit - elapsed));
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [startedAt, pausedMinutes, timeLimitMinutes, extendedMinutes]);

  const urgent = remaining < 5;
  const warning = remaining < 15;
  return (
    <span className={`font-mono text-sm font-bold ${urgent ? 'text-red-600 animate-pulse' : warning ? 'text-amber-600' : 'text-green-600'}`}>
      {formatDuration(remaining)} left
    </span>
  );
}

/** Print a session receipt in a new window */
function printSessionReceipt(session: any) {
  const startTime = new Date(session.startedAt).toLocaleString();
  const endTime = session.endedAt ? new Date(session.endedAt).toLocaleString() : new Date().toLocaleString();
  const duration = session.durationMinutes != null ? formatDuration(session.durationMinutes) : '—';
  const timeCents = session.package
    ? session.package.priceCents
    : Math.round(((session.durationMinutes ?? 0) / 60) * session.ratePerHourCents);

  printHtml(`<!DOCTYPE html><html><head><title>Session Receipt</title>
<style>
body{font-family:monospace;padding:16px;max-width:320px;margin:auto;font-size:13px}
h2{text-align:center;margin-bottom:4px;font-size:16px}
.divider{border-top:1px dashed #333;margin:8px 0}
.row{display:flex;justify-content:space-between;margin:3px 0}
.total{font-size:15px;font-weight:bold;margin-top:8px}
@media print{button{display:none}}
</style></head><body>
<h2>CYBERCAFE RECEIPT</h2>
<p style="text-align:center;font-size:11px;color:#555">${startTime}</p>
<div class="divider"></div>
<div class="row"><span>Station:</span><span>PC ${session.station?.number ?? '?'}</span></div>
<div class="row"><span>Customer:</span><span>${session.customerName ?? 'Walk-in'}</span></div>
${session.customerPhone ? `<div class="row"><span>Phone:</span><span>${session.customerPhone}</span></div>` : ''}
${session.package ? `<div class="row"><span>Package:</span><span>${session.package.name}</span></div>` : ''}
<div class="row"><span>Start:</span><span>${startTime}</span></div>
<div class="row"><span>End:</span><span>${endTime}</span></div>
<div class="row"><span>Duration:</span><span>${duration}</span></div>
<div class="divider"></div>
<div class="row"><span>Time charge:</span><span>KES ${(timeCents / 100).toFixed(2)}</span></div>
${session.printPagesCents > 0 ? `<div class="row"><span>Print/Scan:</span><span>KES ${(session.printPagesCents / 100).toFixed(2)}</span></div>` : ''}
${session.extrasCents > 0 ? `<div class="row"><span>Extras:</span><span>KES ${(session.extrasCents / 100).toFixed(2)}</span></div>` : ''}
<div class="divider"></div>
<div class="row total"><span>TOTAL:</span><span>KES ${(session.totalCents / 100).toFixed(2)}</span></div>
<div class="row"><span>Payment:</span><span>${session.paymentMethod ?? '—'}</span></div>
${session.paymentRef ? `<div class="row"><span>Ref:</span><span>${session.paymentRef}</span></div>` : ''}
<div class="divider"></div>
<p style="text-align:center;font-size:11px;color:#555">Thank you for visiting!</p>

</body></html>`);
}

export default function CybercafePage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const qc = useQueryClient();
  const { confirm } = useDialog();

  const [tab, setTab] = useState<Tab>('stations');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // ── Modals ────────────────────────────────────────────────────────────────
  const [startModal, setStartModal] = useState<{ station: any } | null>(null);
  const [endModal, setEndModal] = useState<{ session: any; completedSession?: any } | null>(null);
  const [addStationModal, setAddStationModal] = useState(false);
  const [extendModal, setExtendModal] = useState<{ session: any } | null>(null);

  // ── Forms ─────────────────────────────────────────────────────────────────
  const [startForm, setStartForm] = useState({
    customerName: '', customerPhone: '', packageId: '', ratePerHourCents: 0, notes: '',
  });
  const [endForm, setEndForm] = useState({
    paymentMethod: 'CASH', paymentRef: '', printPagesCents: 0, extrasCents: 0, notes: '',
  });
  const [stationForm, setStationForm] = useState({
    number: 1, label: '', specs: '', ratePerHourCents: 6000, stationType: 'BROWSING',
  });
  const [pkgForm, setPkgForm] = useState({ name: '', durationMinutes: 60, priceCents: 6000, description: '' });
  const [rateForm, setRateForm] = useState({ service: '', unit: 'per page', rateCents: 0, category: 'PRINT' });
  const [editingRate, setEditingRate] = useState<any | null>(null);

  // ── Attendant call alerts ─────────────────────────────────────────────────
  const [callingStations, setCallingStations] = useState<Record<string, number>>({});  // stationId → timestamp

  const playAlertSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const beep = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.4, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      };
      beep(880, 0, 0.15);
      beep(1100, 0.18, 0.15);
      beep(880, 0.36, 0.2);
    } catch (_) { /* audio not available */ }
  }, []);

  useEffect(() => {
    const unsub = subscribeToEvent(SocketEvents.CYBER_CALL_ATTENDANT, (data: any) => {
      const label = data.stationLabel ?? `PC ${data.stationNumber}`;
      playAlertSound();
      toast.warning(`🔔 ${label} is calling for assistance!`, {
        duration: 20000,
        position: 'top-center',
        style: { fontSize: '1rem', fontWeight: 600 },
      });
      setCallingStations((prev) => ({ ...prev, [data.stationId]: Date.now() }));
      // Auto-clear badge after 60 seconds
      setTimeout(() => {
        setCallingStations((prev) => {
          const next = { ...prev };
          delete next[data.stationId];
          return next;
        });
      }, 60000);
    });
    return unsub;
  }, [playAlertSound]);

  // ── Data Queries ──────────────────────────────────────────────────────────
  const { data: stations = [], refetch: refetchStations } = useQuery({
    queryKey: ['cyber-stations', businessId, storeId],
    queryFn: () => api.get<any[]>(`/cybercafe/stations?businessId=${businessId}&storeId=${storeId}`),
    refetchInterval: 10000,
  });

  const { data: packages = [], refetch: refetchPkgs } = useQuery({
    queryKey: ['cyber-packages', businessId],
    queryFn: () => api.get<any[]>(`/cybercafe/packages?businessId=${businessId}`),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['cyber-sessions', businessId, storeId, startDate, endDate],
    queryFn: () => {
      let url = `/cybercafe/sessions?businessId=${businessId}&storeId=${storeId}`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      return api.get<any[]>(url);
    },
    enabled: tab === 'sessions',
  });

  const { data: stats } = useQuery({
    queryKey: ['cyber-stats', businessId, storeId, startDate, endDate],
    queryFn: () => {
      let url = `/cybercafe/stats?businessId=${businessId}&storeId=${storeId}`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      return api.get<any>(url);
    },
    enabled: tab === 'stats',
  });

  const { data: dailySummary } = useQuery({
    queryKey: ['cyber-daily-summary', businessId, storeId],
    queryFn: () => api.get<any>(`/cybercafe/daily-summary?businessId=${businessId}&storeId=${storeId}`),
    refetchInterval: 30000,
  });

  const { data: dbRates = [], refetch: refetchRates } = useQuery({
    queryKey: ['cyber-rates', businessId, storeId],
    queryFn: () => api.get<any[]>(`/cybercafe/rates?businessId=${businessId}&storeId=${storeId}`),
    enabled: tab === 'rates',
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createStationMut = useMutation({
    mutationFn: (dto: any) => api.post('/cybercafe/stations', dto),
    onSuccess: () => {
      void refetchStations();
      setAddStationModal(false);
      setStationForm({ number: 1, label: '', specs: '', ratePerHourCents: 6000, stationType: 'BROWSING' });
    },
  });

  const startSessionMut = useMutation({
    mutationFn: ({ stationId, dto }: any) => api.post(`/cybercafe/stations/${stationId}/start`, dto),
    onSuccess: () => { void refetchStations(); setStartModal(null); },
  });

  const pauseMut = useMutation({
    mutationFn: (sessionId: string) => api.post(`/cybercafe/sessions/${sessionId}/pause`, {}),
    onSuccess: () => { void refetchStations(); },
  });

  const resumeMut = useMutation({
    mutationFn: (sessionId: string) => api.post(`/cybercafe/sessions/${sessionId}/resume`, {}),
    onSuccess: () => { void refetchStations(); },
  });

  const endSessionMut = useMutation({
    mutationFn: ({ sessionId, dto }: any) => api.post(`/cybercafe/sessions/${sessionId}/end`, dto),
    onSuccess: (data: any) => {
      void refetchStations();
      void qc.invalidateQueries({ queryKey: ['cyber-sessions'] });
      void qc.invalidateQueries({ queryKey: ['cyber-stats'] });
      void qc.invalidateQueries({ queryKey: ['cyber-daily-summary'] });
      // Store completed session data for receipt option
      if (endModal) {
        setEndModal({ session: endModal.session, completedSession: data });
      }
    },
  });

  const voidMut = useMutation({
    mutationFn: (sessionId: string) => api.post(`/cybercafe/sessions/${sessionId}/void`, {}),
    onSuccess: () => { void refetchStations(); },
  });

  const extendMut = useMutation({
    mutationFn: ({ sessionId, extraMinutes }: { sessionId: string; extraMinutes: number }) =>
      api.post(`/cybercafe/sessions/${sessionId}/extend`, { extraMinutes }),
    onSuccess: () => { void refetchStations(); setExtendModal(null); },
  });

  const createPkgMut = useMutation({
    mutationFn: (dto: any) => api.post('/cybercafe/packages', dto),
    onSuccess: () => { void refetchPkgs(); setPkgForm({ name: '', durationMinutes: 60, priceCents: 6000, description: '' }); },
  });

  const createRateMut = useMutation({
    mutationFn: (dto: any) => api.post('/cybercafe/rates', dto),
    onSuccess: () => { void refetchRates(); setRateForm({ service: '', unit: 'per page', rateCents: 0, category: 'PRINT' }); },
  });

  const updateRateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: any }) => api.patch(`/cybercafe/rates/${id}`, dto),
    onSuccess: () => { void refetchRates(); setEditingRate(null); },
  });

  const deleteRateMut = useMutation({
    mutationFn: (id: string) => api.delete(`/cybercafe/rates/${id}`),
    onSuccess: () => { void refetchRates(); },
  });

  const seedRatesMut = useMutation({
    mutationFn: async () => {
      for (const r of SEED_RATES) {
        await api.post('/cybercafe/rates', { ...r, businessId, storeId });
      }
    },
    onSuccess: () => { void refetchRates(); },
  });

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'stations', label: 'Station Grid', icon: <Monitor className="w-4 h-4" /> },
    { id: 'sessions', label: 'Session History', icon: <List className="w-4 h-4" /> },
    { id: 'packages', label: 'Packages', icon: <Package className="w-4 h-4" /> },
    { id: 'rates', label: 'Service Rates', icon: <Tag className="w-4 h-4" /> },
    { id: 'stats', label: 'Statistics', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const openStartModal = (station: any) => {
    setStartForm({ customerName: '', customerPhone: '', packageId: '', ratePerHourCents: station.ratePerHourCents, notes: '' });
    setStartModal({ station });
  };

  const openEndModal = (session: any) => {
    setEndForm({ paymentMethod: 'CASH', paymentRef: '', printPagesCents: 0, extrasCents: 0, notes: '' });
    setEndModal({ session });
  };

  // Group DB rates by category
  const ratesByCategory = RATE_CATEGORIES.reduce<Record<string, any[]>>((acc, cat) => {
    acc[cat] = dbRates.filter((r: any) => r.category === cat);
    return acc;
  }, {});

  return (
    <div className="p-3 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold">Cybercafe Management</h1>
        </div>
        <button
          onClick={() => setAddStationModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> Add Station
        </button>
      </div>

      {/* Daily Summary Bar */}
      {dailySummary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <p className="text-xs text-blue-600 font-medium flex items-center justify-center gap-1">
              <Zap className="w-3 h-3" /> Active Sessions
            </p>
            <p className="text-2xl font-bold text-blue-700">{dailySummary.activeSessions}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="text-xs text-green-600 font-medium flex items-center justify-center gap-1">
              <Monitor className="w-3 h-3" /> Total Stations
            </p>
            <p className="text-2xl font-bold text-green-700">{dailySummary.totalStations}</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
            <p className="text-xs text-indigo-600 font-medium flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3" /> Today's Revenue
            </p>
            <p className="text-xl font-bold text-indigo-700">{formatKES(dailySummary.todayRevenueCents)}</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
            <p className="text-xs text-purple-600 font-medium flex items-center justify-center gap-1">
              <CheckCircle className="w-3 h-3" /> Today's Sessions
            </p>
            <p className="text-2xl font-bold text-purple-700">{dailySummary.todaySessions}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <p className="text-xs text-amber-600 font-medium flex items-center justify-center gap-1">
              <Timer className="w-3 h-3" /> Today's Hours
            </p>
            <p className="text-xl font-bold text-amber-700">{((dailySummary.todayMinutes ?? 0) / 60).toFixed(1)}h</p>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 border-b overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── STATION GRID ── */}
      {tab === 'stations' && (
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
            {(['AVAILABLE', 'IN_USE', 'PAUSED', 'OFFLINE'] as StationStatus[]).map((s) => (
              <span key={s} className={`flex items-center gap-1 px-2 py-1 rounded border ${STATUS_STYLE[s]}`}>
                {STATUS_ICON[s]} {s.replace('_', ' ')}
              </span>
            ))}
          </div>

          {/* Station cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {stations.map((station: any) => {
              const status: StationStatus = station.status as StationStatus;
              const stationType: StationType = (station.stationType ?? 'BROWSING') as StationType;
              const session = station.activeSession;
              const isCalling = !!callingStations[station.id];
              return (
                <div
                  key={station.id}
                  className={`rounded-xl border-2 p-4 flex flex-col gap-2 transition-all ${isCalling ? 'border-orange-400 bg-orange-50 animate-pulse' : STATUS_STYLE[status]}`}
                >
                  {/* Call attendant alert banner */}
                  {isCalling && (
                    <div className="flex items-center justify-between bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded -mx-1 -mt-1">
                      <span>🔔 CALLING FOR HELP</span>
                      <button
                        onClick={() => setCallingStations((prev) => { const n = { ...prev }; delete n[station.id]; return n; })}
                        className="ml-2 hover:text-orange-200"
                      >✕</button>
                    </div>
                  )}

                  {/* Station header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {STATUS_ICON[status]}
                      <span className="font-bold text-sm">PC {station.number}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[status]}`}>
                      {status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Station type badge */}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium self-start ${STATION_TYPE_BADGE[stationType]}`}>
                    {STATION_TYPE_ICON[stationType]} {stationType}
                  </span>

                  {station.label && <p className="text-xs text-gray-500 truncate">{station.label}</p>}
                  {station.specs && <p className="text-xs text-gray-400 truncate">{station.specs}</p>}

                  {/* Rate */}
                  <p className="text-xs text-gray-500">
                    {(station.ratePerHourCents / 100).toFixed(0)} KES/hr
                  </p>

                  {/* Active session info */}
                  {session && (
                    <div className="bg-white/70 rounded-lg p-2 space-y-1 text-xs">
                      <p className="font-semibold truncate">{session.customerName ?? 'Walk-in'}</p>
                      {session.package && (
                        <p className="text-indigo-600 truncate">📦 {session.package.name}</p>
                      )}
                      <SessionTimer
                        startedAt={session.startedAt}
                        pausedMinutes={session.pausedMinutes}
                        status={session.status}
                      />
                      {/* Package countdown */}
                      {session.package && session.timeLimitMinutes != null && (
                        <PackageCountdown
                          startedAt={session.startedAt}
                          pausedMinutes={session.pausedMinutes}
                          timeLimitMinutes={session.timeLimitMinutes}
                          extendedMinutes={session.extendedMinutes ?? 0}
                        />
                      )}
                      {/* Estimated charge */}
                      {!session.package && (
                        <p className="text-gray-500 font-semibold">
                          Est. {formatKES(
                            Math.round(
                              (Math.max(0, (Date.now() - new Date(session.startedAt).getTime()) / 60000 - session.pausedMinutes) / 60)
                              * session.ratePerHourCents
                            )
                          )}
                        </p>
                      )}
                      {/* Quick extend buttons */}
                      {(session.status === 'ACTIVE' || session.status === 'PAUSED') && (
                        <div className="flex gap-1 pt-1">
                          <button
                            onClick={() => extendMut.mutate({ sessionId: session.id, extraMinutes: 30 })}
                            disabled={extendMut.isPending}
                            className="flex-1 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200 disabled:opacity-50"
                          >
                            +30m
                          </button>
                          <button
                            onClick={() => extendMut.mutate({ sessionId: session.id, extraMinutes: 60 })}
                            disabled={extendMut.isPending}
                            className="flex-1 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200 disabled:opacity-50"
                          >
                            +1hr
                          </button>
                          <button
                            onClick={() => setExtendModal({ session })}
                            className="px-1 py-0.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                            title="More extend options"
                          >
                            ···
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1 mt-auto">
                    {status === 'AVAILABLE' && (
                      <button
                        onClick={() => openStartModal(station)}
                        className="w-full py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 flex items-center justify-center gap-1"
                      >
                        <Play className="w-3 h-3" /> Start Session
                      </button>
                    )}
                    {status === 'IN_USE' && session && (
                      <>
                        <button
                          onClick={() => pauseMut.mutate(session.id)}
                          disabled={pauseMut.isPending}
                          className="w-full py-1 bg-yellow-500 text-white rounded text-xs font-medium hover:bg-yellow-600 flex items-center justify-center gap-1"
                        >
                          <Pause className="w-3 h-3" /> Pause
                        </button>
                        <button
                          onClick={() => openEndModal(session)}
                          className="w-full py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 flex items-center justify-center gap-1"
                        >
                          <Square className="w-3 h-3" /> End & Bill
                        </button>
                      </>
                    )}
                    {status === 'PAUSED' && session && (
                      <>
                        <button
                          onClick={() => resumeMut.mutate(session.id)}
                          disabled={resumeMut.isPending}
                          className="w-full py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 flex items-center justify-center gap-1"
                        >
                          <Play className="w-3 h-3" /> Resume
                        </button>
                        <button
                          onClick={() => openEndModal(session)}
                          className="w-full py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 flex items-center justify-center gap-1"
                        >
                          <Square className="w-3 h-3" /> End & Bill
                        </button>
                      </>
                    )}
                    {status === 'OFFLINE' && (
                      <button
                        onClick={() => api.patch(`/cybercafe/stations/${station.id}`, { status: 'AVAILABLE' }).then(() => refetchStations())}
                        className="w-full py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                      >
                        Set Online
                      </button>
                    )}
                    {status !== 'OFFLINE' && status === 'AVAILABLE' && (
                      <button
                        onClick={() => api.patch(`/cybercafe/stations/${station.id}`, { status: 'OFFLINE' }).then(() => refetchStations())}
                        className="w-full py-1 border border-gray-300 text-gray-500 rounded text-xs hover:bg-gray-50"
                      >
                        Set Offline
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/cyber-kiosk?stationId=${station.id}`;
                        navigator.clipboard.writeText(url);
                        toast.success('Kiosk URL copied!');
                      }}
                      className="w-full py-1 border border-indigo-200 text-indigo-600 rounded text-xs hover:bg-indigo-50 flex items-center justify-center gap-1"
                    >
                      🔗 Copy Kiosk URL
                    </button>
                  </div>
                </div>
              );
            })}
            {stations.length === 0 && (
              <div className="col-span-full text-center py-16 text-gray-400">
                <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No stations yet. Click "Add Station" to get started.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SESSION HISTORY ── */}
      {tab === 'sessions' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Station</th>
                  <th className="text-left px-4 py-2">Customer</th>
                  <th className="text-left px-4 py-2">Package</th>
                  <th className="text-right px-4 py-2">Duration</th>
                  <th className="text-right px-4 py-2">Rate/hr</th>
                  <th className="text-right px-4 py-2">Extras</th>
                  <th className="text-right px-4 py-2">Total</th>
                  <th className="text-left px-4 py-2">Payment</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Started</th>
                  <th className="text-left px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s: any) => (
                  <tr key={s.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">PC {s.station?.number}</td>
                    <td className="px-4 py-2">{s.customerName ?? <span className="text-gray-400">Walk-in</span>}</td>
                    <td className="px-4 py-2">{s.package?.name ?? <span className="text-gray-400">Hourly</span>}</td>
                    <td className="px-4 py-2 text-right font-mono">{s.durationMinutes != null ? formatDuration(s.durationMinutes) : '—'}</td>
                    <td className="px-4 py-2 text-right">{formatKES(s.ratePerHourCents)}/hr</td>
                    <td className="px-4 py-2 text-right">{(s.printPagesCents + s.extrasCents) > 0 ? formatKES(s.printPagesCents + s.extrasCents) : '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold">{s.totalCents > 0 ? formatKES(s.totalCents) : '—'}</td>
                    <td className="px-4 py-2">{s.paymentMethod ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.status === 'COMPLETED' ? 'bg-green-100 text-green-700'
                        : s.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700'
                        : s.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-500'
                      }`}>{s.status}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{new Date(s.startedAt).toLocaleString()}</td>
                    <td className="px-4 py-2 flex items-center gap-2">
                      {s.status === 'COMPLETED' && (
                        <button
                          onClick={() => printSessionReceipt(s)}
                          className="text-xs text-indigo-500 hover:underline flex items-center gap-0.5"
                        >
                          <Printer className="w-3 h-3" /> Receipt
                        </button>
                      )}
                      {(s.status === 'ACTIVE' || s.status === 'PAUSED') && (
                        <button
                          onClick={() => voidMut.mutate(s.id)}
                          className="text-xs text-red-500 hover:underline"
                        >Void</button>
                      )}
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">No sessions found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PACKAGES ── */}
      {tab === 'packages' && (
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add Package</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input
                className="border rounded px-3 py-1.5 text-sm"
                placeholder="Name (e.g. 1 Hour)"
                value={pkgForm.name}
                onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
              />
              <input
                className="border rounded px-3 py-1.5 text-sm"
                placeholder="Duration (minutes)"
                type="number"
                min={1}
                value={pkgForm.durationMinutes}
                onChange={(e) => setPkgForm({ ...pkgForm, durationMinutes: parseInt(e.target.value) || 60 })}
              />
              <input
                className="border rounded px-3 py-1.5 text-sm"
                placeholder="Price (KES)"
                type="number"
                value={pkgForm.priceCents / 100}
                onChange={(e) => setPkgForm({ ...pkgForm, priceCents: Math.round(parseFloat(e.target.value) * 100) || 0 })}
              />
              <input
                className="border rounded px-3 py-1.5 text-sm"
                placeholder="Description (optional)"
                value={pkgForm.description}
                onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })}
              />
            </div>
            <button
              onClick={() => { if (!pkgForm.name) return; createPkgMut.mutate({ ...pkgForm, businessId }); }}
              disabled={!pkgForm.name || createPkgMut.isPending}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {createPkgMut.isPending ? 'Saving...' : 'Add Package'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {packages.map((pkg: any) => (
              <div key={pkg.id} className="bg-white border rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-500" />
                  <span className="font-semibold text-sm">{pkg.name}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-500 text-xs">
                  <Clock className="w-3 h-3" />
                  {pkg.durationMinutes >= 60
                    ? `${(pkg.durationMinutes / 60).toFixed(1).replace('.0', '')} hr${pkg.durationMinutes > 60 ? 's' : ''}`
                    : `${pkg.durationMinutes} min`}
                </div>
                {pkg.description && <p className="text-xs text-gray-400">{pkg.description}</p>}
                <p className="text-xl font-bold text-indigo-600">{formatKES(pkg.priceCents)}</p>
                <p className="text-xs text-gray-400">
                  ≈ {formatKES(Math.round(pkg.priceCents / (pkg.durationMinutes / 60)))}/hr
                </p>
                <button
                  onClick={() => api.patch(`/cybercafe/packages/${pkg.id}`, { isActive: false }).then(() => refetchPkgs())}
                  className="text-xs text-red-400 hover:underline"
                >Remove</button>
              </div>
            ))}
            {packages.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-400">
                No packages yet. Add a package above.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SERVICE RATES / PRICE BOARD ── */}
      {tab === 'rates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold">Service Rate Card</h2>
              <p className="text-sm text-gray-500">Manage your cybercafe's price list. Rates are stored in the database.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {dbRates.length === 0 && (
                <button
                  onClick={() => seedRatesMut.mutate()}
                  disabled={seedRatesMut.isPending}
                  className="px-3 py-1.5 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50"
                >
                  {seedRatesMut.isPending ? 'Seeding...' : 'Seed Default Rates'}
                </button>
              )}
              <button
                onClick={() => {
                  printHtml(`<!DOCTYPE html><html><head><title>Rate Card</title>
<style>body{font-family:Arial,sans-serif;padding:20px;max-width:500px;margin:auto}
h1{text-align:center;font-size:22px;border-bottom:2px solid #333;padding-bottom:8px}
h3{color:#1e3a5f;margin-top:16px;font-size:14px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th{background:#1e3a5f;color:white;padding:8px 12px;text-align:left}
td{padding:8px 12px;border-bottom:1px solid #eee}
tr:nth-child(even)td{background:#f8f8f8}
.price{text-align:right;font-weight:bold;color:#1e3a5f}
@media print{button{display:none}}</style></head>
<body><h1>Service Rate Card</h1>
${RATE_CATEGORIES.map((cat) => {
  const catRates = dbRates.filter((r: any) => r.category === cat);
  if (!catRates.length) return '';
  return `<h3>${cat}</h3><table><thead><tr><th>Service</th><th>Unit</th><th class="price">Rate (KES)</th></tr></thead><tbody>
${catRates.map((r: any) => `<tr><td>${r.service}</td><td style="font-size:11px;color:#888">${r.unit}</td><td class="price">${(r.rateCents / 100).toFixed(2)}</td></tr>`).join('')}
</tbody></table>`;
}).join('')}
<br/><p style="text-align:center;font-size:11px;color:#666">Prices subject to change without notice.</p>
</body></html>`);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
              >
                <Printer className="w-4 h-4" /> Print Rate Card
              </button>
            </div>
          </div>

          {/* Add rate form */}
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add New Rate</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <input
                className="border rounded px-3 py-1.5 text-sm"
                placeholder="Service name"
                value={rateForm.service}
                onChange={(e) => setRateForm({ ...rateForm, service: e.target.value })}
              />
              <input
                className="border rounded px-3 py-1.5 text-sm"
                placeholder="Unit (e.g. per page)"
                value={rateForm.unit}
                onChange={(e) => setRateForm({ ...rateForm, unit: e.target.value })}
              />
              <input
                className="border rounded px-3 py-1.5 text-sm"
                type="number"
                placeholder="Rate (KES)"
                value={rateForm.rateCents / 100 || ''}
                onChange={(e) => setRateForm({ ...rateForm, rateCents: Math.round(parseFloat(e.target.value) * 100) || 0 })}
              />
              <select
                className="border rounded px-3 py-1.5 text-sm"
                value={rateForm.category}
                onChange={(e) => setRateForm({ ...rateForm, category: e.target.value })}
              >
                {RATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                onClick={() => {
                  if (!rateForm.service) return;
                  createRateMut.mutate({ ...rateForm, businessId, storeId });
                }}
                disabled={!rateForm.service || createRateMut.isPending}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {createRateMut.isPending ? 'Adding...' : 'Add Rate'}
              </button>
            </div>
          </div>

          {/* Rates grouped by category */}
          {RATE_CATEGORIES.map((cat) => {
            const catRates = ratesByCategory[cat] ?? [];
            if (catRates.length === 0) return null;
            return (
              <div key={cat} className="bg-white border rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-indigo-50 border-b">
                  <h3 className="font-semibold text-sm text-indigo-800">{cat}</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-4 py-2">Service</th>
                      <th className="text-left px-4 py-2">Unit</th>
                      <th className="text-right px-4 py-2">Rate (KES)</th>
                      <th className="px-4 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {catRates.map((r: any) => (
                      <tr key={r.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2">
                          {editingRate?.id === r.id ? (
                            <input
                              className="border rounded px-2 py-1 text-sm w-full"
                              value={editingRate.service}
                              onChange={(e) => setEditingRate({ ...editingRate, service: e.target.value })}
                            />
                          ) : r.service}
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {editingRate?.id === r.id ? (
                            <input
                              className="border rounded px-2 py-1 text-sm w-full"
                              value={editingRate.unit}
                              onChange={(e) => setEditingRate({ ...editingRate, unit: e.target.value })}
                            />
                          ) : r.unit}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-indigo-700">
                          {editingRate?.id === r.id ? (
                            <input
                              className="border rounded px-2 py-1 text-sm w-24 text-right"
                              type="number"
                              value={editingRate.rateCents / 100}
                              onChange={(e) => setEditingRate({ ...editingRate, rateCents: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                            />
                          ) : (r.rateCents / 100).toFixed(2)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2 justify-end">
                            {editingRate?.id === r.id ? (
                              <>
                                <button
                                  onClick={() => updateRateMut.mutate({ id: r.id, dto: { service: editingRate.service, unit: editingRate.unit, rateCents: editingRate.rateCents } })}
                                  disabled={updateRateMut.isPending}
                                  className="text-xs text-green-600 hover:underline font-medium"
                                >Save</button>
                                <button onClick={() => setEditingRate(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setEditingRate({ ...r })}
                                  className="text-xs text-indigo-500 hover:underline"
                                >Edit</button>
                                <button
                                  onClick={async () => { const ok = await confirm({ title: 'Delete Rate', message: 'Delete this pricing rate?', variant: 'danger', confirmLabel: 'Delete' }); if (ok) deleteRateMut.mutate(r.id); }}
                                  disabled={deleteRateMut.isPending}
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          {dbRates.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No rates configured yet.</p>
              <p className="text-sm mt-1">Click "Seed Default Rates" to add standard cybercafe pricing, or add rates manually above.</p>
            </div>
          )}
        </div>
      )}

      {/* ── STATISTICS ── */}
      {tab === 'stats' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {stats && (
            <>
              {/* Live station status */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-green-600 font-medium">Available</p>
                  <p className="text-3xl font-bold text-green-700">{stats.stationStatus.available}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-blue-600 font-medium">In Use</p>
                  <p className="text-3xl font-bold text-blue-700">{stats.stationStatus.inUse}</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-yellow-600 font-medium">Paused</p>
                  <p className="text-3xl font-bold text-yellow-700">{stats.stationStatus.paused}</p>
                </div>
                <div className="bg-gray-50 border rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-500 font-medium">Total Stations</p>
                  <p className="text-3xl font-bold text-gray-700">{stats.stationStatus.total}</p>
                </div>
              </div>
              {/* Period KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border rounded-xl p-4">
                  <p className="text-xs text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-indigo-600">{formatKES(stats.totalRevenueCents)}</p>
                </div>
                <div className="bg-white border rounded-xl p-4">
                  <p className="text-xs text-gray-500">Total Sessions</p>
                  <p className="text-2xl font-bold">{stats.totalSessions}</p>
                </div>
                <div className="bg-white border rounded-xl p-4">
                  <p className="text-xs text-gray-500">Total Hours</p>
                  <p className="text-2xl font-bold">{((stats.totalMinutes ?? 0) / 60).toFixed(1)} hrs</p>
                </div>
                <div className="bg-white border rounded-xl p-4">
                  <p className="text-xs text-gray-500">Avg Session</p>
                  <p className="text-2xl font-bold">{(stats.avgSessionMinutes ?? 0).toFixed(0)} min</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* By station */}
                <div className="bg-white border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b font-semibold text-sm">Revenue by Station</div>
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs">
                      <tr>
                        <th className="text-left px-4 py-2">Station</th>
                        <th className="text-right px-4 py-2">Sessions</th>
                        <th className="text-right px-4 py-2">Hours</th>
                        <th className="text-right px-4 py-2">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.byStation.map((s: any) => (
                        <tr key={s.stationId} className="border-t">
                          <td className="px-4 py-2 font-medium">{s.stationName}</td>
                          <td className="px-4 py-2 text-right">{s.sessions}</td>
                          <td className="px-4 py-2 text-right">{((s.minutes ?? 0) / 60).toFixed(1)}</td>
                          <td className="px-4 py-2 text-right font-semibold text-indigo-600">{formatKES(s.revenueCents)}</td>
                        </tr>
                      ))}
                      {stats.byStation.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No data</td></tr>}
                    </tbody>
                  </table>
                </div>
                {/* By payment */}
                <div className="bg-white border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b font-semibold text-sm">Revenue by Payment Method</div>
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs">
                      <tr>
                        <th className="text-left px-4 py-2">Method</th>
                        <th className="text-right px-4 py-2">Sessions</th>
                        <th className="text-right px-4 py-2">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.byPayment.map((p: any) => (
                        <tr key={p.method} className="border-t">
                          <td className="px-4 py-2 font-medium">{p.method}</td>
                          <td className="px-4 py-2 text-right">{p.count}</td>
                          <td className="px-4 py-2 text-right font-semibold">{formatKES(p.totalCents)}</td>
                        </tr>
                      ))}
                      {stats.byPayment.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No data</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          {!stats && <p className="text-gray-400 text-center py-8">Loading statistics...</p>}
        </div>
      )}

      {/* ══ START SESSION MODAL ══ */}
      {startModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Play className="w-5 h-5 text-indigo-600" />
                Start Session — PC {startModal.station.number}
              </h2>
              <button onClick={() => setStartModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-3">
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Customer name (optional)"
                value={startForm.customerName}
                onChange={(e) => setStartForm({ ...startForm, customerName: e.target.value })}
              />
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Customer phone (optional)"
                value={startForm.customerPhone}
                onChange={(e) => setStartForm({ ...startForm, customerPhone: e.target.value })}
              />

              {/* Package selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Package (optional)</label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={startForm.packageId}
                  onChange={(e) => setStartForm({ ...startForm, packageId: e.target.value })}
                >
                  <option value="">Hourly billing</option>
                  {packages.map((pkg: any) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} — {formatKES(pkg.priceCents)} ({pkg.durationMinutes >= 60 ? `${pkg.durationMinutes / 60}hr` : `${pkg.durationMinutes}min`})
                    </option>
                  ))}
                </select>
              </div>

              {/* Hourly rate (only when no package) */}
              {!startForm.packageId && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rate per hour (KES)</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    type="number"
                    value={startForm.ratePerHourCents / 100}
                    onChange={(e) => setStartForm({ ...startForm, ratePerHourCents: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                  />
                </div>
              )}

              <textarea
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Notes (optional)"
                rows={2}
                value={startForm.notes}
                onChange={(e) => setStartForm({ ...startForm, notes: e.target.value })}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStartModal(null)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => {
                  startSessionMut.mutate({
                    stationId: startModal.station.id,
                    dto: {
                      businessId,
                      storeId,
                      customerName: startForm.customerName || undefined,
                      customerPhone: startForm.customerPhone || undefined,
                      packageId: startForm.packageId || undefined,
                      ratePerHourCents: startForm.packageId ? undefined : startForm.ratePerHourCents,
                      notes: startForm.notes || undefined,
                    },
                  });
                }}
                disabled={startSessionMut.isPending}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {startSessionMut.isPending ? 'Starting...' : 'Start Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ END SESSION MODAL ══ */}
      {endModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Square className="w-5 h-5 text-red-600" />
                End Session & Bill
              </h2>
              <button onClick={() => setEndModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            {/* Session summary */}
            <div className="bg-indigo-50 rounded-xl p-4 space-y-2 text-sm">
              <p className="font-semibold text-base">{endModal.session.customerName ?? 'Walk-in'}</p>
              {endModal.session.package ? (
                <p className="text-indigo-700">Package: {endModal.session.package.name} — {formatKES(endModal.session.package.priceCents)}</p>
              ) : (
                <p className="text-gray-600">Rate: {formatKES(endModal.session.ratePerHourCents)}/hr</p>
              )}
              <div className="flex items-center gap-2 text-2xl font-bold text-indigo-700">
                <Clock className="w-5 h-5" />
                <SessionTimer startedAt={endModal.session.startedAt} pausedMinutes={endModal.session.pausedMinutes} status={endModal.session.status} />
              </div>
              {/* Estimated total breakdown */}
              {!endModal.session.package && (
                <div className="text-xs text-gray-500 space-y-0.5 pt-1 border-t border-indigo-200">
                  <div className="flex justify-between">
                    <span>Time charge (est.):</span>
                    <span className="font-semibold">
                      {formatKES(Math.round(
                        (Math.max(0, (Date.now() - new Date(endModal.session.startedAt).getTime()) / 60000 - endModal.session.pausedMinutes) / 60)
                        * endModal.session.ratePerHourCents
                      ))}
                    </span>
                  </div>
                  {endForm.printPagesCents > 0 && (
                    <div className="flex justify-between">
                      <span>Print/Scan:</span>
                      <span className="font-semibold">{formatKES(endForm.printPagesCents)}</span>
                    </div>
                  )}
                  {endForm.extrasCents > 0 && (
                    <div className="flex justify-between">
                      <span>Extras:</span>
                      <span className="font-semibold">{formatKES(endForm.extrasCents)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Show completed session + print receipt if already ended */}
            {endModal.completedSession ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-2">
                  <CheckCircle className="w-8 h-8 text-green-600 mx-auto" />
                  <p className="font-semibold text-green-700">Session Completed</p>
                  <p className="text-2xl font-bold text-green-800">{formatKES(endModal.completedSession.totalCents)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => printSessionReceipt(endModal.completedSession)}
                    className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center justify-center gap-1"
                  >
                    <Printer className="w-4 h-4" /> Print Receipt
                  </button>
                  <button onClick={() => setEndModal(null)} className="flex-1 py-2 border rounded-lg text-sm">Close</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Print job charges */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                    <Printer className="w-3 h-3" /> Print/Scan Charges (KES)
                  </label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    type="number"
                    placeholder="0"
                    value={endForm.printPagesCents / 100 || ''}
                    onChange={(e) => setEndForm({ ...endForm, printPagesCents: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                  />
                </div>
                {/* Extras */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                    <Coffee className="w-3 h-3" /> Other Extras (KES)
                  </label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    type="number"
                    placeholder="0"
                    value={endForm.extrasCents / 100 || ''}
                    onChange={(e) => setEndForm({ ...endForm, extrasCents: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                  />
                </div>

                {/* Payment method */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                  <div className="flex gap-2 flex-wrap">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m}
                        onClick={() => setEndForm({ ...endForm, paymentMethod: m })}
                        className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${endForm.paymentMethod === m ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {endForm.paymentMethod === 'MPESA' && (
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    placeholder="M-Pesa reference"
                    value={endForm.paymentRef}
                    onChange={(e) => setEndForm({ ...endForm, paymentRef: e.target.value })}
                  />
                )}

                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Notes (optional)"
                  rows={2}
                  value={endForm.notes}
                  onChange={(e) => setEndForm({ ...endForm, notes: e.target.value })}
                />

                <div className="flex gap-2 pt-2">
                  <button onClick={() => setEndModal(null)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
                  <button
                    onClick={() => endSessionMut.mutate({ sessionId: endModal.session.id, dto: endForm })}
                    disabled={endSessionMut.isPending}
                    className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {endSessionMut.isPending ? 'Processing...' : 'End & Charge'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ ADD STATION MODAL ══ */}
      {addStationModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Add Station</h2>
              <button onClick={() => setAddStationModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Station number (e.g. 1)" type="number"
                value={stationForm.number} onChange={(e) => setStationForm({ ...stationForm, number: parseInt(e.target.value) || 1 })} />
              <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Label (e.g. Gaming PC 1)"
                value={stationForm.label} onChange={(e) => setStationForm({ ...stationForm, label: e.target.value })} />
              <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Specs (e.g. i5, 8GB, GTX 1650)"
                value={stationForm.specs} onChange={(e) => setStationForm({ ...stationForm, specs: e.target.value })} />
              <div>
                <label className="block text-xs text-gray-600 mb-1">Station Type</label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={stationForm.stationType}
                  onChange={(e) => setStationForm({ ...stationForm, stationType: e.target.value })}
                >
                  <option value="BROWSING">🌐 Browsing</option>
                  <option value="GAMING">🎮 Gaming</option>
                  <option value="WORKSTATION">💼 Workstation</option>
                  <option value="PRINTING">🖨️ Printing</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Rate per hour (KES)</label>
                <input className="w-full border rounded px-3 py-2 text-sm" type="number"
                  value={stationForm.ratePerHourCents / 100}
                  onChange={(e) => setStationForm({ ...stationForm, ratePerHourCents: Math.round(parseFloat(e.target.value) * 100) || 0 })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAddStationModal(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => createStationMut.mutate({ ...stationForm, businessId, storeId })}
                disabled={createStationMut.isPending}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {createStationMut.isPending ? 'Adding...' : 'Add Station'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ EXTEND SESSION MODAL ══ */}
      {extendModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Timer className="w-5 h-5 text-indigo-600" />
                Extend Session
              </h2>
              <button onClick={() => setExtendModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="bg-indigo-50 rounded-xl p-3 text-sm space-y-1">
              <p className="font-semibold">{extendModal.session.customerName ?? 'Walk-in'} — PC {extendModal.session.station?.number}</p>
              {extendModal.session.timeLimitMinutes != null && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Remaining:</span>
                  <PackageCountdown
                    startedAt={extendModal.session.startedAt}
                    pausedMinutes={extendModal.session.pausedMinutes}
                    timeLimitMinutes={extendModal.session.timeLimitMinutes}
                    extendedMinutes={extendModal.session.extendedMinutes ?? 0}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[15, 30, 60, 120].map((mins) => (
                <button
                  key={mins}
                  onClick={() => extendMut.mutate({ sessionId: extendModal.session.id, extraMinutes: mins })}
                  disabled={extendMut.isPending}
                  className="py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl border border-indigo-200 transition-colors disabled:opacity-50"
                >
                  +{mins >= 60 ? `${mins / 60}hr` : `${mins}min`}
                </button>
              ))}
            </div>

            <button onClick={() => setExtendModal(null)} className="w-full py-2 border rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

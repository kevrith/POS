import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShoppingCart, BarChart3, Package, Settings, LogOut, Users,
  CreditCard, Truck, DollarSign, UserCheck, Coffee, Layers,
  Bell, ChevronDown, ChevronRight, Wallet, Hash, ChefHat, Box,
  Tag, Gift, Sun, Moon, Monitor, Wand2, ArrowRightLeft, LayoutDashboard,
  AlertTriangle, X, Pill, CalendarClock, TrendingUp, GitBranch, Landmark,
  Fuel, Lock, BedDouble, CheckCircle2, Trash2, Radio, BookOpen,
  Link2, FileText, Clock, Send, Tablet, Shield,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, getToken } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import { connectSocket, disconnectSocket, subscribeToEvent, SocketEvents } from '../lib/socket';
import { toast } from 'sonner';
import SyncStatusBadge, { OfflineBanner } from './SyncStatusBadge';
import MobileNav from './MobileNav';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles?: string[];
}

interface NavGroup {
  label: string;
  roles?: string[];
  items: NavItem[];
}

interface NavItemWithBusinessTypes extends NavItem {
  businessTypes?: string[];
  newTab?: boolean; // open in new browser tab
}

interface NavGroupWithBusinessTypes extends Omit<NavGroup, 'items'> {
  businessTypes?: string[];
  items: NavItemWithBusinessTypes[];
}

const NAV_GROUPS: NavGroupWithBusinessTypes[] = [
  {
    label: 'Home',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/pos', icon: ShoppingCart, label: 'Point of Sale', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
      { to: '/supermart', icon: ShoppingCart, label: 'Supermarket POS', roles: ['OWNER', 'MANAGER', 'CASHIER'], businessTypes: ['SUPERMARKET'] },
      { to: '/hospitality', icon: Coffee, label: 'Hospitality', roles: ['OWNER', 'MANAGER', 'WAITER'], businessTypes: ['HOSPITALITY', 'FAST_FOOD'] },
      { to: '/kds', icon: Monitor, label: 'Kitchen Display', roles: ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN'], businessTypes: ['HOSPITALITY', 'FAST_FOOD'] },
      { to: '/kiosk', icon: Tablet, label: 'Kiosk Mode', roles: ['OWNER', 'MANAGER'], newTab: true },
      { to: '/layaway', icon: Layers, label: 'Layaway', roles: ['OWNER', 'MANAGER', 'CASHIER'], businessTypes: ['RETAIL', 'SUPERMARKET'] },
      { to: '/proforma', icon: CreditCard, label: 'Proformas', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
      { to: '/prescriptions', icon: Pill, label: 'Prescriptions', roles: ['OWNER', 'MANAGER', 'CASHIER'], businessTypes: ['CLINIC'] },
      { to: '/pharmacy', icon: Pill, label: 'Pharmacy Mgmt', roles: ['OWNER', 'MANAGER'], businessTypes: ['CLINIC'] },
      { to: '/appointments', icon: CalendarClock, label: 'Appointments', roles: ['OWNER', 'MANAGER', 'CASHIER'], businessTypes: ['CLINIC', 'SALON'] },
    ],
  },
  {
    label: 'Operations',
    roles: ['OWNER', 'MANAGER'],
    items: [
      { to: '/delivery', icon: Truck, label: 'Delivery', businessTypes: ['HOSPITALITY', 'FAST_FOOD', 'RETAIL', 'SUPERMARKET'] },
      { to: '/delivery-management', icon: Truck, label: 'Delivery Dispatch', roles: ['OWNER', 'MANAGER'], businessTypes: ['HOSPITALITY', 'FAST_FOOD', 'RETAIL', 'SUPERMARKET'] },
      { to: '/waitlist', icon: Clock, label: 'Waitlist', roles: ['OWNER', 'MANAGER', 'WAITER'], businessTypes: ['HOSPITALITY', 'FAST_FOOD'] },
      { to: '/hotel', icon: BedDouble, label: 'Hotel Integration', roles: ['OWNER', 'MANAGER'], businessTypes: ['HOSPITALITY'] },
      { to: '/channel-manager', icon: Radio, label: 'Channel Manager', roles: ['OWNER', 'MANAGER'], businessTypes: ['HOSPITALITY'] },
      { to: '/fuel-pump', icon: Fuel, label: 'Fuel Pumps', roles: ['OWNER', 'MANAGER', 'CASHIER'], businessTypes: ['FUEL_PUMP'] },
    ],
  },
  {
    label: 'Inventory',
    roles: ['OWNER', 'MANAGER'],
    items: [
      { to: '/inventory', icon: Package, label: 'Items & Stock' },
      { to: '/batch', icon: Layers, label: 'Batch & Expiry', businessTypes: ['CLINIC', 'SUPERMARKET'] },
      { to: '/serial', icon: Hash, label: 'Serial Tracking', businessTypes: ['RETAIL'] },
      { to: '/recipe', icon: ChefHat, label: 'Recipes / BOM', businessTypes: ['HOSPITALITY', 'FAST_FOOD'] },
      { to: '/bundle', icon: Box, label: 'Bundles / Kits' },
      { to: '/suppliers', icon: Truck, label: 'Suppliers & POs' },
      { to: '/rfq', icon: Send, label: 'RFQ', roles: ['OWNER', 'MANAGER'] },
      { to: '/transfers', icon: ArrowRightLeft, label: 'Stock Transfers' },
      { to: '/stocktake', icon: CheckCircle2, label: 'Stocktake' },
      { to: '/damaged-goods', icon: Trash2, label: 'Damaged Goods' },
    ],
  },
  {
    label: 'Finance',
    roles: ['OWNER', 'MANAGER', 'ACCOUNTANT', 'CASHIER'],
    items: [
      { to: '/owner-dashboard', icon: LayoutDashboard, label: 'Owner Dashboard', roles: ['OWNER'] },
      { to: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
      { to: '/expenses', icon: DollarSign, label: 'Expenses', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
      { to: '/cheques', icon: FileText, label: 'Cheques', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
      { to: '/ledger', icon: BookOpen, label: 'General Ledger', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
      { to: '/payment-links', icon: Link2, label: 'Payment Links', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
      { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
      { to: '/sales-list', icon: ShoppingCart, label: 'Sales History', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
    ],
  },
  {
    label: 'People',
    roles: ['OWNER', 'MANAGER'],
    items: [
      { to: '/customers', icon: Users, label: 'Customers' },
      { to: '/hr', icon: UserCheck, label: 'Staff & HR' },
      { to: '/payroll', icon: DollarSign, label: 'Payroll' },
    ],
  },
  {
    label: 'Marketing',
    roles: ['OWNER', 'MANAGER'],
    items: [
      { to: '/promotions', icon: Tag, label: 'Promotions' },
      { to: '/gift-cards', icon: Gift, label: 'Gift Cards' },
    ],
  },
  {
    label: 'Analytics',
    roles: ['OWNER', 'MANAGER'],
    items: [
      { to: '/forecasting', icon: TrendingUp, label: 'AI Forecasting', roles: ['OWNER', 'MANAGER'] },
      { to: '/reconciliation', icon: Landmark, label: 'Reconciliation', roles: ['OWNER', 'MANAGER'] },
    ],
  },
  {
    label: 'Franchise',
    roles: ['OWNER'],
    items: [
      { to: '/franchise', icon: GitBranch, label: 'Franchise Network', roles: ['OWNER'] },
    ],
  },
  {
    label: 'Security',
    roles: ['OWNER', 'MANAGER'],
    items: [
      { to: '/security-settings', icon: Shield, label: 'Security & Roles', roles: ['OWNER', 'MANAGER'] },
    ],
  },
];

/** Generate initials avatar colour from name */
function avatarColor(name: string) {
  const colors = [
    'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-indigo-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(false);

  const { data: subscription } = useQuery<{
    subscriptionStatus: string;
    trialEndsAt: string | null;
    daysRemaining: number | null;
    isTrialExpired: boolean;
  }>({
    queryKey: ['subscription', user?.businessId],
    queryFn: () => api.get(`/business/${user!.businessId}/subscription`),
    enabled: !!user?.businessId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data: businessSettings } = useQuery<{ posMode: string }>({
    queryKey: ['business-settings', user?.businessId],
    queryFn: () => api.get(`/business/${user!.businessId}/settings`),
    enabled: !!user?.businessId,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const businessType = businessSettings?.posMode ?? 'RETAIL';

  const showTrialBanner =
    !trialBannerDismissed &&
    subscription?.subscriptionStatus === 'TRIAL' &&
    subscription.daysRemaining !== null &&
    subscription.daysRemaining <= 7;

  // ─── WebSocket ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const token = sessionStorage.getItem('pos-access-token');
    if (token && user?.businessId) {
      // Short delay so React StrictMode's cleanup-remount cycle completes
      // before we open a socket connection (avoids "closed before established").
      const t = setTimeout(() => {
        if (!cancelled) connectSocket(token, user.businessId!);
      }, 80);
      return () => { cancelled = true; clearTimeout(t); disconnectSocket(); };
    }
    return () => { disconnectSocket(); };
  }, [user?.businessId]);

  // ─── Notification unread count + real-time badge ──────────────────────────
  const [unreadCount, setUnreadCount] = useState(0);
  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['notifications-unread', user?.businessId],
    queryFn: () => api.get(`/notifications/unread-count?businessId=${user!.businessId}`),
    enabled: !!user?.businessId,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    if (unreadData?.count !== undefined) setUnreadCount(unreadData.count);
  }, [unreadData?.count]);
  // Clear badge when user opens notifications page
  useEffect(() => {
    if (location.pathname === '/notifications') setUnreadCount(0);
  }, [location.pathname]);
  useEffect(() => {
    if (!user?.businessId) return;
    return subscribeToEvent(SocketEvents.NOTIFICATION_CREATED, (data) => {
      setUnreadCount((n) => n + 1);
      if (data.priority === 'HIGH') {
        toast(data.title as string, {
          description: data.body as string,
          duration: 8000,
        });
      }
    });
  }, [user?.businessId]);

  // ─── Auto-lock ────────────────────────────────────────────────────────────
  const LOCK_TIMEOUT_MS = parseInt(localStorage.getItem('pos-lock-timeout') ?? '900000', 10);
  const [isLocked, setIsLocked] = useState(false);
  const [lockPin, setLockPin] = useState('');
  const [lockError, setLockError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsLocked(true), LOCK_TIMEOUT_MS);
  }, [LOCK_TIMEOUT_MS]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  async function handleUnlock(pinValue?: string) {
    const p = pinValue ?? lockPin;
    if (p.length < 4) return;
    try {
      const res = await fetch('/api/v1/auth/login/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p, businessId: user?.businessId }),
      });
      if (res.ok) {
        setIsLocked(false);
        setLockPin('');
        setLockError('');
        resetTimer();
      } else {
        setLockError('Incorrect PIN');
        setLockPin('');
      }
    } catch {
      setLockError('Network error');
    }
  }

  // Keyboard support for lock screen
  useEffect(() => {
    if (!isLocked) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') {
        setLockPin((p) => {
          if (p.length >= 6) return p;
          const next = p + e.key;
          // Pass next directly to avoid stale-closure issue with `lockPin` state
          if (next.length >= 4) setTimeout(() => void handleUnlock(next), 0);
          return next;
        });
      } else if (e.key === 'Backspace') {
        setLockPin((p) => p.slice(0, -1));
      } else if (e.key === 'Enter') {
        void handleUnlock();
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        setLockPin('');
        setLockError('');
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked]);

  const userRole = user?.role ?? '';

  const isActive = (path: string) =>
    path === '/pos' ? location.pathname === path : location.pathname.startsWith(path);

  const toggleGroup = (label: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const canSee = (roles?: string[]) => !roles || roles.includes(userRole);
  const canSeeBusinessType = (businessTypes?: string[]) =>
    !businessTypes || businessTypes.includes(businessType);

  const visibleGroups = NAV_GROUPS
    .filter((g) => canSee(g.roles) && canSeeBusinessType(g.businessTypes))
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => canSee(item.roles) && canSeeBusinessType(item.businessTypes)),
    }))
    .filter((g) => g.items.length > 0);

  const showSettings = canSee(['OWNER', 'MANAGER']);

  // ─── Lock screen ─────────────────────────────────────────────────────────
  if (isLocked) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/95 backdrop-blur-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs p-8 text-center">
          {/* Icon */}
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Session Locked</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {user?.name ? <><span className="font-medium text-gray-700 dark:text-gray-300">{user.name}</span> — </> : ''}
            enter your PIN to continue
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-5">
            You can also type on your keyboard
          </p>

          {/* PIN dots */}
          <div className="flex justify-center gap-3 mb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-150 ${
                  i < lockPin.length
                    ? 'bg-blue-600 border-blue-600 text-white scale-110'
                    : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700'
                }`}
              >
                {i < lockPin.length ? '●' : ''}
              </div>
            ))}
          </div>
          {lockError && (
            <p className="text-sm text-red-500 mb-3 font-medium">{lockError}</p>
          )}

          {/* PIN pad */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[1,2,3,4,5,6,7,8,9,'C',0,'⌫'].map((k, i) => (
              <button
                key={i}
                onClick={() => {
                  if (k === 'C') { setLockPin(''); setLockError(''); }
                  else if (k === '⌫') setLockPin((p) => p.slice(0, -1));
                  else if (lockPin.length < 6) {
                    const next = lockPin + k.toString();
                    setLockPin(next);
                    if (next.length >= 4) void handleUnlock(next);
                  }
                }}
                className={`h-12 rounded-xl font-semibold text-base transition-all duration-100 active:scale-90 ${
                  k === 'C'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm hover:bg-red-100 dark:hover:bg-red-900/40'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300'
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Enter button */}
          <button
            onClick={() => void handleUnlock()}
            disabled={lockPin.length < 4}
            className="w-full h-12 mb-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2"
          >
            Unlock  <kbd className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded font-mono">↵ Enter</kbd>
          </button>

          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            Sign out instead
          </button>
        </div>
      </div>
    );
  }

  // ─── Main layout ──────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-[260px] flex-col flex-shrink-0 bg-[#f8f9fb] dark:bg-[#0d1117] border-r border-gray-200/80 dark:border-white/[0.055] relative">

        {/* 2px gradient accent line at the very top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 z-10" />

        {/* ── Brand header ──────────────────────────────────────────────── */}
        <div className="px-4 pt-6 pb-4 mt-[2px]">

          {/* Logo + wordmark row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-inset ring-white/15">
                <img
                  src="/logo.png"
                  alt=""
                  className="w-6 h-6 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              {/* Online dot */}
              <div className="absolute -bottom-0.5 -right-0.5 w-[11px] h-[11px] bg-emerald-400 rounded-full border-2 border-[#f8f9fb] dark:border-[#0d1117] shadow-sm" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-extrabold text-gray-900 dark:text-white leading-tight tracking-[-0.01em]">KASTRA POS</div>
              <div className="flex items-center gap-1.5 mt-[3px]">
                <span className="text-[9.5px] font-bold tracking-[0.14em] uppercase text-blue-600 dark:text-blue-400">Enterprise</span>
                <span className="w-[3px] h-[3px] rounded-full bg-gray-300 dark:bg-white/20 flex-shrink-0" />
                <span className={`text-[9px] font-semibold px-1.5 py-[1px] rounded-full uppercase tracking-wide ${
                  subscription?.subscriptionStatus === 'ACTIVE'
                    ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : subscription?.subscriptionStatus === 'TRIAL'
                      ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/40'
                }`}>
                  {subscription?.subscriptionStatus === 'ACTIVE' ? 'Active' : subscription?.subscriptionStatus === 'TRIAL' ? 'Trial' : 'Free'}
                </span>
              </div>
            </div>
          </div>

          {/* User identity card */}
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white dark:bg-white/[0.05] border border-gray-200/70 dark:border-white/[0.08] shadow-sm hover:shadow dark:shadow-none hover:border-gray-300/70 dark:hover:border-white/[0.13] transition-all duration-200 cursor-default">
            <div className={`w-8 h-8 rounded-full ${avatarColor(user?.name ?? 'U')} flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 ring-2 ring-white dark:ring-white/20 shadow-sm`}>
              {getInitials(user?.name ?? 'U')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-gray-800 dark:text-white/90 truncate leading-tight">{user?.name}</div>
              <div className="flex items-center gap-1.5 mt-[3px]">
                <div className="w-[5px] h-[5px] rounded-full bg-emerald-400 ring-[2px] ring-emerald-400/25 flex-shrink-0" />
                <span className="text-[11px] text-gray-400 dark:text-white/35 capitalize font-medium leading-none">{user?.role?.toLowerCase()}</span>
              </div>
            </div>
          </div>

          <div className="mt-2.5">
            <SyncStatusBadge />
          </div>
        </div>

        {/* Section separator */}
        <div className="mx-3.5 h-px bg-gray-200/70 dark:bg-white/[0.055]" />

        {/* ── Navigation ────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-2.5 px-2.5 scrollbar-thin scrollbar-thumb-gray-300/60 dark:scrollbar-thumb-white/10 scrollbar-track-transparent">
          {visibleGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.label);
            return (
              <div key={group.label} className="mb-2">

                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-2 py-[5px] mb-[3px] rounded-md transition-colors duration-150 group hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                >
                  <span className="text-[9.5px] font-bold text-gray-400/70 dark:text-white/22 uppercase tracking-[0.14em] group-hover:text-gray-500 dark:group-hover:text-white/45 transition-colors duration-150">
                    {group.label}
                  </span>
                  {collapsed
                    ? <ChevronRight className="w-[11px] h-[11px] text-gray-300/80 dark:text-white/15 group-hover:text-gray-400 dark:group-hover:text-white/35 transition-colors" />
                    : <ChevronDown className="w-[11px] h-[11px] text-gray-300/80 dark:text-white/15 group-hover:text-gray-400 dark:group-hover:text-white/35 transition-colors" />
                  }
                </button>

                {/* Group items */}
                <div className={`overflow-hidden transition-all duration-200 ease-out ${
                  collapsed ? 'max-h-0 opacity-0' : 'max-h-[900px] opacity-100'
                }`}>
                  <div className="space-y-[2px]">
                    {group.items.map((item) => {
                      const active = isActive(item.to);
                      const navCls = `group flex items-center gap-2.5 px-2 py-[6px] rounded-lg text-[13px] font-medium transition-all duration-150 ${
                        active
                          ? 'bg-blue-600/[0.09] dark:bg-blue-500/[0.14] text-blue-700 dark:text-blue-300'
                          : 'text-gray-500/90 dark:text-white/38 hover:text-gray-800 dark:hover:text-white/75 hover:bg-gray-900/[0.04] dark:hover:bg-white/[0.05]'
                      }`;
                      const navInner = (
                        <>
                          <div className={`flex-shrink-0 flex items-center justify-center w-[26px] h-[26px] rounded-md transition-all duration-150 ${
                            active
                              ? 'bg-blue-600/[0.12] dark:bg-blue-400/[0.18]'
                              : 'bg-transparent group-hover:bg-gray-900/[0.05] dark:group-hover:bg-white/[0.07]'
                          }`}>
                            <item.icon className={`w-[14px] h-[14px] transition-colors duration-150 ${
                              active
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-400 dark:text-white/32 group-hover:text-gray-600 dark:group-hover:text-white/60'
                            }`} />
                          </div>
                          <span className={`flex-1 truncate transition-all duration-150 ${active ? 'font-semibold' : 'font-medium'}`}>
                            {item.label}
                          </span>
                          {active && <div className="flex-shrink-0 w-1 h-1 rounded-full bg-blue-500 dark:bg-blue-400 opacity-70" />}
                        </>
                      );
                      return item.newTab ? (
                        <button
                          key={item.to}
                          onClick={() => {
                            const biz = user?.businessId ?? '';
                            const store = user?.storeId ?? '';
                            // Pass token via localStorage so the new tab can pick it up
                            // (sessionStorage is tab-scoped and not shared with new tabs)
                            const token = getToken();
                            if (token) localStorage.setItem('kiosk-tab-token', token);
                            window.open(`${item.to}?businessId=${biz}&storeId=${store}`, '_blank', 'noopener');
                          }}
                          className={`w-full text-left cursor-pointer ${navCls}`}
                        >
                          {navInner}
                        </button>
                      ) : (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={navCls}
                        >
                          {navInner}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="px-2.5 pb-3 pt-1">
          {/* Separator above footer */}
          <div className="mx-0.5 mb-2 h-px bg-gray-200/70 dark:bg-white/[0.055]" />

          {/* Footer actions grouped in a card */}
          <div className="rounded-xl bg-white/70 dark:bg-white/[0.035] border border-gray-200/60 dark:border-white/[0.07] overflow-hidden divide-y divide-gray-200/50 dark:divide-white/[0.05]">

            {/* Notifications */}
            <Link
              to="/notifications"
              className={`group flex items-center gap-2.5 px-3 py-[8px] text-[13px] font-medium transition-colors duration-150 ${
                isActive('/notifications')
                  ? 'bg-blue-600/[0.09] dark:bg-blue-500/[0.14] text-blue-700 dark:text-blue-300'
                  : 'text-gray-500 dark:text-white/42 hover:text-gray-800 dark:hover:text-white/75 hover:bg-gray-50 dark:hover:bg-white/[0.05]'
              }`}
            >
              <div className={`flex-shrink-0 flex items-center justify-center w-[26px] h-[26px] rounded-md transition-all duration-150 ${
                isActive('/notifications')
                  ? 'bg-blue-600/[0.12] dark:bg-blue-400/[0.18]'
                  : 'bg-transparent group-hover:bg-gray-900/[0.05] dark:group-hover:bg-white/[0.07]'
              }`}>
                <Bell className={`w-[14px] h-[14px] ${isActive('/notifications') ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-white/32 group-hover:text-gray-600 dark:group-hover:text-white/60'}`} />
              </div>
              <span className="flex-1">Notifications</span>
              {unreadCount > 0 && (
                <div className="flex-shrink-0 flex items-center justify-center min-w-[16px] h-4 bg-red-500 rounded-full px-1 text-[10px] font-bold text-white shadow-sm shadow-red-500/40">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
            </Link>

            {showSettings && (
              <>
                <Link
                  to="/settings"
                  className={`group flex items-center gap-2.5 px-3 py-[8px] text-[13px] font-medium transition-colors duration-150 ${
                    isActive('/settings')
                      ? 'bg-blue-600/[0.09] dark:bg-blue-500/[0.14] text-blue-700 dark:text-blue-300'
                      : 'text-gray-500 dark:text-white/42 hover:text-gray-800 dark:hover:text-white/75 hover:bg-gray-50 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <div className={`flex-shrink-0 flex items-center justify-center w-[26px] h-[26px] rounded-md transition-all duration-150 ${
                    isActive('/settings')
                      ? 'bg-blue-600/[0.12] dark:bg-blue-400/[0.18]'
                      : 'bg-transparent group-hover:bg-gray-900/[0.05] dark:group-hover:bg-white/[0.07]'
                  }`}>
                    <Settings className={`w-[14px] h-[14px] group-hover:rotate-90 transition-all duration-300 ${isActive('/settings') ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-white/32 group-hover:text-gray-600 dark:group-hover:text-white/60'}`} />
                  </div>
                  <span className="flex-1">Settings</span>
                </Link>
                <Link
                  to="/setup"
                  className={`group flex items-center gap-2.5 px-3 py-[8px] text-[13px] font-medium transition-colors duration-150 ${
                    isActive('/setup')
                      ? 'bg-blue-600/[0.09] dark:bg-blue-500/[0.14] text-blue-700 dark:text-blue-300'
                      : 'text-gray-500 dark:text-white/42 hover:text-gray-800 dark:hover:text-white/75 hover:bg-gray-50 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <div className={`flex-shrink-0 flex items-center justify-center w-[26px] h-[26px] rounded-md transition-all duration-150 ${
                    isActive('/setup')
                      ? 'bg-blue-600/[0.12] dark:bg-blue-400/[0.18]'
                      : 'bg-transparent group-hover:bg-gray-900/[0.05] dark:group-hover:bg-white/[0.07]'
                  }`}>
                    <Wand2 className={`w-[14px] h-[14px] ${isActive('/setup') ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-white/32 group-hover:text-gray-600 dark:group-hover:text-white/60'}`} />
                  </div>
                  <span className="flex-1">Setup Wizard</span>
                </Link>
              </>
            )}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="w-full group flex items-center gap-2.5 px-3 py-[8px] text-[13px] font-medium text-gray-500 dark:text-white/42 hover:text-gray-800 dark:hover:text-white/75 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors duration-150"
            >
              <div className="flex-shrink-0 flex items-center justify-center w-[26px] h-[26px] rounded-md bg-transparent group-hover:bg-gray-900/[0.05] dark:group-hover:bg-white/[0.07] transition-all duration-150">
                {isDark
                  ? <Sun className="w-[14px] h-[14px] text-amber-500 group-hover:rotate-12 transition-transform duration-300" />
                  : <Moon className="w-[14px] h-[14px] text-gray-400 group-hover:text-indigo-500 transition-colors duration-200" />
                }
              </div>
              <span className="flex-1 text-left">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            {/* Sign out — danger-tinted */}
            <button
              onClick={logout}
              className="w-full group flex items-center gap-2.5 px-3 py-[8px] text-[13px] font-medium text-gray-400 dark:text-white/32 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50/80 dark:hover:bg-red-500/[0.07] transition-colors duration-150"
            >
              <div className="flex-shrink-0 flex items-center justify-center w-[26px] h-[26px] rounded-md bg-transparent group-hover:bg-red-100/60 dark:group-hover:bg-red-500/10 transition-all duration-150">
                <LogOut className="w-[14px] h-[14px] group-hover:translate-x-0.5 transition-transform duration-200" />
              </div>
              <span className="flex-1 text-left">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <OfflineBanner />

        {/* Trial banner */}
        {showTrialBanner && (
          <div className={`flex items-center justify-between px-4 py-2 text-sm font-medium ${
            subscription!.isTrialExpired
              ? 'bg-red-600 text-white'
              : subscription!.daysRemaining! <= 3
                ? 'bg-orange-500 text-white'
                : 'bg-amber-400 text-amber-900'
          }`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {subscription!.isTrialExpired
                ? 'Your trial has expired. API access is restricted. Please subscribe to continue.'
                : `Trial ending in ${subscription!.daysRemaining} day${subscription!.daysRemaining === 1 ? '' : 's'}. Subscribe to keep full access.`
              }
            </div>
            <button
              onClick={() => setTrialBannerDismissed(true)}
              className="ml-4 hover:opacity-70 transition-opacity flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 pb-16 md:pb-0 relative">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.01]">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgb(0 0 0) 1px, transparent 0)`,
              backgroundSize: '20px 20px'
            }} />
          </div>
          <div className="relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

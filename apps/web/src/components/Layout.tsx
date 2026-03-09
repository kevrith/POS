import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShoppingCart, BarChart3, Package, Settings, LogOut, Users,
  CreditCard, Truck, DollarSign, UserCheck, Coffee, Layers,
  Bell, ChevronDown, ChevronRight, Wallet, Hash, ChefHat, Box, Grid,
  Tag, Gift, Sun, Moon, Monitor, Wand2, ArrowRightLeft, LayoutDashboard,
  AlertTriangle, X, Pill, CalendarClock, TrendingUp, GitBranch, Landmark,
  Lock,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import { connectSocket, disconnectSocket } from '../lib/socket';
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
}

interface NavGroupWithBusinessTypes extends Omit<NavGroup, 'items'> {
  businessTypes?: string[];
  items: NavItemWithBusinessTypes[];
}

const NAV_GROUPS: NavGroupWithBusinessTypes[] = [
  {
    label: 'Sales',
    items: [
      { to: '/pos', icon: ShoppingCart, label: 'Point of Sale', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
      { to: '/hospitality', icon: Coffee, label: 'Hospitality', roles: ['OWNER', 'MANAGER', 'WAITER'], businessTypes: ['RESTAURANT'] },
      { to: '/tables', icon: Grid, label: 'Tables', roles: ['OWNER', 'MANAGER', 'WAITER'], businessTypes: ['RESTAURANT'] },
      { to: '/kds', icon: Monitor, label: 'Kitchen Display', roles: ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN'], businessTypes: ['RESTAURANT'] },
      { to: '/layaway', icon: Layers, label: 'Layaway', roles: ['OWNER', 'MANAGER', 'CASHIER'], businessTypes: ['RETAIL', 'SUPERMARKET'] },
      { to: '/proforma', icon: CreditCard, label: 'Proformas', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
      { to: '/prescriptions', icon: Pill, label: 'Prescriptions', roles: ['OWNER', 'MANAGER', 'CASHIER'], businessTypes: ['CLINIC'] },
      { to: '/appointments', icon: CalendarClock, label: 'Appointments', roles: ['OWNER', 'MANAGER', 'CASHIER'], businessTypes: ['CLINIC', 'SALON'] },
    ],
  },
  {
    label: 'Operations',
    roles: ['OWNER', 'MANAGER'],
    items: [
      { to: '/delivery', icon: Truck, label: 'Delivery', businessTypes: ['RESTAURANT', 'RETAIL', 'SUPERMARKET'] },
    ],
  },
  {
    label: 'Inventory',
    roles: ['OWNER', 'MANAGER'],
    items: [
      { to: '/inventory', icon: Package, label: 'Items & Stock' },
      { to: '/batch', icon: Layers, label: 'Batch & Expiry', businessTypes: ['CLINIC', 'SUPERMARKET'] },
      { to: '/serial', icon: Hash, label: 'Serial Tracking', businessTypes: ['RETAIL'] },
      { to: '/recipe', icon: ChefHat, label: 'Recipes / BOM', businessTypes: ['RESTAURANT'] },
      { to: '/bundle', icon: Box, label: 'Bundles / Kits' },
      { to: '/suppliers', icon: Truck, label: 'Suppliers & POs' },
      { to: '/transfers', icon: ArrowRightLeft, label: 'Stock Transfers' },
    ],
  },
  {
    label: 'Finance',
    roles: ['OWNER', 'MANAGER', 'ACCOUNTANT', 'CASHIER'],
    items: [
      { to: '/owner-dashboard', icon: LayoutDashboard, label: 'Owner Dashboard', roles: ['OWNER'] },
      { to: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
      { to: '/expenses', icon: DollarSign, label: 'Expenses', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
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
      <aside className="hidden md:flex w-56 flex-col flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">

        {/* Brand header */}
        <div className="px-4 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm flex-shrink-0">
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 dark:text-white leading-tight">KASTRA POS</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">Enterprise POS</div>
            </div>
          </div>

          {/* User card */}
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-1.5">
            <div className={`w-6 h-6 rounded-md ${avatarColor(user?.name ?? 'U')} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>
              {getInitials(user?.name ?? 'U')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate leading-tight">
                {user?.name}
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight capitalize">
                {user?.role?.toLowerCase()}
              </div>
            </div>
          </div>

          <div className="mt-2">
            <SyncStatusBadge />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {visibleGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.label);
            return (
              <div key={group.label} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest rounded hover:text-gray-600 dark:hover:text-gray-300 transition-colors mb-0.5"
                >
                  {group.label}
                  {collapsed
                    ? <ChevronRight className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                  }
                </button>
                {!collapsed && group.items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-100 mb-0.5 ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                      }`}
                    >
                      <item.icon className={`w-4 h-4 flex-shrink-0 transition-colors ${
                        active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                      }`} />
                      <span className="truncate text-[13px]">{item.label}</span>
                      {active && (
                        <div className="ml-auto w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400 flex-shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-2 space-y-0.5">
          <Link
            to="/notifications"
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              isActive('/notifications')
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
            Notifications
          </Link>

          {showSettings && (
            <>
              <Link
                to="/settings"
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  isActive('/settings')
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Settings className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                Settings
              </Link>
              <Link
                to="/setup"
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  isActive('/setup')
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Wand2 className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                Setup Wizard
              </Link>
            </>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {isDark
              ? <Sun className="w-4 h-4 flex-shrink-0 text-amber-400" />
              : <Moon className="w-4 h-4 flex-shrink-0 text-gray-400" />
            }
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Sign Out
          </button>
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

        <main className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950 pb-16 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}

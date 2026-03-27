import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Menu, X, ShoppingCart, BarChart3, Package, Settings, Users, Truck,
  DollarSign, CreditCard, Coffee, Grid, Monitor, Layers, Pill, CalendarClock,
  Hash, ChefHat, Box, ArrowRightLeft, Wallet, UserCheck, Tag, Gift,
  TrendingUp, Landmark, GitBranch, LayoutDashboard, LogOut, Bell,
  Home, MoreHorizontal,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';

/* ── Bottom tab bar items (always visible) ────────────────────────────────── */
const BOTTOM_TABS = [
  { to: '/pos',       icon: ShoppingCart, label: 'POS'       },
  { to: '/inventory', icon: Package,      label: 'Items'     },
  { to: '/reports',   icon: BarChart3,    label: 'Reports'   },
  { to: '/',          icon: Home,         label: 'Dashboard' },
];

/* ── Full navigation groups (overlay menu) ────────────────────────────────── */
const MENU_GROUPS = [
  {
    label: 'Sales',
    items: [
      { to: '/pos',           icon: ShoppingCart,  label: 'Point of Sale'   },
      { to: '/sales-list',    icon: ShoppingCart,  label: 'Sales History'   },
      { to: '/layaway',       icon: Layers,        label: 'Layaway'         },
      { to: '/proforma',      icon: CreditCard,    label: 'Proformas'       },
      { to: '/customers',     icon: Users,         label: 'Customers'       },
      { to: '/promotions',    icon: Tag,           label: 'Promotions'      },
      { to: '/gift-cards',    icon: Gift,          label: 'Gift Cards'      },
    ],
  },
  {
    label: 'Hospitality',
    items: [
      { to: '/hospitality',   icon: Coffee,        label: 'Hospitality'     },
      { to: '/tables',        icon: Grid,          label: 'Tables'          },
      { to: '/kds',           icon: Monitor,       label: 'Kitchen Display' },
      { to: '/prescriptions', icon: Pill,          label: 'Prescriptions'   },
      { to: '/appointments',  icon: CalendarClock, label: 'Appointments'    },
      { to: '/delivery',      icon: Truck,         label: 'Delivery'        },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { to: '/inventory',     icon: Package,       label: 'Items & Stock'   },
      { to: '/batch',         icon: Layers,        label: 'Batch & Expiry'  },
      { to: '/serial',        icon: Hash,          label: 'Serial Tracking' },
      { to: '/recipe',        icon: ChefHat,       label: 'Recipes / BOM'   },
      { to: '/bundle',        icon: Box,           label: 'Bundles / Kits'  },
      { to: '/suppliers',     icon: Truck,         label: 'Suppliers & POs' },
      { to: '/transfers',     icon: ArrowRightLeft, label: 'Stock Transfers' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/reports',       icon: BarChart3,     label: 'Reports'         },
      { to: '/cash-drawer',   icon: Wallet,        label: 'Cash Drawer'     },
      { to: '/expenses',      icon: DollarSign,    label: 'Expenses'        },
      { to: '/reconciliation',icon: Landmark,      label: 'Reconciliation'  },
      { to: '/payroll',       icon: DollarSign,    label: 'Payroll'         },
      { to: '/forecasting',   icon: TrendingUp,    label: 'AI Forecasting'  },
    ],
  },
  {
    label: 'Management',
    items: [
      { to: '/hr',            icon: UserCheck,     label: 'Staff & HR'      },
      { to: '/owner-dashboard',icon: LayoutDashboard,label:'Owner Dashboard'},
      { to: '/franchise',     icon: GitBranch,     label: 'Franchise'       },
      { to: '/notifications', icon: Bell,          label: 'Notifications'   },
      { to: '/settings',      icon: Settings,      label: 'Settings'        },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────────────── */

interface Props {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export default function MobileNav({ isOpen, onOpen, onClose }: Props) {
  const location  = useLocation();
  const logout    = useAuthStore((s) => s.logout);
  const user      = useAuthStore((s) => s.user);
  const isDark    = useThemeStore((s) => s.isDark);
  const toggleTheme = useThemeStore((s) => s.toggle);

  /* Lock body scroll when menu is open */
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const isActive = (to: string) =>
    to === '/'
      ? location.pathname === '/'
      : location.pathname === to || location.pathname.startsWith(to + '/');

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <>
      {/* ── Mobile top header ─────────────────────────────────────────────── */}
      <div className="md:hidden flex items-center justify-between px-4 h-14 bg-white dark:bg-[#0d1117] border-b border-gray-200/80 dark:border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-extrabold text-gray-900 dark:text-white tracking-tight">
            KASTRA <span className="text-blue-500">POS</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors"
            aria-label="Toggle theme"
          >
            {isDark
              ? <svg className="w-[15px] h-[15px] text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          <button
            onClick={isOpen ? onClose : onOpen}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            <div className="w-[18px] h-[18px] relative">
              <span className={`absolute inset-0 transition-all duration-200 ${isOpen ? 'opacity-100 rotate-0' : 'opacity-0 rotate-90'}`}>
                <X className="w-[18px] h-[18px]" />
              </span>
              <span className={`absolute inset-0 transition-all duration-200 ${isOpen ? 'opacity-0 -rotate-90' : 'opacity-100 rotate-0'}`}>
                <Menu className="w-[18px] h-[18px]" />
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Overlay backdrop ──────────────────────────────────────────────── */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* ── Slide-in drawer ───────────────────────────────────────────────── */}
      <div
        className={`md:hidden fixed top-0 bottom-0 right-0 z-50 w-[300px] flex flex-col
          bg-white dark:bg-[#0d1117] shadow-[−24px_0_64px_rgba(0,0,0,0.25)]
          border-l border-gray-100 dark:border-white/[0.06]
          transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
              {initials}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-gray-900 dark:text-white leading-none">{user?.name ?? 'User'}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 capitalize">{user?.role?.toLowerCase() ?? ''}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-3">
          {MENU_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-4 py-1.5 text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-[0.1em]">
                {group.label}
              </div>
              {group.items.map((item) => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                      active
                        ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 shadow-[inset_2px_0_0_#3b82f6] dark:shadow-[inset_2px_0_0_#60a5fa]'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.05] hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Drawer footer */}
        <div className="border-t border-gray-100 dark:border-white/[0.06] p-3 flex-shrink-0">
          <button
            onClick={() => { logout(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Bottom tab bar ────────────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#0d1117]/95 backdrop-blur-md border-t border-gray-200/80 dark:border-white/[0.06]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch">
          {BOTTOM_TABS.map((tab) => {
            const active = isActive(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className="flex-1 flex flex-col items-center justify-end pt-2 pb-2.5 gap-1 relative transition-colors duration-150"
              >
                {/* Active indicator line at top */}
                <span className={`absolute top-0 left-1/2 -translate-x-1/2 h-[2px] rounded-b-full transition-all duration-200 ${
                  active ? 'w-6 bg-blue-500' : 'w-0 bg-transparent'
                }`} />
                <tab.icon className={`w-[20px] h-[20px] transition-colors duration-150 ${
                  active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                }`} />
                <span className={`text-[10px] font-semibold leading-none transition-colors duration-150 ${
                  active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                }`}>{tab.label}</span>
              </Link>
            );
          })}
          {/* More button */}
          <button
            onClick={isOpen ? onClose : onOpen}
            className="flex-1 flex flex-col items-center justify-end pt-2 pb-2.5 gap-1 relative transition-colors duration-150"
          >
            <span className={`absolute top-0 left-1/2 -translate-x-1/2 h-[2px] rounded-b-full transition-all duration-200 ${
              isOpen ? 'w-6 bg-blue-500' : 'w-0 bg-transparent'
            }`} />
            <MoreHorizontal className={`w-[20px] h-[20px] transition-colors duration-150 ${
              isOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
            }`} />
            <span className={`text-[10px] font-semibold leading-none transition-colors duration-150 ${
              isOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
            }`}>More</span>
          </button>
        </div>
      </div>
    </>
  );
}

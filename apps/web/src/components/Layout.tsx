import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShoppingCart, BarChart3, Package, Settings, LogOut, Users,
  CreditCard, Truck, DollarSign, UserCheck, Coffee, Layers,
  Bell, ChevronDown, ChevronRight, Wallet, Hash, ChefHat, Box, Grid,
  Tag, Gift, Sun, Moon, Monitor,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import SyncStatusBadge, { OfflineBanner } from './SyncStatusBadge';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles?: string[]; // undefined = visible to all roles
}

interface NavGroup {
  label: string;
  roles?: string[]; // undefined = visible to all roles
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Sales',
    items: [
      { to: '/pos', icon: ShoppingCart, label: 'Point of Sale', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
      { to: '/hospitality', icon: Coffee, label: 'Hospitality', roles: ['OWNER', 'MANAGER', 'WAITER'] },
      { to: '/tables', icon: Grid, label: 'Tables', roles: ['OWNER', 'MANAGER', 'WAITER'] },
      { to: '/kds', icon: Monitor, label: 'Kitchen Display', roles: ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN'] },
      { to: '/layaway', icon: Layers, label: 'Layaway', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
      { to: '/proforma', icon: CreditCard, label: 'Proformas', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
    ],
  },
  {
    label: 'Inventory',
    roles: ['OWNER', 'MANAGER'],
    items: [
      { to: '/inventory', icon: Package, label: 'Items & Stock' },
      { to: '/batch', icon: Layers, label: 'Batch & Expiry' },
      { to: '/serial', icon: Hash, label: 'Serial Tracking' },
      { to: '/recipe', icon: ChefHat, label: 'Recipes / BOM' },
      { to: '/bundle', icon: Box, label: 'Bundles / Kits' },
      { to: '/suppliers', icon: Truck, label: 'Suppliers & POs' },
    ],
  },
  {
    label: 'Finance',
    roles: ['OWNER', 'MANAGER', 'ACCOUNTANT', 'CASHIER'],
    items: [
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
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const canSee = (roles?: string[]) =>
    !roles || roles.includes(userRole);

  const visibleGroups = NAV_GROUPS
    .filter((g) => canSee(g.roles))
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => canSee(item.roles)),
    }))
    .filter((g) => g.items.length > 0);

  const showSettings = canSee(['OWNER', 'MANAGER']);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-white dark:bg-gray-800 shadow-lg flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">POS Kenya</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {user?.name} · {user?.role}
          </p>
          <div className="mt-2">
            <SyncStatusBadge />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.label);
            return (
              <div key={group.label} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300"
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
                      className={`flex items-center px-4 py-2.5 text-sm transition-colors ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-r-4 border-blue-600 font-medium'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <item.icon className={`w-4 h-4 mr-3 flex-shrink-0 ${active ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-2 space-y-0.5">
          <Link
            to="/notifications"
            className={`flex items-center px-4 py-2 text-sm rounded transition-colors ${
              isActive('/notifications')
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Bell className="w-4 h-4 mr-3" />
            Notifications
          </Link>
          {showSettings && (
            <Link
              to="/settings"
              className={`flex items-center px-4 py-2 text-sm rounded transition-colors ${
                isActive('/settings')
                  ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Settings className="w-4 h-4 mr-3" />
              Settings
            </Link>
          )}
          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center px-4 py-2 text-sm rounded transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="w-4 h-4 mr-3" /> : <Moon className="w-4 h-4 mr-3" />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <OfflineBanner />
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          {children}
        </main>
      </div>
    </div>
  );
}

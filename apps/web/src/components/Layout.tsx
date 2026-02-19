import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShoppingCart, BarChart3, Package, Settings, LogOut, Users,
  CreditCard, Truck, DollarSign, UserCheck, Coffee, Layers,
  Bell, ChevronDown, ChevronRight, Wallet, Hash, ChefHat, Box, Grid,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Sales',
    items: [
      { to: '/pos', icon: ShoppingCart, label: 'Point of Sale' },
      { to: '/hospitality', icon: Coffee, label: 'Hospitality' },
      { to: '/tables', icon: Grid, label: 'Tables' },
      { to: '/layaway', icon: Layers, label: 'Layaway' },
      { to: '/proforma', icon: CreditCard, label: 'Proformas' },
    ],
  },
  {
    label: 'Inventory',
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
    items: [
      { to: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
      { to: '/expenses', icon: DollarSign, label: 'Expenses' },
      { to: '/reports', icon: BarChart3, label: 'Reports' },
      { to: '/sales-list', icon: ShoppingCart, label: 'Sales History' },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/customers', icon: Users, label: 'Customers' },
      { to: '/hr', icon: UserCheck, label: 'Staff & HR' },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const isActive = (path: string) =>
    path === '/pos' ? location.pathname === path : location.pathname.startsWith(path);

  const toggleGroup = (label: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <aside className="w-56 bg-white shadow-lg flex flex-col flex-shrink-0">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold text-blue-600">POS Kenya</h1>
          <p className="text-xs text-gray-500 truncate">{user?.name} · {user?.role}</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_GROUPS.map((group) => {
            const collapsed = collapsedGroups.has(group.label);
            return (
              <div key={group.label} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600"
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
                          ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-600 font-medium'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <item.icon className={`w-4 h-4 mr-3 flex-shrink-0 ${active ? 'text-blue-600' : ''}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t p-2 space-y-0.5">
          <Link
            to="/notifications"
            className={`flex items-center px-4 py-2 text-sm rounded transition-colors ${
              isActive('/notifications') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Bell className="w-4 h-4 mr-3" />
            Notifications
          </Link>
          <Link
            to="/settings"
            className={`flex items-center px-4 py-2 text-sm rounded transition-colors ${
              isActive('/settings') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Settings className="w-4 h-4 mr-3" />
            Settings
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

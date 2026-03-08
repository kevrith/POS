import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingCart, BarChart3, Package, Settings, Users, Truck, DollarSign, CreditCard, Coffee, Grid, Monitor, Layers, Pill, CalendarClock, Hash, ChefHat, Box, ArrowRightLeft, Wallet, UserCheck, Tag, Gift, TrendingUp, Landmark, GitBranch, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/auth';

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const allLinks = [
    { to: '/pos', icon: ShoppingCart, label: 'Point of Sale' },
    { to: '/hospitality', icon: Coffee, label: 'Hospitality' },
    { to: '/tables', icon: Grid, label: 'Tables' },
    { to: '/kds', icon: Monitor, label: 'Kitchen Display' },
    { to: '/layaway', icon: Layers, label: 'Layaway' },
    { to: '/proforma', icon: CreditCard, label: 'Proformas' },
    { to: '/prescriptions', icon: Pill, label: 'Prescriptions' },
    { to: '/appointments', icon: CalendarClock, label: 'Appointments' },
    { to: '/delivery', icon: Truck, label: 'Delivery' },
    { to: '/inventory', icon: Package, label: 'Items & Stock' },
    { to: '/batch', icon: Layers, label: 'Batch & Expiry' },
    { to: '/serial', icon: Hash, label: 'Serial Tracking' },
    { to: '/recipe', icon: ChefHat, label: 'Recipes / BOM' },
    { to: '/bundle', icon: Box, label: 'Bundles / Kits' },
    { to: '/suppliers', icon: Truck, label: 'Suppliers & POs' },
    { to: '/transfers', icon: ArrowRightLeft, label: 'Stock Transfers' },
    { to: '/owner-dashboard', icon: LayoutDashboard, label: 'Owner Dashboard' },
    { to: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
    { to: '/expenses', icon: DollarSign, label: 'Expenses' },
    { to: '/reports', icon: BarChart3, label: 'Reports' },
    { to: '/sales-list', icon: ShoppingCart, label: 'Sales History' },
    { to: '/customers', icon: Users, label: 'Customers' },
    { to: '/hr', icon: UserCheck, label: 'Staff & HR' },
    { to: '/payroll', icon: DollarSign, label: 'Payroll' },
    { to: '/promotions', icon: Tag, label: 'Promotions' },
    { to: '/gift-cards', icon: Gift, label: 'Gift Cards' },
    { to: '/forecasting', icon: TrendingUp, label: 'AI Forecasting' },
    { to: '/reconciliation', icon: Landmark, label: 'Reconciliation' },
    { to: '/franchise', icon: GitBranch, label: 'Franchise Network' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-gray-900 dark:text-white">KASTRA POS</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setIsOpen(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-900 shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">KASTRA POS</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{user?.name}</div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="p-4 space-y-1">
              {allLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    location.pathname === link.to || location.pathname.startsWith(link.to + '/')
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <link.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{link.label}</span>
                </Link>
              ))}
              <button
                onClick={() => { logout(); setIsOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mt-4"
              >
                <LogOut className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 safe-area-inset-bottom z-20">
        <div className="flex items-center justify-around px-2 py-2">
          {[allLinks[0], allLinks[9], allLinks[19], allLinks[29]].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-0 ${
                location.pathname === link.to
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <link.icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-xs font-medium truncate">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

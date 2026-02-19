import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';

// Lazy load all pages for code-splitting
const POSPage = lazy(() => import('./pages/POSPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'));
const HRPage = lazy(() => import('./pages/HRPage'));
const CashDrawerPage = lazy(() => import('./pages/CashDrawerPage'));
const HospitalityPage = lazy(() => import('./pages/HospitalityPage'));
const LayawayPage = lazy(() => import('./pages/LayawayPage'));
const ProformaPage = lazy(() => import('./pages/ProformaPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const BatchManagementPage = lazy(() => import('./pages/BatchManagementPage'));
const SerialTrackingPage = lazy(() => import('./pages/SerialTrackingPage'));
const RecipeManagementPage = lazy(() => import('./pages/RecipeManagementPage'));
const BundleManagementPage = lazy(() => import('./pages/BundleManagementPage'));
const TablesPage = lazy(() => import('./pages/HospitalityPage'));
const SalesListPage = lazy(() => import('./pages/SalesListPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/pos" replace />} />
          {/* Sales */}
          <Route path="/pos" element={<POSPage />} />
          <Route path="/hospitality" element={<HospitalityPage />} />
          <Route path="/layaway" element={<LayawayPage />} />
          <Route path="/proforma" element={<ProformaPage />} />
          {/* Inventory */}
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/batch" element={<BatchManagementPage />} />
          <Route path="/serial" element={<SerialTrackingPage />} />
          <Route path="/recipe" element={<RecipeManagementPage />} />
          <Route path="/bundle" element={<BundleManagementPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/tables" element={<TablesPage />} />
          {/* Finance */}
          <Route path="/cash-drawer" element={<CashDrawerPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/sales-list" element={<SalesListPage />} />
          {/* People */}
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/hr" element={<HRPage />} />
          {/* System */}
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

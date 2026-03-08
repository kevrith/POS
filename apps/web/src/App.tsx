import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';

// Lazy load all pages for code-splitting
const POSPage = lazy(() => import('./pages/POSRouterPage'));
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
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'));
const GiftCardsPage = lazy(() => import('./pages/GiftCardsPage'));
const KDSPage = lazy(() => import('./pages/KDSPage'));
const SetupWizardPage = lazy(() => import('./pages/SetupWizardPage'));
const TransfersPage = lazy(() => import('./pages/TransfersPage'));
const OwnerDashboardPage = lazy(() => import('./pages/OwnerDashboardPage'));
const PoleDisplayPage = lazy(() => import('./pages/PoleDisplayPage'));
const PrescriptionsPage = lazy(() => import('./pages/PrescriptionsPage'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'));
const DeliveryPage = lazy(() => import('./pages/DeliveryPage'));
const CustomerPortalPage = lazy(() => import('./pages/CustomerPortalPage'));
const PayrollPage = lazy(() => import('./pages/PayrollPage'));
const ForecastingPage = lazy(() => import('./pages/ForecastingPage'));
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage'));
const FranchisePage = lazy(() => import('./pages/FranchisePage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Pole display is a standalone page — no auth, no layout
  if (window.location.pathname === '/pole-display') {
    return (
      <Suspense fallback={<div style={{ background: '#0d1b2a', height: '100vh' }} />}>
        <PoleDisplayPage />
      </Suspense>
    );
  }

  // Customer portal — public, no auth, no layout
  if (window.location.pathname === '/portal') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-indigo-50" />}>
        <CustomerPortalPage />
      </Suspense>
    );
  }

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
          <Route path="/payroll" element={<PayrollPage />} />
          {/* Hospitality */}
          <Route path="/kds" element={<KDSPage />} />
          {/* Marketing */}
          <Route path="/promotions" element={<PromotionsPage />} />
          <Route path="/gift-cards" element={<GiftCardsPage />} />
          {/* Multi-store */}
          <Route path="/transfers" element={<TransfersPage />} />
          <Route path="/owner-dashboard" element={<OwnerDashboardPage />} />
          {/* Clinic / Pharmacy */}
          <Route path="/prescriptions" element={<PrescriptionsPage />} />
          {/* Appointments / Service */}
          <Route path="/appointments" element={<AppointmentsPage />} />
          {/* Delivery */}
          <Route path="/delivery" element={<DeliveryPage />} />
          {/* System */}
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/setup" element={<SetupWizardPage />} />
          <Route path="/forecasting" element={<ForecastingPage />} />
          <Route path="/reconciliation" element={<ReconciliationPage />} />
          <Route path="/franchise" element={<FranchisePage />} />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
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
const SalesListPage = lazy(() => import('./pages/SalesListPage'));
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'));
const GiftCardsPage = lazy(() => import('./pages/GiftCardsPage'));
const KDSPage = lazy(() => import('./pages/KDSPage'));
const SetupWizardPage = lazy(() => import('./pages/SetupWizardPage'));
const TransfersPage = lazy(() => import('./pages/TransfersPage'));
const OwnerDashboardPage = lazy(() => import('./pages/OwnerDashboardPage'));
const PoleDisplayPage = lazy(() => import('./pages/PoleDisplayPage'));
const PrescriptionsPage = lazy(() => import('./pages/PrescriptionsPage'));
const PharmacyPage = lazy(() => import('./pages/PharmacyPage'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'));
const DeliveryPage = lazy(() => import('./pages/DeliveryPage'));
const CustomerPortalPage = lazy(() => import('./pages/CustomerPortalPage'));
const PayrollPage = lazy(() => import('./pages/PayrollPage'));
const ForecastingPage = lazy(() => import('./pages/ForecastingPage'));
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage'));
const FranchisePage = lazy(() => import('./pages/FranchisePage'));
const DesktopSetupPage = lazy(() => import('./pages/DesktopSetupPage'));
const HotelPage = lazy(() => import('./pages/HotelPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StocktakePage = lazy(() => import('./pages/StocktakePage'));
const DamagedGoodsPage = lazy(() => import('./pages/DamagedGoodsPage'));
const WaitlistPage = lazy(() => import('./pages/WaitlistPage'));
const ChannelManagerPage = lazy(() => import('./pages/ChannelManagerPage'));
const ChequesPage = lazy(() => import('./pages/ChequesPage'));
const LedgerPage = lazy(() => import('./pages/LedgerPage'));
const PaymentLinksPage = lazy(() => import('./pages/PaymentLinksPage'));
const PayCheckoutPage = lazy(() => import('./pages/PayCheckoutPage'));
const RFQPage = lazy(() => import('./pages/RFQPage'));
const KioskPage = lazy(() => import('./pages/KioskPage'));
const SupermarketPOSPage = lazy(() => import('./pages/SupermarketPOSPage'));
const ReservationWidgetPage = lazy(() => import('./pages/ReservationWidgetPage'));
const SecuritySettingsPage = lazy(() => import('./pages/SecuritySettingsPage'));
const DeliveryManagementPage = lazy(() => import('./pages/DeliveryManagementPage'));
const QRMenuPage = lazy(() => import('./pages/QRMenuPage'));
const OnlineOrderPage = lazy(() => import('./pages/OnlineOrderPage'));
const FuelPumpPage = lazy(() => import('./pages/FuelPumpPage'));
const CybercafePage = lazy(() => import('./pages/CybercafePage'));
const CyberKioskPage = lazy(() => import('./pages/CyberKioskPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

// Extend window type for Tauri (matches DesktopSetupPage declaration)
declare global { interface Window { __TAURI__?: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> } } }

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // On first Tauri launch: redirect to desktop setup wizard
  if (
    window.__TAURI__ &&
    window.location.pathname !== '/desktop-setup' &&
    !localStorage.getItem('desktop-setup-done')
  ) {
    window.location.replace('/desktop-setup');
    return null;
  }

  // Desktop installation wizard — shown on first Tauri launch before setup
  if (window.location.pathname === '/desktop-setup') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
        <DesktopSetupPage />
      </Suspense>
    );
  }

  // Online reservation widget — public embeddable, no auth
  if (window.location.pathname === '/reservation-widget') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-blue-50" />}>
        <ReservationWidgetPage />
      </Suspense>
    );
  }

  // Kiosk mode — standalone, no auth required
  if (window.location.pathname === '/kiosk') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
        <KioskPage />
      </Suspense>
    );
  }

  // Pole display is a standalone page — no auth, no layout
  if (window.location.pathname === '/pole-display') {
    return (
      <Suspense fallback={<div style={{ background: '#0d1b2a', height: '100vh' }} />}>
        <PoleDisplayPage />
      </Suspense>
    );
  }

  // Cyber kiosk — public, no auth, shown on customer's screen
  if (window.location.pathname === '/cyber-kiosk') {
    return (
      <Suspense fallback={<div style={{ background: '#030712', height: '100vh' }} />}>
        <CyberKioskPage />
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

  // Payment link checkout — public, no auth, no layout
  if (window.location.pathname.startsWith('/pay/')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
        <Routes>
          <Route path="/pay/:code" element={<PayCheckoutPage />} />
        </Routes>
      </Suspense>
    );
  }

  // QR Menu — public, no auth
  if (window.location.pathname.startsWith('/menu/')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
        <Routes><Route path="/menu/:businessId" element={<QRMenuPage />} /></Routes>
      </Suspense>
    );
  }

  // Online Ordering — public, no auth
  if (window.location.pathname.startsWith('/order/')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-white" />}>
        <Routes><Route path="/order/:businessId" element={<OnlineOrderPage />} /></Routes>
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    // Ensure any /login?... URL is preserved so LoginPage can read params
    return <LoginPage />;
  }

  return (
    <>
    <Toaster position="top-right" richColors closeButton duration={4000} />
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/pos" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/stocktake" element={<StocktakePage />} />
          {/* Sales */}
          <Route path="/pos" element={<POSPage />} />
          <Route path="/supermart" element={<SupermarketPOSPage />} />
          <Route path="/kiosk" element={<KioskPage />} />
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
          <Route path="/tables" element={<HospitalityPage />} />
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
          <Route path="/pharmacy" element={<PharmacyPage />} />
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
          <Route path="/hotel" element={<HotelPage />} />
          {/* Inventory - extended */}
          <Route path="/damaged-goods" element={<DamagedGoodsPage />} />
          <Route path="/stocktake" element={<StocktakePage />} />
          <Route path="/rfq" element={<RFQPage />} />
          {/* Hospitality - extended */}
          <Route path="/waitlist" element={<WaitlistPage />} />
          <Route path="/channel-manager" element={<ChannelManagerPage />} />
          {/* Finance - extended */}
          <Route path="/cheques" element={<ChequesPage />} />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="/payment-links" element={<PaymentLinksPage />} />
          {/* Security & Delivery */}
          <Route path="/security-settings" element={<SecuritySettingsPage />} />
          <Route path="/delivery-management" element={<DeliveryManagementPage />} />
          {/* Fuel Pump */}
          <Route path="/fuel-pump" element={<FuelPumpPage />} />
          {/* Cybercafe */}
          <Route path="/cybercafe" element={<CybercafePage />} />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </Suspense>
    </Layout>
    </>
  );
}

import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useAuthStore } from './stores/auth';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import { DialogProvider } from './components/Dialog';

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
const OnlineOrdersPage = lazy(() => import('./pages/OnlineOrdersPage'));
const ShopPage = lazy(() => import('./pages/ShopPage'));
const AffiliatePortalPage = lazy(() => import('./pages/AffiliatePortalPage'));
const FuelPumpPage = lazy(() => import('./pages/FuelPumpPage'));
const CybercafePage = lazy(() => import('./pages/CybercafePage'));
const CyberKioskPage = lazy(() => import('./pages/CyberKioskPage'));
const FieldOrdersPage = lazy(() => import('./pages/FieldOrdersPage'));
const DeliveryRoutesPage = lazy(() => import('./pages/DeliveryRoutesPage'));
const AgentPage = lazy(() => import('./pages/AgentPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));

declare global {
  interface Window {
    // Tauri v1 used __TAURI__, Tauri v2 uses __TAURI_INTERNALS__
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

/** Returns true when running inside a Tauri webview (v1 or v2) */
function isTauriEnv(): boolean {
  return !!(window.__TAURI_INTERNALS__ ?? window.__TAURI__);
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

/**
 * In Tauri v2, window.__TAURI__ is injected by the runtime AFTER the first
 * synchronous JS execution. We must poll briefly before deciding whether we
 * are inside Tauri or a regular browser, otherwise the check always returns
 * false on first render and the login page is shown instead of the wizard.
 *
 * Polls every 20 ms for up to 300 ms (15 attempts), then resolves to false.
 */
function useTauriReady(): { ready: boolean; isTauri: boolean } {
  const [state, setState] = useState<{ ready: boolean; isTauri: boolean }>(() => {
    if (isTauriEnv()) return { ready: true, isTauri: true };
    return { ready: false, isTauri: false };
  });

  useEffect(() => {
    if (state.ready) return;
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      if (isTauriEnv()) {
        clearInterval(id);
        setState({ ready: true, isTauri: true });
      } else if (attempts >= 25) {
        // 25 × 20ms = 500ms max wait — enough for any Tauri injection delay
        clearInterval(id);
        setState({ ready: true, isTauri: false });
      }
    }, 20);
    return () => clearInterval(id);
  }, [state.ready]);

  return state;
}

/** Invoke a Tauri command — works for v1 and v2. Returns null if not in Tauri. */
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> } }).__TAURI_INTERNALS__;
    if (internals?.invoke) return internals.invoke<T>(cmd, args);
    if (window.__TAURI__) return (window.__TAURI__ as { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> }).invoke<T>(cmd, args);
  } catch { /* ignore */ }
  return null;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const { ready, isTauri } = useTauriReady();
  const [tauriSetupVerified, setTauriSetupVerified] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  // Always use the Rust config file as the single source of truth.
  // localStorage is unreliable (persists across re-installs in WebView2/WKWebView).
  // If mode.json is missing/UNCONFIGURED → first run or reset → show wizard.
  useEffect(() => {
    if (!ready || !isTauri) {
      setTauriSetupVerified(true);
      return;
    }
    void tauriInvoke<{ mode: string }>('get_setup_mode').then(cfg => {
      if (!cfg || cfg.mode === 'UNCONFIGURED') {
        localStorage.removeItem('desktop-setup-done');
        localStorage.removeItem('desktop-device-role');
        setShowSetupWizard(true);
      }
      setTauriSetupVerified(true);
    }).catch(() => {
      // Rust not reachable (browser dev mode) — fall back to localStorage
      if (!localStorage.getItem('desktop-setup-done')) {
        setShowSetupWizard(true);
      }
      setTauriSetupVerified(true);
    });
  }, [ready, isTauri]);

  // Wait until Tauri env is detected AND (if Tauri) setup config is verified
  if (!ready || (isTauri && !tauriSetupVerified)) {
    return <div className="min-h-screen bg-slate-900" />;
  }

  // Tauri first-run: intercept before ANY other logic including auth
  if (isTauri && showSetupWizard) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
        <DesktopSetupPage />
      </Suspense>
    );
  }

  // Public standalone pages — no auth, no layout
  if (window.location.pathname === '/reservation-widget') {
    return <Suspense fallback={<div className="min-h-screen bg-blue-50" />}><ReservationWidgetPage /></Suspense>;
  }
  if (window.location.pathname === '/kiosk') {
    return <Suspense fallback={<div className="min-h-screen bg-gray-100" />}><KioskPage /></Suspense>;
  }
  if (window.location.pathname === '/pole-display') {
    return <Suspense fallback={<div style={{ background: '#0d1b2a', height: '100vh' }} />}><PoleDisplayPage /></Suspense>;
  }
  if (window.location.pathname === '/cyber-kiosk') {
    return <Suspense fallback={<div style={{ background: '#030712', height: '100vh' }} />}><CyberKioskPage /></Suspense>;
  }
  if (window.location.pathname === '/portal') {
    return <Suspense fallback={<div className="min-h-screen bg-indigo-50" />}><CustomerPortalPage /></Suspense>;
  }
  if (window.location.pathname === '/reset-password') {
    return <Suspense fallback={<div className="min-h-screen bg-slate-900" />}><ResetPasswordPage /></Suspense>;
  }
  if (window.location.pathname.startsWith('/pay/')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
        <Routes><Route path="/pay/:code" element={<PayCheckoutPage />} /></Routes>
      </Suspense>
    );
  }
  if (window.location.pathname.startsWith('/menu/')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
        <Routes><Route path="/menu/:businessId" element={<QRMenuPage />} /></Routes>
      </Suspense>
    );
  }
  if (window.location.pathname.startsWith('/order/')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-white" />}>
        <Routes><Route path="/order/:businessId" element={<OnlineOrderPage />} /></Routes>
      </Suspense>
    );
  }
  if (window.location.pathname.startsWith('/shop/')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
        <Routes><Route path="/shop/:businessId" element={<ShopPage />} /></Routes>
      </Suspense>
    );
  }
  if (window.location.pathname.startsWith('/affiliate')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
        <Routes><Route path="/affiliate" element={<AffiliatePortalPage />} /></Routes>
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return (
      <GoogleOAuthProvider clientId={googleClientId || 'disabled'}>
        <LoginPage />
      </GoogleOAuthProvider>
    );
  }

  return (
    <DialogProvider>
      <>
        <Toaster position="top-right" richColors closeButton duration={4000} />
        <Layout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/pos" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/pos" element={<POSPage />} />
              <Route path="/supermart" element={<SupermarketPOSPage />} />
              <Route path="/hospitality" element={<HospitalityPage />} />
              <Route path="/layaway" element={<LayawayPage />} />
              <Route path="/proforma" element={<ProformaPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/batch" element={<BatchManagementPage />} />
              <Route path="/serial" element={<SerialTrackingPage />} />
              <Route path="/recipe" element={<RecipeManagementPage />} />
              <Route path="/bundle" element={<BundleManagementPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/cash-drawer" element={<CashDrawerPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/sales-list" element={<SalesListPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/hr" element={<HRPage />} />
              <Route path="/payroll" element={<PayrollPage />} />
              <Route path="/kds" element={<KDSPage />} />
              <Route path="/promotions" element={<PromotionsPage />} />
              <Route path="/gift-cards" element={<GiftCardsPage />} />
              <Route path="/transfers" element={<TransfersPage />} />
              <Route path="/owner-dashboard" element={<OwnerDashboardPage />} />
              <Route path="/prescriptions" element={<PrescriptionsPage />} />
              <Route path="/pharmacy" element={<PharmacyPage />} />
              <Route path="/appointments" element={<AppointmentsPage />} />
              <Route path="/delivery" element={<DeliveryPage />} />
              <Route path="/online-orders" element={<OnlineOrdersPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/setup" element={<SetupWizardPage />} />
              <Route path="/forecasting" element={<ForecastingPage />} />
              <Route path="/reconciliation" element={<ReconciliationPage />} />
              <Route path="/franchise" element={<FranchisePage />} />
              <Route path="/hotel" element={<HotelPage />} />
              <Route path="/damaged-goods" element={<DamagedGoodsPage />} />
              <Route path="/stocktake" element={<StocktakePage />} />
              <Route path="/rfq" element={<RFQPage />} />
              <Route path="/waitlist" element={<WaitlistPage />} />
              <Route path="/channel-manager" element={<ChannelManagerPage />} />
              <Route path="/cheques" element={<ChequesPage />} />
              <Route path="/ledger" element={<LedgerPage />} />
              <Route path="/payment-links" element={<PaymentLinksPage />} />
              <Route path="/security-settings" element={<SecuritySettingsPage />} />
              <Route path="/delivery-management" element={<DeliveryManagementPage />} />
              <Route path="/fuel-pump" element={<FuelPumpPage />} />
              <Route path="/cybercafe" element={<CybercafePage />} />
              <Route path="/field-orders" element={<FieldOrdersPage />} />
              <Route path="/delivery-routes" element={<DeliveryRoutesPage />} />
              <Route path="/agent" element={<AgentPage />} />
              <Route path="*" element={<Navigate to="/pos" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </>
    </DialogProvider>
  );
}

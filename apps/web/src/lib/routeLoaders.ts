/**
 * The page behind each menu route, as a dynamic import, so a page can be fetched BEFORE it is opened.
 *
 * React.lazy fetches a page only when it is first drawn, which is the click. Asking for the same module earlier (the
 * pointer reaches the menu item, or the browser is idle) puts it in the module cache, and the click then finds it ready.
 * The specifiers must match the ones in App.tsx: `routeLoaders.test.ts` checks that every lazy route is listed here.
 */
export const routeLoaders: Record<string, () => Promise<unknown>> = {
  '/affiliate': () => import('../pages/AffiliatePortalPage'),
  '/dashboard': () => import('../pages/DashboardPage'),
  '/pos': () => import('../pages/POSRouterPage'),
  '/supermart': () => import('../pages/SupermarketPOSPage'),
  '/hospitality': () => import('../pages/HospitalityPage'),
  '/layaway': () => import('../pages/LayawayPage'),
  '/proforma': () => import('../pages/ProformaPage'),
  '/inventory': () => import('../pages/InventoryPage'),
  '/batch': () => import('../pages/BatchManagementPage'),
  '/serial': () => import('../pages/SerialTrackingPage'),
  '/recipe': () => import('../pages/RecipeManagementPage'),
  '/bundle': () => import('../pages/BundleManagementPage'),
  '/suppliers': () => import('../pages/SuppliersPage'),
  '/cash-drawer': () => import('../pages/CashDrawerPage'),
  '/expenses': () => import('../pages/ExpensesPage'),
  '/reports': () => import('../pages/ReportsPage'),
  '/sales-list': () => import('../pages/SalesListPage'),
  '/customers': () => import('../pages/CustomersPage'),
  '/hr': () => import('../pages/HRPage'),
  '/payroll': () => import('../pages/PayrollPage'),
  '/kds': () => import('../pages/KDSPage'),
  '/promotions': () => import('../pages/PromotionsPage'),
  '/gift-cards': () => import('../pages/GiftCardsPage'),
  '/transfers': () => import('../pages/TransfersPage'),
  '/owner-dashboard': () => import('../pages/OwnerDashboardPage'),
  '/prescriptions': () => import('../pages/PrescriptionsPage'),
  '/pharmacy': () => import('../pages/PharmacyPage'),
  '/appointments': () => import('../pages/AppointmentsPage'),
  '/delivery': () => import('../pages/DeliveryPage'),
  '/online-orders': () => import('../pages/OnlineOrdersPage'),
  '/notifications': () => import('../pages/NotificationsPage'),
  '/settings': () => import('../pages/SettingsPage'),
  '/setup': () => import('../pages/SetupWizardPage'),
  '/server': () => import('../pages/ServerSettingsPage'),
  '/license': () => import('../pages/LicensePage'),
  '/forecasting': () => import('../pages/ForecastingPage'),
  '/reconciliation': () => import('../pages/ReconciliationPage'),
  '/franchise': () => import('../pages/FranchisePage'),
  '/hotel': () => import('../pages/HotelPage'),
  '/damaged-goods': () => import('../pages/DamagedGoodsPage'),
  '/stocktake': () => import('../pages/StocktakePage'),
  '/rfq': () => import('../pages/RFQPage'),
  '/waitlist': () => import('../pages/WaitlistPage'),
  '/channel-manager': () => import('../pages/ChannelManagerPage'),
  '/cheques': () => import('../pages/ChequesPage'),
  '/ledger': () => import('../pages/LedgerPage'),
  '/payment-links': () => import('../pages/PaymentLinksPage'),
  '/security-settings': () => import('../pages/SecuritySettingsPage'),
  '/delivery-management': () => import('../pages/DeliveryManagementPage'),
  '/fuel-pump': () => import('../pages/FuelPumpPage'),
  '/cybercafe': () => import('../pages/CybercafePage'),
  '/field-orders': () => import('../pages/FieldOrdersPage'),
  '/delivery-routes': () => import('../pages/DeliveryRoutesPage'),
  '/agent': () => import('../pages/AgentPage'),
};

const asked = new Set<string>();

/** Start loading the page for `path`. Safe to call often: each page is requested once, and a failure is ignored (the click will retry). */
export function prefetchRoute(path: string): void {
  const key = '/' + path.replace(/^\//, '').split(/[/?#]/)[0];
  const load = routeLoaders[key];
  if (!load || asked.has(key)) return;
  asked.add(key);
  load().catch(() => asked.delete(key));
}

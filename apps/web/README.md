# KASTRA POS — Web PWA

React 18 + TypeScript + Vite 5. The main POS terminal and back office, installable as
a PWA and bundled unchanged by the Tauri desktop app.

Dev server: **http://localhost:3005** (proxies `/api` → `http://localhost:3010`).

---

## Run

```bash
npm install
npm run dev          # :3005
npm run build        # tsc + vite build → dist/
npm run preview
```

`npm run build` type-checks before bundling, so it doubles as the type gate in CI.

> The dev server uses file **polling** (`usePolling: true`) to sidestep the Linux
> inotify watcher limit. If it still fails with `ENOSPC`, raise
> `fs.inotify.max_user_watches`.

---

## API access

`src/lib/api.ts` has base `/api/v1` — relative on purpose, so the app adapts to
whatever origin serves it. Set `VITE_API_URL` **only** when the API lives on a
different origin than the web app.

Always call through `api.get / api.post / api.patch / api.delete`. Get the bearer
token with `getToken()` from `../lib/api` — not from the auth store.

---

## Layout

```
src/
├── App.tsx              # routes + lazy page imports + public-route escape hatches
├── pages/               # 68 route pages
├── components/
│   ├── Layout.tsx       # shell + plan-gated sidebar
│   ├── pos/             # cart panel, item grid, camera, price override, age gate…
│   └── …                # PaymentModal, VoidModal, ReturnModal, PrintModal, LiveMap…
├── stores/              # zustand: auth · pos · sync · theme
├── hooks/               # useBarcodeScanner · useFeatureAccess · useKeyboardShortcuts
└── lib/                 # api · db (Dexie) · syncEngine · featureGates · hardware…
```

### Hardware / platform libs (`src/lib/`)

| File | What it drives |
|---|---|
| `printer.ts`, `receiptPrint.ts` | Thermal receipts (WebUSB / Web Bluetooth) |
| `scale.ts` | Weighing scales (Web Serial / Bluetooth) |
| `cardTerminal.ts`, `terminal.ts` | Card terminals |
| `nfc.ts`, `biometric.ts` | NFC taps, WebAuthn login |
| `fuelPumpController.ts` | Fuel dispenser control |
| `socket.ts` | Live updates (KDS, pole display, driver location) |
| `db.ts`, `syncEngine.ts` | Dexie/IndexedDB offline store + replay |
| `whatsapp.ts` | WhatsApp receipt handoff |

---

## Offline behaviour

Sales taken while offline are written to IndexedDB (Dexie) with an `offlineId` UUID
and replayed by `syncEngine.ts` when connectivity returns; the server deduplicates on
`offlineId`, so a replay can never double-post. `SyncStatusBadge` shows queue depth.

### Service-worker caveat

`vite.config.ts` sets `navigateFallback: '/index.html'`, which would answer *every*
navigation from the precache — including links handed to customers and suppliers on a
device that has a months-old bundle cached. Public routes are therefore listed in
`navigateFallbackDenylist` and always fetch a fresh shell:

`/track/` · `/quote/` · `/shop/` · `/pay/` · `/menu/` · `/order/` · `/portal` ·
`/affiliate` · `/api/` · `/offline.html`

**Adding a new public/customer-facing route means adding it to that denylist.**

---

## Routes

Authenticated app routes are plan-gated — see
[Plans & feature gating](../../README.md#plans--feature-gating).

**Selling** — `/pos` `/supermart` `/kds` `/sales-list` `/cash-drawer` `/proforma`
`/layaway`
**Inventory** — `/inventory` `/batch` `/serial` `/recipe` `/bundle` `/stocktake`
`/transfers` `/damaged-goods` `/suppliers` `/rfq`
**Hospitality & hotel** — `/hospitality` `/hotel` `/waitlist` `/appointments`
`/channel-manager`
**Verticals** — `/pharmacy` `/prescriptions` `/fuel-pump` `/cybercafe`
**Money** — `/expenses` `/cheques` `/ledger` `/reconciliation` `/payment-links`
`/gift-cards` `/promotions`
**People** — `/hr` `/payroll`
**Distribution** — `/agent` `/field-orders` `/delivery` `/delivery-management`
`/delivery-routes` `/online-orders` `/franchise`
**Insight & admin** — `/dashboard` `/owner-dashboard` `/reports` `/forecasting`
`/customers` `/notifications` `/settings` `/security-settings` `/setup`

**Public (no login)** — `/track/:orderNumber` `/quote/:token` `/shop/:businessId`
`/menu/:businessId` `/order/:businessId` `/pay/:code` `/portal` `/affiliate`

`/portal` is matched on `window.location.pathname` before the router mounts, so the
phone-OTP customer portal never renders the staff shell.

Both customer-facing OTP screens — `/portal` (`CustomerPortalPage`) and
`/shop/:businessId` (`ShopPage`) — share [`hooks/useOtpTimers.ts`](src/hooks/useOtpTimers.ts)
for the code-expiry countdown and the resend cooldown, driven by the
`expiresInSeconds` / `resendInSeconds` the server returns. Their `portalFetch`
helpers both drop the session and return to the login screen on a 401.

---

## Plan gating

`src/lib/featureGates.ts` maps each route key → the minimum plan. `Layout.tsx`
filters the sidebar with `hasFeature()`; `useFeatureAccess` gates page bodies and
`UpgradeModal` handles the upsell.

Two details worth knowing:

- `planRank()` is deliberately **case-insensitive** — a paid activation writes a
  title-case `planName` ("Enterprise") while the map keys are upper case, and a raw
  lookup used to rank a paying Enterprise customer as FREE.
- `TRIAL` businesses get full access; after the trial the business's
  `subscriptionTier` is enforced.

**This map controls nothing.** It hides nav items and shows upgrade prompts; the real
access decision is made server-side by the API's `SubscriptionGuard` against the
`Feature` enum in `@pos/shared`. Adding a gated feature means a row in `FEATURE_PLANS`
here **and** a `@RequiresFeature(...)` decorator on the controller — see the
[API README](../api/README.md#plan-enforcement).

---

## Auth store gotcha

`businessId` lives on the **user**, not on `AuthState`:

```ts
const businessId = useAuthStore(s => s.user)?.businessId;
```

---

## Desktop

`apps/desktop` bundles `apps/web/dist` (`frontendDist: "../../web/dist"`). **Build
this app before building the desktop app** or Tauri ships a stale bundle.

---

When you add a page, route, gated feature, hardware lib or public link, update this
README in the same change.

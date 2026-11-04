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
| `printer.ts` | Print entry points: renders with `@pos/print-core` and sends receipts, bills and kitchen tickets to the browser, USB, Bluetooth, LAN (via the API), an installed printer (desktop app) or a Star/Epson HTTP printer. KOT printing reports failures instead of hiding them |
| `printTransports.ts` | Raw byte transports: WebUSB, Web Bluetooth, LAN through the API |
| `printHtml.ts` | The ONE way a page is printed: a hidden, script-less sandboxed iframe. Never use `window.open` for printing |
| `receiptPrint.ts` | The per-device printer preference (`receipt-print-pref` in localStorage), auto-print and explicit print |
| `printQueue.ts` | Client for the server print queue (`/print-jobs`): queue a LAN print, log a print made on this device, ask how many times a sale's receipt was printed (so reprints are COPY) |
| `printBridge.ts` | Desktop app only: polls for queued jobs and writes them to LAN printers with the Tauri `print_to_network` command, so a cloud API can reach printers it cannot see. Signs in with a long-lived **print station key** (`print-station-token`, no one needs to be logged in; a revoked key is dropped on the first 401) or, without one, the signed-in person's login. On by default in the desktop app; switch off in Settings -> Printers. `PrintBridge` is mounted on the login screen too |
| `kotPrintFeedback.ts` | Toast with a "Print here" action when a kitchen printer cannot be reached |

Settings -> Printers also has **Print full test page** (columns, alignment, characters, QR, cut) and **Test cash drawer** for checking a new printer; see [HARDWARE_TEST.md](../../packages/print-core/HARDWARE_TEST.md). It ends with **Print history** (`components/PrintQueuePanel.tsx`, owner/manager): a 7-day audit (reprints and hand-opened cash drawers per person), **Print stations** (`PrintStationsPanel.tsx`: create a key, use this computer as a station, see online/offline, remove) and every receipt, ticket and drawer open with Retry for failed ones.
What a receipt/ticket/bill contains lives in [`packages/print-core`](../../packages/print-core/README.md), shared with the mobile app.
Tests: `npm test` (vitest) covers the print preference, routing and failure reporting.
| `scale.ts` | Weighing scales (Web Serial / Bluetooth) |
| `cardTerminal.ts`, `terminal.ts` | Card terminals |
| `nfc.ts`, `biometric.ts` | NFC taps, WebAuthn login |
| `fuelPumpController.ts` | Fuel dispenser control |
| `socket.ts` | Live updates (KDS, pole display, driver location). The server only joins a socket to the business in its token |
| `useKdsRealtime.ts` | Keeps a kitchen screen live: refreshes on ticket events, chimes for a new ticket, warns loudly when a sent line is voided |
| `useRestaurantAccess.ts` | Whether tables and the kitchen display are on: a restaurant till, or any till with the Restaurant module enabled |
| `db.ts`, `syncEngine.ts` | Dexie/IndexedDB offline store + replay |
| `whatsapp.ts` | WhatsApp receipt handoff |

---

## Phone layout

The web app is used on phones, so every screen has to work at 360-430px wide. The shell hides the
sidebar below `md` and shows `MobileNav` (a fixed bottom tab bar), and `Layout`'s `<main>` reserves its
height with `pb-[calc(57px+env(safe-area-inset-bottom))] md:pb-0` (all routes except `/pos`, which
positions its own cart bar above the tab bar).

`src/index.css` carries the global phone rules, so new screens get them for free:

- below 768px every `<table>` becomes its own horizontal scroll box (headers do not wrap)
- below 640px the `p-6`/`px-6`/`p-8`/`px-8` gutters shrink (`sm:` and up are untouched)
- centered modal overlays (`fixed inset-0 ... items-center justify-center`) scroll and use `safe center`,
  so a dialog taller than the screen is never clipped
- `h-screen`/`min-h-screen` use `100dvh` where supported (mobile URL bar)

When you build a screen:

- Master-detail and cart panels: full-width sheet below `md` (`fixed inset-0 z-40 md:static ...`), with a
  close/back button and an in-flow summary bar that opens it. See `SupermarketPOSPage`, `KioskPage`,
  the Bar Tabs view in `HospitalityPage` and the customer panel in `CustomersPage`.
- Multi-column grids start at 1-2 columns: `grid-cols-2 sm:grid-cols-3`, never bare `grid-cols-3`/`4`
  (numeric keypads are the exception).
- Header rows use `flex-wrap gap-3`; tab and chip rows use `overflow-x-auto [&>button]:shrink-0
  [&>button]:whitespace-nowrap`.
- Hover-only controls need `[@media(hover:none)]:...` so touch users can reach them.

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

## Offline sales

A checkout is sent straight to the server. If there is no answer (browser offline, dropped connection, 502/503/504, no
reply in 20 s) a sale made with **cash, card, M-Pesa or bank transfer** is saved in IndexedDB (`lib/offlineSales.ts`,
the Dexie `syncQueue` table in `lib/db.ts`) and uploads by itself (`lib/syncEngine.ts`). The till prints a
**provisional receipt**: number `OFF-XXXXXXXX`, an `OFFLINE SALE - PROVISIONAL RECEIPT` banner and the PENDING KRA banner. The
real receipt number and the eTIMS record are made when it uploads (the entry keeps the real number for 7 days).

- **Safe to repeat.** Every sale carries its idempotency key (`lib/checkoutKey.ts`); the server records it once, so an
  unknown outcome (the reply was lost) is simply queued and retried.
- **Not queued:** gift card, credit sale, loyalty redemption, room charge. They need a live server answer to complete, so
  they fail visibly and the cashier picks another payment method.
- **Failure handling** (`classifyFailure`): a lost connection or 502/503/504/408/429 keeps the entry waiting and stops the
  run without using up attempts; a 4xx means the server REFUSED the sale (for example out of stock), so it is parked as
  FAILED with the reason, never dropped, and does not block the sales behind it; other 5xx back off and give up after 10
  tries. One upload can never hang the queue (30 s timeout), and only one tab uploads at a time (Web Locks).
- **Whose sale it is.** A sale uploads under its cashier's login, or under an owner/manager's, who uploads it on the cashier's
  behalf (`onBehalfOfCashierId`, honoured by the API only for owners/managers of the same business). Another cashier leaves it alone.
- **Seeing it.** The sidebar sync badge opens **Sales saved offline** (`components/OfflineSalesPanel.tsx`): waiting, uploaded (with the
  real receipt number), refused (Retry; managers can Discard with a warning). A refused sale turns the badge and banner red.
- **Limits.** Prices and stock come from what the till already loaded (kept in the service-worker cache for 7 days for a reload
  while offline), so an offline sale can be refused later if stock ran out meanwhile. Printing to a LAN printer through the server
  needs a connection; browser, USB, Bluetooth and installed printers work offline. Tests: `lib/__tests__/offlineSales.test.ts`
  (fake IndexedDB).

## Printing notes

- **System printer is the default** (`DEFAULT_PREF` in `receiptPrint.ts`). It opens the browser
  print dialog, which lists every printer installed on the computer, so a thermal printer with
  its normal driver needs no pairing. The direct modes (WebUSB, Bluetooth, LAN, Star, Epson)
  are grouped under "Advanced" in Settings because they bypass the installed-printer list;
  on Windows a driver-claimed USB printer usually cannot be opened over WebUSB. The dialog
  can only be skipped with Chrome's `--kiosk-printing` (default printer) or, in the desktop
  app, the `system` method below.
- **Silent printing to an installed printer (desktop app only).** `lib/desktopPrinter.ts` calls the Tauri
  commands `list_system_printers` / `print_to_system_printer` (`apps/desktop/src-tauri/src/system_printer.rs`),
  which use the Windows spooler (RAW datatype) or CUPS (`lp -o raw`). The `system` print method
  (`systemPrinterName` in the pref) builds the same ESC/POS bytes as the USB path and sends them to the
  named queue, so it needs a thermal receipt printer. The option only appears when `isDesktopApp()`.
  Receipts only; bills and kitchen tickets still use their own paths.
- **Reprints are marked copies.** A second print of the same sale (POS Print button, Sales list) sets
  `copyNumber`, prints a COPY banner and never opens the cash drawer.
- **Pair once, print silently** (direct modes). Settings, Printers pairs a USB or Bluetooth printer
  (`pairUsbPrinter` / `pairBluetoothPrinter`, which must run from a click) and stores the
  choice for this device. Checkout, Reprint and the Print button all go through
  `receiptPrint.ts`; `PrintModal` is only the fallback when no printer is set or the
  printer fails.
- **ESC/POS is bytes, not UTF-8.** `TextEncoder` turns every byte above 0x7F into two,
  which corrupts commands such as the cash drawer pulse. Always use `encodeEscPos`, and
  pass user text through `asciiSafe`. Anything written into receipt HTML goes through
  `escapeHtml`.
- **Paper size** (58 mm small Bluetooth printers, 32 columns; 80 mm standard thermal, 48
  columns) is chosen in Settings, Printers and read by `getPaperWidth()`. Unset keeps the
  old behaviour: a 32-column ESC/POS layout, which also prints on wider paper, and an
  80 mm browser page. Amount columns size to their content, so large totals are never cut.
- **Browser printing uses a hidden iframe**, not `window.open`: a popup opened after an
  `await` is blocked by the browser and fails silently.
- **LAN printing goes through the API** (`POST /printers/:id/print`), so the API host must
  be on the same network as the printer. A cloud-hosted API cannot reach a printer at
  `192.168.x.x`; use Star/Epson (browser to printer) or a LAN-hosted server there.
- Web Bluetooth and WebUSB exist only in Chromium browsers; there is no support in Safari
  or on iOS.

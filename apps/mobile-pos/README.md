# KASTRA POS — Cashier App (mobile-pos)

Expo / React Native app for cashiers, waiters and managers. A **floor app**: selling
first, with a role-gated Manage section for the people who actually run the shop.

- Store name: **KASTRA POS** · slug `kastra-pos-cashier` · package `co.ke.kastra.pos`
- Router: `expo-router` (file-based)

---

## Develop

```bash
npm install
npx expo start          # scan the QR with Expo Go
npm run typecheck
```

This app is **outside** the root npm workspace — it has its own `package-lock.json`
and must be installed from this directory.

---

## Server URL

Base URL resolution in [lib/api.ts](lib/api.ts):

1. the URL the user picked on the login screen (`SecureStore` key `pos_server_url`),
2. otherwise `EXPO_PUBLIC_API_URL`,
3. otherwise the deployed cloud API.

Point it at a LAN address to run against a local API. **Android needs cleartext
traffic enabled for plain-HTTP LAN URLs.**

---

## Tabs

| Tab | Contents |
|---|---|
| **POS** | The till — item search, barcode scan, cart, payment |
| **Sales** | Sales history and returns |
| **Customers** | Lookup, credit balance, quick create |
| **Reports** | Day summary, X/Z, staff performance |
| **Manage** | Back-office tiles (role-gated — see below) |
| **Settings** | Server URL, POS mode, receipt printing, logout |

Extra screens: `payment` · `barcode-scan` · `cash-drawer` · `table-order` ·
`purchase-order` · `my-hr`, plus ~20 `manage-*` screens covering stock, stocktake
sessions, batches, transfers, suppliers, purchase orders, damaged goods, expenses,
approvals, attendance, users, tables, kitchen, day-close and multi-store rollup.

---

## Role gating ([lib/roles.ts](lib/roles.ts))

Three distinct role sets, deliberately not one:

| Set | Roles | Grants |
|---|---|---|
| `MANAGE_ROLES` | OWNER, MANAGER, ADMIN | The Manage section — stock, transfers, users, settings |
| `FINANCE_ROLES` | + ACCOUNTANT | Reports, expenses, cash-drawer oversight, X/Z |
| `canApprove` | = `MANAGE_ROLES` | Leave, expenses, POs, salary advances |

ACCOUNTANT is intentionally in `FINANCE_ROLES` but **not** `MANAGE_ROLES` — they can
see the money without adjusting stock or editing staff, which is the same line the
web app draws. Cashiers and waiters see only **their own** sales; browsing the whole
store's takings is OWNER/MANAGER/ACCOUNTANT only.

The module is pure (no imports), so it unit-tests in plain Node.

---

## POS modes ([lib/posMode.ts](lib/posMode.ts))

The web app renders a whole separate POS page per business type. On a phone that
makes no sense — every vertical collapses to one single-column cart — so mobile keeps
**one** POS screen and varies three things through a capability map:

1. the pre-cart step (which table / pump / station / patient),
2. a few post-cart steps (send to kitchen, end session),
3. which tabs and Manage tiles are visible.

Modes: `RETAIL` `SUPERMARKET` `HOSPITALITY` `FAST_FOOD` `BAR_TAB` `FUEL_PUMP`
`CYBERCAFE` `CLINIC` `SALON`.
Capabilities: `tables` `kitchen` `serviceCharge` `pumps` `appointments`
`prescriptions` `layaway` `batches` `recipes` `delivery`.

Adding a vertical is **one row in the map**, not an `if` scattered across a dozen
screens. Cybercafé stations are deliberately excluded — they sit at a fixed counter
that already runs the web app.

---

## Offline

[lib/db.ts](lib/db.ts) is an **AsyncStorage** queue, not SQLite (`expo-sqlite` isn't
installed). Sales that fail to reach the server are queued with an `offlineId` UUID
and replayed by `lib/sync.ts` against `/sales/checkout`; the server deduplicates on
`offlineId`, so a replay of a request that actually succeeded never double-posts.
Items are cached locally for offline lookup.

> **The flush is manual.** `processSyncQueue()` is only called from the Sync button
> in Settings — unlike `mobile-agent` and `mobile-driver`, this app has no
> `useOfflineSync` timer, no foreground trigger and no sync banner. A cashier who
> sells offline and never opens Settings keeps an unsynced queue.

---

## Receipt printing

**Off by default.** Most mobile selling has no printer and relies on the digital
receipt the API sends by SMS/WhatsApp when the sale has a customer. Switch it on in
Settings and a "Print Receipt" button appears on the success screen.

Transport is the **OS print sheet** (`expo-print`) — on Android it can target a
system-paired Bluetooth/Wi-Fi printer or save/share a PDF. Direct silent ESC/POS over
Bluetooth would need a native module and per-model device testing; it is not
implemented.

---

## Session handling

JWTs are short-lived (15 min email login, 12 h PIN). `lib/api.ts` refreshes
**proactively** before expiry — `/auth/refresh` requires a still-valid token — and a
401 logs the user out rather than retrying. Without this, an expired token surfaced
to the cashier as a bare "no sales found".

Push notifications come from the shared [`@pos/mobile-push`](../../packages/mobile-push/)
package.

---

## Release

Built by `.github/workflows/mobile-release.yml`: run **Mobile Apps Release**
(app: `mobile-pos` or `all`) or push a `mobile-v*` tag. Produces an Android APK
artifact. CI type-checks this app on every push.

---

When you add a screen, capability, role rule or offline queue type, update this
README in the same change.

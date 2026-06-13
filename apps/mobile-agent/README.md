# KASTRA Agent (Field Sales)

Expo / React Native app for **field sales agents** (van-sales, distribution).
Agents are `User`s with role `SALES_AGENT`; they log in with the credentials
created for them in the web POS (Settings → Users).

## Screens
- **Today** — month stats + commission progress + the call plan (customers to
  visit, prioritised by outstanding balance).
- **Customers** — searchable shop list, quick order / call.
- **New Order** — pick a customer, add catalogue items, submit. Handles the
  `CREDIT_LIMIT_EXCEEDED` response.
- **Collections** — customers with outstanding balances; record cash / M-Pesa
  payments against unpaid orders.
- **Profile** — performance, server URL, logout.
- **Register Customer** (modal) — name, phone, KRA PIN, shop type, credit
  limit, optional GPS capture.

## API
Talks to the existing `field-sales` controller (`/api/v1/field-sales/*`) plus
`/items` and `/auth/login`. Default server is the deployed cloud API
(`pos-bhe5.onrender.com`); changeable on the login screen for LAN servers.

## Offline queueing
Orders, customer registrations, and payments work with no signal:
- Each mutation tries the network first (so the credit-limit rejection still
  shows instantly when online). On a network failure it's written to a
  persistent AsyncStorage queue (`lib/offline.ts`) and the agent sees a
  "Saved Offline" confirmation.
- `useOfflineSync` flushes the queue on app launch, every 30s, and whenever the
  app returns to the foreground. A thin amber **SyncBanner** shows the pending
  count and lets the agent force a retry.
- Every queued action carries an `offlineId` (UUID). The backend deduplicates
  on it (`FieldOrder.offlineId`, `Customer.offlineId`, `FieldOrderPayment.offlineId`),
  so a replay of a request that actually succeeded never double-creates an order
  or **double-counts a payment**. Migration: `20260613000000_add_field_offline_idempotency`.

Limitation: a customer registered while offline has no server id until it
syncs, so you can't capture an order against that brand-new shop until the
registration has uploaded.

## Develop
```bash
npm install
npx expo start        # scan QR with Expo Go (dev)
npm run typecheck
```

## Build an APK
This app is wired into `.github/workflows/mobile-release.yml`. To build:
- Run the **Mobile Apps Release** workflow (app: `mobile-agent` or `all`), or
- push a `mobile-v*` tag.

**First-time EAS setup:** the app needs an EAS project id. Run `eas init` in
this directory once (creates `extra.eas.projectId` + `updates.url` in app.json)
before the first cloud/`--local` EAS build, and add the `EXPO_TOKEN` repo
secret if not already present.
